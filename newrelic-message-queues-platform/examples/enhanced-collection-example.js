/**
 * Enhanced Metric Collection Example
 * 
 * Demonstrates how to use the enhanced metric collection system with:
 * - Structured metric definitions
 * - Concurrent collection using worker pools
 * - Consumer group lag monitoring
 * - Connection verification and health checks
 * - Comprehensive error handling
 */

const path = require('path');
const chalk = require('chalk');

// Import the enhanced collectors
const EnhancedKafkaCollector = require('../infrastructure/collectors/enhanced-kafka-collector');
const ConsumerOffsetCollector = require('../infrastructure/collectors/consumer-offset-collector');
const { 
  getAllMetricDefinitions,
  getMetricsByStrategy,
  COLLECTION_STRATEGIES 
} = require('../core/metrics/metric-definitions');
const { logger } = require('../core/utils/logger');
const { getConfigManager } = require('../core/config/config-manager');

/**
 * Enhanced Collection Demo
 */
class EnhancedCollectionDemo {
  constructor() {
    this.config = {
      // Enhanced collector configuration
      brokerWorkerPoolSize: 5,
      topicWorkerPoolSize: 8,
      consumerWorkerPoolSize: 3,
      enableDetailedTopicMetrics: true,
      enableConsumerLagCollection: true,
      metricValidation: true,
      
      // Consumer offset collector configuration
      lagWarningThreshold: 1000,
      lagCriticalThreshold: 10000,
      lagTrendAnalysis: true,
      partitionLevelDetails: true,
      
      // Collection timing
      collectionInterval: 30000, // 30 seconds
      healthCheckInterval: 60000, // 1 minute
      
      // Debug settings
      debug: process.env.DEBUG === 'true' || process.argv.includes('--debug')
    };
    
    this.enhancedCollector = null;
    this.consumerCollector = null;
    this.isRunning = false;
    this.collectionCount = 0;
  }

  /**
   * Initialize the enhanced collection system
   */
  async initialize() {
    console.log(chalk.blue.bold('\n🚀 Enhanced Kafka Metric Collection Demo\n'));
    
    try {
      // Display metric definitions overview
      this.displayMetricDefinitions();
      
      // Initialize enhanced Kafka collector
      console.log(chalk.yellow('📊 Initializing Enhanced Kafka Collector...'));
      this.enhancedCollector = new EnhancedKafkaCollector(this.config);
      await this.enhancedCollector.initialize();
      
      // Initialize consumer offset collector
      console.log(chalk.yellow('👥 Initializing Consumer Offset Collector...'));
      this.consumerCollector = new ConsumerOffsetCollector(this.config);
      await this.consumerCollector.initialize();
      
      console.log(chalk.green.bold('\n✅ Enhanced collection system initialized successfully!\n'));
      
      // Display collection strategies
      this.displayCollectionStrategies();
      
      return true;
      
    } catch (error) {
      console.error(chalk.red.bold(`❌ Initialization failed: ${error.message}`));
      await this.cleanup();
      throw error;
    }
  }

  /**
   * Display metric definitions overview
   */
  displayMetricDefinitions() {
    console.log(chalk.cyan.bold('📋 Metric Definitions Overview:\n'));
    
    const definitions = getAllMetricDefinitions();
    
    Object.entries(definitions).forEach(([entityType, metrics]) => {
      const metricCount = Object.keys(metrics).length;
      console.log(chalk.cyan(`   ${entityType.toUpperCase()}: ${metricCount} metrics defined`));
      
      // Show sample metrics
      const sampleMetrics = Object.keys(metrics).slice(0, 3);
      sampleMetrics.forEach(metric => {
        console.log(chalk.gray(`     - ${metric}`));
      });
      if (Object.keys(metrics).length > 3) {
        console.log(chalk.gray(`     - ... and ${Object.keys(metrics).length - 3} more`));
      }
      console.log();
    });
  }

  /**
   * Display collection strategies
   */
  displayCollectionStrategies() {
    console.log(chalk.magenta.bold('🎯 Collection Strategies:\n'));
    
    Object.entries(COLLECTION_STRATEGIES).forEach(([strategy, config]) => {
      console.log(chalk.magenta(`   ${strategy.toUpperCase()}`));
      console.log(chalk.gray(`     ${config.description}`));
      console.log(chalk.gray(`     Parallelism: ${config.parallelism}, Batch Size: ${config.batchSize}`));
      
      const metrics = getMetricsByStrategy(strategy);
      const metricCount = Object.values(metrics).reduce((sum, entityMetrics) => 
        sum + Object.keys(entityMetrics).length, 0);
      
      if (metricCount > 0) {
        console.log(chalk.gray(`     Metrics using this strategy: ${metricCount}`));
      }
      console.log();
    });
  }

  /**
   * Run a comprehensive collection cycle
   */
  async runCollectionCycle() {
    this.collectionCount++;
    const cycleStartTime = Date.now();
    
    console.log(chalk.blue.bold(`\n📊 Collection Cycle #${this.collectionCount}`));
    console.log(chalk.gray(`Started at: ${new Date().toISOString()}`));
    console.log(chalk.gray('─'.repeat(60)));
    
    const results = {
      enhanced: null,
      consumer: null,
      errors: []
    };
    
    try {
      // Run enhanced Kafka collection
      console.log(chalk.yellow('🔍 Running enhanced Kafka metrics collection...'));
      try {
        results.enhanced = await this.enhancedCollector.collectEnhancedKafkaMetrics('5 minutes ago');
        this.displayEnhancedResults(results.enhanced);
      } catch (error) {
        console.error(chalk.red(`❌ Enhanced collection failed: ${error.message}`));
        results.errors.push({ type: 'enhanced', error: error.message });
      }
      
      // Run consumer offset collection
      console.log(chalk.yellow('\n👥 Running consumer offset collection...'));
      try {
        results.consumer = await this.consumerCollector.collectConsumerGroupMetrics('5 minutes ago');
        this.displayConsumerResults(results.consumer);
      } catch (error) {
        console.error(chalk.red(`❌ Consumer collection failed: ${error.message}`));
        results.errors.push({ type: 'consumer', error: error.message });
      }
      
      // Display cycle summary
      const cycleDuration = Date.now() - cycleStartTime;
      this.displayCycleSummary(results, cycleDuration);
      
      return results;
      
    } catch (error) {
      console.error(chalk.red.bold(`❌ Collection cycle failed: ${error.message}`));
      results.errors.push({ type: 'cycle', error: error.message });
      return results;
    }
  }

  /**
   * Display enhanced collection results
   */
  displayEnhancedResults(results) {
    if (!results) return;
    
    const stats = results.collectionStats;
    
    console.log(chalk.green('✅ Enhanced Collection Results:'));
    console.log(chalk.gray(`   Duration: ${stats.totalDuration}ms`));
    console.log(chalk.gray(`   Brokers: ${stats.brokerCount}`));
    console.log(chalk.gray(`   Topics: ${stats.topicCount}`));
    console.log(chalk.gray(`   Clusters: ${stats.clusterCount}`));
    
    if (stats.errorCount > 0) {
      console.log(chalk.red(`   Errors: ${stats.errorCount}`));
    }
    
    // Display worker pool performance
    if (stats.workerPoolStats) {
      console.log(chalk.gray('   Worker Pool Performance:'));
      Object.entries(stats.workerPoolStats).forEach(([poolName, poolStats]) => {
        if (poolStats.metrics.tasksProcessed > 0) {
          console.log(chalk.gray(`     ${poolName}: ${poolStats.metrics.tasksProcessed} tasks, avg ${poolStats.metrics.avgProcessingTime.toFixed(0)}ms`));
        }
      });
    }
    
    // Sample some collected metrics
    if (results.brokerMetrics.length > 0) {
      console.log(chalk.gray('   Sample Broker Metrics:'));
      const sample = results.brokerMetrics[0];
      console.log(chalk.gray(`     Broker ${sample['broker.id']}: ${sample['broker.messagesInPerSecond']} msg/s in, ${sample['broker.bytesInPerSecond']} bytes/s in`));
    }
  }

  /**
   * Display consumer collection results
   */
  displayConsumerResults(results) {
    if (!results) return;
    
    const stats = results.collectionStats;
    
    console.log(chalk.green('✅ Consumer Collection Results:'));
    console.log(chalk.gray(`   Duration: ${stats.totalDuration}ms`));
    console.log(chalk.gray(`   Consumer Groups: ${stats.consumerGroupCount}`));
    console.log(chalk.gray(`   Lag Metrics: ${stats.lagMetricCount}`));
    
    if (stats.stateChangeCount > 0) {
      console.log(chalk.blue(`   State Changes: ${stats.stateChangeCount}`));
    }
    
    // Display lag severity breakdown
    if (stats.lagSeverityCounts) {
      const { OK, WARNING, CRITICAL } = stats.lagSeverityCounts;
      if (CRITICAL > 0) {
        console.log(chalk.red(`   Critical Lag: ${CRITICAL} partitions`));
      }
      if (WARNING > 0) {
        console.log(chalk.yellow(`   Warning Lag: ${WARNING} partitions`));
      }
      if (OK > 0) {
        console.log(chalk.green(`   OK Lag: ${OK} partitions`));
      }
    }
    
    if (stats.errorCount > 0) {
      console.log(chalk.red(`   Errors: ${stats.errorCount}`));
    }
    
    // Sample consumer group info
    if (results.consumerGroups.length > 0) {
      console.log(chalk.gray('   Sample Consumer Groups:'));
      results.consumerGroups.slice(0, 2).forEach(group => {
        console.log(chalk.gray(`     ${group.groupId} (${group.clusterName}): ${group.state}, ${group.memberCount} members`));
      });
    }
  }

  /**
   * Display cycle summary
   */
  displayCycleSummary(results, cycleDuration) {
    console.log(chalk.gray('─'.repeat(60)));
    console.log(chalk.blue(`📊 Cycle #${this.collectionCount} Summary:`));
    console.log(chalk.gray(`   Total Duration: ${cycleDuration}ms`));
    console.log(chalk.gray(`   Components: ${results.enhanced ? '✅' : '❌'} Enhanced, ${results.consumer ? '✅' : '❌'} Consumer`));
    
    if (results.errors.length > 0) {
      console.log(chalk.red(`   Errors: ${results.errors.length}`));
      results.errors.forEach(error => {
        console.log(chalk.red(`     ${error.type}: ${error.error}`));
      });
    }
    
    console.log(chalk.gray(`   Completed at: ${new Date().toISOString()}`));
  }

  /**
   * Run health checks
   */
  async runHealthChecks() {
    console.log(chalk.cyan('\n🩺 Running Health Checks...\n'));
    
    try {
      // Enhanced collector health
      if (this.enhancedCollector) {
        const enhancedHealth = await this.enhancedCollector.getHealthStatus();
        console.log(chalk.cyan('📊 Enhanced Collector Health:'));
        console.log(chalk.gray(`   Initialized: ${enhancedHealth.initialized ? '✅' : '❌'}`));
        console.log(chalk.gray(`   Connection Verified: ${enhancedHealth.connectionVerified ? '✅' : '❌'}`));
        console.log(chalk.gray(`   Last Health Check: ${enhancedHealth.lastHealthCheck || 'Never'}`));
        
        if (enhancedHealth.healthCheckStale) {
          console.log(chalk.yellow('   ⚠️ Health check is stale'));
        }
        
        // Worker pool status
        console.log(chalk.gray('   Worker Pools:'));
        Object.entries(enhancedHealth.workerPools).forEach(([name, status]) => {
          const running = status.isRunning ? '✅' : '❌';
          console.log(chalk.gray(`     ${name}: ${running} (${status.idleWorkers}/${status.poolSize} idle)`));
        });
        console.log();
      }
      
      // Consumer collector health
      if (this.consumerCollector) {
        const consumerSummary = await this.consumerCollector.getConsumerGroupLagSummary();
        console.log(chalk.cyan('👥 Consumer Collector Health:'));
        console.log(chalk.gray(`   Total Groups Tracked: ${consumerSummary.totalGroups}`));
        console.log(chalk.gray(`   Groups with High Lag: ${consumerSummary.groupsWithHighLag}`));
        
        if (consumerSummary.consumerGroups.length > 0) {
          console.log(chalk.gray('   Recent Group Activity:'));
          consumerSummary.consumerGroups.slice(0, 3).forEach(group => {
            console.log(chalk.gray(`     ${group.groupId}: max lag ${group.maxLag}, avg lag ${group.avgLag.toFixed(0)}`));
          });
        }
        console.log();
      }
      
      // Circuit breaker status (if available)
      if (this.enhancedCollector && this.enhancedCollector.getCircuitBreakerStats) {
        const cbStats = this.enhancedCollector.getCircuitBreakerStats();
        console.log(chalk.cyan('🔌 Circuit Breaker Status:'));
        Object.entries(cbStats).forEach(([name, stats]) => {
          const state = stats.state || 'unknown';
          const color = state === 'CLOSED' ? chalk.green : (state === 'OPEN' ? chalk.red : chalk.yellow);
          console.log(color(`   ${name}: ${state} (${stats.successCount}/${stats.failureCount})`));
        });
      }
      
    } catch (error) {
      console.error(chalk.red(`❌ Health check failed: ${error.message}`));
    }
  }

  /**
   * Run continuous collection demo
   */
  async runDemo(options = {}) {
    const {
      cycles = 5,
      intervalSeconds = 30,
      includeHealthChecks = true
    } = options;
    
    try {
      await this.initialize();
      
      this.isRunning = true;
      
      console.log(chalk.green.bold(`\n🎬 Starting demo with ${cycles} cycles (${intervalSeconds}s intervals)\n`));
      
      for (let i = 0; i < cycles && this.isRunning; i++) {
        // Run collection cycle
        await this.runCollectionCycle();
        
        // Run health checks periodically
        if (includeHealthChecks && (i + 1) % 2 === 0) {
          await this.runHealthChecks();
        }
        
        // Wait before next cycle (except for last iteration)
        if (i < cycles - 1 && this.isRunning) {
          console.log(chalk.gray(`\n⏳ Waiting ${intervalSeconds} seconds until next cycle...\n`));
          await this.sleep(intervalSeconds * 1000);
        }
      }
      
      console.log(chalk.green.bold('\n🎉 Demo completed successfully!\n'));
      
    } catch (error) {
      console.error(chalk.red.bold(`❌ Demo failed: ${error.message}`));
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Stop the demo
   */
  stop() {
    console.log(chalk.yellow('\n🛑 Stopping demo...\n'));
    this.isRunning = false;
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    console.log(chalk.gray('🧹 Cleaning up resources...'));
    
    try {
      if (this.enhancedCollector) {
        await this.enhancedCollector.cleanup();
      }
      
      if (this.consumerCollector) {
        await this.consumerCollector.cleanup();
      }
      
      console.log(chalk.green('✅ Cleanup completed'));
      
    } catch (error) {
      console.error(chalk.red(`❌ Cleanup failed: ${error.message}`));
    }
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Main execution
 */
async function main() {
  const demo = new EnhancedCollectionDemo();
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log(chalk.yellow('\n📡 Received SIGINT, stopping demo...'));
    demo.stop();
  });
  
  process.on('SIGTERM', () => {
    console.log(chalk.yellow('\n📡 Received SIGTERM, stopping demo...'));
    demo.stop();
  });
  
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const cycles = parseInt(args.find(arg => arg.startsWith('--cycles='))?.split('=')[1]) || 3;
    const interval = parseInt(args.find(arg => arg.startsWith('--interval='))?.split('=')[1]) || 30;
    const healthChecks = !args.includes('--no-health-checks');
    
    // Run the demo
    await demo.runDemo({
      cycles,
      intervalSeconds: interval,
      includeHealthChecks: healthChecks
    });
    
  } catch (error) {
    console.error(chalk.red.bold(`❌ Demo execution failed: ${error.message}`));
    
    if (process.env.DEBUG === 'true') {
      console.error(error.stack);
    }
    
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error(chalk.red.bold('Fatal error:'), error.message);
    process.exit(1);
  });
}

module.exports = {
  EnhancedCollectionDemo
};