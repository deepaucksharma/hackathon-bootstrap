/**
 * Gap Detector for Hybrid Mode
 * 
 * Identifies missing entities and metrics when running in hybrid mode
 * by comparing infrastructure data with simulation requirements.
 */

const chalk = require('chalk');

class GapDetector {
  constructor(options = {}) {
    this.accountId = options.accountId;
    this.debug = options.debug || false;
    this.thresholds = {
      minBrokers: options.minBrokers || 1,
      minTopics: options.minTopics || 1,
      maxMetricAge: options.maxMetricAge || 300000, // 5 minutes
      ...options.thresholds
    };
  }

  /**
   * Analyze gaps between infrastructure and desired state
   */
  analyzeGaps(infrastructureEntities, desiredTopology) {
    const gaps = {
      missingEntities: [],
      staleMetrics: [],
      configurationMismatches: [],
      coverageReport: {},
      recommendations: []
    };

    // Group entities by type
    const entityGroups = this.groupEntitiesByType(infrastructureEntities);
    
    // Check for missing clusters
    gaps.missingEntities.push(...this.findMissingClusters(
      entityGroups.clusters || [],
      desiredTopology.clusters || []
    ));

    // Check for missing brokers
    gaps.missingEntities.push(...this.findMissingBrokers(
      entityGroups.brokers || [],
      desiredTopology.brokers || []
    ));

    // Check for missing topics
    gaps.missingEntities.push(...this.findMissingTopics(
      entityGroups.topics || [],
      desiredTopology.topics || []
    ));

    // Check for stale metrics
    gaps.staleMetrics = this.findStaleMetrics(infrastructureEntities);

    // Check configuration mismatches
    gaps.configurationMismatches = this.findConfigurationMismatches(
      infrastructureEntities,
      desiredTopology
    );

    // Generate coverage report
    gaps.coverageReport = this.generateCoverageReport(
      entityGroups,
      desiredTopology
    );

    // Generate recommendations
    gaps.recommendations = this.generateRecommendations(gaps);

    return gaps;
  }

  /**
   * Group entities by type for easier analysis
   */
  groupEntitiesByType(entities) {
    const groups = {
      clusters: [],
      brokers: [],
      topics: [],
      consumerGroups: []
    };

    entities.forEach(entity => {
      switch (entity.entityType) {
        case 'MESSAGE_QUEUE_CLUSTER':
          groups.clusters.push(entity);
          break;
        case 'MESSAGE_QUEUE_BROKER':
          groups.brokers.push(entity);
          break;
        case 'MESSAGE_QUEUE_TOPIC':
          groups.topics.push(entity);
          break;
        case 'MESSAGE_QUEUE_CONSUMER_GROUP':
          groups.consumerGroups.push(entity);
          break;
      }
    });

    return groups;
  }

  /**
   * Find missing clusters
   */
  findMissingClusters(infrastructureClusters, desiredClusters) {
    const missing = [];
    const infraClusterNames = new Set(
      infrastructureClusters.map(c => c.clusterName)
    );

    desiredClusters.forEach(desired => {
      if (!infraClusterNames.has(desired.name)) {
        missing.push({
          type: 'cluster',
          name: desired.name,
          reason: 'Not found in infrastructure data',
          impact: 'high',
          suggestion: 'Check if nri-kafka is collecting from this cluster'
        });
      }
    });

    return missing;
  }

  /**
   * Find missing brokers
   */
  findMissingBrokers(infrastructureBrokers, desiredBrokers) {
    const missing = [];
    const infraBrokerIds = new Map();
    
    // Group by cluster
    infrastructureBrokers.forEach(broker => {
      const cluster = broker.clusterName || 'default';
      if (!infraBrokerIds.has(cluster)) {
        infraBrokerIds.set(cluster, new Set());
      }
      infraBrokerIds.get(cluster).add(broker.brokerId);
    });

    desiredBrokers.forEach(desired => {
      const cluster = desired.clusterName || 'default';
      const clusterBrokers = infraBrokerIds.get(cluster);
      
      if (!clusterBrokers || !clusterBrokers.has(String(desired.id))) {
        missing.push({
          type: 'broker',
          name: `Broker ${desired.id}`,
          cluster: cluster,
          reason: 'Not found in infrastructure data',
          impact: 'medium',
          suggestion: 'Verify broker is running and JMX is accessible'
        });
      }
    });

    return missing;
  }

  /**
   * Find missing topics
   */
  findMissingTopics(infrastructureTopics, desiredTopics) {
    const missing = [];
    const infraTopicNames = new Map();
    
    // Group by cluster
    infrastructureTopics.forEach(topic => {
      const cluster = topic.clusterName || 'default';
      if (!infraTopicNames.has(cluster)) {
        infraTopicNames.set(cluster, new Set());
      }
      infraTopicNames.get(cluster).add(topic.topicName);
    });

    desiredTopics.forEach(desired => {
      const cluster = desired.clusterName || 'default';
      const clusterTopics = infraTopicNames.get(cluster);
      
      if (!clusterTopics || !clusterTopics.has(desired.name)) {
        missing.push({
          type: 'topic',
          name: desired.name,
          cluster: cluster,
          reason: 'Not found in infrastructure data',
          impact: 'low',
          suggestion: 'Topic may not exist or may have no traffic'
        });
      }
    });

    return missing;
  }

  /**
   * Find stale metrics
   */
  findStaleMetrics(entities) {
    const stale = [];
    const now = Date.now();

    entities.forEach(entity => {
      const lastUpdate = entity.timestamp || entity._lastUpdate;
      if (lastUpdate && (now - lastUpdate) > this.thresholds.maxMetricAge) {
        const ageMinutes = Math.floor((now - lastUpdate) / 60000);
        stale.push({
          entityGuid: entity.entityGuid,
          entityType: entity.entityType,
          displayName: entity.displayName,
          lastUpdate: new Date(lastUpdate).toISOString(),
          ageMinutes: ageMinutes,
          reason: `No updates for ${ageMinutes} minutes`,
          impact: ageMinutes > 30 ? 'high' : 'medium'
        });
      }
    });

    return stale;
  }

  /**
   * Find configuration mismatches
   */
  findConfigurationMismatches(infrastructureEntities, desiredTopology) {
    const mismatches = [];

    // Check topic configurations
    infrastructureEntities.forEach(entity => {
      if (entity.entityType === 'MESSAGE_QUEUE_TOPIC') {
        const desired = desiredTopology.topics?.find(
          t => t.name === entity.topicName && 
              t.clusterName === entity.clusterName
        );

        if (desired) {
          // Check partition count
          if (desired.partitions && 
              entity['topic.partitions.count'] !== desired.partitions) {
            mismatches.push({
              entityGuid: entity.entityGuid,
              type: 'partition_count',
              actual: entity['topic.partitions.count'],
              desired: desired.partitions,
              impact: 'medium',
              suggestion: 'Consider adjusting topic partitions'
            });
          }

          // Check replication factor
          if (desired.replicationFactor && 
              entity['topic.replicationFactor'] !== desired.replicationFactor) {
            mismatches.push({
              entityGuid: entity.entityGuid,
              type: 'replication_factor',
              actual: entity['topic.replicationFactor'],
              desired: desired.replicationFactor,
              impact: 'high',
              suggestion: 'Replication factor mismatch may affect durability'
            });
          }
        }
      }
    });

    return mismatches;
  }

  /**
   * Generate coverage report
   */
  generateCoverageReport(entityGroups, desiredTopology) {
    const report = {
      clusters: {
        found: entityGroups.clusters.length,
        expected: desiredTopology.clusters?.length || 0,
        coverage: 0
      },
      brokers: {
        found: entityGroups.brokers.length,
        expected: desiredTopology.brokers?.length || 0,
        coverage: 0
      },
      topics: {
        found: entityGroups.topics.length,
        expected: desiredTopology.topics?.length || 0,
        coverage: 0
      },
      overall: {
        totalFound: 0,
        totalExpected: 0,
        coverage: 0
      }
    };

    // Calculate coverage percentages
    Object.keys(report).forEach(key => {
      if (key !== 'overall') {
        const item = report[key];
        item.coverage = item.expected > 0 
          ? Math.round((item.found / item.expected) * 100) 
          : 100;
      }
    });

    // Calculate overall coverage
    report.overall.totalFound = report.clusters.found + 
                                report.brokers.found + 
                                report.topics.found;
    report.overall.totalExpected = report.clusters.expected + 
                                  report.brokers.expected + 
                                  report.topics.expected;
    report.overall.coverage = report.overall.totalExpected > 0
      ? Math.round((report.overall.totalFound / report.overall.totalExpected) * 100)
      : 100;

    return report;
  }

  /**
   * Generate recommendations based on gaps
   */
  generateRecommendations(gaps) {
    const recommendations = [];

    // Missing entities recommendations
    if (gaps.missingEntities.length > 0) {
      const highImpact = gaps.missingEntities.filter(e => e.impact === 'high');
      if (highImpact.length > 0) {
        recommendations.push({
          priority: 'high',
          type: 'missing_entities',
          message: `${highImpact.length} critical entities are missing from infrastructure data`,
          action: 'Verify infrastructure agent and nri-kafka are properly configured',
          entities: highImpact.map(e => e.name)
        });
      }
    }

    // Stale metrics recommendations
    if (gaps.staleMetrics.length > 0) {
      const criticalStale = gaps.staleMetrics.filter(e => e.impact === 'high');
      if (criticalStale.length > 0) {
        recommendations.push({
          priority: 'high',
          type: 'stale_metrics',
          message: `${criticalStale.length} entities have critically stale metrics`,
          action: 'Check infrastructure agent connectivity and collection interval',
          entities: criticalStale.map(e => e.displayName)
        });
      }
    }

    // Configuration mismatch recommendations
    const criticalMismatches = gaps.configurationMismatches.filter(
      m => m.impact === 'high'
    );
    if (criticalMismatches.length > 0) {
      recommendations.push({
        priority: 'medium',
        type: 'configuration',
        message: `${criticalMismatches.length} configuration mismatches detected`,
        action: 'Review and align infrastructure configuration with desired state',
        details: criticalMismatches
      });
    }

    // Coverage recommendations
    if (gaps.coverageReport.overall.coverage < 80) {
      recommendations.push({
        priority: 'medium',
        type: 'coverage',
        message: `Infrastructure coverage is only ${gaps.coverageReport.overall.coverage}%`,
        action: 'Consider using simulation to fill gaps in infrastructure data',
        breakdown: {
          clusters: `${gaps.coverageReport.clusters.coverage}%`,
          brokers: `${gaps.coverageReport.brokers.coverage}%`,
          topics: `${gaps.coverageReport.topics.coverage}%`
        }
      });
    }

    // Simulation recommendations
    if (gaps.missingEntities.length > 5) {
      recommendations.push({
        priority: 'low',
        type: 'simulation',
        message: 'Many entities are missing from infrastructure',
        action: 'Enable hybrid mode to simulate missing entities',
        command: 'node platform.js --mode hybrid --fill-gaps'
      });
    }

    return recommendations;
  }

  /**
   * Print gap analysis report
   */
  printReport(gaps) {
    console.log(chalk.blue('\n📊 Gap Analysis Report\n'));

    // Coverage summary
    const coverage = gaps.coverageReport;
    console.log(chalk.cyan('Coverage Summary:'));
    console.log(chalk.gray(`  Overall: ${coverage.overall.coverage}%`));
    console.log(chalk.gray(`  - Clusters: ${coverage.clusters.found}/${coverage.clusters.expected} (${coverage.clusters.coverage}%)`));
    console.log(chalk.gray(`  - Brokers: ${coverage.brokers.found}/${coverage.brokers.expected} (${coverage.brokers.coverage}%)`));
    console.log(chalk.gray(`  - Topics: ${coverage.topics.found}/${coverage.topics.expected} (${coverage.topics.coverage}%)`));

    // Missing entities
    if (gaps.missingEntities.length > 0) {
      console.log(chalk.yellow(`\n⚠️  Missing Entities: ${gaps.missingEntities.length}`));
      gaps.missingEntities.slice(0, 5).forEach(entity => {
        console.log(chalk.gray(`  - ${entity.type}: ${entity.name} (${entity.cluster || 'N/A'})`));
      });
      if (gaps.missingEntities.length > 5) {
        console.log(chalk.gray(`  ... and ${gaps.missingEntities.length - 5} more`));
      }
    }

    // Stale metrics
    if (gaps.staleMetrics.length > 0) {
      console.log(chalk.yellow(`\n⏰ Stale Metrics: ${gaps.staleMetrics.length}`));
      gaps.staleMetrics.slice(0, 3).forEach(metric => {
        console.log(chalk.gray(`  - ${metric.displayName}: ${metric.ageMinutes} minutes old`));
      });
    }

    // Recommendations
    if (gaps.recommendations.length > 0) {
      console.log(chalk.blue('\n💡 Recommendations:'));
      gaps.recommendations.forEach((rec, index) => {
        const icon = rec.priority === 'high' ? '❗' : '💡';
        console.log(chalk.cyan(`\n${icon} ${index + 1}. ${rec.message}`));
        console.log(chalk.gray(`   Action: ${rec.action}`));
        if (rec.command) {
          console.log(chalk.gray(`   Run: ${rec.command}`));
        }
      });
    }

    console.log(chalk.green('\n✓ Gap analysis complete\n'));
  }
}

module.exports = GapDetector;