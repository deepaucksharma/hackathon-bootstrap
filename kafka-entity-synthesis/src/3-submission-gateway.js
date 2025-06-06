#!/usr/bin/env node

/**
 * Submission Gateway - Send payloads to New Relic Event API
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { loadEnv } = require('./lib/common');

class SubmissionGateway {
  constructor() {
    this.env = loadEnv();
    this.config = JSON.parse(fs.readFileSync('config/platform-config.json', 'utf8'));
  }

  /**
   * Submit payload to Event API
   */
  async submit(payload, experiment, options = {}) {
    console.log(`📤 Submitting payload for: ${experiment.name}`);
    
    const startTime = Date.now();
    
    try {
      // Validate payload
      this.validatePayload(payload);
      
      // Submit to API
      const response = await this.sendToAPI(payload, options.dryRun);
      
      // Record submission
      const submission = {
        timestamp: new Date().toISOString(),
        experimentId: experiment.metadata.id,
        experimentName: experiment.name,
        status: response.status,
        statusText: response.statusText,
        duration: Date.now() - startTime,
        eventCount: Array.isArray(payload) ? payload.length : 1,
        dryRun: options.dryRun || false
      };
      
      // Save submission record
      this.saveSubmission(submission, experiment);
      
      console.log(`  ✅ Submitted ${submission.eventCount} events (${submission.duration}ms)`);
      
      return submission;
      
    } catch (error) {
      console.error(`  ❌ Submission failed: ${error.message}`);
      
      const submission = {
        timestamp: new Date().toISOString(),
        experimentId: experiment.metadata.id,
        experimentName: experiment.name,
        status: 'error',
        error: error.message,
        duration: Date.now() - startTime
      };
      
      this.saveSubmission(submission, experiment);
      
      throw error;
    }
  }

  /**
   * Validate payload before submission
   */
  validatePayload(payload) {
    if (!payload) {
      throw new Error('Payload is empty');
    }
    
    const events = Array.isArray(payload) ? payload : [payload];
    
    for (const event of events) {
      if (!event.eventType) {
        throw new Error('Event missing eventType');
      }
      
      if (!event.timestamp) {
        throw new Error('Event missing timestamp');
      }
      
      // Check for common MSK event types
      const validEventTypes = [
        'AwsMskClusterSample',
        'AwsMskBrokerSample',
        'AwsMskTopicSample'
      ];
      
      if (!validEventTypes.includes(event.eventType)) {
        console.warn(`  ⚠️  Unusual event type: ${event.eventType}`);
      }
    }
  }

  /**
   * Send payload to New Relic Event API
   */
  async sendToAPI(payload, dryRun = false) {
    if (dryRun) {
      console.log('  🔍 DRY RUN - Would send:');
      console.log(JSON.stringify(payload, null, 2).substring(0, 500) + '...');
      return { status: 200, statusText: 'OK (dry run)' };
    }
    
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(payload);
      const accountId = this.env.NEW_RELIC_ACCOUNT_ID;
      
      const options = {
        hostname: 'insights-collector.newrelic.com',
        path: `/v1/accounts/${accountId}/events`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Insert-Key': this.env.NEW_RELIC_LICENSE_KEY,
          'Content-Length': data.length
        }
      };

      const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', chunk => responseData += chunk);
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            statusText: res.statusMessage,
            body: responseData
          });
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  /**
   * Save submission record
   */
  saveSubmission(submission, experiment) {
    const dir = path.join('results', 'detailed', experiment.metadata.id);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const filename = path.join(dir, 'submission.json');
    fs.writeFileSync(filename, JSON.stringify(submission, null, 2));
  }

  /**
   * Query recent submissions
   */
  async querySubmissions(experimentId) {
    const query = `
      FROM Event 
      SELECT count(*) 
      WHERE _experimentId = '${experimentId}' 
      SINCE 30 minutes ago
    `;
    
    // This would use the GraphQL API to verify submission
    // For now, return a placeholder
    return { query, status: 'pending' };
  }
}

// Command line interface for testing
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log('Usage: node 3-submission-gateway.js <payload.json> [--dry-run]');
    process.exit(1);
  }
  
  try {
    const gateway = new SubmissionGateway();
    const payload = JSON.parse(fs.readFileSync(args[0], 'utf8'));
    const dryRun = args.includes('--dry-run');
    
    // Create mock experiment for testing
    const experiment = {
      name: 'Manual Test',
      metadata: {
        id: `manual-test-${Date.now()}`
      }
    };
    
    gateway.submit(payload, experiment, { dryRun })
      .then(result => {
        console.log('\nSubmission Result:', result);
      })
      .catch(error => {
        console.error('❌ Error:', error.message);
        process.exit(1);
      });
      
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

module.exports = SubmissionGateway;