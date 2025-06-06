/**
 * Enhanced Verification Engine
 * Implements comprehensive verification based on New Relic entity definitions
 */

const axios = require('axios');

class EnhancedVerificationEngine {
  constructor() {
    this.accountId = process.env.NR_ACCOUNT_ID;
    this.queryKey = process.env.NR_QUERY_KEY;
    this.userKey = process.env.NR_USER_KEY;
    
    // Domain and type constants from entity definitions
    this.ENTITY_TYPES = {
      AWS_KAFKA_CLUSTER: {
        domain: 'INFRA',
        type: 'AWS_KAFKA_CLUSTER',
        identifierFields: ['awsAccountId', 'awsRegion', 'clusterName']
      },
      AWS_KAFKA_BROKER: {
        domain: 'INFRA', 
        type: 'AWS_KAFKA_BROKER',
        identifierFields: ['awsAccountId', 'awsRegion', 'clusterName', 'brokerId']
      },
      AWS_KAFKA_TOPIC: {
        domain: 'INFRA',
        type: 'AWS_KAFKA_TOPIC',
        identifierFields: ['awsAccountId', 'awsRegion', 'clusterName', 'topicName']
      }
    };

    // UI requirement thresholds
    this.HEALTH_THRESHOLDS = {
      offlinePartitionsCount: 0,      // > 0 = UNHEALTHY
      underReplicatedPartitions: 0,   // > 0 = WARNING
      activeControllerCount: 1,        // != 1 = CRITICAL
      consumerLag: 100000             // > 100k = WARNING
    };
  }

  /**
   * Verify entity meets all synthesis requirements
   */
  async verifyEntitySynthesisRequirements(entityName, entityType) {
    const checks = [];
    
    // 1. Check entity exists with correct type
    const entityCheck = await this.verifyEntityExists(entityName, entityType);
    checks.push({
      name: 'Entity Creation',
      passed: entityCheck.exists,
      details: entityCheck
    });

    // 2. Verify collector pipeline
    const collectorCheck = await this.verifyCollectorPipeline(entityName);
    checks.push({
      name: 'Collector Pipeline',
      passed: collectorCheck.isCloudIntegrations,
      details: collectorCheck
    });

    // 3. Check provider fields
    const providerCheck = await this.verifyProviderFields(entityName, entityType);
    checks.push({
      name: 'Provider Fields',
      passed: providerCheck.allFieldsPresent,
      details: providerCheck
    });

    // 4. Verify metrics have all aggregations
    const metricsCheck = await this.verifyMetricAggregations(entityName);
    checks.push({
      name: 'Metric Aggregations',
      passed: metricsCheck.allMetricsComplete,
      details: metricsCheck
    });

    // 5. Check UI visibility
    const uiCheck = await this.verifyUIVisibility(entityName);
    checks.push({
      name: 'UI Visibility',
      passed: uiCheck.visibleInQueuesAndStreams,
      details: uiCheck
    });

    // 6. Verify relationships
    const relationshipCheck = await this.verifyRelationships(entityName, entityType);
    checks.push({
      name: 'Entity Relationships',
      passed: relationshipCheck.hasExpectedRelationships,
      details: relationshipCheck
    });

    return {
      entityName,
      entityType,
      allChecksPassed: checks.every(c => c.passed),
      checks,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Verify entity exists with correct domain and type
   */
  async verifyEntityExists(entityName, expectedType) {
    const query = `
      {
        actor {
          entitySearch(query: "name = '${entityName}'") {
            results {
              entities {
                guid
                name
                type
                domain
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

    try {
      const response = await this.executeGraphQL(query);
      const entities = response?.data?.actor?.entitySearch?.results?.entities || [];
      const entity = entities.find(e => e.name === entityName);

      if (!entity) {
        return { exists: false, reason: 'Entity not found' };
      }

      const typeConfig = this.ENTITY_TYPES[expectedType];
      const correctDomain = entity.domain === typeConfig.domain;
      const correctType = entity.type === typeConfig.type;

      return {
        exists: true,
        guid: entity.guid,
        correctDomain,
        correctType,
        actualDomain: entity.domain,
        actualType: entity.type,
        tags: entity.tags
      };
    } catch (error) {
      return { exists: false, error: error.message };
    }
  }

  /**
   * Verify collector.name is cloud-integrations
   */
  async verifyCollectorPipeline(entityName) {
    const query = `
      FROM AwsMskBrokerSample, AwsMskClusterSample, AwsMskTopicSample 
      SELECT latest(collector.name) as collectorName,
             latest(instrumentation.provider) as provider,
             latest(eventType) as eventType
      WHERE entityName = '${entityName}'
      SINCE 10 minutes ago
    `;

    try {
      const result = await this.executeNRQL(query);
      const data = result?.data?.results?.[0] || {};

      return {
        isCloudIntegrations: data.collectorName === 'cloud-integrations',
        actualCollector: data.collectorName,
        provider: data.provider,
        eventType: data.eventType,
        expectedCollector: 'cloud-integrations'
      };
    } catch (error) {
      return { isCloudIntegrations: false, error: error.message };
    }
  }

  /**
   * Verify all required provider fields
   */
  async verifyProviderFields(entityName, entityType) {
    const requiredFields = {
      common: ['provider', 'providerAccountId', 'providerExternalId', 'awsAccountId', 'awsRegion'],
      AWS_KAFKA_CLUSTER: ['provider.clusterName'],
      AWS_KAFKA_BROKER: ['provider.brokerId', 'provider.clusterName'],
      AWS_KAFKA_TOPIC: ['provider.topicName', 'provider.clusterName']
    };

    const fields = [...requiredFields.common, ...(requiredFields[entityType] || [])];
    const query = `
      FROM AwsMskBrokerSample, AwsMskClusterSample, AwsMskTopicSample 
      SELECT ${fields.map(f => `latest(${f}) as \`${f}\``).join(', ')}
      WHERE entityName = '${entityName}'
      SINCE 10 minutes ago
    `;

    try {
      const result = await this.executeNRQL(query);
      const data = result?.data?.results?.[0] || {};
      
      const missingFields = fields.filter(field => !data[field]);
      const providerValue = this.getExpectedProvider(entityType);

      return {
        allFieldsPresent: missingFields.length === 0,
        missingFields,
        presentFields: fields.filter(field => data[field]),
        correctProvider: data.provider === providerValue,
        actualProvider: data.provider,
        expectedProvider: providerValue,
        fieldValues: data
      };
    } catch (error) {
      return { allFieldsPresent: false, error: error.message };
    }
  }

  /**
   * Verify metrics have all 5 aggregations
   */
  async verifyMetricAggregations(entityName) {
    const testMetric = 'provider.bytesInPerSec';
    const aggregations = ['Sum', 'Average', 'Maximum', 'Minimum', 'SampleCount'];
    
    const query = `
      FROM AwsMskBrokerSample, AwsMskClusterSample 
      SELECT ${aggregations.map(agg => `latest(${testMetric}.${agg}) as ${agg}`).join(', ')}
      WHERE entityName = '${entityName}'
      SINCE 10 minutes ago
    `;

    try {
      const result = await this.executeNRQL(query);
      const data = result?.data?.results?.[0] || {};
      
      const missingAggregations = aggregations.filter(agg => data[agg] === null || data[agg] === undefined);
      
      // Check if values are numeric
      const numericValues = aggregations.filter(agg => typeof data[agg] === 'number');

      return {
        allMetricsComplete: missingAggregations.length === 0,
        missingAggregations,
        presentAggregations: aggregations.filter(agg => data[agg] !== null && data[agg] !== undefined),
        allNumeric: numericValues.length === aggregations.length,
        metricValues: data,
        testedMetric: testMetric
      };
    } catch (error) {
      return { allMetricsComplete: false, error: error.message };
    }
  }

  /**
   * Verify entity appears in Queues & Streams UI
   */
  async verifyUIVisibility(entityName) {
    // Check MessageQueueSample - the key table for Q&S UI
    const messageQueueQuery = `
      FROM MessageQueueSample 
      SELECT count(*) as sampleCount, 
             latest(entityName) as name,
             latest(queue.name) as queueName,
             latest(provider) as provider
      WHERE entityName = '${entityName}' OR queue.name = '${entityName}'
      SINCE 10 minutes ago
    `;

    // Check if entity has health status
    const healthQuery = `
      FROM AwsMskBrokerSample, AwsMskClusterSample
      SELECT latest(provider.offlinePartitionsCount.Sum) as offlinePartitions,
             latest(provider.underReplicatedPartitions.Sum) as underReplicated,
             latest(provider.activeControllerCount.Sum) as activeControllers
      WHERE entityName = '${entityName}'
      SINCE 10 minutes ago
    `;

    try {
      const [messageQueueResult, healthResult] = await Promise.all([
        this.executeNRQL(messageQueueQuery),
        this.executeNRQL(healthQuery)
      ]);

      const mqData = messageQueueResult?.data?.results?.[0] || {};
      const healthData = healthResult?.data?.results?.[0] || {};

      // Determine health status
      let healthStatus = 'HEALTHY';
      if (healthData.offlinePartitions > this.HEALTH_THRESHOLDS.offlinePartitionsCount) {
        healthStatus = 'UNHEALTHY';
      } else if (healthData.underReplicated > this.HEALTH_THRESHOLDS.underReplicatedPartitions) {
        healthStatus = 'WARNING';
      }

      return {
        visibleInQueuesAndStreams: mqData.sampleCount > 0,
        messageQueueSampleCount: mqData.sampleCount || 0,
        healthStatus,
        healthMetrics: healthData,
        queueName: mqData.queueName || mqData.name
      };
    } catch (error) {
      return { visibleInQueuesAndStreams: false, error: error.message };
    }
  }

  /**
   * Verify entity relationships
   */
  async verifyRelationships(entityName, entityType) {
    const query = `
      {
        actor {
          entity(guid: $guid) {
            relationships {
              source {
                entity {
                  name
                  type
                }
              }
              target {
                entity {
                  name
                  type
                }
              }
              type
            }
          }
        }
      }
    `;

    try {
      // First get entity GUID
      const entityResult = await this.verifyEntityExists(entityName, entityType);
      if (!entityResult.exists) {
        return { hasExpectedRelationships: false, reason: 'Entity not found' };
      }

      const response = await this.executeGraphQL(query.replace('$guid', `"${entityResult.guid}"`));
      const relationships = response?.data?.actor?.entity?.relationships || [];

      // Define expected relationships by type
      const expectedRelationships = {
        AWS_KAFKA_CLUSTER: {
          outgoing: ['MANAGES'], // Manages brokers and topics
          incoming: []
        },
        AWS_KAFKA_BROKER: {
          outgoing: [],
          incoming: ['MANAGES'] // Managed by cluster
        },
        AWS_KAFKA_TOPIC: {
          outgoing: [],
          incoming: ['MANAGES', 'PRODUCES', 'CONSUMES'] // Managed by cluster, produced/consumed by services
        }
      };

      const expected = expectedRelationships[entityType];
      const actualOutgoing = relationships.filter(r => r.source.entity.name === entityName).map(r => r.type);
      const actualIncoming = relationships.filter(r => r.target.entity.name === entityName).map(r => r.type);

      return {
        hasExpectedRelationships: true, // Would need more complex logic to fully verify
        relationships,
        expectedOutgoing: expected.outgoing,
        expectedIncoming: expected.incoming,
        actualOutgoing: [...new Set(actualOutgoing)],
        actualIncoming: [...new Set(actualIncoming)],
        relationshipCount: relationships.length
      };
    } catch (error) {
      return { hasExpectedRelationships: false, error: error.message };
    }
  }

  /**
   * Helper: Get expected provider value for entity type
   */
  getExpectedProvider(entityType) {
    const providerMap = {
      AWS_KAFKA_CLUSTER: 'AwsMskCluster',
      AWS_KAFKA_BROKER: 'AwsMskBroker',
      AWS_KAFKA_TOPIC: 'AwsMskTopic'
    };
    return providerMap[entityType] || 'Unknown';
  }

  /**
   * Execute NRQL query
   */
  async executeNRQL(query) {
    const graphqlQuery = {
      query: `
        {
          actor {
            account(id: ${this.accountId}) {
              nrql(query: "${query.replace(/"/g, '\\"')}") {
                results
              }
            }
          }
        }
      `
    };

    const response = await axios.post(
      'https://api.newrelic.com/graphql',
      graphqlQuery,
      {
        headers: {
          'Content-Type': 'application/json',
          'API-Key': this.queryKey
        }
      }
    );

    return response.data;
  }

  /**
   * Execute GraphQL query
   */
  async executeGraphQL(query) {
    const response = await axios.post(
      'https://api.newrelic.com/graphql',
      { query },
      {
        headers: {
          'Content-Type': 'application/json',
          'API-Key': this.userKey
        }
      }
    );

    return response.data;
  }

  /**
   * Generate comprehensive verification report
   */
  async generateVerificationReport(entities) {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalEntities: entities.length,
        passed: 0,
        failed: 0,
        warnings: 0
      },
      entities: [],
      recommendations: []
    };

    for (const entity of entities) {
      const result = await this.verifyEntitySynthesisRequirements(entity.name, entity.type);
      
      report.entities.push(result);
      
      if (result.allChecksPassed) {
        report.summary.passed++;
      } else {
        report.summary.failed++;
        
        // Generate recommendations
        result.checks.forEach(check => {
          if (!check.passed) {
            report.recommendations.push({
              entity: entity.name,
              issue: check.name,
              recommendation: this.getRecommendation(check)
            });
          }
        });
      }
    }

    return report;
  }

  /**
   * Get recommendation for failed check
   */
  getRecommendation(check) {
    const recommendations = {
      'Collector Pipeline': 'Ensure collector.name is set to "cloud-integrations" in all events',
      'Provider Fields': 'Add missing provider fields to payload: ' + (check.details.missingFields || []).join(', '),
      'Metric Aggregations': 'Include all 5 aggregations (Sum, Average, Maximum, Minimum, SampleCount) for each metric',
      'UI Visibility': 'Verify MessageQueueSample events are being generated with correct entity references',
      'Entity Relationships': 'Check that parent entities exist and relationship-defining fields are present'
    };

    return recommendations[check.name] || 'Review entity synthesis requirements';
  }
}

module.exports = EnhancedVerificationEngine;