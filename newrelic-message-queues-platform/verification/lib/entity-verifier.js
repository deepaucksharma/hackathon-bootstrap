/**
 * Entity Verifier
 * 
 * Verifies that MESSAGE_QUEUE_* entities are properly synthesized in New Relic
 * and that their data is correctly ingested and queryable.
 */

const https = require('https');

class EntityVerifier {
  constructor(config = {}) {
    this.config = {
      apiKey: config.apiKey || process.env.NEW_RELIC_API_KEY,
      accountId: config.accountId || process.env.NEW_RELIC_ACCOUNT_ID,
      nerdGraphUrl: config.nerdGraphUrl || 'https://api.newrelic.com/graphql',
      queryTimeout: config.queryTimeout || 30000,
      ...config
    };
  }

  /**
   * Verify complete entity synthesis
   */
  async verifyEntitySynthesis(entityType, expectedCount, options = {}) {
    const verification = {
      timestamp: new Date().toISOString(),
      entityType,
      expectedCount,
      tests: [],
      passed: false,
      score: 0
    };

    try {
      // Test 1: Entity count verification
      const countTest = await this.verifyEntityCount(entityType, expectedCount);
      verification.tests.push(countTest);

      // Test 2: Entity attributes verification
      const attributesTest = await this.verifyEntityAttributes(entityType);
      verification.tests.push(attributesTest);

      // Test 3: Golden metrics verification
      const metricsTest = await this.verifyGoldenMetrics(entityType);
      verification.tests.push(metricsTest);

      // Test 4: Entity relationships verification
      const relationshipsTest = await this.verifyEntityRelationships(entityType);
      verification.tests.push(relationshipsTest);

      // Test 5: Data freshness verification
      const freshnessTest = await this.verifyDataFreshness(entityType);
      verification.tests.push(freshnessTest);

      // Calculate overall score
      const passedTests = verification.tests.filter(t => t.passed).length;
      verification.score = (passedTests / verification.tests.length) * 100;
      verification.passed = verification.score >= 80; // 80% threshold

      return verification;

    } catch (error) {
      verification.error = error.message;
      return verification;
    }
  }

  /**
   * Verify entity count
   */
  async verifyEntityCount(entityType, expectedCount) {
    const query = `{
      actor {
        entitySearch(query: "type = '${entityType}'") {
          count
          results {
            entities {
              guid
              name
              type
            }
          }
        }
      }
    }`;

    const result = await this.executeNerdGraphQuery(query);
    const actualCount = result.data.actor.entitySearch.count;

    return {
      name: 'Entity Count Verification',
      description: `Verify ${entityType} entity count`,
      expected: expectedCount,
      actual: actualCount,
      passed: actualCount >= expectedCount,
      details: {
        entities: result.data.actor.entitySearch.results.entities.slice(0, 10),
        message: actualCount >= expectedCount 
          ? `Found ${actualCount} ${entityType} entities (expected at least ${expectedCount})`
          : `Only found ${actualCount} ${entityType} entities (expected ${expectedCount})`
      }
    };
  }

  /**
   * Verify entity attributes
   */
  async verifyEntityAttributes(entityType) {
    const requiredAttributes = this.getRequiredAttributes(entityType);
    const query = `{
      actor {
        entitySearch(query: "type = '${entityType}'", options: {limit: 5}) {
          results {
            entities {
              guid
              name
              tags {
                key
                values
              }
              ... on AlertableEntity {
                alertSeverity
              }
            }
          }
        }
      }
    }`;

    const result = await this.executeNerdGraphQuery(query);
    const entities = result.data.actor.entitySearch.results.entities;
    
    const attributeTests = [];
    let allPassed = true;

    for (const entity of entities) {
      const entityTags = {};
      entity.tags.forEach(tag => {
        entityTags[tag.key] = tag.values;
      });

      const missingAttributes = [];
      requiredAttributes.forEach(attr => {
        if (!entityTags[attr] && !entity[attr]) {
          missingAttributes.push(attr);
          allPassed = false;
        }
      });

      attributeTests.push({
        entityName: entity.name,
        guid: entity.guid,
        hasAllAttributes: missingAttributes.length === 0,
        missingAttributes
      });
    }

    return {
      name: 'Entity Attributes Verification',
      description: 'Verify required attributes are present',
      passed: allPassed,
      requiredAttributes,
      details: attributeTests
    };
  }

  /**
   * Verify golden metrics
   */
  async verifyGoldenMetrics(entityType) {
    const goldenMetrics = this.getGoldenMetrics(entityType);
    const sampleType = this.getSampleType(entityType);
    
    const metricTests = [];
    let allPassed = true;

    for (const metric of goldenMetrics) {
      const query = `
        FROM ${sampleType}
        SELECT ${metric.query}
        WHERE entity.type = '${entityType}'
        SINCE 1 hour ago
        LIMIT 1
      `;

      try {
        const result = await this.executeNRQLQuery(query);
        const hasData = result && result.results && result.results.length > 0;
        
        metricTests.push({
          metric: metric.name,
          title: metric.title,
          query: query,
          hasData,
          passed: hasData,
          value: hasData ? result.results[0][metric.name] : null
        });

        if (!hasData) allPassed = false;

      } catch (error) {
        metricTests.push({
          metric: metric.name,
          title: metric.title,
          query: query,
          hasData: false,
          passed: false,
          error: error.message
        });
        allPassed = false;
      }
    }

    return {
      name: 'Golden Metrics Verification',
      description: 'Verify golden metrics are available',
      passed: allPassed,
      totalMetrics: goldenMetrics.length,
      availableMetrics: metricTests.filter(t => t.passed).length,
      details: metricTests
    };
  }

  /**
   * Verify entity relationships
   */
  async verifyEntityRelationships(entityType) {
    const expectedRelationships = this.getExpectedRelationships(entityType);
    const query = `{
      actor {
        entitySearch(query: "type = '${entityType}'", options: {limit: 3}) {
          results {
            entities {
              guid
              name
              relatedEntities {
                results {
                  source {
                    entity {
                      guid
                      name
                      type
                    }
                  }
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
    }`;

    const result = await this.executeNerdGraphQuery(query);
    const entities = result.data.actor.entitySearch.results.entities;
    
    const relationshipTests = [];
    let allPassed = true;

    for (const entity of entities) {
      const relationships = entity.relatedEntities?.results || [];
      const relationshipTypes = new Set(relationships.map(r => r.type));
      
      const missingRelationships = [];
      expectedRelationships.forEach(expected => {
        if (!relationshipTypes.has(expected)) {
          missingRelationships.push(expected);
          allPassed = false;
        }
      });

      relationshipTests.push({
        entityName: entity.name,
        guid: entity.guid,
        foundRelationships: Array.from(relationshipTypes),
        missingRelationships,
        hasExpectedRelationships: missingRelationships.length === 0
      });
    }

    return {
      name: 'Entity Relationships Verification',
      description: 'Verify entity relationships are established',
      passed: allPassed,
      expectedRelationships,
      details: relationshipTests
    };
  }

  /**
   * Verify data freshness
   */
  async verifyDataFreshness(entityType) {
    const sampleType = this.getSampleType(entityType);
    const query = `
      FROM ${sampleType}
      SELECT 
        latest(timestamp) as latestTimestamp,
        earliest(timestamp) as earliestTimestamp,
        uniqueCount(entity.guid) as entityCount
      WHERE entity.type = '${entityType}'
      SINCE 1 hour ago
    `;

    try {
      const result = await this.executeNRQLQuery(query);
      const data = result.results[0];
      
      const latestTimestamp = new Date(data.latestTimestamp);
      const now = new Date();
      const ageInMinutes = (now - latestTimestamp) / (1000 * 60);
      
      const isFresh = ageInMinutes <= 5; // Data should be less than 5 minutes old

      return {
        name: 'Data Freshness Verification',
        description: 'Verify data is being ingested recently',
        passed: isFresh,
        latestDataAge: `${ageInMinutes.toFixed(1)} minutes`,
        latestTimestamp: latestTimestamp.toISOString(),
        entityCount: data.entityCount,
        details: {
          message: isFresh 
            ? `Data is fresh (${ageInMinutes.toFixed(1)} minutes old)`
            : `Data is stale (${ageInMinutes.toFixed(1)} minutes old)`,
          threshold: '5 minutes'
        }
      };

    } catch (error) {
      return {
        name: 'Data Freshness Verification',
        description: 'Verify data is being ingested recently',
        passed: false,
        error: error.message
      };
    }
  }

  /**
   * Get required attributes for entity type
   */
  getRequiredAttributes(entityType) {
    const attributeMap = {
      'MESSAGE_QUEUE_CLUSTER': ['provider', 'environment', 'region'],
      'MESSAGE_QUEUE_BROKER': ['clusterName', 'hostname'],
      'MESSAGE_QUEUE_TOPIC': ['clusterName', 'topic'],
      'MESSAGE_QUEUE_QUEUE': ['provider', 'queueName']
    };

    return attributeMap[entityType] || [];
  }

  /**
   * Get golden metrics for entity type
   */
  getGoldenMetrics(entityType) {
    const metricsMap = {
      'MESSAGE_QUEUE_CLUSTER': [
        { name: 'health.score', title: 'Health Score', query: 'latest(cluster.health.score)' },
        { name: 'throughput.total', title: 'Total Throughput', query: 'sum(cluster.throughput.total)' },
        { name: 'error.rate', title: 'Error Rate', query: 'average(cluster.error.rate)' },
        { name: 'availability', title: 'Availability', query: 'average(cluster.availability)' }
      ],
      'MESSAGE_QUEUE_BROKER': [
        { name: 'cpu.usage', title: 'CPU Usage', query: 'average(broker.cpu.usage)' },
        { name: 'memory.usage', title: 'Memory Usage', query: 'average(broker.memory.usage)' },
        { name: 'network.throughput', title: 'Network Throughput', query: 'sum(broker.network.throughput)' }
      ],
      'MESSAGE_QUEUE_TOPIC': [
        { name: 'throughput.in', title: 'Inbound Throughput', query: 'sum(topic.throughput.in)' },
        { name: 'throughput.out', title: 'Outbound Throughput', query: 'sum(topic.throughput.out)' },
        { name: 'consumer.lag', title: 'Consumer Lag', query: 'average(topic.consumer.lag)' }
      ],
      'MESSAGE_QUEUE_QUEUE': [
        { name: 'depth', title: 'Queue Depth', query: 'average(queue.depth)' },
        { name: 'throughput', title: 'Throughput', query: 'sum(queue.throughput)' },
        { name: 'processing.time', title: 'Processing Time', query: 'average(queue.processing.time)' }
      ]
    };

    return metricsMap[entityType] || [];
  }

  /**
   * Get expected relationships for entity type
   */
  getExpectedRelationships(entityType) {
    const relationshipMap = {
      'MESSAGE_QUEUE_CLUSTER': ['CONTAINS'],
      'MESSAGE_QUEUE_BROKER': ['BELONGS_TO'],
      'MESSAGE_QUEUE_TOPIC': ['BELONGS_TO', 'PRODUCES', 'CONSUMES'],
      'MESSAGE_QUEUE_QUEUE': ['BELONGS_TO']
    };

    return relationshipMap[entityType] || [];
  }

  /**
   * Get sample type for entity type
   */
  getSampleType(entityType) {
    return entityType.replace(/_/g, '') + 'Sample';
  }

  /**
   * Execute NerdGraph query
   */
  async executeNerdGraphQuery(query) {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({ query });
      const urlObj = new URL(this.config.nerdGraphUrl);
      
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'API-Key': this.config.apiKey
        }
      };

      const req = https.request(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          try {
            const result = JSON.parse(responseData);
            if (result.errors) {
              reject(new Error(JSON.stringify(result.errors)));
            } else {
              resolve(result);
            }
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(this.config.queryTimeout);
      req.write(payload);
      req.end();
    });
  }

  /**
   * Execute NRQL query
   */
  async executeNRQLQuery(nrql) {
    const query = `{
      actor {
        account(id: ${this.config.accountId}) {
          nrql(query: "${nrql.replace(/"/g, '\\"')}") {
            results
          }
        }
      }
    }`;

    const result = await this.executeNerdGraphQuery(query);
    return result.data.actor.account.nrql;
  }
}

module.exports = EntityVerifier;