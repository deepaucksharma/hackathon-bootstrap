/**
 * Verification Runner
 * 
 * Orchestrates dashboard verification tests and manages batch operations.
 * Provides a high-level interface for running comprehensive verification suites.
 */

const fs = require('fs').promises;
const path = require('path');
const DashboardVerifier = require('../engines/dashboard-verifier');

class VerificationRunner {
  constructor(config = {}) {
    this.config = {
      apiKey: config.apiKey || process.env.NEW_RELIC_USER_API_KEY,
      accountId: config.accountId || process.env.NEW_RELIC_ACCOUNT_ID,
      outputDir: config.outputDir || './verification-results',
      batchSize: config.batchSize || 5,
      parallelExecutions: config.parallelExecutions || 3,
      retryAttempts: config.retryAttempts || 2,
      includeLoadTests: config.includeLoadTests || false,
      reportFormats: config.reportFormats || ['json', 'html'],
      ...config
    };

    this.verifier = new DashboardVerifier(this.config);
    this.executionQueue = [];
    this.runningVerifications = new Map();
    this.completedVerifications = [];
    this.failedVerifications = [];
  }

  /**
   * Run verification for a single dashboard
   */
  async verifyDashboard(dashboardGuid, options = {}) {
    console.log(`🚀 Starting verification for dashboard: ${dashboardGuid}`);
    
    const verificationOptions = {
      includeLoadTest: this.config.includeLoadTests,
      retryAttempts: this.config.retryAttempts,
      ...options
    };

    try {
      const startTime = Date.now();
      const results = await this.verifier.verifyDashboard(dashboardGuid, verificationOptions);
      
      results.executionTime = Date.now() - startTime;
      this.completedVerifications.push(results);

      // Save results to files
      await this.saveResults(results);
      
      console.log(`✅ Verification completed for ${dashboardGuid} (${results.executionTime}ms)`);
      console.log(`📊 Overall Score: ${results.summary.overallScore.toFixed(1)}/100`);
      
      return results;

    } catch (error) {
      console.error(`❌ Verification failed for ${dashboardGuid}:`, error.message);
      
      const failedResult = {
        dashboardGuid,
        error: error.message,
        timestamp: new Date().toISOString(),
        executionTime: Date.now() - Date.now()
      };
      
      this.failedVerifications.push(failedResult);
      throw error;
    }
  }

  /**
   * Run batch verification for multiple dashboards
   */
  async verifyDashboards(dashboardGuids, options = {}) {
    console.log(`🔄 Starting batch verification for ${dashboardGuids.length} dashboards`);
    
    const batchOptions = {
      concurrency: options.concurrency || this.config.parallelExecutions,
      stopOnFirstFailure: options.stopOnFirstFailure || false,
      generateBatchReport: options.generateBatchReport !== false,
      ...options
    };

    const batches = this.createBatches(dashboardGuids, this.config.batchSize);
    const allResults = [];
    let totalProcessed = 0;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`📦 Processing batch ${i + 1}/${batches.length} (${batch.length} dashboards)`);

      try {
        const batchResults = await this.processBatch(batch, batchOptions);
        allResults.push(...batchResults);
        totalProcessed += batch.length;
        
        console.log(`✅ Batch ${i + 1} completed (${totalProcessed}/${dashboardGuids.length} total)`);
        
      } catch (error) {
        console.error(`❌ Batch ${i + 1} failed:`, error.message);
        
        if (batchOptions.stopOnFirstFailure) {
          break;
        }
      }

      // Brief pause between batches to avoid overwhelming the API
      if (i < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Generate batch summary report
    if (batchOptions.generateBatchReport) {
      const batchReport = await this.generateBatchReport(allResults);
      console.log(`📄 Batch report generated: ${batchReport.reportPath}`);
    }

    console.log(`🏁 Batch verification completed: ${allResults.length} successful, ${this.failedVerifications.length} failed`);
    return {
      successful: allResults,
      failed: this.failedVerifications,
      summary: this.generateBatchSummary(allResults)
    };
  }

  /**
   * Process a single batch of dashboards
   */
  async processBatch(dashboardGuids, options) {
    const promises = dashboardGuids.map(async (guid) => {
      try {
        return await this.verifyDashboard(guid, options);
      } catch (error) {
        if (options.retryFailures && this.config.retryAttempts > 0) {
          console.log(`🔄 Retrying verification for ${guid}...`);
          return await this.retryVerification(guid, options);
        }
        throw error;
      }
    });

    if (options.concurrency > 1) {
      // Process with limited concurrency
      return await this.processWithConcurrency(promises, options.concurrency);
    } else {
      // Process sequentially
      return await Promise.all(promises);
    }
  }

  /**
   * Process promises with limited concurrency
   */
  async processWithConcurrency(promises, concurrency) {
    const results = [];
    const executing = [];

    for (const promise of promises) {
      const wrappedPromise = promise.then(result => {
        executing.splice(executing.indexOf(wrappedPromise), 1);
        return result;
      });

      results.push(wrappedPromise);
      executing.push(wrappedPromise);

      if (executing.length >= concurrency) {
        await Promise.race(executing);
      }
    }

    return Promise.all(results);
  }

  /**
   * Retry failed verification
   */
  async retryVerification(dashboardGuid, options) {
    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      console.log(`🔄 Retry attempt ${attempt}/${this.config.retryAttempts} for ${dashboardGuid}`);
      
      try {
        await new Promise(resolve => setTimeout(resolve, attempt * 1000)); // Exponential backoff
        return await this.verifyDashboard(dashboardGuid, { ...options, isRetry: true });
      } catch (error) {
        if (attempt === this.config.retryAttempts) {
          throw error;
        }
        console.log(`⚠️  Retry attempt ${attempt} failed, retrying...`);
      }
    }
  }

  /**
   * Create batches from dashboard GUIDs
   */
  createBatches(dashboardGuids, batchSize) {
    const batches = [];
    for (let i = 0; i < dashboardGuids.length; i += batchSize) {
      batches.push(dashboardGuids.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Save verification results to files
   */
  async saveResults(results) {
    try {
      // Ensure output directory exists
      await fs.mkdir(this.config.outputDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const baseFilename = `verification-${results.dashboardGuid}-${timestamp}`;

      // Save in requested formats
      for (const format of this.config.reportFormats) {
        const filename = `${baseFilename}.${format}`;
        const filepath = path.join(this.config.outputDir, filename);
        
        const content = this.verifier.exportResults(results.verificationId, format);
        await fs.writeFile(filepath, content, 'utf8');
        
        console.log(`💾 Saved ${format.toUpperCase()} report: ${filepath}`);
      }

    } catch (error) {
      console.error('❌ Failed to save results:', error.message);
    }
  }

  /**
   * Generate batch report
   */
  async generateBatchReport(results) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportFilename = `batch-verification-report-${timestamp}`;
    
    const batchSummary = this.generateBatchSummary(results);
    const report = {
      generatedAt: new Date().toISOString(),
      totalDashboards: results.length,
      summary: batchSummary,
      dashboardResults: results.map(r => ({
        dashboardGuid: r.dashboardGuid,
        overallScore: r.summary.overallScore,
        passRate: r.summary.passRate,
        executionTime: r.executionTime,
        recommendations: r.recommendations.length
      })),
      topPerformers: results
        .sort((a, b) => b.summary.overallScore - a.summary.overallScore)
        .slice(0, 5)
        .map(r => ({
          dashboardGuid: r.dashboardGuid,
          score: r.summary.overallScore
        })),
      needsAttention: results
        .filter(r => r.summary.overallScore < 70)
        .map(r => ({
          dashboardGuid: r.dashboardGuid,
          score: r.summary.overallScore,
          criticalIssues: r.recommendations.filter(rec => rec.priority === 'high').length
        }))
    };

    // Save batch report
    const reportPath = path.join(this.config.outputDir, `${reportFilename}.json`);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

    // Generate HTML version
    if (this.config.reportFormats.includes('html')) {
      const htmlReport = this.generateBatchHtmlReport(report);
      const htmlPath = path.join(this.config.outputDir, `${reportFilename}.html`);
      await fs.writeFile(htmlPath, htmlReport, 'utf8');
    }

    return {
      reportPath,
      summary: batchSummary
    };
  }

  /**
   * Generate batch summary
   */
  generateBatchSummary(results) {
    if (results.length === 0) {
      return {
        totalDashboards: 0,
        averageScore: 0,
        passRate: 0,
        totalExecutionTime: 0
      };
    }

    const totalScore = results.reduce((sum, r) => sum + r.summary.overallScore, 0);
    const passedDashboards = results.filter(r => r.summary.overallScore >= 70).length;
    const totalExecutionTime = results.reduce((sum, r) => sum + r.executionTime, 0);

    return {
      totalDashboards: results.length,
      averageScore: totalScore / results.length,
      passRate: (passedDashboards / results.length) * 100,
      totalExecutionTime,
      averageExecutionTime: totalExecutionTime / results.length,
      categoryScores: this.calculateCategoryAverages(results),
      common_issues: this.identifyCommonIssues(results)
    };
  }

  /**
   * Calculate category averages
   */
  calculateCategoryAverages(results) {
    const categories = {};
    
    results.forEach(result => {
      Object.entries(result.summary.categories).forEach(([category, data]) => {
        if (!categories[category]) {
          categories[category] = { scores: [], total: 0 };
        }
        categories[category].scores.push(data.score);
        categories[category].total++;
      });
    });

    const averages = {};
    Object.entries(categories).forEach(([category, data]) => {
      averages[category] = {
        averageScore: data.scores.reduce((sum, score) => sum + score, 0) / data.total,
        totalTests: data.total
      };
    });

    return averages;
  }

  /**
   * Identify common issues across dashboards
   */
  identifyCommonIssues(results) {
    const issueCount = {};
    
    results.forEach(result => {
      result.recommendations.forEach(rec => {
        const key = `${rec.category}: ${rec.issue}`;
        issueCount[key] = (issueCount[key] || 0) + 1;
      });
    });

    return Object.entries(issueCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([issue, count]) => ({
        issue,
        occurrences: count,
        percentage: (count / results.length) * 100
      }));
  }

  /**
   * Generate batch HTML report
   */
  generateBatchHtmlReport(report) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Batch Dashboard Verification Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { background: #f5f5f5; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
          .summary { display: flex; gap: 20px; margin: 20px 0; }
          .metric { background: white; border: 1px solid #ddd; padding: 15px; border-radius: 5px; flex: 1; text-align: center; }
          .metric-value { font-size: 2em; font-weight: bold; color: #333; }
          .metric-label { color: #666; margin-top: 5px; }
          .dashboard-list { margin: 20px 0; }
          .dashboard-item { background: white; border: 1px solid #ddd; padding: 10px; margin: 5px 0; border-radius: 3px; display: flex; justify-content: space-between; align-items: center; }
          .score-good { color: green; font-weight: bold; }
          .score-warning { color: orange; font-weight: bold; }
          .score-poor { color: red; font-weight: bold; }
          .section { margin: 30px 0; }
          .issue-list { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Batch Dashboard Verification Report</h1>
          <p><strong>Generated:</strong> ${report.generatedAt}</p>
          <p><strong>Total Dashboards:</strong> ${report.totalDashboards}</p>
        </div>

        <div class="summary">
          <div class="metric">
            <div class="metric-value">${report.summary.averageScore.toFixed(1)}</div>
            <div class="metric-label">Average Score</div>
          </div>
          <div class="metric">
            <div class="metric-value">${report.summary.passRate.toFixed(1)}%</div>
            <div class="metric-label">Pass Rate</div>
          </div>
          <div class="metric">
            <div class="metric-value">${Math.round(report.summary.averageExecutionTime)}ms</div>
            <div class="metric-label">Avg Execution Time</div>
          </div>
        </div>

        <div class="section">
          <h2>Top Performers</h2>
          <div class="dashboard-list">
            ${report.topPerformers.map(dash => `
              <div class="dashboard-item">
                <span>${dash.dashboardGuid}</span>
                <span class="score-good">${dash.score.toFixed(1)}</span>
              </div>
            `).join('')}
          </div>
        </div>

        ${report.needsAttention.length > 0 ? `
          <div class="section">
            <h2>Needs Attention</h2>
            <div class="dashboard-list">
              ${report.needsAttention.map(dash => `
                <div class="dashboard-item">
                  <span>${dash.dashboardGuid}</span>
                  <span class="${dash.score < 50 ? 'score-poor' : 'score-warning'}">${dash.score.toFixed(1)} (${dash.criticalIssues} critical issues)</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div class="section">
          <h2>Common Issues</h2>
          <div class="issue-list">
            ${report.summary.common_issues.map(issue => `
              <div>
                <strong>${issue.issue}</strong><br>
                Affects ${issue.occurrences} dashboards (${issue.percentage.toFixed(1)}%)
              </div>
            `).join('<br><br>')}
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Get verification statistics
   */
  getStatistics() {
    return {
      totalCompleted: this.completedVerifications.length,
      totalFailed: this.failedVerifications.length,
      averageScore: this.completedVerifications.length > 0 ? 
        this.completedVerifications.reduce((sum, r) => sum + r.summary.overallScore, 0) / this.completedVerifications.length : 0,
      currentlyRunning: this.runningVerifications.size,
      queuedVerifications: this.executionQueue.length
    };
  }

  /**
   * Clean up old result files
   */
  async cleanupOldResults(maxAge = 30) { // days
    try {
      const files = await fs.readdir(this.config.outputDir);
      const cutoffTime = Date.now() - (maxAge * 24 * 60 * 60 * 1000);
      
      for (const file of files) {
        const filepath = path.join(this.config.outputDir, file);
        const stats = await fs.stat(filepath);
        
        if (stats.mtime.getTime() < cutoffTime) {
          await fs.unlink(filepath);
          console.log(`🧹 Cleaned up old result file: ${file}`);
        }
      }
    } catch (error) {
      console.error('❌ Failed to cleanup old results:', error.message);
    }
  }
}

module.exports = VerificationRunner;