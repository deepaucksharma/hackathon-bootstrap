/**
 * Production Streaming Example
 * 
 * Demonstrates streaming real data to New Relic with a production-like topology
 */

require('dotenv').config();
const chalk = require('chalk');
const DataSimulator = require('../simulation/engines/data-simulator');
const NewRelicStreamer = require('../simulation/streaming/new-relic-streamer');

async function runProductionStreaming(options = {}) {
  console.log(chalk.bold.blue('\n🏭 Production Streaming Example'));
  console.log(chalk.gray('=' .repeat(60)));
  console.log(chalk.white('Streaming realistic production data to New Relic'));
  console.log();
  
  const config = {
    duration: options.duration || 5, // minutes
    interval: options.interval || 30, // seconds
    dryRun: options.dryRun || false,
    verbose: options.verbose || false
  };
  
  try {
    // Step 1: Create production topology
    console.log(chalk.yellow('📋 Step 1: Creating production topology...'));
    const simulator = new DataSimulator({
      businessHoursStart: 9,
      businessHoursEnd: 17,
      anomalyRate: 0.02, // 2% anomaly rate
      seasonalVariation: true
    });
    
    const topology = simulator.createTopology({
      provider: 'kafka',
      environment: 'production',
      region: 'us-east-1',
      clusterCount: 3,
      brokersPerCluster: 10,
      topicsPerCluster: 50,
      partitionsPerTopic: 20,
      clusterConfig: {
        team: 'platform-engineering',
        criticality: 'critical',
        sla: '99.99'
      }
    });
    
    console.log(chalk.green('✅ Created production topology:'));
    console.log(chalk.gray(`   • Clusters: ${topology.clusters.length}`));
    console.log(chalk.gray(`   • Brokers: ${topology.brokers.length}`));
    console.log(chalk.gray(`   • Topics: ${topology.topics.length}`));
    console.log(chalk.gray(`   • Total entities: ${topology.clusters.length + topology.brokers.length + topology.topics.length}`));
    
    // Step 2: Initialize streamer
    console.log(chalk.yellow('\n📤 Step 2: Initializing New Relic streamer...'));
    const streamer = new NewRelicStreamer({
      apiKey: process.env.NEW_RELIC_API_KEY,
      accountId: process.env.NEW_RELIC_ACCOUNT_ID,
      batchSize: 100,
      flushInterval: 10000, // 10 seconds
      dryRun: config.dryRun,
      verbose: config.verbose
    });
    
    console.log(chalk.green('✅ Streamer initialized'));
    console.log(chalk.gray(`   • Dry run: ${config.dryRun ? 'YES' : 'NO'}`));
    console.log(chalk.gray(`   • Account ID: ${process.env.NEW_RELIC_ACCOUNT_ID}`));
    
    // Step 3: Initial entity sync
    console.log(chalk.yellow('\n🔄 Step 3: Initial entity sync...'));
    const allEntities = [
      ...topology.clusters,
      ...topology.brokers,
      ...topology.topics
    ];
    
    await streamer.streamEvents(allEntities);
    await streamer.flushAll();
    
    const initialStats = streamer.getStats();
    console.log(chalk.green('✅ Initial sync complete:'));
    console.log(chalk.gray(`   • Entities synced: ${initialStats.events.sent}`));
    
    // Step 4: Continuous metric streaming
    console.log(chalk.yellow(`\n📊 Step 4: Streaming metrics for ${config.duration} minutes...`));
    console.log(chalk.gray(`   Interval: Every ${config.interval} seconds`));
    
    const endTime = Date.now() + (config.duration * 60 * 1000);
    let iteration = 0;
    
    const streamingInterval = setInterval(async () => {
      iteration++;
      const minutesRemaining = Math.ceil((endTime - Date.now()) / 60000);
      
      console.log(chalk.cyan(`\n⏱️  Iteration ${iteration} (${minutesRemaining} min remaining)`));
      
      // Update metrics for all entities
      let metricsCount = 0;
      
      // Update cluster metrics
      for (const cluster of topology.clusters) {
        simulator.updateClusterMetrics(cluster);
        streamer.streamMetrics(cluster);
        metricsCount += cluster.goldenMetrics.length;
      }
      
      // Update broker metrics
      for (const broker of topology.brokers) {
        simulator.updateBrokerMetrics(broker);
        streamer.streamMetrics(broker);
        metricsCount += broker.goldenMetrics.length;
      }
      
      // Update topic metrics with consumer lag simulation
      for (const topic of topology.topics) {
        simulator.updateTopicMetrics(topic);
        streamer.streamMetrics(topic);
        metricsCount += topic.goldenMetrics.length;
      }
      
      // Flush metrics
      await streamer.flushAll();
      
      console.log(chalk.gray(`   • Metrics sent: ${metricsCount}`));
      
      // Inject anomalies occasionally
      if (Math.random() < 0.1) { // 10% chance per iteration
        const anomalyCluster = topology.clusters[Math.floor(Math.random() * topology.clusters.length)];
        console.log(chalk.yellow(`   ⚠️  Injecting anomaly in cluster: ${anomalyCluster.name}`));
        
        anomalyCluster.updateGoldenMetric('cluster.error.rate', 15.5, 'percentage');
        anomalyCluster.updateGoldenMetric('cluster.health.score', 45, 'percentage');
        streamer.streamMetrics(anomalyCluster);
      }
      
      // Check if time is up
      if (Date.now() >= endTime) {
        clearInterval(streamingInterval);
        await completeStreaming();
      }
    }, config.interval * 1000);
    
    async function completeStreaming() {
      console.log(chalk.yellow('\n🏁 Completing streaming session...'));
      
      // Final flush
      await streamer.flushAll();
      
      // Get final stats
      const finalStats = streamer.getStats();
      
      console.log(chalk.bold.green('\n✅ Streaming session complete!'));
      console.log(chalk.white('\n📊 Final Statistics:'));
      console.log(chalk.gray(`   • Total events sent: ${finalStats.events.sent}`));
      console.log(chalk.gray(`   • Total metrics sent: ${finalStats.metrics.sent}`));
      console.log(chalk.gray(`   • Events per second: ${finalStats.eventsPerSecond}`));
      console.log(chalk.gray(`   • Metrics per second: ${finalStats.metricsPerSecond}`));
      console.log(chalk.gray(`   • Success rate: ${finalStats.eventSuccessRate}%`));
      console.log(chalk.gray(`   • Total errors: ${finalStats.events.failed + finalStats.metrics.failed}`));
      
      if (!config.dryRun) {
        console.log(chalk.bold.blue('\n🔗 View your data in New Relic:'));
        console.log(chalk.white(`   Entity Explorer: https://one.newrelic.com/nr1-core/entity-explorer`));
        console.log(chalk.white(`   Query Builder: https://one.newrelic.com/data-exploration/query-builder`));
        console.log(chalk.gray('\n   Sample NRQL queries:'));
        console.log(chalk.gray(`   • SELECT * FROM MESSAGE_QUEUE_CLUSTER_SAMPLE SINCE 30 minutes ago`));
        console.log(chalk.gray(`   • SELECT average(cluster.health.score) FROM MESSAGE_QUEUE_CLUSTER_SAMPLE TIMESERIES`));
        console.log(chalk.gray(`   • SELECT sum(topic.throughput.in) FROM MESSAGE_QUEUE_TOPIC_SAMPLE FACET topic`));
      }
      
      // Shutdown
      await streamer.shutdown();
      process.exit(0);
    }
    
  } catch (error) {
    console.error(chalk.red(`\n❌ Error: ${error.message}`));
    console.error(error.stack);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  duration: 5,
  interval: 30,
  dryRun: false,
  verbose: false
};

args.forEach(arg => {
  if (arg === '--dry-run') options.dryRun = true;
  if (arg === '--verbose') options.verbose = true;
  if (arg.startsWith('--duration=')) options.duration = parseInt(arg.split('=')[1]);
  if (arg.startsWith('--interval=')) options.interval = parseInt(arg.split('=')[1]);
});

// Check for required environment variables
const required = ['NEW_RELIC_API_KEY', 'NEW_RELIC_ACCOUNT_ID'];
const missing = required.filter(key => !process.env[key]);

if (missing.length > 0) {
  console.error(chalk.red('❌ Missing required environment variables:'));
  missing.forEach(key => console.error(chalk.red(`   • ${key}`)));
  console.log(chalk.gray('\n💡 Set these in your .env file or export them'));
  process.exit(1);
}

// Show usage
if (args.includes('--help')) {
  console.log(chalk.white('\nUsage: node production-streaming.js [options]\n'));
  console.log(chalk.gray('Options:'));
  console.log(chalk.gray('  --duration=N    Stream for N minutes (default: 5)'));
  console.log(chalk.gray('  --interval=N    Send metrics every N seconds (default: 30)'));
  console.log(chalk.gray('  --dry-run       Run without sending data to New Relic'));
  console.log(chalk.gray('  --verbose       Show detailed output'));
  console.log(chalk.gray('  --help          Show this help message'));
  console.log();
  process.exit(0);
}

// Run the example
console.log(chalk.gray(`\n⚙️  Configuration:`));
console.log(chalk.gray(`   • Duration: ${options.duration} minutes`));
console.log(chalk.gray(`   • Interval: ${options.interval} seconds`));
console.log(chalk.gray(`   • Dry run: ${options.dryRun}`));
console.log(chalk.gray(`   • Verbose: ${options.verbose}`));

runProductionStreaming(options).catch(error => {
  console.error(chalk.red(`\n❌ Fatal error: ${error.message}`));
  process.exit(1);
});