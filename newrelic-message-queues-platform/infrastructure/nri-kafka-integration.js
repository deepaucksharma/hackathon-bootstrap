/**
 * NRI-Kafka Integration Module
 * 
 * Handles real data collection from nri-kafka integration
 * via New Relic Infrastructure Agent
 */

const axios = require('axios');
const debug = require('debug')('platform:nri-kafka');
const chalk = require('chalk');

class NriKafkaIntegration {
  constructor(config) {
    this.config = {
      accountId: config.accountId,
      apiKey: config.apiKey,
      region: config.region || 'US',
      ...config
    };
    
    this.nrqlApi = this.config.region === 'EU' 
      ? 'https://api.eu.newrelic.com/graphql'
      : 'https://api.newrelic.com/graphql';
  }

  /**
   * Query real nri-kafka data from New Relic
   */
  async queryNriKafkaData(clusterName, timeRange = '5 minutes ago') {
    const nrql = this.buildNrqlQuery(clusterName, timeRange);
    
    try {
      const response = await this.executeNrqlQuery(nrql);
      return this.parseNrqlResponse(response);
    } catch (error) {
      debug('Failed to query nri-kafka data:', error);
      throw new Error(`Failed to query nri-kafka data: ${error.message}`);
    }
  }

  /**
   * Build NRQL query for nri-kafka data
   */
  buildNrqlQuery(clusterName, timeRange) {
    const queries = {
      brokers: `
        FROM KafkaBrokerSample 
        SELECT 
          latest(broker.bytesInPerSecond) as bytesInPerSecond,
          latest(broker.bytesOutPerSecond) as bytesOutPerSecond,
          latest(broker.messagesInPerSecond) as messagesInPerSecond,
          latest(broker.fetchConsumerTotalTimeMs) as fetchConsumerTotalTimeMs,
          latest(broker.produceRequestsPerSecond) as produceRequestsPerSecond,
          latest(jvm.heapUsed) as jvmHeapUsed,
          latest(jvm.heapMax) as jvmHeapMax,
          latest(net.bytesReceivedPerSecond) as netBytesReceivedPerSecond,
          latest(net.bytesSentPerSecond) as netBytesSentPerSecond,
          latest(request.avgTimeFetch) as requestAvgTimeFetch,
          latest(request.avgTimeProduce) as requestAvgTimeProduce,
          latest(request.handlerIdle) as requestHandlerIdle,
          latest(follower.lag.sum) as followerLagSum,
          latest(underReplicatedPartitions) as underReplicatedPartitions,
          latest(activeControllerCount) as activeControllerCount,
          latest(offlinePartitionsCount) as offlinePartitionsCount,
          latest(leaderElectionRate) as leaderElectionRate
        WHERE clusterName = '${clusterName}'
        FACET hostname, broker.id
        SINCE ${timeRange}
        LIMIT 100
      `,
      
      topics: `
        FROM KafkaTopicSample
        SELECT 
          latest(topic.messagesInPerSecond) as messagesInPerSecond,
          latest(topic.bytesInPerSecond) as bytesInPerSecond,
          latest(topic.bytesOutPerSecond) as bytesOutPerSecond,
          latest(topic.fetchRequestsPerSecond) as fetchRequestsPerSecond,
          latest(topic.retentionSizeBytes) as retentionSizeBytes,
          latest(topic.logEndOffset) as logEndOffset,
          latest(topic.logStartOffset) as logStartOffset,
          latest(topic.partitionsCount) as partitionsCount,
          latest(topic.replicationFactor) as replicationFactor,
          latest(topic.underReplicatedPartitions) as underReplicatedPartitions
        WHERE clusterName = '${clusterName}'
        FACET topic, clusterName
        SINCE ${timeRange}
        LIMIT 500
      `,
      
      consumerGroups: `
        FROM KafkaConsumerSample
        SELECT 
          latest(consumer.lag) as consumerLag,
          latest(consumer.messageRate) as messageRate,
          latest(consumer.maxLag) as maxLag,
          latest(consumer.avgLag) as avgLag,
          latest(consumer.totalLag) as totalLag,
          latest(consumer.lagTrend) as lagTrend,
          latest(consumer.bytesConsumedRate) as bytesConsumedRate,
          latest(consumer.recordsConsumedRate) as recordsConsumedRate,
          latest(consumer.fetchRate) as fetchRate
        WHERE clusterName = '${clusterName}'
        FACET consumer.group.id, consumer.clientId, topic
        SINCE ${timeRange}
        LIMIT 200
      `,

      partitions: `
        FROM KafkaPartitionSample
        SELECT 
          latest(partition.logEndOffset) as logEndOffset,
          latest(partition.logStartOffset) as logStartOffset,
          latest(partition.logSize) as logSize,
          latest(partition.leader) as leader,
          latest(partition.replicas) as replicas,
          latest(partition.inSyncReplicas) as inSyncReplicas,
          latest(partition.underReplicated) as underReplicated
        WHERE clusterName = '${clusterName}'
        FACET topic, partition, broker.id
        SINCE ${timeRange}
        LIMIT 1000
      `,

      cluster: `
        FROM KafkaClusterSample
        SELECT 
          latest(cluster.brokersCount) as brokersCount,
          latest(cluster.topicsCount) as topicsCount,
          latest(cluster.partitionsCount) as partitionsCount,
          latest(cluster.underReplicatedPartitions) as underReplicatedPartitions,
          latest(cluster.offlinePartitionsCount) as offlinePartitionsCount,
          latest(cluster.activeControllers) as activeControllers,
          latest(cluster.preferredReplicaImbalance) as preferredReplicaImbalance
        WHERE clusterName = '${clusterName}'
        FACET clusterName
        SINCE ${timeRange}
        LIMIT 10
      `
    };

    return queries;
  }

  /**
   * Execute NRQL query via GraphQL API
   */
  async executeNrqlQuery(queries) {
    const results = {};
    
    for (const [queryType, nrql] of Object.entries(queries)) {
      const graphqlQuery = {
        query: `
          query($accountId: Int!, $nrql: Nrql!) {
            actor {
              account(id: $accountId) {
                nrql(query: $nrql) {
                  results
                  metadata {
                    timeWindow {
                      begin
                      end
                    }
                  }
                }
              }
            }
          }
        `,
        variables: {
          accountId: parseInt(this.config.accountId),
          nrql: nrql.trim()
        }
      };

      try {
        const response = await axios.post(this.nrqlApi, graphqlQuery, {
          headers: {
            'Content-Type': 'application/json',
            'API-Key': this.config.apiKey
          }
        });

        if (response.data.errors) {
          throw new Error(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
        }

        results[queryType] = response.data.data.actor.account.nrql.results;
        debug(`Collected ${results[queryType].length} ${queryType} samples`);
        
      } catch (error) {
        console.warn(chalk.yellow(`⚠️  Failed to query ${queryType}: ${error.message}`));
        results[queryType] = [];
      }
    }

    return results;
  }

  /**
   * Parse NRQL response into standard format
   */
  parseNrqlResponse(results) {
    const parsed = {
      brokers: [],
      topics: [],
      consumerGroups: [],
      partitions: [],
      clusters: []
    };

    // Parse broker data
    if (results.brokers) {
      parsed.brokers = results.brokers.map(facet => ({
        eventType: 'KafkaBrokerSample',
        timestamp: Date.now(),
        hostname: facet.facet[0],
        'broker.id': parseInt(facet.facet[1]),
        'broker.bytesInPerSecond': facet.bytesInPerSecond || 0,
        'broker.bytesOutPerSecond': facet.bytesOutPerSecond || 0,
        'broker.messagesInPerSecond': facet.messagesInPerSecond || 0,
        'jvm.heapUsed': facet.jvmHeapUsed || 0,
        'jvm.heapMax': facet.jvmHeapMax || 0,
        'request.avgTimeFetch': facet.requestAvgTimeFetch || 0,
        'request.avgTimeProduce': facet.requestAvgTimeProduce || 0,
        'request.handlerIdle': facet.requestHandlerIdle || 100,
        'underReplicatedPartitions': facet.underReplicatedPartitions || 0,
        'activeControllerCount': facet.activeControllerCount || 0,
        'offlinePartitionsCount': facet.offlinePartitionsCount || 0
      }));
    }

    // Parse topic data
    if (results.topics) {
      parsed.topics = results.topics.map(facet => ({
        eventType: 'KafkaTopicSample',
        timestamp: Date.now(),
        topic: facet.facet[0],
        clusterName: facet.facet[1],
        'topic.messagesInPerSecond': facet.messagesInPerSecond || 0,
        'topic.bytesInPerSecond': facet.bytesInPerSecond || 0,
        'topic.bytesOutPerSecond': facet.bytesOutPerSecond || 0,
        'topic.partitionsCount': facet.partitionsCount || 1,
        'topic.replicationFactor': facet.replicationFactor || 1,
        'topic.underReplicatedPartitions': facet.underReplicatedPartitions || 0,
        'topic.retentionSizeBytes': facet.retentionSizeBytes || 0
      }));
    }

    // Parse consumer group data
    if (results.consumerGroups) {
      parsed.consumerGroups = results.consumerGroups.map(facet => ({
        eventType: 'KafkaConsumerSample',
        timestamp: Date.now(),
        'consumer.group.id': facet.facet[0],
        'consumer.clientId': facet.facet[1],
        topic: facet.facet[2],
        'consumer.lag': facet.consumerLag || 0,
        'consumer.totalLag': facet.totalLag || 0,
        'consumer.messageRate': facet.messageRate || 0,
        'consumer.bytesConsumedRate': facet.bytesConsumedRate || 0,
        'consumer.fetchRate': facet.fetchRate || 0
      }));
    }

    // Parse partition data
    if (results.partitions) {
      parsed.partitions = results.partitions.map(facet => ({
        eventType: 'KafkaPartitionSample',
        timestamp: Date.now(),
        topic: facet.facet[0],
        partition: parseInt(facet.facet[1]),
        'broker.id': parseInt(facet.facet[2]),
        'partition.logEndOffset': facet.logEndOffset || 0,
        'partition.logStartOffset': facet.logStartOffset || 0,
        'partition.logSize': facet.logSize || 0,
        'partition.underReplicated': facet.underReplicated || false
      }));
    }

    // Parse cluster data
    if (results.cluster) {
      parsed.clusters = results.cluster.map(facet => ({
        eventType: 'KafkaClusterSample',
        timestamp: Date.now(),
        clusterName: facet.facet[0],
        'cluster.brokersCount': facet.brokersCount || 0,
        'cluster.topicsCount': facet.topicsCount || 0,
        'cluster.partitionsCount': facet.partitionsCount || 0,
        'cluster.underReplicatedPartitions': facet.underReplicatedPartitions || 0,
        'cluster.offlinePartitionsCount': facet.offlinePartitionsCount || 0
      }));
    }

    return parsed;
  }

  /**
   * Get comprehensive Kafka metrics for a cluster
   */
  async getKafkaMetrics(clusterName) {
    console.log(chalk.cyan(`📊 Querying nri-kafka data for cluster: ${clusterName}`));
    
    try {
      const data = await this.queryNriKafkaData(clusterName);
      
      // Log collection summary
      console.log(chalk.green('✅ Data collection summary:'));
      console.log(chalk.gray(`   - Brokers: ${data.brokers.length}`));
      console.log(chalk.gray(`   - Topics: ${data.topics.length}`));
      console.log(chalk.gray(`   - Consumer Groups: ${data.consumerGroups.length}`));
      console.log(chalk.gray(`   - Partitions: ${data.partitions.length}`));
      console.log(chalk.gray(`   - Clusters: ${data.clusters.length}`));
      
      return data;
    } catch (error) {
      console.error(chalk.red('❌ Failed to get Kafka metrics:'), error.message);
      throw error;
    }
  }

  /**
   * Monitor multiple Kafka clusters
   */
  async monitorClusters(clusterNames) {
    const allData = {
      brokers: [],
      topics: [],
      consumerGroups: [],
      partitions: [],
      clusters: []
    };

    for (const clusterName of clusterNames) {
      try {
        const clusterData = await this.getKafkaMetrics(clusterName);
        
        // Aggregate data
        allData.brokers.push(...clusterData.brokers);
        allData.topics.push(...clusterData.topics);
        allData.consumerGroups.push(...clusterData.consumerGroups);
        allData.partitions.push(...clusterData.partitions);
        allData.clusters.push(...clusterData.clusters);
        
      } catch (error) {
        console.warn(chalk.yellow(`⚠️  Skipping cluster ${clusterName}: ${error.message}`));
      }
    }

    return allData;
  }

  /**
   * Calculate derived metrics from raw data
   */
  calculateDerivedMetrics(data) {
    const metrics = {
      clusters: {},
      brokers: {},
      topics: {},
      consumerGroups: {}
    };

    // Calculate cluster-level metrics
    data.clusters.forEach(cluster => {
      metrics.clusters[cluster.clusterName] = {
        health: this.calculateClusterHealth(cluster, data),
        throughput: this.calculateClusterThroughput(cluster, data),
        availability: this.calculateClusterAvailability(cluster, data)
      };
    });

    // Calculate broker-level metrics
    data.brokers.forEach(broker => {
      const brokerId = `${broker.hostname}:${broker['broker.id']}`;
      metrics.brokers[brokerId] = {
        cpuUsage: this.calculateBrokerCpuUsage(broker),
        memoryUsage: this.calculateBrokerMemoryUsage(broker),
        networkUsage: this.calculateBrokerNetworkUsage(broker),
        requestLatency: this.calculateBrokerLatency(broker)
      };
    });

    // Calculate topic-level metrics
    data.topics.forEach(topic => {
      metrics.topics[topic.topic] = {
        throughput: topic['topic.messagesInPerSecond'] || 0,
        retentionUtilization: this.calculateRetentionUtilization(topic),
        replicationHealth: this.calculateReplicationHealth(topic)
      };
    });

    // Calculate consumer group metrics
    const consumerGroupMap = {};
    data.consumerGroups.forEach(consumer => {
      const groupId = consumer['consumer.group.id'];
      if (!consumerGroupMap[groupId]) {
        consumerGroupMap[groupId] = [];
      }
      consumerGroupMap[groupId].push(consumer);
    });

    Object.entries(consumerGroupMap).forEach(([groupId, consumers]) => {
      metrics.consumerGroups[groupId] = {
        totalLag: consumers.reduce((sum, c) => sum + (c['consumer.lag'] || 0), 0),
        consumerCount: new Set(consumers.map(c => c['consumer.clientId'])).size,
        topicCount: new Set(consumers.map(c => c.topic)).size,
        state: this.determineConsumerGroupState(consumers)
      };
    });

    return metrics;
  }

  // Helper methods for metric calculations
  calculateClusterHealth(cluster, allData) {
    let healthScore = 100;
    
    // Deduct for under-replicated partitions
    if (cluster['cluster.underReplicatedPartitions'] > 0) {
      healthScore -= Math.min(30, cluster['cluster.underReplicatedPartitions'] * 2);
    }
    
    // Deduct for offline partitions
    if (cluster['cluster.offlinePartitionsCount'] > 0) {
      healthScore -= Math.min(50, cluster['cluster.offlinePartitionsCount'] * 10);
    }
    
    // Check broker health
    const clusterBrokers = allData.brokers.filter(b => 
      b.clusterName === cluster.clusterName
    );
    
    const unhealthyBrokers = clusterBrokers.filter(b => 
      b['request.handlerIdle'] < 20 || b['underReplicatedPartitions'] > 0
    );
    
    if (unhealthyBrokers.length > 0) {
      healthScore -= Math.min(20, unhealthyBrokers.length * 5);
    }
    
    return Math.max(0, healthScore);
  }

  calculateClusterThroughput(cluster, allData) {
    const clusterBrokers = allData.brokers.filter(b => 
      b.clusterName === cluster.clusterName
    );
    
    const totalBytesIn = clusterBrokers.reduce((sum, b) => 
      sum + (b['broker.bytesInPerSecond'] || 0), 0
    );
    
    const totalBytesOut = clusterBrokers.reduce((sum, b) => 
      sum + (b['broker.bytesOutPerSecond'] || 0), 0
    );
    
    return {
      bytesInPerSecond: totalBytesIn,
      bytesOutPerSecond: totalBytesOut,
      totalBytesPerSecond: totalBytesIn + totalBytesOut
    };
  }

  calculateClusterAvailability(cluster, allData) {
    const totalBrokers = cluster['cluster.brokersCount'] || 0;
    const activeBrokers = allData.brokers.filter(b => 
      b.clusterName === cluster.clusterName && b['activeControllerCount'] >= 0
    ).length;
    
    return totalBrokers > 0 ? (activeBrokers / totalBrokers) * 100 : 0;
  }

  calculateBrokerCpuUsage(broker) {
    // Estimate CPU usage from request handler idle percentage
    const idlePercent = broker['request.handlerIdle'] || 100;
    return 100 - idlePercent;
  }

  calculateBrokerMemoryUsage(broker) {
    const heapUsed = broker['jvm.heapUsed'] || 0;
    const heapMax = broker['jvm.heapMax'] || 1;
    return heapMax > 0 ? (heapUsed / heapMax) * 100 : 0;
  }

  calculateBrokerNetworkUsage(broker) {
    const bytesIn = broker['broker.bytesInPerSecond'] || 0;
    const bytesOut = broker['broker.bytesOutPerSecond'] || 0;
    return bytesIn + bytesOut;
  }

  calculateBrokerLatency(broker) {
    const fetchLatency = broker['request.avgTimeFetch'] || 0;
    const produceLatency = broker['request.avgTimeProduce'] || 0;
    return (fetchLatency + produceLatency) / 2;
  }

  calculateRetentionUtilization(topic) {
    const retentionSize = topic['topic.retentionSizeBytes'] || 0;
    const maxRetention = 1099511627776; // 1TB default
    return (retentionSize / maxRetention) * 100;
  }

  calculateReplicationHealth(topic) {
    const underReplicated = topic['topic.underReplicatedPartitions'] || 0;
    const totalPartitions = topic['topic.partitionsCount'] || 1;
    return totalPartitions > 0 
      ? ((totalPartitions - underReplicated) / totalPartitions) * 100 
      : 100;
  }

  determineConsumerGroupState(consumers) {
    const totalLag = consumers.reduce((sum, c) => sum + (c['consumer.lag'] || 0), 0);
    const avgMessageRate = consumers.reduce((sum, c) => 
      sum + (c['consumer.messageRate'] || 0), 0
    ) / consumers.length;
    
    if (totalLag === 0) return 'STABLE';
    if (totalLag > 10000) return 'LAGGING';
    if (avgMessageRate === 0) return 'IDLE';
    return 'ACTIVE';
  }
}

module.exports = NriKafkaIntegration;