/**
 * Report Generator
 * 
 * Generates comprehensive verification reports in multiple formats including
 * HTML, PDF, Markdown, and JSON for verification results.
 */

const fs = require('fs').promises;
const path = require('path');
const chalk = require('chalk');

class ReportGenerator {
  constructor(config = {}) {
    this.config = {
      outputDir: config.outputDir || './verification-results',
      templateDir: config.templateDir || path.join(__dirname, '../templates'),
      formats: config.formats || ['html', 'markdown', 'json'],
      includeScreenshots: config.includeScreenshots !== false,
      ...config
    };
  }

  /**
   * Generate all report formats
   */
  async generateReports(verification) {
    console.log('📝 Generating verification reports...');
    
    // Ensure output directory exists
    await this.ensureOutputDirectory();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportName = `verification-report-${timestamp}`;
    const reports = {};

    try {
      // Generate reports in each format
      for (const format of this.config.formats) {
        console.log(chalk.gray(`  Generating ${format.toUpperCase()} report...`));
        
        switch (format) {
          case 'html':
            reports.html = await this.generateHTMLReport(verification, reportName);
            break;
            
          case 'markdown':
            reports.markdown = await this.generateMarkdownReport(verification, reportName);
            break;
            
          case 'json':
            reports.json = await this.generateJSONReport(verification, reportName);
            break;
            
          case 'pdf':
            // PDF generation would require additional dependencies like puppeteer
            console.log(chalk.yellow('  PDF generation not yet implemented'));
            break;
        }
      }

      // Generate summary file
      await this.generateSummaryFile(verification, reportName);

      console.log(chalk.green('✅ Reports generated successfully'));
      console.log(chalk.gray(`  Output directory: ${this.config.outputDir}`));

      return reports;

    } catch (error) {
      console.error(chalk.red(`❌ Report generation failed: ${error.message}`));
      throw error;
    }
  }

  /**
   * Generate HTML report
   */
  async generateHTMLReport(verification, reportName) {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Message Queues Platform Verification Report</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h1, h2, h3 {
            color: #2a2a2a;
        }
        h1 {
            border-bottom: 3px solid #008c99;
            padding-bottom: 10px;
        }
        .summary {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 6px;
            margin: 20px 0;
        }
        .score {
            font-size: 48px;
            font-weight: bold;
            text-align: center;
            margin: 20px 0;
        }
        .score.passed { color: #11a968; }
        .score.failed { color: #d0021b; }
        .stage {
            margin: 30px 0;
            padding: 20px;
            border-left: 4px solid #008c99;
            background: #fafafa;
        }
        .test-result {
            margin: 10px 0;
            padding: 10px;
            border-radius: 4px;
        }
        .test-result.passed {
            background: #e8f5e9;
            border-left: 4px solid #4caf50;
        }
        .test-result.failed {
            background: #ffebee;
            border-left: 4px solid #f44336;
        }
        .recommendation {
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 10px 0;
            border-radius: 4px;
        }
        .metric {
            display: inline-block;
            margin: 10px;
            padding: 15px;
            background: #e8eaf6;
            border-radius: 4px;
            text-align: center;
            min-width: 120px;
        }
        .metric-value {
            font-size: 24px;
            font-weight: bold;
            color: #3f51b5;
        }
        .metric-label {
            font-size: 12px;
            color: #666;
            text-transform: uppercase;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }
        th {
            background: #f5f5f5;
            font-weight: 600;
        }
        .tag {
            display: inline-block;
            padding: 4px 8px;
            margin: 2px;
            background: #e0e0e0;
            border-radius: 3px;
            font-size: 12px;
        }
        .tag.high { background: #ffcdd2; color: #c62828; }
        .tag.medium { background: #ffe0b2; color: #e65100; }
        .tag.low { background: #fff9c4; color: #f57f17; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Message Queues Platform Verification Report</h1>
        
        <div class="summary">
            <h2>Executive Summary</h2>
            <div class="score ${verification.summary?.passed ? 'passed' : 'failed'}">
                ${verification.summary?.overallScore || 0}%
            </div>
            <p><strong>Verification ID:</strong> ${verification.id}</p>
            <p><strong>Timestamp:</strong> ${new Date(verification.timestamp).toLocaleString()}</p>
            <p><strong>Status:</strong> ${verification.summary?.passed ? '✅ PASSED' : '❌ FAILED'}</p>
            
            <div style="text-align: center; margin: 20px 0;">
                ${this.generateMetricHTML('Total Stages', verification.summary?.totalStages || 0)}
                ${this.generateMetricHTML('Passed Stages', verification.summary?.passedStages || 0)}
                ${this.generateMetricHTML('Overall Score', `${verification.summary?.overallScore || 0}%`)}
            </div>
        </div>

        ${verification.stages?.entities ? this.generateEntityStageHTML(verification.stages.entities) : ''}
        ${verification.stages?.dashboards ? this.generateDashboardStageHTML(verification.stages.dashboards) : ''}
        ${verification.stages?.browser ? this.generateBrowserStageHTML(verification.stages.browser) : ''}
        ${verification.stages?.e2e ? this.generateE2EStageHTML(verification.stages.e2e) : ''}

        ${verification.recommendations?.length > 0 ? this.generateRecommendationsHTML(verification.recommendations) : ''}

        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #666;">
            <p>Generated by Message Queues Platform Verification System</p>
            <p>${new Date().toLocaleString()}</p>
        </div>
    </div>
</body>
</html>`;

    const filepath = path.join(this.config.outputDir, `${reportName}.html`);
    await fs.writeFile(filepath, html);
    
    return filepath;
  }

  /**
   * Generate Markdown report
   */
  async generateMarkdownReport(verification, reportName) {
    const markdown = `# Message Queues Platform Verification Report

## Executive Summary

**Verification ID:** ${verification.id}  
**Timestamp:** ${new Date(verification.timestamp).toLocaleString()}  
**Overall Score:** ${verification.summary?.overallScore || 0}%  
**Status:** ${verification.summary?.passed ? '✅ PASSED' : '❌ FAILED'}

### Summary Metrics

| Metric | Value |
|--------|-------|
| Total Stages | ${verification.summary?.totalStages || 0} |
| Passed Stages | ${verification.summary?.passedStages || 0} |
| Overall Score | ${verification.summary?.overallScore || 0}% |

${verification.stages?.entities ? this.generateEntityStageMarkdown(verification.stages.entities) : ''}
${verification.stages?.dashboards ? this.generateDashboardStageMarkdown(verification.stages.dashboards) : ''}
${verification.stages?.browser ? this.generateBrowserStageMarkdown(verification.stages.browser) : ''}
${verification.stages?.e2e ? this.generateE2EStageMarkdown(verification.stages.e2e) : ''}

${verification.recommendations?.length > 0 ? this.generateRecommendationsMarkdown(verification.recommendations) : ''}

---

*Generated by Message Queues Platform Verification System*  
*${new Date().toLocaleString()}*
`;

    const filepath = path.join(this.config.outputDir, `${reportName}.md`);
    await fs.writeFile(filepath, markdown);
    
    return filepath;
  }

  /**
   * Generate JSON report
   */
  async generateJSONReport(verification, reportName) {
    const filepath = path.join(this.config.outputDir, `${reportName}.json`);
    await fs.writeFile(filepath, JSON.stringify(verification, null, 2));
    
    return filepath;
  }

  /**
   * Generate summary file
   */
  async generateSummaryFile(verification, reportName) {
    const summary = {
      reportName,
      timestamp: verification.timestamp,
      overallScore: verification.summary?.overallScore || 0,
      passed: verification.summary?.passed || false,
      stages: Object.keys(verification.stages || {}),
      recommendationCount: verification.recommendations?.length || 0,
      files: {
        html: `${reportName}.html`,
        markdown: `${reportName}.md`,
        json: `${reportName}.json`
      }
    };

    const filepath = path.join(this.config.outputDir, 'latest-summary.json');
    await fs.writeFile(filepath, JSON.stringify(summary, null, 2));
    
    return filepath;
  }

  // HTML Generation Helpers

  generateMetricHTML(label, value) {
    return `
      <div class="metric">
        <div class="metric-value">${value}</div>
        <div class="metric-label">${label}</div>
      </div>
    `;
  }

  generateEntityStageHTML(entityStage) {
    return `
      <div class="stage">
        <h2>Entity Verification</h2>
        <p><strong>Score:</strong> ${entityStage.summary?.score || 0}%</p>
        
        <h3>Entity Types Tested</h3>
        <table>
          <thead>
            <tr>
              <th>Entity Type</th>
              <th>Status</th>
              <th>Score</th>
              <th>Tests Passed</th>
            </tr>
          </thead>
          <tbody>
            ${Object.entries(entityStage.entityTypes || {}).map(([type, result]) => `
              <tr>
                <td>${type}</td>
                <td>${result.passed ? '✅ Passed' : '❌ Failed'}</td>
                <td>${result.score}%</td>
                <td>${result.tests.filter(t => t.passed).length}/${result.tests.length}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        ${Object.entries(entityStage.entityTypes || {}).map(([type, result]) => 
          result.tests.filter(t => !t.passed).length > 0 ? `
            <h4>Failed Tests for ${type}</h4>
            ${result.tests.filter(t => !t.passed).map(test => `
              <div class="test-result failed">
                <strong>${test.name}</strong>
                <p>${test.details?.message || 'Test failed'}</p>
              </div>
            `).join('')}
          ` : ''
        ).join('')}
      </div>
    `;
  }

  generateDashboardStageHTML(dashboardStage) {
    return `
      <div class="stage">
        <h2>Dashboard Verification</h2>
        <p><strong>Average Score:</strong> ${dashboardStage.summary?.averageScore || 0}%</p>
        
        <h3>Dashboards Tested</h3>
        <table>
          <thead>
            <tr>
              <th>Dashboard GUID</th>
              <th>Status</th>
              <th>Widget Tests</th>
              <th>Performance</th>
            </tr>
          </thead>
          <tbody>
            ${Object.entries(dashboardStage.dashboards || {}).map(([guid, result]) => `
              <tr>
                <td>${guid}</td>
                <td>${result.error ? '❌ Error' : result.summary?.overallScore >= 80 ? '✅ Passed' : '⚠️ Issues'}</td>
                <td>${result.tests?.widgets ? `${result.tests.widgets.passedWidgets}/${result.tests.widgets.totalWidgets}` : 'N/A'}</td>
                <td>${result.tests?.performance?.averageLoadTime ? `${result.tests.performance.averageLoadTime}ms` : 'N/A'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  generateBrowserStageHTML(browserStage) {
    return `
      <div class="stage">
        <h2>Browser Verification</h2>
        <p><strong>Average Score:</strong> ${browserStage.summary?.averageScore || 0}%</p>
        <p><strong>Cross-Browser Issues:</strong> ${browserStage.summary?.crossBrowserIssues || 0}</p>
        
        <h3>Browser Test Results</h3>
        ${Object.entries(browserStage.dashboards || {}).map(([url, result]) => `
          <h4>${url}</h4>
          ${result.browsers ? Object.entries(result.browsers).map(([browser, browserResult]) => `
            <div style="margin-left: 20px;">
              <h5>${browser}</h5>
              ${browserResult.tests ? `
                <ul>
                  ${Object.entries(browserResult.tests).map(([testName, test]) => `
                    <li>${testName}: ${test.passed ? '✅ Passed' : '❌ Failed'}</li>
                  `).join('')}
                </ul>
              ` : '<p>No test results</p>'}
            </div>
          `).join('') : '<p>No browser results</p>'}
        `).join('')}
      </div>
    `;
  }

  generateE2EStageHTML(e2eStage) {
    return `
      <div class="stage">
        <h2>End-to-End Verification</h2>
        <p><strong>Score:</strong> ${e2eStage.summary?.score || 0}%</p>
        
        <h3>E2E Flows</h3>
        ${Object.entries(e2eStage.flows || {}).map(([flowName, result]) => `
          <h4>${flowName} ${result.passed ? '✅' : '❌'}</h4>
          <ol>
            ${result.steps.map(step => `
              <li class="test-result ${step.passed ? 'passed' : 'failed'}">
                ${step.name} (${step.duration}ms)
                ${step.error ? `<br><small>Error: ${step.error}</small>` : ''}
              </li>
            `).join('')}
          </ol>
        `).join('')}
      </div>
    `;
  }

  generateRecommendationsHTML(recommendations) {
    return `
      <div class="stage">
        <h2>Recommendations</h2>
        ${recommendations.map(rec => `
          <div class="recommendation">
            <span class="tag ${rec.severity}">${rec.severity}</span>
            <strong>${rec.category}</strong>
            <p><strong>Issue:</strong> ${rec.issue}</p>
            <p><strong>Recommendation:</strong> ${rec.recommendation}</p>
          </div>
        `).join('')}
      </div>
    `;
  }

  // Markdown Generation Helpers

  generateEntityStageMarkdown(entityStage) {
    return `
## Entity Verification

**Score:** ${entityStage.summary?.score || 0}%

### Entity Types Tested

| Entity Type | Status | Score | Tests Passed |
|-------------|---------|--------|--------------|
${Object.entries(entityStage.entityTypes || {}).map(([type, result]) => 
  `| ${type} | ${result.passed ? '✅ Passed' : '❌ Failed'} | ${result.score}% | ${result.tests.filter(t => t.passed).length}/${result.tests.length} |`
).join('\n')}

${Object.entries(entityStage.entityTypes || {}).map(([type, result]) => {
  const failedTests = result.tests.filter(t => !t.passed);
  return failedTests.length > 0 ? `
#### Failed Tests for ${type}

${failedTests.map(test => `- **${test.name}**: ${test.details?.message || 'Test failed'}`).join('\n')}
` : '';
}).join('')}
`;
  }

  generateDashboardStageMarkdown(dashboardStage) {
    return `
## Dashboard Verification

**Average Score:** ${dashboardStage.summary?.averageScore || 0}%

### Dashboards Tested

| Dashboard GUID | Status | Widget Tests | Performance |
|----------------|--------|--------------|-------------|
${Object.entries(dashboardStage.dashboards || {}).map(([guid, result]) => 
  `| ${guid} | ${result.error ? '❌ Error' : result.summary?.overallScore >= 80 ? '✅ Passed' : '⚠️ Issues'} | ${result.tests?.widgets ? `${result.tests.widgets.passedWidgets}/${result.tests.widgets.totalWidgets}` : 'N/A'} | ${result.tests?.performance?.averageLoadTime ? `${result.tests.performance.averageLoadTime}ms` : 'N/A'} |`
).join('\n')}
`;
  }

  generateBrowserStageMarkdown(browserStage) {
    return `
## Browser Verification

**Average Score:** ${browserStage.summary?.averageScore || 0}%  
**Cross-Browser Issues:** ${browserStage.summary?.crossBrowserIssues || 0}

### Browser Test Results

${Object.entries(browserStage.dashboards || {}).map(([url, result]) => `
#### ${url}

${result.browsers ? Object.entries(result.browsers).map(([browser, browserResult]) => `
##### ${browser}

${browserResult.tests ? Object.entries(browserResult.tests).map(([testName, test]) => 
  `- ${testName}: ${test.passed ? '✅ Passed' : '❌ Failed'}`
).join('\n') : 'No test results'}
`).join('\n') : 'No browser results'}
`).join('\n')}
`;
  }

  generateE2EStageMarkdown(e2eStage) {
    return `
## End-to-End Verification

**Score:** ${e2eStage.summary?.score || 0}%

### E2E Flows

${Object.entries(e2eStage.flows || {}).map(([flowName, result]) => `
#### ${flowName} ${result.passed ? '✅' : '❌'}

${result.steps.map((step, index) => 
  `${index + 1}. ${step.name} (${step.duration}ms) ${step.passed ? '✅' : '❌'}${step.error ? `\n   Error: ${step.error}` : ''}`
).join('\n')}
`).join('\n')}
`;
  }

  generateRecommendationsMarkdown(recommendations) {
    return `
## Recommendations

${recommendations.map(rec => `
### ${rec.category} (${rec.severity})

**Issue:** ${rec.issue}  
**Recommendation:** ${rec.recommendation}
`).join('\n')}
`;
  }

  /**
   * Ensure output directory exists
   */
  async ensureOutputDirectory() {
    try {
      await fs.access(this.config.outputDir);
    } catch {
      await fs.mkdir(this.config.outputDir, { recursive: true });
    }
  }
}

module.exports = ReportGenerator;