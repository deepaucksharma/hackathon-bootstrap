#!/usr/bin/env node

/**
 * Performance Benchmark for Entity Transformation Pipeline
 * 
 * Tests the transformation performance with various data sizes
 * to ensure the platform can handle production workloads.
 */

const chalk = require('chalk');
const NriKafkaTransformer = require('./transformers/nri-kafka-transformer');

// Generate sample data for benchmarking
function generateSampleData(brokerCount, topicCount) {
  const samples = [];
  const timestamp = Date.now();
  
  // Generate broker samples
  for (let i = 1; i <= brokerCount; i++) {
    samples.push({
      eventType: 'KafkaBrokerSample',
      'broker.id': i,
      'broker.bytesInPerSecond': Math.random() * 10485760, // 0-10 MB/s
      'broker.bytesOutPerSecond': Math.random() * 10485760,
      'broker.messagesInPerSecond': Math.floor(Math.random() * 10000),
      'broker.messagesOutPerSecond': Math.floor(Math.random() * 10000),
      'broker.cpuPercent': 20 + Math.random() * 60,
      'broker.JVMMemoryUsedPercent': 30 + Math.random() * 50,
      'broker.diskUsedPercent': 20 + Math.random() * 60,
      'broker.networkProcessorIdlePercent': 60 + Math.random() * 35,
      'broker.requestHandlerIdlePercent': 65 + Math.random() * 30,
      'broker.underReplicatedPartitions': Math.random() > 0.9 ? Math.floor(Math.random() * 5) : 0,
      'broker.offlinePartitions': Math.random() > 0.95 ? 1 : 0,
      'broker.requestsPerSecond': Math.floor(Math.random() * 5000),
      'broker.leaderElectionRate': Math.random() * 0.5,
      'broker.uncleanLeaderElections': 0,
      clusterName: 'benchmark-cluster',
      kafkaVersion: '2.8.0',
      hostname: `broker-${i}.benchmark.local`,
      timestamp
    });
  }
  
  // Generate topic samples
  for (let i = 1; i <= topicCount; i++) {
    samples.push({
      eventType: 'KafkaTopicSample',
      'topic.name': `topic-${i}`,
      'topic.bytesInPerSecond': Math.random() * 5242880, // 0-5 MB/s
      'topic.bytesOutPerSecond': Math.random() * 5242880,
      'topic.messagesInPerSecond': Math.floor(Math.random() * 5000),
      'topic.messagesOutPerSecond': Math.floor(Math.random() * 5000),
      'topic.fetchRequestsPerSecond': Math.floor(Math.random() * 100),
      'topic.produceRequestsPerSecond': Math.floor(Math.random() * 100),
      'topic.partitionCount': Math.floor(3 + Math.random() * 20),
      'topic.replicationFactor': Math.floor(1 + Math.random() * 3),
      'topic.underReplicatedPartitions': Math.random() > 0.9 ? 1 : 0,
      'topic.diskSize': Math.random() * 1073741824, // 0-1 GB
      'topic.retentionMs': 86400000 * (1 + Math.floor(Math.random() * 7)), // 1-7 days
      clusterName: 'benchmark-cluster',
      timestamp
    });
  }
  
  return samples;
}

// Run a single benchmark
function runBenchmark(name, samples, transformer) {
  const startTime = process.hrtime.bigint();
  const startMemory = process.memoryUsage();
  
  try {
    const result = transformer.transformSamples(samples);
    
    const endTime = process.hrtime.bigint();
    const endMemory = process.memoryUsage();
    
    const durationMs = Number(endTime - startTime) / 1000000;
    const memoryDelta = (endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024;
    
    return {
      name,
      success: true,
      inputSamples: samples.length,
      outputEntities: result.stats.entitiesCreated,
      durationMs,
      samplesPerSecond: Math.round((samples.length / durationMs) * 1000),
      entitiesPerSecond: Math.round((result.stats.entitiesCreated / durationMs) * 1000),
      memoryUsageMB: memoryDelta,
      errors: result.stats.transformationErrors,
      breakdown: {
        brokers: result.stats.brokerEntities,
        topics: result.stats.topicEntities,
        clusters: result.stats.clusterEntities
      }
    };
  } catch (error) {
    return {
      name,
      success: false,
      error: error.message
    };
  }
}

// Format number with commas
function formatNumber(num) {
  return num.toLocaleString();
}

// Main benchmark suite
async function runBenchmarkSuite() {
  console.log(chalk.blue('\n🚀 Entity Transformation Performance Benchmark\n'));
  
  const accountId = '12345';
  const transformer = new NriKafkaTransformer(accountId);
  const results = [];
  
  // Define test scenarios
  const scenarios = [
    { name: 'Small Cluster', brokers: 3, topics: 10 },
    { name: 'Medium Cluster', brokers: 10, topics: 50 },
    { name: 'Large Cluster', brokers: 30, topics: 200 },
    { name: 'Extra Large Cluster', brokers: 100, topics: 1000 },
    { name: 'Massive Cluster', brokers: 500, topics: 5000 }
  ];
  
  // Warm up
  console.log(chalk.gray('Warming up...'));
  const warmupData = generateSampleData(10, 10);
  transformer.transformSamples(warmupData);
  
  // Run benchmarks
  for (const scenario of scenarios) {
    console.log(chalk.cyan(`\n📊 Testing ${scenario.name} (${scenario.brokers} brokers, ${scenario.topics} topics)`));
    
    const samples = generateSampleData(scenario.brokers, scenario.topics);
    const result = runBenchmark(scenario.name, samples, transformer);
    results.push(result);
    
    if (result.success) {
      console.log(chalk.green(`✓ Completed in ${result.durationMs.toFixed(2)}ms`));
      console.log(chalk.gray(`  - Input: ${formatNumber(result.inputSamples)} samples`));
      console.log(chalk.gray(`  - Output: ${formatNumber(result.outputEntities)} entities`));
      console.log(chalk.gray(`  - Throughput: ${formatNumber(result.samplesPerSecond)} samples/sec`));
      console.log(chalk.gray(`  - Entity rate: ${formatNumber(result.entitiesPerSecond)} entities/sec`));
      console.log(chalk.gray(`  - Memory delta: ${result.memoryUsageMB.toFixed(2)} MB`));
      
      if (result.errors > 0) {
        console.log(chalk.yellow(`  ⚠️  ${result.errors} transformation errors`));
      }
    } else {
      console.log(chalk.red(`✗ Failed: ${result.error}`));
    }
  }
  
  // Performance analysis
  console.log(chalk.blue('\n📈 Performance Analysis'));
  
  const successfulResults = results.filter(r => r.success);
  
  if (successfulResults.length > 0) {
    // Calculate averages
    const avgSamplesPerSec = successfulResults.reduce((sum, r) => sum + r.samplesPerSecond, 0) / successfulResults.length;
    const avgEntitiesPerSec = successfulResults.reduce((sum, r) => sum + r.entitiesPerSecond, 0) / successfulResults.length;
    
    console.log(chalk.green('\n✓ Summary:'));
    console.log(chalk.gray(`  - Average throughput: ${formatNumber(Math.round(avgSamplesPerSec))} samples/sec`));
    console.log(chalk.gray(`  - Average entity rate: ${formatNumber(Math.round(avgEntitiesPerSec))} entities/sec`));
    
    // Find best and worst performance
    const bestThroughput = successfulResults.reduce((best, r) => r.samplesPerSecond > best.samplesPerSecond ? r : best);
    const worstThroughput = successfulResults.reduce((worst, r) => r.samplesPerSecond < worst.samplesPerSecond ? r : worst);
    
    console.log(chalk.gray(`  - Best throughput: ${formatNumber(bestThroughput.samplesPerSecond)} samples/sec (${bestThroughput.name})`));
    console.log(chalk.gray(`  - Worst throughput: ${formatNumber(worstThroughput.samplesPerSecond)} samples/sec (${worstThroughput.name})`));
    
    // Scalability analysis
    console.log(chalk.cyan('\n📊 Scalability Analysis:'));
    
    for (const result of successfulResults) {
      const efficiency = (result.entitiesPerSecond / result.inputSamples) * 100;
      console.log(chalk.gray(`  - ${result.name}: ${efficiency.toFixed(1)}% transformation efficiency`));
    }
    
    // Production recommendations
    console.log(chalk.blue('\n💡 Production Recommendations:'));
    
    if (avgSamplesPerSec > 10000) {
      console.log(chalk.green('✓ Performance is excellent for production use'));
      console.log(chalk.gray('  - Can handle large-scale Kafka clusters'));
      console.log(chalk.gray('  - Consider running multiple instances for massive deployments'));
    } else if (avgSamplesPerSec > 5000) {
      console.log(chalk.yellow('⚠️  Performance is good for most production scenarios'));
      console.log(chalk.gray('  - Suitable for medium to large Kafka clusters'));
      console.log(chalk.gray('  - Monitor memory usage for very large deployments'));
    } else {
      console.log(chalk.red('❌ Performance may need optimization for large deployments'));
      console.log(chalk.gray('  - Consider batching transformations'));
      console.log(chalk.gray('  - Review transformation logic for optimization opportunities'));
    }
    
    // Memory usage analysis
    const avgMemoryUsage = successfulResults.reduce((sum, r) => sum + r.memoryUsageMB, 0) / successfulResults.length;
    console.log(chalk.cyan('\n💾 Memory Usage:'));
    console.log(chalk.gray(`  - Average memory delta: ${avgMemoryUsage.toFixed(2)} MB per transformation`));
    
    if (avgMemoryUsage < 50) {
      console.log(chalk.green('  ✓ Memory usage is efficient'));
    } else {
      console.log(chalk.yellow('  ⚠️  Consider memory optimization for large deployments'));
    }
  }
  
  // Generate performance report
  console.log(chalk.blue('\n📄 Detailed Performance Report:'));
  console.log(chalk.gray('┌─────────────────────┬──────────┬──────────┬────────────┬─────────────┬──────────┐'));
  console.log(chalk.gray('│ Scenario            │ Samples  │ Entities │ Duration   │ Throughput  │ Memory   │'));
  console.log(chalk.gray('├─────────────────────┼──────────┼──────────┼────────────┼─────────────┼──────────┤'));
  
  for (const result of results) {
    if (result.success) {
      const row = [
        result.name.padEnd(19),
        formatNumber(result.inputSamples).padStart(8),
        formatNumber(result.outputEntities).padStart(8),
        `${result.durationMs.toFixed(1)}ms`.padStart(10),
        `${formatNumber(result.samplesPerSecond)}/s`.padStart(11),
        `${result.memoryUsageMB.toFixed(1)}MB`.padStart(8)
      ];
      console.log(chalk.gray(`│ ${row.join(' │ ')} │`));
    }
  }
  
  console.log(chalk.gray('└─────────────────────┴──────────┴──────────┴────────────┴─────────────┴──────────┘'));
  
  console.log(chalk.blue('\n✅ Benchmark completed!\n'));
}

// Run if called directly
if (require.main === module) {
  runBenchmarkSuite().catch(console.error);
}

module.exports = { runBenchmarkSuite, generateSampleData, runBenchmark };