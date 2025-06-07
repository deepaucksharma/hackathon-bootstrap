/**
 * Enhanced Verification Engine - The Engine of Rigor
 * 
 * Executes comprehensive checks to verify entity synthesis,
 * UI visibility, metric population, and system health.
 */

const https = require('https');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

class VerificationEngine {
  constructor(config) {
    this.config = config;
    this.apiKey = config.newRelic.apiKeys.query || config.newRelic.apiKeys.user;
    this.accountId = config.newRelic.accountId;
    
    // Load entity definitions for validation
    const entityDefsPath = path.join(__dirname, '..', 'config', 'entity-definitions.json');
    this.entityDefinitions = JSON.parse(fs.readFileSync(entityDefsPath, 'utf8'));
    
    // Register all available checks
    this.checks = {
      // Core entity checks
      entityShouldExist: this.entityShouldExist.bind(this),
      entityShouldNotExist: this.entityShouldNotExist.bind(this),
      entityShouldBeInUi: this.entityShouldBeInUi.bind(this),
      entityShouldHaveCorrectType: this.entityShouldHaveCorrectType.bind(this),
      
      // Metric checks
      metricShouldBePopulated: this.metricShouldBePopulated.bind(this),
      metricShouldHaveValue: this.metricShouldHaveValue.bind(this),
      allAggregationsShouldExist: this.allAggregationsShouldExist.bind(this),
      
      // Health and status checks
      healthStatusShouldBe: this.healthStatusShouldBe.bind(this),
      entityShouldBeHealthy: this.entityShouldBeHealthy.bind(this),
      entityShouldBeUnhealthy: this.entityShouldBeUnhealthy.bind(this),
      
      // Relationship checks
      relationshipShouldExist: this.relationshipShouldExist.bind(this),
      clusterShouldHaveBrokers: this.clusterShouldHaveBrokers.bind(this),
      
      // Data quality checks
      eventCountShouldBe: this.eventCountShouldBe.bind(this),
      fieldShouldExist: this.fieldShouldExist.bind(this),
      fieldShouldNotExist: this.fieldShouldNotExist.bind(this),
      
      // UI-specific checks
      shouldAppearInMessageQueues: this.shouldAppearInMessageQueues.bind(this),
      shouldHaveChart: this.shouldHaveChart.bind(this),
      
      // Custom validation
      customQuery: this.customQuery.bind(this)
    };
  }

  /**
   * Run verification for an experiment
   */
  async verify(experiment, submissionResult) {
    console.log('\n🔍 Running verification checks...');
    
    const results = {
      timestamp: new Date().toISOString(),
      experimentName: experiment.name,
      checks: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0
      }
    };
    
    // Default to standard checks if none specified
    const checks = experiment.verification?.checks || this.getDefaultChecks(experiment);
    
    // Wait for entity synthesis
    const waitTime = experiment.verification?.waitTime || 30000;
    console.log(`⏳ Waiting ${waitTime/1000}s for entity synthesis...`);
    await this.sleep(waitTime);
    
    // Run each check
    for (const check of checks) {
      console.log(`\n📋 Running check: ${check.type}`);
      
      const checkResult = await this.runCheck(check, experiment);
      results.checks.push(checkResult);
      results.summary.total++;
      
      if (checkResult.passed) {
        results.summary.passed++;
        console.log(`   ✅ PASSED${checkResult.message ? ': ' + checkResult.message : ''}`);
      } else {
        results.summary.failed++;
        console.log(`   ❌ FAILED: ${checkResult.error || 'Unknown error'}`);
      }
      
      // Show details if available
      if (checkResult.details) {
        console.log(`   📊 Details:`, checkResult.details);
      }
    }
    
    // Overall result
    results.success = results.summary.failed === 0;
    console.log(`\n📊 Verification Summary: ${results.summary.passed}/${results.summary.total} passed`);
    
    // Save results
    await this.saveResults(results, experiment);
    
    return results;
  }

  /**
   * Run a single check with retries
   */
  async runCheck(checkConfig, experiment) {
    const checkFn = this.checks[checkConfig.type];
    
    if (!checkFn) {
      return {
        type: checkConfig.type,
        passed: false,
        error: `Unknown check type: ${checkConfig.type}`,
        timestamp: new Date().toISOString()
      };
    }
    
    const maxRetries = checkConfig.retries || 3;
    const retryDelay = checkConfig.retryDelay || 10000;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await checkFn(checkConfig.params || {}, experiment);
        
        if (result.passed) {
          return {
            type: checkConfig.type,
            passed: true,
            attempt,
            message: result.message,
            details: result.details,
            timestamp: new Date().toISOString()
          };
        }
        
        // Failed but might retry
        if (attempt < maxRetries) {
          console.log(`   ↻ Retrying in ${retryDelay/1000}s... (${attempt}/${maxRetries})`);
          await this.sleep(retryDelay);
        } else {
          // Final failure
          return {
            type: checkConfig.type,
            passed: false,
            error: result.error || 'Check failed',
            details: result.details,
            attempts: attempt,
            timestamp: new Date().toISOString()
          };
        }
      } catch (error) {
        if (attempt === maxRetries) {
          return {
            type: checkConfig.type,
            passed: false,
            error: error.message,
            attempts: attempt,
            timestamp: new Date().toISOString()
          };
        }
        await this.sleep(retryDelay);
      }
    }
  }

  // ========== CORE ENTITY CHECKS ==========

  async entityShouldExist(params, experiment) {
    const entityName = this.resolveValue(params.name, experiment);
    const entityType = params.type || 'AWS_KAFKA_BROKER';
    
    const query = `
      query {
        actor {
          entitySearch(query: "name = '${entityName}' AND type = '${entityType}'") {
            results {
              entities {
                guid
                name
                type
                accountId
              }
            }
          }
        }
      }
    `;
    
    const response = await this.runGraphQL(query);
    const entities = response?.data?.actor?.entitySearch?.results?.entities || [];
    
    if (entities.length > 0) {
      return {
        passed: true,
        message: `Entity found: ${entities[0].guid}`,
        details: { entity: entities[0] }
      };
    }
    
    return {
      passed: false,
      error: `Entity not found: ${entityName} (${entityType})`
    };
  }

  async entityShouldNotExist(params, experiment) {
    const result = await this.entityShouldExist(params, experiment);
    return {
      passed: !result.passed,
      error: result.passed ? 'Entity exists but should not' : null,
      message: result.passed ? null : 'Entity correctly does not exist'
    };
  }

  async entityShouldHaveCorrectType(params, experiment) {
    const entityName = this.resolveValue(params.name, experiment);
    const expectedType = params.expectedType;
    const expectedDomain = params.expectedDomain || 'INFRA';
    
    const query = `
      query {
        actor {
          entitySearch(query: "name = '${entityName}'") {
            results {
              entities {
                guid
                name
                type
                domain
                entityType
              }
            }
          }
        }
      }
    `;
    
    const response = await this.runGraphQL(query);
    const entities = response?.data?.actor?.entitySearch?.results?.entities || [];
    
    if (entities.length === 0) {
      return {
        passed: false,
        error: 'Entity not found'
      };
    }
    
    const entity = entities[0];
    const typeMatches = entity.type === expectedType;
    const domainMatches = entity.domain === expectedDomain;
    
    if (typeMatches && domainMatches) {
      return {
        passed: true,
        message: `Entity has correct type: ${expectedDomain}:${expectedType}`,
        details: { entity }
      };
    }
    
    return {
      passed: false,
      error: `Expected ${expectedDomain}:${expectedType}, got ${entity.domain}:${entity.type}`,
      details: { entity }
    };
  }

  async entityShouldBeInUi(params, experiment) {
    const entityGuid = this.resolveValue(params.guid, experiment);
    
    // The critical check - query MessageQueueSample
    const query = `
      FROM MessageQueueSample 
      WHERE entity.guid = '${entityGuid}'
      SELECT count(*), latest(queue.messagesPerSecond), latest(provider)
      SINCE 30 minutes ago
    `;
    
    const results = await this.runNRQL(query);
    
    if (results && results.length > 0 && results[0].count > 0) {
      return {
        passed: true,
        message: 'Entity visible in Message Queues UI',
        details: {
          eventCount: results[0].count,
          provider: results[0]['latest.provider'],
          throughput: results[0]['latest.queue.messagesPerSecond']
        }
      };
    }
    
    return {
      passed: false,
      error: 'Entity not visible in Message Queues UI (no MessageQueueSample events)'
    };
  }

  // ========== METRIC CHECKS ==========

  async metricShouldBePopulated(params, experiment) {
    const entityName = this.resolveValue(params.entityName, experiment);
    const metricName = params.metricName;
    const eventType = params.eventType || 'AwsMskBrokerSample';
    
    const query = `
      FROM ${eventType}
      SELECT latest(${metricName}) as value
      WHERE entityName = '${entityName}'
      SINCE 30 minutes ago
    `;
    
    const results = await this.runNRQL(query);
    const value = results?.[0]?.value;
    
    if (value !== null && value !== undefined) {
      return {
        passed: true,
        message: `Metric populated: ${metricName} = ${value}`,
        details: { value }
      };
    }
    
    return {
      passed: false,
      error: `Metric not populated: ${metricName}`
    };
  }

  async metricShouldHaveValue(params, experiment) {
    const result = await this.metricShouldBePopulated(params, experiment);
    
    if (!result.passed) {
      return result;
    }
    
    const actualValue = result.details.value;
    const expectedValue = params.value;
    const operator = params.operator || '=';
    
    let passed = false;
    switch (operator) {
      case '=':
      case '==':
        passed = actualValue == expectedValue;
        break;
      case '>':
        passed = actualValue > expectedValue;
        break;
      case '<':
        passed = actualValue < expectedValue;
        break;
      case '>=':
        passed = actualValue >= expectedValue;
        break;
      case '<=':
        passed = actualValue <= expectedValue;
        break;
      case '!=':
        passed = actualValue != expectedValue;
        break;
    }
    
    return {
      passed,
      message: passed ? `Metric ${params.metricName} ${operator} ${expectedValue}` : null,
      error: passed ? null : `Expected ${params.metricName} ${operator} ${expectedValue}, got ${actualValue}`,
      details: { actualValue, expectedValue, operator }
    };
  }

  async allAggregationsShouldExist(params, experiment) {
    const entityName = this.resolveValue(params.entityName, experiment);
    const metricBase = params.metricBase;
    const eventType = params.eventType || 'AwsMskBrokerSample';
    const aggregations = ['.Sum', '.Average', '.Minimum', '.Maximum', '.SampleCount'];
    
    const query = `
      FROM ${eventType}
      SELECT ${aggregations.map(agg => `latest(${metricBase}${agg}) as '${agg}'`).join(', ')}
      WHERE entityName = '${entityName}'
      SINCE 30 minutes ago
    `;
    
    const results = await this.runNRQL(query);
    
    if (!results || results.length === 0) {
      return {
        passed: false,
        error: 'No data found for entity'
      };
    }
    
    const missing = [];
    const found = {};
    
    for (const agg of aggregations) {
      const value = results[0][agg];
      if (value === null || value === undefined) {
        missing.push(`${metricBase}${agg}`);
      } else {
        found[agg] = value;
      }
    }
    
    if (missing.length === 0) {
      return {
        passed: true,
        message: 'All aggregations present',
        details: found
      };
    }
    
    return {
      passed: false,
      error: `Missing aggregations: ${missing.join(', ')}`,
      details: { found, missing }
    };
  }

  // ========== HEALTH STATUS CHECKS ==========

  async healthStatusShouldBe(params, experiment) {
    const entityGuid = this.resolveValue(params.guid, experiment);
    const expectedStatus = params.status;
    
    const query = `
      query {
        actor {
          entity(guid: "${entityGuid}") {
            alertSeverity
            reporting
            tags {
              key
              values
            }
          }
        }
      }
    `;
    
    const response = await this.runGraphQL(query);
    const entity = response?.data?.actor?.entity;
    
    if (!entity) {
      return {
        passed: false,
        error: 'Entity not found'
      };
    }
    
    // Map alert severity to health status
    const statusMap = {
      'NOT_ALERTING': 'HEALTHY',
      'WARNING': 'WARNING',
      'CRITICAL': 'UNHEALTHY',
      'NOT_CONFIGURED': 'UNKNOWN'
    };
    
    const actualStatus = entity.reporting 
      ? statusMap[entity.alertSeverity] || 'UNKNOWN'
      : 'NOT_REPORTING';
    
    const passed = actualStatus === expectedStatus;
    
    return {
      passed,
      message: passed ? `Health status is ${expectedStatus}` : null,
      error: passed ? null : `Expected ${expectedStatus}, got ${actualStatus}`,
      details: {
        actualStatus,
        expectedStatus,
        reporting: entity.reporting,
        alertSeverity: entity.alertSeverity
      }
    };
  }

  async entityShouldBeHealthy(params, experiment) {
    return this.healthStatusShouldBe({ ...params, status: 'HEALTHY' }, experiment);
  }

  async entityShouldBeUnhealthy(params, experiment) {
    return this.healthStatusShouldBe({ ...params, status: 'UNHEALTHY' }, experiment);
  }

  // ========== RELATIONSHIP CHECKS ==========

  async relationshipShouldExist(params, experiment) {
    const sourceGuid = this.resolveValue(params.sourceGuid, experiment);
    const targetGuid = this.resolveValue(params.targetGuid, experiment);
    const relationshipType = params.type || 'MANAGES';
    
    const query = `
      query {
        actor {
          entity(guid: "${sourceGuid}") {
            relationships {
              filter(relationshipTypes: ["${relationshipType}"]) {
                results {
                  target {
                    entity {
                      guid
                      name
                      type
                    }
                  }
                  type
                }
              }
            }
          }
        }
      }
    `;
    
    const response = await this.runGraphQL(query);
    const relationships = response?.data?.actor?.entity?.relationships?.filter?.results || [];
    
    const found = relationships.find(rel => 
      rel.target?.entity?.guid === targetGuid
    );
    
    if (found) {
      return {
        passed: true,
        message: `Relationship exists: ${relationshipType}`,
        details: { relationship: found }
      };
    }
    
    return {
      passed: false,
      error: `Relationship not found: ${sourceGuid} -[${relationshipType}]-> ${targetGuid}`,
      details: { totalRelationships: relationships.length }
    };
  }

  async clusterShouldHaveBrokers(params, experiment) {
    const clusterGuid = this.resolveValue(params.clusterGuid, experiment);
    const expectedCount = params.count || 1;
    
    const query = `
      query {
        actor {
          entity(guid: "${clusterGuid}") {
            relationships {
              filter(relationshipTypes: ["MANAGES"]) {
                results {
                  target {
                    entity {
                      ... on InfrastructureAwsKafkaBrokerEntity {
                        guid
                        name
                        brokerId: tags(keys: ["provider.brokerId"]) {
                          values
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;
    
    const response = await this.runGraphQL(query);
    const brokers = response?.data?.actor?.entity?.relationships?.filter?.results || [];
    
    const brokerCount = brokers.filter(rel => 
      rel.target?.entity?.guid
    ).length;
    
    const passed = expectedCount === '*' 
      ? brokerCount > 0 
      : brokerCount === expectedCount;
    
    return {
      passed,
      message: passed ? `Cluster has ${brokerCount} brokers` : null,
      error: passed ? null : `Expected ${expectedCount} brokers, found ${brokerCount}`,
      details: {
        brokerCount,
        brokers: brokers.map(b => ({
          guid: b.target?.entity?.guid,
          name: b.target?.entity?.name,
          brokerId: b.target?.entity?.brokerId?.values?.[0]
        }))
      }
    };
  }

  // ========== DATA QUALITY CHECKS ==========

  async eventCountShouldBe(params, experiment) {
    const eventType = params.eventType || 'AwsMskBrokerSample';
    const whereClause = params.where || '';
    const expectedCount = params.count;
    const operator = params.operator || '=';
    
    const query = `
      FROM ${eventType}
      SELECT count(*) as eventCount
      ${whereClause}
      SINCE 30 minutes ago
    `;
    
    const results = await this.runNRQL(query);
    const actualCount = results?.[0]?.eventCount || 0;
    
    let passed = false;
    switch (operator) {
      case '>':
        passed = actualCount > expectedCount;
        break;
      case '>=':
        passed = actualCount >= expectedCount;
        break;
      case '=':
      case '==':
        passed = actualCount === expectedCount;
        break;
      case '<':
        passed = actualCount < expectedCount;
        break;
      case '<=':
        passed = actualCount <= expectedCount;
        break;
    }
    
    return {
      passed,
      message: passed ? `Event count ${operator} ${expectedCount}` : null,
      error: passed ? null : `Expected count ${operator} ${expectedCount}, got ${actualCount}`,
      details: { actualCount, expectedCount, operator }
    };
  }

  async fieldShouldExist(params, experiment) {
    const eventType = params.eventType || 'AwsMskBrokerSample';
    const fieldName = params.field;
    const whereClause = params.where || '';
    
    const query = `
      FROM ${eventType}
      SELECT count(*) as withField
      WHERE ${fieldName} IS NOT NULL
      ${whereClause ? 'AND ' + whereClause : ''}
      SINCE 30 minutes ago
    `;
    
    const results = await this.runNRQL(query);
    const count = results?.[0]?.withField || 0;
    
    return {
      passed: count > 0,
      message: count > 0 ? `Field ${fieldName} exists (${count} events)` : null,
      error: count === 0 ? `Field ${fieldName} not found` : null,
      details: { fieldName, eventsWithField: count }
    };
  }

  async fieldShouldNotExist(params, experiment) {
    const result = await this.fieldShouldExist(params, experiment);
    return {
      passed: !result.passed,
      message: result.passed ? null : `Field ${params.field} correctly absent`,
      error: result.passed ? `Field ${params.field} exists but should not` : null,
      details: result.details
    };
  }

  // ========== UI-SPECIFIC CHECKS ==========

  async shouldAppearInMessageQueues(params, experiment) {
    const clusterName = this.resolveValue(params.clusterName, experiment);
    
    // This is the definitive UI visibility check
    const query = `
      FROM MessageQueueSample
      SELECT count(*), uniques(entity.name), uniques(queue.name)
      WHERE provider = 'AwsMsk'
      AND (entity.name LIKE '%${clusterName}%' OR queue.name LIKE '%${clusterName}%')
      SINCE 30 minutes ago
    `;
    
    const results = await this.runNRQL(query);
    
    if (results && results.length > 0 && results[0].count > 0) {
      return {
        passed: true,
        message: 'Visible in Message Queues UI',
        details: {
          eventCount: results[0].count,
          entities: results[0]['uniques.entity.name'],
          queues: results[0]['uniques.queue.name']
        }
      };
    }
    
    return {
      passed: false,
      error: 'Not visible in Message Queues UI'
    };
  }

  async shouldHaveChart(params, experiment) {
    const entityName = this.resolveValue(params.entityName, experiment);
    const chartType = params.chartType || 'throughput';
    
    // Check for specific metrics that power charts
    const chartMetrics = {
      throughput: ['provider.bytesInPerSec.Average', 'provider.bytesOutPerSec.Average'],
      messages: ['provider.messagesInPerSec.Average'],
      cpu: ['provider.cpuUser.Average', 'provider.cpuSystem.Average'],
      disk: ['provider.diskUsed.Average', 'provider.diskFree.Average']
    };
    
    const metrics = chartMetrics[chartType] || chartMetrics.throughput;
    
    const query = `
      FROM AwsMskBrokerSample
      SELECT ${metrics.map(m => `latest(${m})`).join(', ')}
      WHERE entityName = '${entityName}'
      SINCE 30 minutes ago
    `;
    
    const results = await this.runNRQL(query);
    
    if (!results || results.length === 0) {
      return {
        passed: false,
        error: 'No data for chart metrics'
      };
    }
    
    const hasData = metrics.some(metric => {
      const value = results[0][`latest.${metric}`];
      return value !== null && value !== undefined && value > 0;
    });
    
    return {
      passed: hasData,
      message: hasData ? `Chart data available for ${chartType}` : null,
      error: hasData ? null : `No data for ${chartType} chart`,
      details: results[0]
    };
  }

  // ========== CUSTOM VALIDATION ==========

  async customQuery(params, experiment) {
    const query = this.resolveValue(params.query, experiment);
    const validation = params.validation;
    
    const results = await this.runNRQL(query);
    
    if (!results || results.length === 0) {
      return {
        passed: false,
        error: 'Query returned no results'
      };
    }
    
    // Apply custom validation logic
    if (validation) {
      const evalContext = { results, result: results[0] };
      try {
        const passed = eval(validation);
        return {
          passed: !!passed,
          message: passed ? 'Custom validation passed' : null,
          error: passed ? null : 'Custom validation failed',
          details: results[0]
        };
      } catch (e) {
        return {
          passed: false,
          error: `Validation error: ${e.message}`
        };
      }
    }
    
    // Default: pass if any results
    return {
      passed: true,
      message: 'Query returned results',
      details: results[0]
    };
  }

  // ========== HELPER METHODS ==========

  resolveValue(value, experiment) {
    if (typeof value !== 'string') return value;
    
    // Replace placeholders
    return value.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      // Check experiment payload
      if (experiment.payload && experiment.payload[key]) {
        return experiment.payload[key];
      }
      // Check experiment metadata
      if (experiment[key]) {
        return experiment[key];
      }
      // Check timestamp
      if (key === 'timestamp') {
        return Date.now();
      }
      return match;
    });
  }

  async runNRQL(query) {
    const graphqlQuery = {
      query: `{
        actor {
          account(id: ${this.accountId}) {
            nrql(query: "${query.replace(/"/g, '\\"').replace(/\n/g, ' ')}") {
              results
            }
          }
        }
      }`
    };
    
    const response = await this.runGraphQL(graphqlQuery.query);
    return response?.data?.actor?.account?.nrql?.results;
  }

  async runGraphQL(query) {
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

  getDefaultChecks(experiment) {
    // Return sensible defaults based on entity type
    const entityType = experiment.entityType || 'broker';
    
    const commonChecks = [
      {
        type: 'entityShouldExist',
        params: {
          name: '{{entityName}}',
          type: entityType === 'broker' ? 'AWS_KAFKA_BROKER' : 
                entityType === 'cluster' ? 'AWS_KAFKA_CLUSTER' : 
                'AWS_KAFKA_TOPIC'
        }
      },
      {
        type: 'shouldAppearInMessageQueues',
        params: { clusterName: '{{clusterName}}' }
      }
    ];
    
    if (entityType === 'broker') {
      commonChecks.push({
        type: 'metricShouldBePopulated',
        params: {
          entityName: '{{entityName}}',
          metricName: 'provider.bytesInPerSec.Average'
        }
      });
    }
    
    return commonChecks;
  }

  async saveResults(results, experiment) {
    const filename = `verification-${experiment.name.replace(/\s+/g, '-')}-${Date.now()}.json`;
    const filepath = path.join(
      __dirname,
      '..',
      'results',
      'detailed-reports',
      filename
    );
    
    await fsPromises.writeFile(filepath, JSON.stringify(results, null, 2));
    console.log(`\n📁 Verification results saved to: ${filename}`);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = VerificationEngine;