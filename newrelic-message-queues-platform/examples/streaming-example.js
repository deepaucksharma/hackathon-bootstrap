/**
 * Streaming Example
 * 
 * Demonstrates how to use the DataSimulator with NewRelicStreamer to
 * continuously generate and stream MESSAGE_QUEUE_* entity data to New Relic.
 */

const DataSimulator = require('../simulation/engines/data-simulator');
const NewRelicStreamer = require('../simulation/streaming/new-relic-streamer');
const { PROVIDERS } = require('../core/entities');
const chalk = require('chalk');

// Configuration
const config = {
  // New Relic configuration
  newRelic: {
    apiKey: process.env.NEW_RELIC_API_KEY,
    accountId: process.env.NEW_RELIC_ACCOUNT_ID,
    region: process.env.NEW_RELIC_REGION || 'US',
    batchSize: 50,
    flushInterval: 5000 // 5 seconds
  },
  
  // Simulation configuration
  simulation: {
    businessHoursStart: 9,
    businessHoursEnd: 17,
    timeZone: 'America/New_York',
    seasonalVariation: true,
    weekendReduction: 0.3,
    anomalyRate: 0.05,
    dataPattern: 'realistic'
  },
  
  // Topology configuration
  topology: {
    provider: PROVIDERS.KAFKA,
    environment: 'production',
    region: 'us-east-1',
    clusterCount: 2,
    brokersPerCluster: 3,
    topicsPerCluster: 10,
    clusterConfig: {
      team: 'platform',
      criticality: 'high'
    }
  },
  
  // Streaming configuration
  streaming: {
    intervalMs: 30000, // Stream every 30 seconds
    duration: null, // Run indefinitely (set to minutes for limited run)
    streamEvents: true,
    streamMetrics: true,
    verbose: true
  }
};

class StreamingOrchestrator {
  constructor(config) {
    this.config = config;
    this.simulator = new DataSimulator(config.simulation);
    this.streamer = new NewRelicStreamer(config.newRelic);
    this.topology = null;
    this.streamingInterval = null;
    this.startTime = Date.now();
    this.cycleCount = 0;
  }
  
  /**
   * Initialize the streaming process
   */
  async initialize() {
    console.log(chalk.blue('🚀 Initializing Message Queue Streaming...'));
    console.log(chalk.gray(`Provider: ${this.config.topology.provider}`));
    console.log(chalk.gray(`Environment: ${this.config.topology.environment}`));
    console.log(chalk.gray(`Region: ${this.config.topology.region}`));
    
    // Validate New Relic configuration
    if (!this.config.newRelic.apiKey || !this.config.newRelic.accountId) {
      throw new Error(chalk.red('❌ NEW_RELIC_API_KEY and NEW_RELIC_ACCOUNT_ID environment variables are required'));
    }
    
    // Create topology
    console.log(chalk.yellow('📊 Creating topology...'));
    this.topology = this.simulator.createTopology(this.config.topology);
    
    console.log(chalk.green(`✅ Created ${this.topology.clusters.length} clusters`));
    console.log(chalk.green(`✅ Created ${this.topology.brokers.length} brokers`));
    console.log(chalk.green(`✅ Created ${this.topology.topics.length} topics`));
    
    // Initial stream
    await this.streamCycle();
    
    return this;
  }
  
  /**
   * Start continuous streaming
   */
  start() {
    console.log(chalk.blue(`\n🎯 Starting continuous streaming (every ${this.config.streaming.intervalMs / 1000}s)...`));
    
    this.streamingInterval = setInterval(async () => {
      await this.streamCycle();
    }, this.config.streaming.intervalMs);
    
    // Handle graceful shutdown
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
    
    return this;
  }
  
  /**
   * Execute one streaming cycle
   */
  async streamCycle() {
    this.cycleCount++;
    const cycleStart = Date.now();
    
    if (this.config.streaming.verbose) {
      console.log(chalk.cyan(`\n⏱️  Cycle ${this.cycleCount} - ${new Date().toLocaleTimeString()}`));
    }
    
    try {
      // Update all metrics with current patterns
      this.updateAllMetrics();
      
      // Stream to New Relic
      await this.streamToNewRelic();
      
      const cycleDuration = Date.now() - cycleStart;
      if (this.config.streaming.verbose) {
        console.log(chalk.gray(`   Cycle completed in ${cycleDuration}ms`));
      }
      
      // Show statistics periodically
      if (this.cycleCount % 10 === 0) {
        this.showStatistics();
      }
      
      // Check if we should stop (if duration is set)
      if (this.config.streaming.duration) {
        const elapsedMinutes = (Date.now() - this.startTime) / (1000 * 60);
        if (elapsedMinutes >= this.config.streaming.duration) {
          console.log(chalk.yellow(`\n⏱️  Reached duration limit (${this.config.streaming.duration} minutes)`));
          await this.shutdown();
        }
      }
      
    } catch (error) {
      console.error(chalk.red(`❌ Error in streaming cycle: ${error.message}`));
      if (this.config.streaming.verbose) {
        console.error(error.stack);
      }
    }
  }
  
  /**
   * Update all entity metrics
   */
  updateAllMetrics() {
    // Update cluster metrics
    this.topology.clusters.forEach(cluster => {
      this.simulator.updateClusterMetrics(cluster);
    });
    
    // Update broker metrics
    this.topology.brokers.forEach(broker => {
      this.simulator.updateBrokerMetrics(broker);
    });
    
    // Update topic metrics
    this.topology.topics.forEach(topic => {
      this.simulator.updateTopicMetrics(topic);
    });
    
    // Update queue metrics if applicable
    this.topology.queues.forEach(queue => {
      this.simulator.updateQueueMetrics(queue);
    });
  }
  
  /**
   * Stream entities to New Relic
   */
  async streamToNewRelic() {
    const entities = [
      ...this.topology.clusters,
      ...this.topology.brokers,
      ...this.topology.topics,
      ...this.topology.queues
    ];
    
    if (this.config.streaming.streamEvents) {
      // Stream as events
      this.streamer.streamEvents(entities);
      
      if (this.config.streaming.verbose) {
        console.log(chalk.green(`   📤 Queued ${entities.length} entity events`));
      }
    }
    
    if (this.config.streaming.streamMetrics) {
      // Stream as metrics
      entities.forEach(entity => {
        this.streamer.streamMetrics(entity);
      });
      
      if (this.config.streaming.verbose) {
        console.log(chalk.green(`   📊 Queued metrics for ${entities.length} entities`));
      }
    }
  }
  
  /**
   * Show streaming statistics
   */
  showStatistics() {
    const stats = this.streamer.getStats();
    const runtime = ((Date.now() - this.startTime) / 1000 / 60).toFixed(1);
    
    console.log(chalk.blue('\n📈 Streaming Statistics:'));
    console.log(chalk.gray(`   Runtime: ${runtime} minutes`));
    console.log(chalk.gray(`   Cycles: ${this.cycleCount}`));
    console.log(chalk.gray(`   Events sent: ${stats.events.sent} (${stats.eventSuccessRate}% success)`));
    console.log(chalk.gray(`   Metrics sent: ${stats.metrics.sent} (${stats.metricSuccessRate}% success)`));
    console.log(chalk.gray(`   Events/sec: ${stats.eventsPerSecond}`));
    console.log(chalk.gray(`   Metrics/sec: ${stats.metricsPerSecond}`));
    console.log(chalk.gray(`   Queued: ${stats.queuedEvents} events, ${stats.queuedMetrics} metrics`));
    
    // Show entity-level statistics
    const clusterHealth = this.topology.clusters.map(c => 
      c.goldenMetrics.find(m => m.name === 'cluster.health.score')?.value || 0
    );
    const avgHealth = (clusterHealth.reduce((a, b) => a + b, 0) / clusterHealth.length).toFixed(1);
    
    console.log(chalk.gray(`   Average cluster health: ${avgHealth}%`));
  }
  
  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log(chalk.yellow('\n🛑 Shutting down streaming...'));
    
    // Stop streaming interval
    if (this.streamingInterval) {
      clearInterval(this.streamingInterval);
      this.streamingInterval = null;
    }
    
    // Flush remaining data
    await this.streamer.shutdown();
    
    // Show final statistics
    this.showStatistics();
    
    console.log(chalk.green('✅ Streaming shutdown complete'));
    process.exit(0);
  }
}

// Main execution
async function main() {
  console.log(chalk.bold.blue('\n🚀 New Relic Message Queue Streaming Example'));
  console.log(chalk.gray('=' .repeat(50)));
  
  try {
    const orchestrator = new StreamingOrchestrator(config);
    await orchestrator.initialize();
    orchestrator.start();
    
    console.log(chalk.green('\n✅ Streaming started successfully!'));
    console.log(chalk.gray('Press Ctrl+C to stop streaming...\n'));
    
  } catch (error) {
    console.error(chalk.red(`\n❌ Failed to start streaming: ${error.message}`));
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { StreamingOrchestrator, config };