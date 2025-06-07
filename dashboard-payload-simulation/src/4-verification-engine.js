#!/usr/bin/env node

/**
 * Verification Engine - Rigorous verification of experiment outcomes
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { loadEnv, sleep } = require('./lib/common');

class VerificationEngine {
  constructor() {
    this.env = loadEnv();
    this.config = JSON.parse(fs.readFileSync('config/platform-config.json', 'utf8'));
    this.checks = {
      entityExists: this.checkEntityExists.bind(this),
      uiQuery: this.checkUIQuery.bind(this),
      metricPopulated: this.checkMetricPopulated.bind(this),
      relationshipExists: this.checkRelationshipExists.bind(this),
      messageQueueSample: this.checkMessageQueueSample.bind(this)
    };
  }

  /**
   * Run all verification checks for an experiment
   */
  async verify(experiment, submission) {
    console.log(`\n🔍 Running verification for: ${experiment.name}`);
    
    const verificationConfig = experiment.verification || {};
    const timeout = verificationConfig.timeout || this.config.defaults.verificationTimeout;
    const startTime = Date.now();
    
    // Wait for initial entity synthesis
    const synthDelay = verificationConfig.initialDelay || this.config.defaults.entitySynthesisDelay;
    console.log(`  ⏳ Waiting ${synthDelay}s for entity synthesis...`);
    await sleep(synthDelay * 1000);
    
    const results = {
      timestamp: new Date().toISOString(),
      experimentId: experiment.metadata.id,
      experimentName: experiment.name,
      checks: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0
      }
    };
    
    // Run each check
    for (const check of verificationConfig.checks || []) {
      console.log(`\n  📋 Check: ${check.type}`);
      
      const checkResult = await this.runCheck(check, experiment, timeout);
      results.checks.push(checkResult);
      results.summary.total++;
      
      if (checkResult.status === 'passed') {
        results.summary.passed++;
        console.log(`    ✅ PASSED`);
      } else if (checkResult.status === 'failed') {
        results.summary.failed++;
        console.log(`    ❌ FAILED: ${checkResult.reason}`);
      } else {
        results.summary.skipped++;
        console.log(`    ⏭️  SKIPPED: ${checkResult.reason}`);
      }
    }
    
    results.duration = Date.now() - startTime;
    results.success = results.summary.failed === 0 && results.summary.passed > 0;
    
    // Save results
    this.saveResults(results, experiment);
    
    console.log(`\n  📊 Summary: ${results.summary.passed}/${results.summary.total} passed`);
    
    return results;
  }

  /**
   * Run a single check with retries
   */
  async runCheck(checkConfig, experiment, timeout) {
    const checkFn = this.checks[checkConfig.type];
    
    if (!checkFn) {
      return {
        type: checkConfig.type,
        status: 'skipped',
        reason: 'Unknown check type'
      };
    }
    
    const typeConfig = this.config.verificationTypes[checkConfig.type];
    const maxRetries = typeConfig.retryable ? typeConfig.maxRetries : 1;
    const retryDelay = typeConfig.retryDelay || 30;
    const endTime = Date.now() + (timeout * 1000);
    
    let attempt = 0;
    let lastError = null;
    
    while (attempt < maxRetries && Date.now() < endTime) {
      attempt++;
      
      try {
        const result = await checkFn(checkConfig.details || {}, experiment);
        
        if (result.success) {
          return {
            type: checkConfig.type,
            status: 'passed',
            attempts: attempt,
            details: result
          };
        }
        
        lastError = result.error || 'Check returned false';
        
      } catch (error) {
        lastError = error.message;
      }
      
      if (attempt < maxRetries && Date.now() + (retryDelay * 1000) < endTime) {
        console.log(`    ↻ Retry ${attempt}/${maxRetries} in ${retryDelay}s...`);
        await sleep(retryDelay * 1000);
      }
    }
    
    return {
      type: checkConfig.type,
      status: 'failed',
      attempts: attempt,
      reason: lastError
    };
  }

  /**
   * Check: Entity exists in NerdGraph
   */
  async checkEntityExists(details, experiment) {
    const entityName = this.processTemplate(details.entityName, experiment);
    const entityType = details.entityType || 'AWS_KAFKA_BROKER';
    
    const query = `
      query {
        actor {
          entitySearch(query: "name = '${entityName}' AND type = '${entityType}'") {
            results {
              entities {
                guid
                name
                type
                tags {
                  key
                  values
                }
              }
            }
          }
        }
      }
    `;
    
    const response = await this.runGraphQLQuery(query);
    const entities = response?.data?.actor?.entitySearch?.results?.entities || [];
    
    if (entities.length > 0) {
      return {
        success: true,
        entityGuid: entities[0].guid,
        entity: entities[0]
      };
    }
    
    return {
      success: false,
      error: `Entity not found: ${entityName}`
    };
  }

  /**
   * Check: UI query returns results
   */
  async checkUIQuery(details, experiment) {
    const nrql = this.processTemplate(details.query, experiment);
    
    const results = await this.runNRQLQuery(nrql);
    
    if (results && results.length > 0) {
      const hasData = results[0].count > 0 || 
                      results[0].results > 0 ||
                      results[0].facets?.length > 0;
      
      return {
        success: hasData,
        results: results[0],
        error: hasData ? null : 'Query returned no data'
      };
    }
    
    return {
      success: false,
      error: 'Query failed or returned empty'
    };
  }

  /**
   * Check: Specific metrics are populated
   */
  async checkMetricPopulated(details, experiment) {
    const entityName = this.processTemplate(details.entityName || experiment.basePayload?.entityName, experiment);
    const metricName = details.metricName;
    
    if (!metricName) {
      return { success: false, error: 'No metricName specified' };
    }
    
    const query = `
      FROM AwsMskBrokerSample 
      SELECT latest(${metricName}) 
      WHERE entityName = '${entityName}' 
      SINCE 30 minutes ago
    `;
    
    const results = await this.runNRQLQuery(query);
    const value = results?.[0]?.[`latest.${metricName}`];
    
    return {
      success: value !== null && value !== undefined,
      value,
      error: value === null ? `Metric ${metricName} is null` : null
    };
  }

  /**
   * Check: Entity relationships exist
   */
  async checkRelationshipExists(details, experiment) {
    const fromEntity = this.processTemplate(details.fromEntity, experiment);
    const toEntity = this.processTemplate(details.toEntity, experiment);
    const relationshipType = details.relationshipType || 'MANAGES';
    
    const query = `
      query {
        actor {
          entity(guid: "${fromEntity}") {
            relationships {
              filter(relationshipTypes: ["${relationshipType}"]) {
                results {
                  target {
                    entity {
                      guid
                      name
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;
    
    const response = await this.runGraphQLQuery(query);
    const relationships = response?.data?.actor?.entity?.relationships?.filter?.results || [];
    
    const hasRelationship = relationships.some(rel => 
      rel.target?.entity?.guid === toEntity ||
      rel.target?.entity?.name === toEntity
    );
    
    return {
      success: hasRelationship,
      relationships: relationships.length,
      error: hasRelationship ? null : 'Relationship not found'
    };
  }

  /**
   * Check: Entity appears in MessageQueueSample
   */
  async checkMessageQueueSample(details, experiment) {
    const entityName = this.processTemplate(details.entityName || experiment.basePayload?.entityName, experiment);
    
    const query = `
      FROM MessageQueueSample 
      SELECT count(*), uniques(queue.name) 
      WHERE provider = 'AwsMsk' 
      AND queue.name LIKE '%${entityName}%' 
      SINCE 30 minutes ago
    `;
    
    const results = await this.runNRQLQuery(query);
    const count = results?.[0]?.count || 0;
    
    return {
      success: count > 0,
      count,
      error: count === 0 ? 'Not found in MessageQueueSample' : null
    };
  }

  /**
   * Process template strings
   */
  processTemplate(template, experiment) {
    if (!template) return '';
    
    return template.replace(/\${(\w+)}/g, (match, key) => {
      if (key === 'timestamp') return experiment.metadata.timestamp;
      if (key === 'experimentId') return experiment.metadata.id;
      return experiment.basePayload?.[key] || match;
    });
  }

  /**
   * Run NRQL query
   */
  async runNRQLQuery(nrql) {
    return new Promise((resolve, reject) => {
      const query = {
        query: `{ actor { account(id: ${this.env.NEW_RELIC_ACCOUNT_ID}) { nrql(query: "${nrql.replace(/"/g, '\\"').replace(/\n/g, ' ')}") { results } } } }`
      };

      const options = {
        hostname: 'api.newrelic.com',
        path: '/graphql',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'API-Key': this.env.NEW_RELIC_USER_KEY
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.data?.actor?.account?.nrql?.results) {
              resolve(response.data.actor.account.nrql.results);
            } else {
              reject(new Error('Query failed'));
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.write(JSON.stringify(query));
      req.end();
    });
  }

  /**
   * Run GraphQL query
   */
  async runGraphQLQuery(query) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.newrelic.com',
        path: '/graphql',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'API-Key': this.env.NEW_RELIC_USER_KEY
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.write(JSON.stringify({ query }));
      req.end();
    });
  }

  /**
   * Save verification results
   */
  saveResults(results, experiment) {
    const dir = path.join('results', 'detailed', experiment.metadata.id);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const filename = path.join(dir, 'verification-results.json');
    fs.writeFileSync(filename, JSON.stringify(results, null, 2));
  }
}

// Command line interface for testing
if (require.main === module) {
  const engine = new VerificationEngine();
  
  // Test entity exists check
  const testCheck = {
    type: 'entityExists',
    details: {
      entityName: 'test-entity',
      entityType: 'AWS_KAFKA_BROKER'
    }
  };
  
  const mockExperiment = {
    name: 'Manual Test',
    metadata: { id: 'test' }
  };
  
  engine.runCheck(testCheck, mockExperiment, 60)
    .then(result => {
      console.log('Check result:', result);
    })
    .catch(error => {
      console.error('Error:', error);
    });
}

module.exports = VerificationEngine;