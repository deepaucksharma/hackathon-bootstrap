/**
 * Capture Engine - Fetches golden payloads from a reference account
 * 
 * This engine queries a known-good New Relic account to capture
 * pristine examples of working MSK entities.
 */

const https = require('https');
const fs = require('fs').promises;
const path = require('path');

class CaptureEngine {
  constructor(config) {
    this.config = config;
    this.apiKey = config.newRelic.apiKeys.query;
    this.accountId = config.newRelic.accountId;
  }

  /**
   * Execute NRQL query against reference account
   */
  async queryNRQL(query, referenceAccountId = null) {
    const accountId = referenceAccountId || this.accountId;
    
    const graphqlQuery = {
      query: `{
        actor {
          account(id: ${accountId}) {
            nrql(query: "${query.replace(/"/g, '\\"')}") {
              results
            }
          }
        }
      }`
    };

    const options = {
      hostname: 'api.newrelic.com',
      path: '/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-Key': this.apiKey
      }
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            if (result.data?.actor?.account?.nrql?.results) {
              resolve(result.data.actor.account.nrql.results);
            } else {
              reject(new Error('Invalid response structure'));
            }
          } catch (e) {
            reject(e);
          }
        });
      });
      
      req.on('error', reject);
      req.write(JSON.stringify(graphqlQuery));
      req.end();
    });
  }

  /**
   * Capture golden payloads from reference account
   */
  async captureGoldenPayloads(referenceAccountId, awsAccountId) {
    console.log('🎯 Capturing golden payloads from reference account...');
    
    const eventTypes = [
      'AwsMskClusterSample',
      'AwsMskBrokerSample',
      'AwsMskTopicSample'
    ];

    const capturedPayloads = {};

    for (const eventType of eventTypes) {
      console.log(`\n📥 Capturing ${eventType}...`);
      
      const query = `
        FROM ${eventType} 
        SELECT * 
        WHERE providerExternalId = '${awsAccountId}'
        SINCE 1 hour ago 
        LIMIT 10
      `;

      try {
        const results = await this.queryNRQL(query, referenceAccountId);
        
        if (results && results.length > 0) {
          // Clean and normalize the payload
          const cleanedPayload = this.normalizePayload(results[0]);
          capturedPayloads[eventType] = cleanedPayload;
          
          // Save to golden payloads directory
          const filename = `${eventType.toLowerCase().replace('sample', '')}.json`;
          const filepath = path.join(
            __dirname, 
            '..', 
            'templates', 
            'golden-payloads',
            filename
          );
          
          await fs.writeFile(
            filepath,
            JSON.stringify(cleanedPayload, null, 2)
          );
          
          console.log(`✅ Captured ${results.length} ${eventType} events`);
          console.log(`📁 Saved to: ${filename}`);
        } else {
          console.log(`⚠️  No ${eventType} events found`);
        }
      } catch (error) {
        console.error(`❌ Error capturing ${eventType}:`, error.message);
      }
    }

    return capturedPayloads;
  }

  /**
   * Normalize captured payload for use as template
   */
  normalizePayload(rawPayload) {
    const normalized = { ...rawPayload };
    
    // Remove dynamic fields that change with each submission
    delete normalized.timestamp;
    delete normalized['nr.ingestTime'];
    
    // Placeholder-ize identifiers
    if (normalized.entityGuid) {
      normalized.entityGuid = '{{ENTITY_GUID}}';
    }
    if (normalized.entityName) {
      normalized.entityName = '{{ENTITY_NAME}}';
    }
    
    // Sort keys for consistency
    return Object.keys(normalized)
      .sort()
      .reduce((obj, key) => {
        obj[key] = normalized[key];
        return obj;
      }, {});
  }

  /**
   * Analyze captured payloads to extract patterns
   */
  async analyzePayloads() {
    console.log('\n🔍 Analyzing captured payloads...\n');
    
    const analysisReport = {
      timestamp: new Date().toISOString(),
      findings: {}
    };

    const payloadFiles = await fs.readdir(
      path.join(__dirname, '..', 'templates', 'golden-payloads')
    );

    for (const file of payloadFiles) {
      if (file.endsWith('.json')) {
        const content = await fs.readFile(
          path.join(__dirname, '..', 'templates', 'golden-payloads', file),
          'utf8'
        );
        const payload = JSON.parse(content);
        
        const entityType = file.replace('.json', '');
        analysisReport.findings[entityType] = {
          fieldCount: Object.keys(payload).length,
          hasCollectorName: !!payload['collector.name'],
          collectorName: payload['collector.name'],
          hasProviderExternalId: !!payload.providerExternalId,
          metricFields: Object.keys(payload).filter(k => k.startsWith('provider.')),
          criticalFields: this.identifyCriticalFields(payload)
        };
      }
    }

    // Save analysis report
    await fs.writeFile(
      path.join(__dirname, '..', 'results', 'payload-analysis.json'),
      JSON.stringify(analysisReport, null, 2)
    );

    return analysisReport;
  }

  /**
   * Identify critical fields based on known patterns
   */
  identifyCriticalFields(payload) {
    const criticalPatterns = [
      'collector.name',
      'instrumentation.provider',
      'provider',
      'awsAccountId',
      'providerExternalId',
      'entityGuid',
      'entityName',
      'eventType'
    ];

    return criticalPatterns.filter(pattern => 
      payload.hasOwnProperty(pattern) && payload[pattern]
    );
  }
}

module.exports = CaptureEngine;