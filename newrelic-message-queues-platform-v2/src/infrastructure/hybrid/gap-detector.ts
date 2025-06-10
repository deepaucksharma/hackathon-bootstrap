/**
 * Gap Detector for Hybrid Mode
 * 
 * Identifies missing entities and metrics when running in hybrid mode
 * by comparing infrastructure data with simulation requirements
 */

import { injectable, inject } from 'inversify';
import { TYPES } from '../config/types.js';
import { Logger } from '../../shared/utils/logger.js';
import { ConfigurationService } from '../config/configuration-service.js';
import { SynthesizedEntity } from '../../synthesizers/entity-synthesizer.js';

export interface DesiredTopology {
  clusters: ClusterSpec[];
  brokers: BrokerSpec[];
  topics: TopicSpec[];
  consumerGroups: ConsumerGroupSpec[];
}

export interface ClusterSpec {
  name: string;
  requiredBrokers?: number;
}

export interface BrokerSpec {
  clusterName: string;
  id: string;
}

export interface TopicSpec {
  clusterName: string;
  name: string;
  partitions?: number;
  replicationFactor?: number;
}

export interface ConsumerGroupSpec {
  clusterName: string;
  id: string;
  topics?: string[];
}

export interface GapAnalysis {
  timestamp: Date;
  missingClusters: ClusterSpec[];
  missingBrokers: BrokerSpec[];
  missingTopics: TopicSpec[];
  missingConsumerGroups: ConsumerGroupSpec[];
  partialClusters: string[];
  staleMetrics: StaleMetric[];
  configurationMismatches: ConfigMismatch[];
  coverageReport: CoverageReport;
  recommendations: string[];
}

export interface StaleMetric {
  entityGuid: string;
  entityType: string;
  metricName: string;
  lastSeen: Date;
  ageMinutes: number;
}

export interface ConfigMismatch {
  entityGuid: string;
  entityType: string;
  field: string;
  expected: any;
  actual: any;
}

export interface CoverageReport {
  clusters: {
    expected: number;
    actual: number;
    coverage: number;
  };
  brokers: {
    expected: number;
    actual: number;
    coverage: number;
  };
  topics: {
    expected: number;
    actual: number;
    coverage: number;
  };
  consumerGroups: {
    expected: number;
    actual: number;
    coverage: number;
  };
  overall: number;
}

@injectable()
export class GapDetector {
  private readonly maxMetricAge: number;
  private readonly minBrokers: number;
  private readonly minTopics: number;

  constructor(
    @inject(TYPES.Logger) private readonly logger: Logger,
    @inject(TYPES.ConfigurationService) private readonly config: ConfigurationService
  ) {
    this.logger = new Logger('GapDetector');
    // Default values for gap detection
    this.maxMetricAge = 300000; // 5 minutes
    this.minBrokers = 1;
    this.minTopics = 1;
  }

  /**
   * Analyze gaps between infrastructure and desired state
   */
  analyzeGaps(infrastructureEntities: SynthesizedEntity[], desiredTopology: DesiredTopology): GapAnalysis {
    const analysis: GapAnalysis = {
      timestamp: new Date(),
      missingClusters: [],
      missingBrokers: [],
      missingTopics: [],
      missingConsumerGroups: [],
      partialClusters: [],
      staleMetrics: [],
      configurationMismatches: [],
      coverageReport: this.createEmptyCoverageReport(),
      recommendations: []
    };

    // Group entities by type
    const entityGroups = this.groupEntitiesByType(infrastructureEntities);

    // Check for missing clusters
    analysis.missingClusters = this.findMissingClusters(entityGroups.clusters, desiredTopology.clusters);

    // Check for missing brokers
    const brokerAnalysis = this.findMissingBrokers(entityGroups.brokers, desiredTopology.brokers);
    analysis.missingBrokers = brokerAnalysis.missing;
    analysis.partialClusters = brokerAnalysis.partialClusters;

    // Check for missing topics
    analysis.missingTopics = this.findMissingTopics(entityGroups.topics, desiredTopology.topics);

    // Check for missing consumer groups
    analysis.missingConsumerGroups = this.findMissingConsumerGroups(
      entityGroups.consumerGroups, 
      desiredTopology.consumerGroups
    );

    // Check for stale metrics
    analysis.staleMetrics = this.findStaleMetrics(infrastructureEntities);

    // Check configuration mismatches
    analysis.configurationMismatches = this.findConfigurationMismatches(
      infrastructureEntities,
      desiredTopology
    );

    // Generate coverage report
    analysis.coverageReport = this.generateCoverageReport(
      entityGroups,
      desiredTopology
    );

    // Generate recommendations
    analysis.recommendations = this.generateRecommendations(analysis);

    return analysis;
  }

  /**
   * Group entities by type for easier analysis
   */
  private groupEntitiesByType(entities: SynthesizedEntity[]): Record<string, SynthesizedEntity[]> {
    const groups: Record<string, SynthesizedEntity[]> = {
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
  private findMissingClusters(actualClusters: SynthesizedEntity[], desiredClusters: ClusterSpec[]): ClusterSpec[] {
    const seenClusters = new Set(actualClusters.map(c => c.clusterName));
    return desiredClusters.filter(cluster => !seenClusters.has(cluster.name));
  }

  /**
   * Find missing brokers and identify partial clusters
   */
  private findMissingBrokers(actualBrokers: SynthesizedEntity[], desiredBrokers: BrokerSpec[]): {
    missing: BrokerSpec[];
    partialClusters: string[];
  } {
    const seenBrokers = new Set(actualBrokers.map(b => `${b.clusterName}:${b.brokerId}`));
    const missing = desiredBrokers.filter(broker => 
      !seenBrokers.has(`${broker.clusterName}:${broker.id}`)
    );

    // Identify partial clusters (clusters with some but not all brokers)
    const clusterBrokerCounts = new Map<string, { actual: number; desired: number }>();
    
    actualBrokers.forEach(broker => {
      const count = clusterBrokerCounts.get(broker.clusterName) || { actual: 0, desired: 0 };
      count.actual++;
      clusterBrokerCounts.set(broker.clusterName, count);
    });

    desiredBrokers.forEach(broker => {
      const count = clusterBrokerCounts.get(broker.clusterName) || { actual: 0, desired: 0 };
      count.desired++;
      clusterBrokerCounts.set(broker.clusterName, count);
    });

    const partialClusters: string[] = [];
    clusterBrokerCounts.forEach((count, clusterName) => {
      if (count.actual > 0 && count.actual < count.desired) {
        partialClusters.push(clusterName);
      }
    });

    return { missing, partialClusters };
  }

  /**
   * Find missing topics
   */
  private findMissingTopics(actualTopics: SynthesizedEntity[], desiredTopics: TopicSpec[]): TopicSpec[] {
    const seenTopics = new Set(actualTopics.map(t => `${t.clusterName}:${t.topicName}`));
    return desiredTopics.filter(topic => 
      !seenTopics.has(`${topic.clusterName}:${topic.name}`)
    );
  }

  /**
   * Find missing consumer groups
   */
  private findMissingConsumerGroups(
    actualGroups: SynthesizedEntity[], 
    desiredGroups: ConsumerGroupSpec[]
  ): ConsumerGroupSpec[] {
    const seenGroups = new Set(actualGroups.map(g => `${g.clusterName}:${g.consumerGroupId}`));
    return desiredGroups.filter(group => 
      !seenGroups.has(`${group.clusterName}:${group.id}`)
    );
  }

  /**
   * Find stale metrics
   */
  private findStaleMetrics(entities: SynthesizedEntity[]): StaleMetric[] {
    const staleMetrics: StaleMetric[] = [];
    const now = Date.now();

    entities.forEach(entity => {
      if (entity.lastSeenAt) {
        const age = now - entity.lastSeenAt;
        if (age > this.maxMetricAge) {
          staleMetrics.push({
            entityGuid: entity.entityGuid,
            entityType: entity.entityType,
            metricName: 'all',
            lastSeen: new Date(entity.lastSeenAt),
            ageMinutes: Math.floor(age / 60000)
          });
        }
      }
    });

    return staleMetrics;
  }

  /**
   * Find configuration mismatches
   */
  private findConfigurationMismatches(
    entities: SynthesizedEntity[],
    desiredTopology: DesiredTopology
  ): ConfigMismatch[] {
    const mismatches: ConfigMismatch[] = [];

    // Check topic configurations
    const topicMap = new Map(desiredTopology.topics.map(t => [`${t.clusterName}:${t.name}`, t]));
    
    entities.filter(e => e.entityType === 'MESSAGE_QUEUE_TOPIC').forEach(entity => {
      const key = `${entity.clusterName}:${entity.topicName}`;
      const desired = topicMap.get(key);
      
      if (desired) {
        if (desired.partitions && entity.partitionCount !== desired.partitions) {
          mismatches.push({
            entityGuid: entity.entityGuid,
            entityType: entity.entityType,
            field: 'partitions',
            expected: desired.partitions,
            actual: entity.partitionCount
          });
        }
        
        if (desired.replicationFactor && entity.replicationFactor !== desired.replicationFactor) {
          mismatches.push({
            entityGuid: entity.entityGuid,
            entityType: entity.entityType,
            field: 'replicationFactor',
            expected: desired.replicationFactor,
            actual: entity.replicationFactor
          });
        }
      }
    });

    return mismatches;
  }

  /**
   * Generate coverage report
   */
  private generateCoverageReport(
    entityGroups: Record<string, SynthesizedEntity[]>,
    desiredTopology: DesiredTopology
  ): CoverageReport {
    const report: CoverageReport = {
      clusters: {
        expected: desiredTopology.clusters.length,
        actual: entityGroups.clusters.length,
        coverage: 0
      },
      brokers: {
        expected: desiredTopology.brokers.length,
        actual: entityGroups.brokers.length,
        coverage: 0
      },
      topics: {
        expected: desiredTopology.topics.length,
        actual: entityGroups.topics.length,
        coverage: 0
      },
      consumerGroups: {
        expected: desiredTopology.consumerGroups.length,
        actual: entityGroups.consumerGroups.length,
        coverage: 0
      },
      overall: 0
    };

    // Calculate coverage percentages
    report.clusters.coverage = report.clusters.expected > 0 
      ? (report.clusters.actual / report.clusters.expected) * 100 : 100;
    report.brokers.coverage = report.brokers.expected > 0 
      ? (report.brokers.actual / report.brokers.expected) * 100 : 100;
    report.topics.coverage = report.topics.expected > 0 
      ? (report.topics.actual / report.topics.expected) * 100 : 100;
    report.consumerGroups.coverage = report.consumerGroups.expected > 0 
      ? (report.consumerGroups.actual / report.consumerGroups.expected) * 100 : 100;

    // Calculate overall coverage
    const totalExpected = report.clusters.expected + report.brokers.expected + 
                         report.topics.expected + report.consumerGroups.expected;
    const totalActual = report.clusters.actual + report.brokers.actual + 
                       report.topics.actual + report.consumerGroups.actual;
    
    report.overall = totalExpected > 0 ? (totalActual / totalExpected) * 100 : 100;

    return report;
  }

  /**
   * Generate recommendations based on gap analysis
   */
  private generateRecommendations(analysis: GapAnalysis): string[] {
    const recommendations: string[] = [];

    // Missing clusters
    if (analysis.missingClusters.length > 0) {
      recommendations.push(
        `Missing ${analysis.missingClusters.length} clusters. Ensure nri-kafka is configured for all clusters.`
      );
    }

    // Partial clusters
    if (analysis.partialClusters.length > 0) {
      recommendations.push(
        `${analysis.partialClusters.length} clusters have incomplete broker coverage. Check broker connectivity.`
      );
    }

    // Stale metrics
    if (analysis.staleMetrics.length > 0) {
      recommendations.push(
        `${analysis.staleMetrics.length} entities have stale metrics. Check infrastructure agent connectivity.`
      );
    }

    // Configuration mismatches
    if (analysis.configurationMismatches.length > 0) {
      recommendations.push(
        `${analysis.configurationMismatches.length} configuration mismatches detected. Review topic settings.`
      );
    }

    // Low coverage
    if (analysis.coverageReport.overall < 80) {
      recommendations.push(
        `Overall coverage is ${analysis.coverageReport.overall.toFixed(1)}%. Consider enabling gap filling in hybrid mode.`
      );
    }

    // Minimum thresholds
    if (analysis.coverageReport.brokers.actual < this.minBrokers) {
      recommendations.push(
        `Only ${analysis.coverageReport.brokers.actual} brokers detected. Minimum ${this.minBrokers} recommended for production.`
      );
    }

    if (analysis.coverageReport.topics.actual < this.minTopics) {
      recommendations.push(
        `Only ${analysis.coverageReport.topics.actual} topics detected. Create topics or check permissions.`
      );
    }

    return recommendations;
  }

  /**
   * Create empty coverage report
   */
  private createEmptyCoverageReport(): CoverageReport {
    return {
      clusters: { expected: 0, actual: 0, coverage: 0 },
      brokers: { expected: 0, actual: 0, coverage: 0 },
      topics: { expected: 0, actual: 0, coverage: 0 },
      consumerGroups: { expected: 0, actual: 0, coverage: 0 },
      overall: 0
    };
  }
}