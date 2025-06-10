/**
 * Platform Orchestrator
 * Coordinates the entire data pipeline from collection to streaming
 */

import { injectable, inject } from 'inversify';
import { TYPES } from '@infrastructure/config/types';
import type { ConfigurationService } from '@infrastructure/config/configuration-service';
import type { Logger } from '@shared/utils/logger';
import type { EventBus } from '@shared/events/event-bus';
import { ErrorFactory } from '@shared/errors/base';

// Collectors
import type { BaseCollector, RawSample } from '../../collectors/base-collector';
import type { InfrastructureCollector } from '../../collectors/infrastructure-collector';
import { SimulationCollector } from '../../collectors/simulation-collector';

// Transformers
import type { BaseTransformer, TransformedMetrics } from '../../transformers/base-transformer';
import type { NriKafkaTransformer } from '../../transformers/nri-kafka-transformer';

// Synthesizer
import { EntitySynthesizer, SynthesizedEntity } from '../../synthesizers/entity-synthesizer';

// Streamers
import type { EntityStreamer } from '../../streaming/entity-streamer';
import type { MetricStreamer } from '../../streaming/metric-streamer';

// Documentation
import { PipelineDocumenter, PipelineDocumenterFactory } from '@infrastructure/documentation/pipeline-documenter';

export interface OrchestratorStats {
  cyclesRun: number;
  lastCycleTime?: number;
  lastCycleDuration?: number;
  totalEntitiesProcessed: number;
  errors: number;
  currentMode: string;
}

@injectable()
export class PlatformOrchestrator {
  private collector?: BaseCollector;
  private transformer?: BaseTransformer;
  private synthesizer: EntitySynthesizer;
  private pipelineDocumenter?: PipelineDocumenter;
  private isRunning = false;
  private cycleTimer?: NodeJS.Timeout;
  private stats: OrchestratorStats;
  private enableDocumentation = false;

  constructor(
    @inject(TYPES.ConfigurationService) private config: ConfigurationService,
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.EventBus) private eventBus: EventBus,
    @inject(TYPES.InfrastructureCollector) private infrastructureCollector: InfrastructureCollector,
    @inject(TYPES.NriKafkaTransformer) private nriKafkaTransformer: NriKafkaTransformer,
    @inject(TYPES.EntityStreamer) private entityStreamer: EntityStreamer,
    @inject(TYPES.MetricStreamer) private metricStreamer: MetricStreamer
  ) {
    // Initialize components based on mode
    this.initializeComponents();
    
    // Initialize synthesizer
    const platformConfig = {
      accountId: this.config.getNewRelicConfig().accountId,
      apiKey: this.config.getNewRelicConfig().ingestKey,
      region: this.config.getNewRelicConfig().region as 'US' | 'EU',
      environment: this.config.getEnvironment(),
      batchSize: 100,
      interval: this.config.getMonitoringInterval() / 1000, // Convert ms to seconds
      provider: this.config.getProvider()
    };
    
    this.synthesizer = new EntitySynthesizer(platformConfig);
    
    this.stats = {
      cyclesRun: 0,
      totalEntitiesProcessed: 0,
      errors: 0,
      currentMode: this.config.getPlatformMode()
    };
  }

  /**
   * Start the orchestrator
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      throw ErrorFactory.validation('Orchestrator is already running');
    }

    this.logger.info('Starting platform orchestrator', {
      mode: this.config.getPlatformMode(),
      interval: this.config.getMonitoringInterval()
    });

    this.isRunning = true;
    
    // Run first cycle immediately
    await this.runCycle();
    
    // Schedule subsequent cycles
    const interval = this.config.getMonitoringInterval();
    this.cycleTimer = setInterval(() => {
      this.runCycle().catch(error => {
        this.logger.error('Error in orchestrator cycle', { error });
      });
    }, interval);
  }

  /**
   * Stop the orchestrator
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('Stopping platform orchestrator');
    
    if (this.cycleTimer) {
      clearInterval(this.cycleTimer);
      this.cycleTimer = undefined;
    }
    
    this.isRunning = false;
  }

  /**
   * Run a single collection/transformation/streaming cycle
   */
  public async runCycle(): Promise<void> {
    const startTime = Date.now();
    const cycleId = `cycle-${Date.now()}`;
    
    try {
      this.logger.debug('Starting orchestrator cycle', { cycleId });
      
      // Emit cycle start event
      await this.eventBus.publish({
        id: cycleId,
        type: 'OrchestratorCycleStarted',
        aggregateId: 'platform',
        timestamp: new Date(startTime),
        version: 1,
        data: { mode: this.config.getPlatformMode() }
      });

      // Step 1: Collect raw data
      const rawSamples = await this.collect();
      this.logger.debug(`Collected ${rawSamples.length} raw samples`);

      // Capture raw data for documentation
      if (this.enableDocumentation && this.pipelineDocumenter) {
        const rawData = this.formatRawDataForDocumentation(rawSamples);
        this.pipelineDocumenter.captureRawData(rawData, this.config.getPlatformMode());
      }

      if (rawSamples.length === 0) {
        this.logger.info('No data to process in this cycle');
        return;
      }

      // Step 2: Transform raw samples to metrics
      const transformedMetrics = await this.transform(rawSamples);
      this.logger.debug(`Transformed ${transformedMetrics.length} metrics`);

      // Capture transformed data for documentation
      if (this.enableDocumentation && this.pipelineDocumenter) {
        const transformationStats = {
          fieldMappings: transformedMetrics.length * 5, // Approximate field mappings
          validations: transformedMetrics.length * 3,   // Approximate validations
          enrichments: transformedMetrics.length * 2    // Approximate enrichments
        };
        this.pipelineDocumenter.captureTransformedData(transformedMetrics, transformationStats);
      }

      // Step 3: Synthesize entities
      const entities = await this.synthesize(transformedMetrics);
      this.logger.debug(`Synthesized ${entities.length} entities`);

      // Capture synthesized data for documentation
      if (this.enableDocumentation && this.pipelineDocumenter) {
        const relationships = this.extractRelationships(entities);
        this.pipelineDocumenter.captureSynthesizedData(entities, relationships);
      }

      // Step 4: Stream to New Relic
      await this.stream(entities);
      
      // Update stats
      this.stats.cyclesRun++;
      this.stats.lastCycleTime = startTime;
      this.stats.lastCycleDuration = Date.now() - startTime;
      this.stats.totalEntitiesProcessed += entities.length;

      // Emit cycle completed event
      await this.eventBus.publish({
        id: `${cycleId}-completed`,
        type: 'OrchestratorCycleCompleted',
        aggregateId: 'platform',
        timestamp: new Date(),
        version: 1,
        data: {
          cycleId,
          duration: this.stats.lastCycleDuration,
          entitiesProcessed: entities.length,
          stats: this.getStats()
        }
      });

      this.logger.info('Orchestrator cycle completed', {
        cycleId,
        duration: `${this.stats.lastCycleDuration}ms`,
        entitiesProcessed: entities.length
      });

    } catch (error) {
      this.stats.errors++;
      
      this.logger.error('Error in orchestrator cycle', {
        cycleId,
        error: error instanceof Error ? error.message : String(error)
      });

      // Emit cycle error event
      await this.eventBus.publish({
        id: `${cycleId}-error`,
        type: 'OrchestratorCycleError',
        aggregateId: 'platform',
        timestamp: new Date(),
        version: 1,
        data: {
          cycleId,
          error: error instanceof Error ? error.message : String(error)
        }
      });

      throw error;
    }
  }

  /**
   * Get orchestrator statistics
   */
  public getStats(): OrchestratorStats {
    return { ...this.stats };
  }

  /**
   * Enable documentation generation
   */
  public enableDocumentationMode(outputDir?: string): void {
    this.enableDocumentation = true;
    this.pipelineDocumenter = PipelineDocumenterFactory.create(this.logger as any, outputDir);
    this.logger.info('Pipeline documentation mode enabled', { outputDir });
  }

  /**
   * Generate pipeline documentation report
   */
  public generateDocumentationReport(): string | null {
    if (!this.pipelineDocumenter) {
      this.logger.warn('Pipeline documentation is not enabled');
      return null;
    }
    return this.pipelineDocumenter.generateReport();
  }

  private initializeComponents(): void {
    const mode = this.config.getPlatformMode();
    const platformConfig = {
      accountId: this.config.getNewRelicConfig().accountId,
      apiKey: this.config.getNewRelicConfig().apiKey,
      region: this.config.getNewRelicConfig().region as 'US' | 'EU',
      environment: this.config.getEnvironment(),
      interval: this.config.getMonitoringInterval() / 1000, // Convert ms to seconds
      provider: this.config.getProvider()
    };

    switch (mode) {
      case 'infrastructure':
        this.collector = this.infrastructureCollector;
        this.transformer = this.nriKafkaTransformer;
        break;
        
      case 'simulation':
        this.collector = new SimulationCollector(platformConfig);
        // Simulation collector returns pre-transformed data
        this.transformer = undefined;
        break;
        
      case 'hybrid':
        // TODO: Implement hybrid mode
        throw ErrorFactory.notImplemented('Hybrid mode not yet implemented');
        
      default:
        throw ErrorFactory.configuration(`Unknown platform mode: ${mode}`);
    }
  }

  private async collect(): Promise<RawSample[]> {
    if (!this.collector) {
      throw ErrorFactory.configuration('No collector configured for current mode');
    }

    try {
      return await this.collector.collect();
    } catch (error) {
      throw ErrorFactory.infrastructure(
        'Failed to collect data',
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  private async transform(rawSamples: RawSample[]): Promise<TransformedMetrics[]> {
    // In simulation mode, data is already transformed
    if (!this.transformer) {
      // Convert raw samples directly to transformed metrics for simulation
      return rawSamples.map(sample => sample as unknown as TransformedMetrics);
    }

    try {
      const results: TransformedMetrics[] = [];
      
      for (const sample of rawSamples) {
        try {
          const transformed = await this.transformer.transform(sample);
          results.push(transformed);
        } catch (error) {
          this.logger.warn('Failed to transform sample', {
            eventType: sample.eventType,
            error: error instanceof Error ? error.message : String(error)
          });
          // Continue with other samples
        }
      }
      
      return results;
    } catch (error) {
      throw ErrorFactory.infrastructure(
        'Failed to transform data',
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  private async synthesize(metrics: TransformedMetrics[]): Promise<SynthesizedEntity[]> {
    try {
      const entities: SynthesizedEntity[] = [];
      
      for (const metric of metrics) {
        const entity = await this.synthesizer.synthesize(metric);
        entities.push(entity);
      }
      
      return entities;
    } catch (error) {
      throw ErrorFactory.infrastructure(
        'Failed to synthesize entities',
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  private async stream(entities: SynthesizedEntity[]): Promise<void> {
    try {
      // Stream as both events and metrics
      await Promise.all([
        this.entityStreamer.stream(entities),
        this.metricStreamer.stream(entities)
      ]);
    } catch (error) {
      throw ErrorFactory.infrastructure(
        'Failed to stream data to New Relic',
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  private formatRawDataForDocumentation(rawSamples: RawSample[]): any {
    // Group samples by type
    const grouped = {
      brokers: [] as any[],
      topics: [] as any[],
      consumerGroups: [] as any[],
      queues: [] as any[]
    };

    rawSamples.forEach(sample => {
      const eventType = sample.eventType;
      
      if (eventType === 'KafkaBrokerSample') {
        grouped.brokers.push(sample);
      } else if (eventType === 'KafkaTopicSample') {
        grouped.topics.push(sample);
      } else if (eventType === 'KafkaConsumerSample') {
        grouped.consumerGroups.push(sample);
      } else if (eventType === 'SimulatedSample') {
        // SimulatedSample can represent any type, check entityType or other fields
        if (sample.entityType === 'MESSAGE_QUEUE_BROKER' || sample['broker.id']) {
          grouped.brokers.push(sample);
        } else if (sample.entityType === 'MESSAGE_QUEUE_TOPIC' || sample.topic) {
          grouped.topics.push(sample);
        } else if (sample.entityType === 'MESSAGE_QUEUE_CONSUMER_GROUP' || sample.consumerGroup) {
          grouped.consumerGroups.push(sample);
        } else {
          // Default to broker if unclear
          grouped.brokers.push(sample);
        }
      }
    });

    return grouped;
  }

  private extractRelationships(entities: SynthesizedEntity[]): any[] {
    const relationships: any[] = [];
    
    entities.forEach(entity => {
      if (entity.relationships) {
        Object.entries(entity.relationships).forEach(([type, targets]) => {
          if (Array.isArray(targets)) {
            targets.forEach(target => {
              relationships.push({
                sourceGuid: entity.guid,
                targetGuid: target,
                type: type
              });
            });
          }
        });
      }
    });

    return relationships;
  }
}