/**
 * Infrastructure Agent Data Collector
 * 
 * Queries New Relic for nri-kafka data and returns it for transformation.
 * This allows us to use real Kafka metrics from the Infrastructure agent.
 */

const NewRelicClient = require('../../core/http/new-relic-client');
const { getConfigManager } = require('../../core/config/config-manager');
const { logger } = require('../../core/utils/logger');
const CircuitBreaker = require('../../core/circuit-breaker');

class InfraAgentCollector {
  constructor(config = {}) {
    // Use shared config manager
    const configManager = getConfigManager(config);
    const nrConfig = configManager.getNewRelicConfig();
    
    this.client = new NewRelicClient(nrConfig);
    this.accountId = nrConfig.accountId;
    this.debug = configManager.isDebug();
    
    // Initialize circuit breakers for external calls
    this.nerdGraphCircuitBreaker = new CircuitBreaker({
      name: 'NerdGraph-InfraCollector',
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 30000,
      retryDelay: 5000,
      maxRetries: 2
    });
    
    this.nrqlCircuitBreaker = new CircuitBreaker({
      name: 'NRQL-InfraCollector',
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 15000,
      retryDelay: 3000,
      maxRetries: 3
    });
    
    // Set up circuit breaker event handlers
    this.setupCircuitBreakerEvents();
    
    if (this.debug) {
      logger.debug('InfraAgentCollector initialized with shared client and circuit breakers');
    }
  }

  /**
   * Setup circuit breaker event handlers for monitoring
   */
  setupCircuitBreakerEvents() {
    // NerdGraph circuit breaker events
    this.nerdGraphCircuitBreaker.on('circuitOpened', ({ failureCount }) => {
      logger.warn(`🔴 NerdGraph circuit opened after ${failureCount} failures`);
    });
    
    this.nerdGraphCircuitBreaker.on('circuitClosed', ({ successCount }) => {
      logger.info(`🟢 NerdGraph circuit closed after ${successCount} successes`);
    });
    
    this.nerdGraphCircuitBreaker.on('callRejected', ({ error }) => {
      logger.warn(`⚠️ NerdGraph call rejected: ${error.message}`);
    });
    
    // NRQL circuit breaker events
    this.nrqlCircuitBreaker.on('circuitOpened', ({ failureCount }) => {
      logger.warn(`🔴 NRQL circuit opened after ${failureCount} failures`);
    });
    
    this.nrqlCircuitBreaker.on('circuitClosed', ({ successCount }) => {
      logger.info(`🟢 NRQL circuit closed after ${successCount} successes`);
    });
    
    this.nrqlCircuitBreaker.on('callRejected', ({ error }) => {
      logger.warn(`⚠️ NRQL call rejected: ${error.message}`);
    });
  }
  
  /**
   * Execute a NerdGraph query using shared client with circuit breaker protection
   */
  async nerdGraphQuery(query, options = {}) {
    try {
      const result = await this.nerdGraphCircuitBreaker.executeWithRetry(
        async () => {
          return await this.client.nerdGraphQuery(query, {}, options);
        }
      );
      
      if (this.debug) {
        logger.debug('NerdGraph query successful');
      }
      
      return result;
    } catch (error) {
      if (this.debug) {
        logger.error(`NerdGraph query failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Collect Kafka broker metrics from Infrastructure agent
   */
  async collectKafkaBrokerMetrics(since = '5 minutes ago') {
    const nrql = `
      FROM KafkaBrokerSample 
      SELECT 
        latest(broker.id) as 'broker.id',
        latest(clusterName) as clusterName,
        latest(kafkaVersion) as kafkaVersion,
        average(broker.bytesInPerSecond) as 'broker.bytesInPerSecond',
        average(broker.bytesOutPerSecond) as 'broker.bytesOutPerSecond',
        average(broker.messagesInPerSecond) as 'broker.messagesInPerSecond',
        average(net.requestsPerSecond) as 'net.requestsPerSecond',
        latest(broker.underReplicatedPartitions) as 'broker.underReplicatedPartitions',
        latest(broker.offlinePartitionsCount) as 'broker.offlinePartitionsCount',
        average(broker.IOWaitPercent) as 'broker.IOWaitPercent',
        average(disk.usedPercent) as 'disk.usedPercent',
        average(broker.requestQueueSize) as 'broker.requestQueueSize',
        average(net.networkProcessorAvgIdlePercent) as 'net.networkProcessorAvgIdlePercent'
      WHERE clusterName IS NOT NULL
      FACET broker.id, clusterName
      SINCE ${since}
      LIMIT 100
    `;

    if (this.debug) {
      logger.debug('Executing NRQL for brokers:', nrql);
    }

    const query = `
      {
        actor {
          account(id: ${this.accountId}) {
            nrql(query: "${nrql.replace(/\n/g, ' ').replace(/"/g, '\\"')}") {
              results
            }
          }
        }
      }
    `;

    const response = await this.nerdGraphQuery(query);
    const results = response.data?.actor?.account?.nrql?.results || [];
    
    // Transform to match KafkaBrokerSample structure
    return results.map(result => ({
      eventType: 'KafkaBrokerSample',
      ...result
    }));
  }

  /**
   * Collect Kafka topic metrics from Infrastructure agent
   */
  async collectKafkaTopicMetrics(since = '5 minutes ago') {
    const nrql = `
      FROM KafkaTopicSample 
      SELECT 
        latest(topic.name) as 'topic.name',
        latest(clusterName) as clusterName,
        average(topic.bytesInPerSecond) as 'topic.bytesInPerSecond',
        average(topic.bytesOutPerSecond) as 'topic.bytesOutPerSecond',
        average(topic.messagesInPerSecond) as 'topic.messagesInPerSecond',
        latest(topic.partitionCount) as 'topic.partitionCount',
        latest(topic.replicationFactor) as 'topic.replicationFactor',
        latest(topic.retentionBytes) as 'topic.diskSize'
      WHERE clusterName IS NOT NULL AND topic.name IS NOT NULL
      FACET topic.name, clusterName
      SINCE ${since}
      LIMIT 500
    `;

    if (this.debug) {
      logger.debug('Executing NRQL for topics:', nrql);
    }

    const query = `
      {
        actor {
          account(id: ${this.accountId}) {
            nrql(query: "${nrql.replace(/\n/g, ' ').replace(/"/g, '\\"')}") {
              results
            }
          }
        }
      }
    `;

    const response = await this.nerdGraphQuery(query);
    const results = response.data?.actor?.account?.nrql?.results || [];
    
    // Transform to match KafkaTopicSample structure
    return results.map(result => ({
      eventType: 'KafkaTopicSample',
      ...result
    }));
  }

  /**
   * Collect all Kafka metrics with enhanced error handling
   */
  async collectKafkaMetrics(since = '5 minutes ago') {
    logger.info('📊 Collecting Kafka metrics from Infrastructure agent...');
    
    const startTime = Date.now();
    const results = {
      brokerMetrics: [],
      topicMetrics: [],
      errors: []
    };
    
    try {
      // Collect broker and topic metrics with individual error handling
      const promises = [
        this.collectKafkaBrokerMetrics(since).catch(error => {
          results.errors.push({ type: 'broker', error: error.message });
          logger.error('❌ Broker metrics collection failed:', error.message);
          return [];
        }),
        this.collectKafkaTopicMetrics(since).catch(error => {
          results.errors.push({ type: 'topic', error: error.message });
          logger.error('❌ Topic metrics collection failed:', error.message);
          return [];
        })
      ];

      const [brokerMetrics, topicMetrics] = await Promise.all(promises);
      
      results.brokerMetrics = brokerMetrics;
      results.topicMetrics = topicMetrics;

      const duration = Date.now() - startTime;
      logger.success(`✅ Collected ${brokerMetrics.length} broker samples`);
      logger.success(`✅ Collected ${topicMetrics.length} topic samples`);
      logger.debug(`Collection completed in ${duration}ms`);

      if (results.errors.length > 0) {
        logger.warn(`⚠️ ${results.errors.length} partial failures occurred`);
      }

      const allMetrics = [...brokerMetrics, ...topicMetrics];
      
      // Add collection metadata
      allMetrics.forEach(metric => {
        metric._collectionMetadata = {
          collectedAt: new Date().toISOString(),
          collectionDuration: duration,
          partialFailures: results.errors.length
        };
      });

      return allMetrics;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`❌ Failed to collect Kafka metrics after ${duration}ms: ${error.message}`);
      
      // Enrich error with context
      error.collectionContext = {
        since,
        duration,
        partialErrors: results.errors
      };
      
      throw error;
    }
  }

  /**
   * Check if Infrastructure agent is reporting Kafka data
   */
  async checkKafkaIntegration() {
    logger.info('🔍 Checking for nri-kafka integration...');
    
    const nrql = `
      FROM KafkaBrokerSample, KafkaTopicSample 
      SELECT count(*) 
      SINCE 1 hour ago
    `;

    try {
      const response = await this.nrqlCircuitBreaker.execute(
        async () => await this.client.executeNrqlQuery(nrql)
      );
      const count = response?.results?.[0]?.count || 0;
      
      if (count > 0) {
        logger.success(`✅ Found ${count} Kafka samples in the last hour`);
        return true;
      } else {
        logger.warn('⚠️ No Kafka data found. Is nri-kafka configured?');
        logger.debug('See: https://docs.newrelic.com/docs/integrations/host-integrations/host-integrations-list/kafka-monitoring-integration/');
        return false;
      }
    } catch (error) {
      logger.error('❌ Failed to check integration:', error.message);
      return false;
    }
  }

  /**
   * Get a summary of available Kafka clusters
   */
  async getKafkaClusters() {
    const nrql = `
      FROM KafkaBrokerSample 
      SELECT uniqueCount(broker.id) as brokerCount 
      FACET clusterName 
      SINCE 1 hour ago
    `;

    try {
      const response = await this.nrqlCircuitBreaker.execute(
        async () => await this.client.executeNrqlQuery(nrql)
      );
      const results = response?.results || [];
      
      return results.map(r => ({
        clusterName: r.clusterName,
        brokerCount: r.brokerCount
      }));
    } catch (error) {
      logger.error('Failed to get clusters:', error.message);
      return [];
    }
  }
  
  /**
   * Get circuit breaker health status
   */
  getCircuitBreakerStats() {
    return {
      nerdGraph: this.nerdGraphCircuitBreaker.getStats(),
      nrql: this.nrqlCircuitBreaker.getStats()
    };
  }
  
  /**
   * Reset circuit breakers (for testing or recovery)
   */
  resetCircuitBreakers() {
    this.nerdGraphCircuitBreaker.reset();
    this.nrqlCircuitBreaker.reset();
    logger.info('🔄 Infrastructure collector circuit breakers reset');
  }
}

module.exports = InfraAgentCollector;