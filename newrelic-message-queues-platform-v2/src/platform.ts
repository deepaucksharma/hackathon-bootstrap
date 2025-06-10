/**
 * Message Queues Platform v2
 * 
 * Clean implementation with proper separation of concerns:
 * - Collectors: Retrieve raw data (nri-kafka format)
 * - Transformers: Convert to standard metrics (no entities)
 * - Synthesizers: Create MESSAGE_QUEUE entities
 * - Streamers: Send to New Relic
 */

import { EventEmitter } from 'events';
import { Logger } from './shared/utils/logger';
import { BaseCollector } from './collectors/base-collector';
import { InfrastructureCollector } from './collectors/infrastructure-collector';
import { SimulationCollector } from './collectors/simulation-collector';
import { BaseTransformer } from './transformers/base-transformer';
import { BrokerTransformer } from './transformers/broker-transformer';
import { TopicTransformer } from './transformers/topic-transformer';
import { ConsumerTransformer } from './transformers/consumer-transformer';
import { EntitySynthesizer } from './synthesizers/entity-synthesizer';
import { MetricStreamer } from './streaming/metric-streamer';
import { EntityStreamer } from './streaming/entity-streamer';
import { DashboardGenerator } from './dashboards/generator';
import { PlatformConfig, PlatformMode } from './shared/types/config';

export class MessageQueuesPlatform extends EventEmitter {
  private logger: Logger;
  private config: PlatformConfig;
  private collector: BaseCollector;
  private transformers: Map<string, BaseTransformer>;
  private synthesizer: EntitySynthesizer;
  private metricStreamer: MetricStreamer;
  private entityStreamer: EntityStreamer;
  private dashboardGenerator: DashboardGenerator;
  private running: boolean = false;
  private intervalId?: NodeJS.Timeout;

  constructor(config: PlatformConfig) {
    super();
    this.logger = new Logger('Platform');
    this.config = this.validateConfig(config);
    
    // Initialize components based on mode
    this.collector = this.createCollector();
    this.transformers = this.createTransformers();
    this.synthesizer = new EntitySynthesizer(this.config);
    this.metricStreamer = new MetricStreamer(this.config);
    this.entityStreamer = new EntityStreamer(this.config);
    this.dashboardGenerator = new DashboardGenerator(this.config);

    this.logger.info(`Platform initialized in ${this.config.mode} mode`);
  }

  private validateConfig(config: PlatformConfig): PlatformConfig {
    // Validate required fields
    if (!config.accountId) {
      throw new Error('Account ID is required');
    }
    if (!config.apiKey) {
      throw new Error('API key is required');
    }
    
    // Set defaults
    return {
      ...config,
      mode: config.mode || 'simulation',
      interval: config.interval || 60,
      provider: config.provider || 'kafka',
      region: config.region || 'US'
    };
  }

  private createCollector(): BaseCollector {
    switch (this.config.mode) {
      case 'infrastructure':
        return new InfrastructureCollector(this.config);
      case 'simulation':
        return new SimulationCollector(this.config);
      default:
        throw new Error(`Unknown mode: ${this.config.mode}`);
    }
  }

  private createTransformers(): Map<string, BaseTransformer> {
    const transformers = new Map<string, BaseTransformer>();
    transformers.set('KafkaBrokerSample', new BrokerTransformer(this.config));
    transformers.set('KafkaTopicSample', new TopicTransformer(this.config));
    transformers.set('KafkaConsumerSample', new ConsumerTransformer(this.config));
    return transformers;
  }

  async start(): Promise<void> {
    if (this.running) {
      this.logger.warn('Platform is already running');
      return;
    }

    this.running = true;
    this.logger.info('Starting platform...');
    
    // Run initial collection cycle
    await this.runCycle();
    
    // Schedule periodic collection
    if (this.config.interval > 0) {
      this.intervalId = setInterval(() => {
        this.runCycle().catch(error => {
          this.logger.error('Error in collection cycle:', error);
          this.emit('error', error);
        });
      }, this.config.interval * 1000);
      
      this.logger.info(`Scheduled collection every ${this.config.interval} seconds`);
    }
    
    this.emit('started');
  }

  async stop(): Promise<void> {
    if (!this.running) {
      this.logger.warn('Platform is not running');
      return;
    }

    this.running = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    
    this.logger.info('Platform stopped');
    this.emit('stopped');
  }

  private async runCycle(): Promise<void> {
    const startTime = Date.now();
    this.logger.debug('Starting collection cycle');
    
    try {
      // Step 1: Collect raw data
      const rawSamples = await this.collector.collect();
      this.logger.debug(`Collected ${rawSamples.length} raw samples`);
      
      // Step 2: Transform metrics (no entity creation)
      const transformedMetrics = [];
      for (const sample of rawSamples) {
        const transformer = this.transformers.get(sample.eventType);
        if (transformer) {
          try {
            const metrics = await transformer.transform(sample);
            transformedMetrics.push(metrics);
          } catch (error) {
            this.logger.error(`Error transforming ${sample.eventType}:`, error);
          }
        } else {
          this.logger.warn(`No transformer for event type: ${sample.eventType}`);
        }
      }
      
      this.logger.debug(`Transformed ${transformedMetrics.length} metrics`);
      
      // Step 3: Synthesize entities (separate from transformation)
      const entities = [];
      for (const metrics of transformedMetrics) {
        try {
          const entity = await this.synthesizer.synthesize(metrics);
          entities.push(entity);
        } catch (error) {
          this.logger.error('Error synthesizing entity:', error);
        }
      }
      
      this.logger.debug(`Synthesized ${entities.length} entities`);
      
      // Step 4: Stream to New Relic
      if (entities.length > 0) {
        // Stream metrics (optional, for custom metrics)
        await this.metricStreamer.stream(entities);
        
        // Stream entities (required for entity synthesis)
        await this.entityStreamer.stream(entities);
        
        this.logger.info(`Streamed ${entities.length} entities to New Relic`);
      }
      
      const duration = Date.now() - startTime;
      this.logger.debug(`Collection cycle completed in ${duration}ms`);
      
      this.emit('cycle:complete', {
        samples: rawSamples.length,
        metrics: transformedMetrics.length,
        entities: entities.length,
        duration
      });
      
    } catch (error) {
      this.logger.error('Error in collection cycle:', error);
      this.emit('cycle:error', error);
      throw error;
    }
  }

  async createDashboard(name?: string): Promise<string> {
    const result = await this.dashboardGenerator.generate(name);
    return result.url;
  }

  getStats(): any {
    return {
      running: this.running,
      mode: this.config.mode,
      interval: this.config.interval,
      collector: this.collector.getStats(),
      synthesizer: this.synthesizer.getStats()
    };
  }
}

// CLI Support
if (import.meta.url === `file://${process.argv[1]}`) {
  import('commander').then(({ Command }) => {
    const program = new Command();
    program
      .version('2.0.0')
      .option('-m, --mode <mode>', 'Platform mode (infrastructure|simulation)', 'simulation')
      .option('-i, --interval <seconds>', 'Collection interval in seconds', '60')
      .option('-a, --account <id>', 'New Relic account ID', process.env.NEW_RELIC_ACCOUNT_ID)
      .option('-k, --api-key <key>', 'New Relic API key', process.env.NEW_RELIC_API_KEY)
      .option('-r, --region <region>', 'New Relic region (US|EU)', 'US')
      .option('-d, --dashboard', 'Create dashboard after starting')
      .parse(process.argv);

    const options = program.opts();
    
    if (!options.account || !options.apiKey) {
      console.error('Error: Account ID and API key are required');
      console.error('Set via environment variables or command line options');
      process.exit(1);
    }

    const config: PlatformConfig = {
      mode: options.mode as PlatformMode,
      interval: parseInt(options.interval),
      accountId: options.account,
      apiKey: options.apiKey,
      region: options.region,
      provider: 'kafka'
    };

    const platform = new MessageQueuesPlatform(config);
    
    // Handle events
    platform.on('started', () => {
      console.log('✅ Platform started successfully');
      
      if (options.dashboard) {
        platform.createDashboard()
          .then(url => console.log(`📊 Dashboard created: ${url}`))
          .catch(error => console.error('❌ Dashboard creation failed:', error));
      }
    });
    
    platform.on('cycle:complete', (stats) => {
      console.log(`📊 Cycle complete: ${stats.entities} entities in ${stats.duration}ms`);
    });
    
    platform.on('error', (error) => {
      console.error('❌ Platform error:', error);
    });
    
    // Handle shutdown
    process.on('SIGINT', async () => {
      console.log('\n⏹️  Shutting down...');
      await platform.stop();
      process.exit(0);
    });
    
    // Start platform
    platform.start().catch(error => {
      console.error('❌ Failed to start platform:', error);
      process.exit(1);
    });
  });
}