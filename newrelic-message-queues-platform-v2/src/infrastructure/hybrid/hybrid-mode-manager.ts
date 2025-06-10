/**
 * Hybrid Mode Manager
 * 
 * Orchestrates the combination of real infrastructure data and simulated data
 * to provide complete coverage of message queue topology
 */

import { injectable, inject } from 'inversify';
import { EventEmitter } from 'events';
import { TYPES } from '../config/types';
import { Logger } from '../../shared/utils/logger';
import { ConfigurationService } from '../config/configuration-service';
import { GapDetector, GapAnalysis } from './gap-detector';
import { EntitySimulator } from './entity-simulator';
import { SynthesizedEntity } from '../../synthesizers/entity-synthesizer';

export interface HybridModeConfig {
  fillGaps: boolean;
  simulateMetrics: boolean;
  preserveInfrastructureData: boolean;
  gapCheckInterval: number;
}

export interface HybridModeStats {
  infrastructureEntities: number;
  simulatedEntities: number;
  gapFilledEntities: number;
  lastGapCheck: Date;
  coverage: {
    clusters: number;
    brokers: number;
    topics: number;
    consumerGroups: number;
  };
}

@injectable()
export class HybridModeManager extends EventEmitter {
  private readonly infrastructureEntities = new Map<string, SynthesizedEntity>();
  private readonly simulatedEntities = new Map<string, SynthesizedEntity>();
  private readonly gapFilledEntities = new Map<string, SynthesizedEntity>();
  
  private readonly seenClusters = new Set<string>();
  private readonly seenBrokers = new Set<string>();
  private readonly seenTopics = new Set<string>();
  private readonly seenConsumerGroups = new Set<string>();
  
  private gapCheckInterval?: NodeJS.Timeout;
  private lastGapAnalysis?: GapAnalysis;

  constructor(
    @inject(TYPES.Logger) private readonly logger: Logger,
    @inject(TYPES.ConfigurationService) private readonly config: ConfigurationService,
    @inject(TYPES.GapDetector) private readonly gapDetector: GapDetector,
    @inject(TYPES.EntitySimulator) private readonly entitySimulator: EntitySimulator
  ) {
    super();
    this.logger = new Logger('HybridModeManager');
  }

  /**
   * Start hybrid mode management
   */
  async start(config: HybridModeConfig): Promise<void> {
    this.logger.info('Starting hybrid mode manager', config);
    
    // Start periodic gap checking
    if (config.gapCheckInterval > 0) {
      this.gapCheckInterval = setInterval(() => {
        this.checkAndFillGaps();
      }, config.gapCheckInterval);
    }
    
    this.emit('started');
  }

  /**
   * Stop hybrid mode management
   */
  async stop(): Promise<void> {
    if (this.gapCheckInterval) {
      clearInterval(this.gapCheckInterval);
    }
    
    this.logger.info('Stopped hybrid mode manager');
    this.emit('stopped');
  }

  /**
   * Update entities from infrastructure source
   */
  updateInfrastructureEntities(entities: SynthesizedEntity[]): void {
    // Clear previous state
    this.infrastructureEntities.clear();
    this.seenClusters.clear();
    this.seenBrokers.clear();
    this.seenTopics.clear();
    this.seenConsumerGroups.clear();
    
    // Update with new entities
    entities.forEach(entity => {
      this.infrastructureEntities.set(entity.entityGuid, entity);
      
      // Track what we've seen
      switch (entity.entityType) {
        case 'MESSAGE_QUEUE_CLUSTER':
          this.seenClusters.add(entity.clusterName);
          break;
        case 'MESSAGE_QUEUE_BROKER':
          this.seenBrokers.add(`${entity.clusterName}:${entity.brokerId}`);
          break;
        case 'MESSAGE_QUEUE_TOPIC':
          this.seenTopics.add(`${entity.clusterName}:${entity.topicName}`);
          break;
        case 'MESSAGE_QUEUE_CONSUMER_GROUP':
          this.seenConsumerGroups.add(`${entity.clusterName}:${entity.consumerGroupId}`);
          break;
      }
    });
    
    this.logger.debug(`Updated infrastructure entities: ${entities.length} entities`);
    
    this.emit('infrastructureUpdated', {
      count: entities.length,
      clusters: this.seenClusters.size,
      brokers: this.seenBrokers.size,
      topics: this.seenTopics.size,
      consumerGroups: this.seenConsumerGroups.size
    });
  }

  /**
   * Update entities from simulation source
   */
  updateSimulatedEntities(entities: SynthesizedEntity[]): void {
    this.simulatedEntities.clear();
    
    entities.forEach(entity => {
      this.simulatedEntities.set(entity.entityGuid, entity);
    });
    
    this.logger.debug(`Updated simulated entities: ${entities.length} entities`);
    
    this.emit('simulationUpdated', {
      count: entities.length
    });
  }

  /**
   * Get combined entities from all sources
   */
  getCombinedEntities(): SynthesizedEntity[] {
    const combined = new Map<string, SynthesizedEntity>();
    
    // Start with infrastructure entities (highest priority)
    this.infrastructureEntities.forEach((entity, guid) => {
      combined.set(guid, entity);
    });
    
    // Add gap-filled entities that don't conflict
    this.gapFilledEntities.forEach((entity, guid) => {
      if (!combined.has(guid)) {
        combined.set(guid, entity);
      }
    });
    
    // Add simulated entities that don't conflict
    this.simulatedEntities.forEach((entity, guid) => {
      if (!combined.has(guid)) {
        combined.set(guid, entity);
      }
    });
    
    return Array.from(combined.values());
  }

  /**
   * Check for gaps and fill them if configured
   */
  private async checkAndFillGaps(): Promise<void> {
    try {
      // Get desired topology from configuration or simulation
      const desiredTopology = this.getDesiredTopology();
      
      // Analyze gaps
      const gapAnalysis = this.gapDetector.analyzeGaps(
        Array.from(this.infrastructureEntities.values()),
        desiredTopology
      );
      
      this.lastGapAnalysis = gapAnalysis;
      
      // Fill gaps if configured (default to true for hybrid mode)
      await this.fillGaps(gapAnalysis);
      
      // Emit gap analysis results
      this.emit('gapAnalysis', gapAnalysis);
      
    } catch (error) {
      this.logger.error('Error checking gaps:', error);
      this.emit('error', error);
    }
  }

  /**
   * Fill identified gaps with simulated entities
   */
  private async fillGaps(gapAnalysis: GapAnalysis): Promise<void> {
    this.gapFilledEntities.clear();
    
    // Fill missing clusters
    for (const cluster of gapAnalysis.missingClusters) {
      const entities = await this.entitySimulator.simulateCluster(cluster);
      entities.forEach(entity => {
        this.gapFilledEntities.set(entity.entityGuid, entity);
      });
    }
    
    // Fill missing brokers
    for (const broker of gapAnalysis.missingBrokers) {
      const entity = await this.entitySimulator.simulateBroker(broker);
      this.gapFilledEntities.set(entity.entityGuid, entity);
    }
    
    // Fill missing topics
    for (const topic of gapAnalysis.missingTopics) {
      const entity = await this.entitySimulator.simulateTopic(topic);
      this.gapFilledEntities.set(entity.entityGuid, entity);
    }
    
    // Fill missing consumer groups
    for (const consumerGroup of gapAnalysis.missingConsumerGroups) {
      const entity = await this.entitySimulator.simulateConsumerGroup(consumerGroup);
      this.gapFilledEntities.set(entity.entityGuid, entity);
    }
    
    this.logger.info(`Filled ${this.gapFilledEntities.size} gaps`);
    
    this.emit('gapsFilled', {
      count: this.gapFilledEntities.size,
      clusters: gapAnalysis.missingClusters.length,
      brokers: gapAnalysis.missingBrokers.length,
      topics: gapAnalysis.missingTopics.length,
      consumerGroups: gapAnalysis.missingConsumerGroups.length
    });
  }

  /**
   * Get desired topology from configuration or simulation
   */
  private getDesiredTopology(): any {
    // This would come from configuration or a topology definition file
    // For now, return a basic topology
    return {
      clusters: [
        { name: this.config.getKafkaConfig().clusterName }
      ],
      brokers: [
        { clusterName: this.config.getKafkaConfig().clusterName, id: '1' },
        { clusterName: this.config.getKafkaConfig().clusterName, id: '2' },
        { clusterName: this.config.getKafkaConfig().clusterName, id: '3' }
      ],
      topics: [
        { clusterName: this.config.getKafkaConfig().clusterName, name: 'events' },
        { clusterName: this.config.getKafkaConfig().clusterName, name: 'logs' }
      ],
      consumerGroups: [
        { clusterName: this.config.getKafkaConfig().clusterName, id: 'processors' }
      ]
    };
  }

  /**
   * Get hybrid mode statistics
   */
  getStats(): HybridModeStats {
    return {
      infrastructureEntities: this.infrastructureEntities.size,
      simulatedEntities: this.simulatedEntities.size,
      gapFilledEntities: this.gapFilledEntities.size,
      lastGapCheck: this.lastGapAnalysis?.timestamp || new Date(),
      coverage: {
        clusters: this.seenClusters.size,
        brokers: this.seenBrokers.size,
        topics: this.seenTopics.size,
        consumerGroups: this.seenConsumerGroups.size
      }
    };
  }

  /**
   * Get last gap analysis results
   */
  getLastGapAnalysis(): GapAnalysis | undefined {
    return this.lastGapAnalysis;
  }
}