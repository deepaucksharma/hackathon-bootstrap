/**
 * Submission Engine - Sends payloads to New Relic Event API
 * 
 * This engine handles the submission of generated payloads
 * to the New Relic platform using the Event API.
 */

const https = require('https');
const fs = require('fs').promises;
const path = require('path');

class SubmissionEngine {
  constructor(config) {
    this.config = config;
    this.insertKey = config.newRelic.apiKeys.insert;
    this.accountId = config.newRelic.accountId;
    this.submissionLog = [];
  }

  /**
   * Submit payload to New Relic Event API
   */
  async submitPayload(payload, metadata = {}) {
    console.log('\n📤 Submitting payload to New Relic...');
    
    // Event API expects an array of events
    const events = Array.isArray(payload) ? payload : [payload];
    
    // Add any missing timestamps
    events.forEach(event => {
      if (!event.timestamp) {
        event.timestamp = Date.now();
      }
    });
    
    const submission = {
      timestamp: new Date().toISOString(),
      metadata,
      events: events.length,
      status: null,
      response: null,
      error: null
    };
    
    try {
      const response = await this.sendToEventAPI(events);
      submission.status = response.statusCode;
      submission.response = response.body;
      
      if (response.statusCode === 200 || response.statusCode === 202) {
        console.log(`✅ Successfully submitted ${events.length} events`);
        console.log(`   Response: ${response.statusCode} ${response.statusMessage}`);
      } else {
        console.error(`❌ Submission failed: ${response.statusCode}`);
        console.error(`   Response: ${response.body}`);
        submission.error = `HTTP ${response.statusCode}: ${response.body}`;
      }
    } catch (error) {
      console.error('❌ Submission error:', error.message);
      submission.status = 'error';
      submission.error = error.message;
    }
    
    // Log submission
    this.submissionLog.push(submission);
    await this.saveSubmissionLog();
    
    return submission;
  }

  /**
   * Send events to New Relic Event API
   */
  async sendToEventAPI(events) {
    const url = this.config.newRelic.endpoints.events
      .replace('{accountId}', this.accountId);
    
    const parsedUrl = new URL(url);
    
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Insert-Key': this.insertKey
      }
    };
    
    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            statusMessage: res.statusMessage,
            headers: res.headers,
            body: data
          });
        });
      });
      
      req.on('error', reject);
      req.write(JSON.stringify(events));
      req.end();
    });
  }

  /**
   * Submit multiple payloads in batch
   */
  async submitBatch(payloads, options = {}) {
    console.log(`\n📦 Submitting batch of ${payloads.length} payloads...`);
    
    const results = [];
    const { parallel = false, delayMs = 1000 } = options;
    
    if (parallel) {
      // Submit all payloads in parallel
      const promises = payloads.map((payload, index) => 
        this.submitPayload(payload.payload || payload, {
          ...payload.metadata,
          batchIndex: index
        })
      );
      
      const submissions = await Promise.allSettled(promises);
      
      submissions.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            status: 'error',
            error: result.reason.message,
            batchIndex: index
          });
        }
      });
    } else {
      // Submit payloads sequentially with delay
      for (let i = 0; i < payloads.length; i++) {
        const payload = payloads[i];
        const submission = await this.submitPayload(
          payload.payload || payload,
          {
            ...payload.metadata,
            batchIndex: i
          }
        );
        results.push(submission);
        
        // Delay between submissions (except for last one)
        if (i < payloads.length - 1 && delayMs > 0) {
          console.log(`⏳ Waiting ${delayMs}ms before next submission...`);
          await this.sleep(delayMs);
        }
      }
    }
    
    // Summary
    const successful = results.filter(r => 
      r.status === 200 || r.status === 202
    ).length;
    
    console.log(`\n📊 Batch submission complete:`);
    console.log(`   ✅ Successful: ${successful}/${payloads.length}`);
    console.log(`   ❌ Failed: ${payloads.length - successful}/${payloads.length}`);
    
    return results;
  }

  /**
   * Submit a simulation (series of related payloads)
   */
  async submitSimulation(simulation) {
    console.log(`\n🎮 Running simulation: ${simulation.name}`);
    console.log(`   Steps: ${simulation.steps.length}`);
    
    const results = {
      name: simulation.name,
      startTime: new Date().toISOString(),
      steps: [],
      summary: null
    };
    
    for (const step of simulation.steps) {
      console.log(`\n📍 Step ${step.step}: ${step.action}`);
      
      const stepResult = {
        step: step.step,
        action: step.action,
        result: null
      };
      
      switch (step.action) {
        case 'send':
          // Submit payload(s)
          const payloads = Array.isArray(step.payload) 
            ? step.payload 
            : [step.payload];
          
          stepResult.result = await this.submitBatch(payloads, {
            parallel: step.parallel || false,
            delayMs: step.delayMs || 1000
          });
          break;
          
        case 'wait':
          console.log(`⏳ Waiting ${step.duration} seconds...`);
          await this.sleep(step.duration * 1000);
          stepResult.result = { waited: step.duration };
          break;
          
        default:
          console.warn(`Unknown action: ${step.action}`);
          stepResult.result = { error: 'Unknown action' };
      }
      
      results.steps.push(stepResult);
    }
    
    results.endTime = new Date().toISOString();
    results.summary = this.summarizeSimulation(results);
    
    // Save simulation results
    const filename = `simulation-${Date.now()}.json`;
    await fs.writeFile(
      path.join(__dirname, '..', 'results', 'detailed-reports', filename),
      JSON.stringify(results, null, 2)
    );
    
    console.log(`\n📁 Simulation results saved to: ${filename}`);
    
    return results;
  }

  /**
   * Retry failed submissions
   */
  async retryFailedSubmissions() {
    const failed = this.submissionLog.filter(s => 
      s.status !== 200 && s.status !== 202
    );
    
    if (failed.length === 0) {
      console.log('✅ No failed submissions to retry');
      return [];
    }
    
    console.log(`\n🔄 Retrying ${failed.length} failed submissions...`);
    
    const retryResults = [];
    for (const submission of failed) {
      // Reconstruct payload from original submission
      const payload = submission.events;
      const result = await this.submitPayload(payload, {
        ...submission.metadata,
        retry: true,
        originalTimestamp: submission.timestamp
      });
      
      retryResults.push(result);
    }
    
    return retryResults;
  }

  /**
   * Save submission log to file
   */
  async saveSubmissionLog() {
    const logPath = path.join(
      __dirname,
      '..',
      'results',
      'submission-log.json'
    );
    
    await fs.writeFile(
      logPath,
      JSON.stringify(this.submissionLog, null, 2)
    );
  }

  /**
   * Generate submission report
   */
  async generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      totalSubmissions: this.submissionLog.length,
      successful: this.submissionLog.filter(s => 
        s.status === 200 || s.status === 202
      ).length,
      failed: this.submissionLog.filter(s => 
        s.status !== 200 && s.status !== 202
      ).length,
      submissions: this.submissionLog
    };
    
    const reportPath = path.join(
      __dirname,
      '..',
      'results',
      `submission-report-${Date.now()}.json`
    );
    
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    console.log('\n📊 Submission Report:');
    console.log(`   Total: ${report.totalSubmissions}`);
    console.log(`   ✅ Successful: ${report.successful}`);
    console.log(`   ❌ Failed: ${report.failed}`);
    console.log(`   📁 Report saved to: ${reportPath}`);
    
    return report;
  }

  /**
   * Clear submission log
   */
  clearLog() {
    this.submissionLog = [];
    console.log('🧹 Submission log cleared');
  }

  // Helper methods
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  summarizeSimulation(results) {
    const totalSteps = results.steps.length;
    const sendSteps = results.steps.filter(s => s.action === 'send');
    const totalEvents = sendSteps.reduce((sum, step) => {
      return sum + (step.result?.length || 0);
    }, 0);
    
    const successful = sendSteps.reduce((sum, step) => {
      if (Array.isArray(step.result)) {
        return sum + step.result.filter(r => 
          r.status === 200 || r.status === 202
        ).length;
      }
      return sum;
    }, 0);
    
    return {
      totalSteps,
      sendSteps: sendSteps.length,
      totalEvents,
      successfulEvents: successful,
      failedEvents: totalEvents - successful,
      duration: this.calculateDuration(results.startTime, results.endTime)
    };
  }

  calculateDuration(startTime, endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const durationMs = end - start;
    return `${Math.round(durationMs / 1000)}s`;
  }
}

module.exports = SubmissionEngine;