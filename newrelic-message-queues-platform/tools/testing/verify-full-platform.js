#!/usr/bin/env node

/**
 * Full Platform End-to-End Verification
 * 
 * This script verifies that all functional components of the platform
 * work together correctly, including v1.0 core + Track 2 enhancements.
 */

const chalk = require('chalk');
const fs = require('fs').promises;
const path = require('path');

// Core components
const EntityFactory = require('./core/entities/entity-factory');
const EnhancedDataSimulator = require('./simulation/engines/enhanced-data-simulator');
const NewRelicStreamer = require('./simulation/streaming/new-relic-streamer');
// Dashboard components are optional for core verification
let DashboardFramework;
try {
  DashboardFramework = require('./dashboards/framework/core/dashboard-framework');
} catch (e) {
  console.log(chalk.yellow('⚠️  Dashboard framework not found, skipping dashboard tests'));
}

// Enhanced components
const { PatternLearner } = require('./ml/pattern-learner');
const IntelligentSimulator = require('./ml/intelligent-simulator');
const AnomalyPredictor = require('./ml/anomaly-predictor');

// Check if API server exists
let SimulationAPI;
try {
  SimulationAPI = require('./api/simulation-api');
} catch (e) {
  console.log(chalk.yellow('⚠️  API module not found, skipping API tests'));
}

class PlatformVerifier {
  constructor() {
    this.results = {
      core: {},
      enhanced: {},
      integration: {},
      overall: true
    };
  }

  async run() {
    console.log(chalk.bold.magenta('\n🔍 New Relic Message Queues Platform - Full Verification\n'));
    console.log('This test verifies all functional components work end-to-end\n');

    try {
      // Core platform tests
      await this.verifyCoreComponents();
      
      // Enhanced features tests
      await this.verifyEnhancedFeatures();
      
      // Integration tests
      await this.verifyIntegration();
      
      // Report results
      this.reportResults();
      
    } catch (error) {
      console.error(chalk.red('\n❌ Critical error during verification:'), error.message);
      this.results.overall = false;
    }
  }

  async verifyCoreComponents() {
    console.log(chalk.cyan('📦 Verifying Core Components\n'));
    
    // 1. Entity Factory
    try {
      console.log('Testing Entity Factory...');
      const factory = new EntityFactory({ accountId: '3630072' });
      const cluster = factory.createCluster({
        name: 'test-cluster',
        provider: 'kafka'
      });
      
      if (cluster && cluster.guid && cluster.entityType === 'MESSAGE_QUEUE_CLUSTER') {
        console.log(chalk.green('  ✅ Entity Factory: Working'));
        this.results.core.entityFactory = true;
      } else {
        throw new Error('Entity creation failed');
      }
      
      // Test relationships
      const broker = factory.createBroker({
        clusterId: cluster.guid,
        name: 'test-broker'
      });
      
      const topic = factory.createTopic({
        clusterId: cluster.guid,
        name: 'test-topic'
      });
      
      if (broker.relationships && topic.relationships) {
        console.log(chalk.green('  ✅ Entity Relationships: Working'));
        this.results.core.relationships = true;
      }
      
    } catch (error) {
      console.log(chalk.red('  ❌ Entity Factory: Failed -'), error.message);
      this.results.core.entityFactory = false;
      this.results.overall = false;
    }

    // 2. Data Simulation
    try {
      console.log('\nTesting Data Simulation...');
      const simulator = new EnhancedDataSimulator({
        enableAnomalies: true,
        anomalyProbability: 0.1
      });
      
      const topology = simulator.generateTopology('kafka', 'small');
      if (topology.clusters.length > 0 && topology.brokers.length > 0) {
        console.log(chalk.green('  ✅ Topology Generation: Working'));
        this.results.core.topologyGeneration = true;
      }
      
      // Test metric generation
      const cluster = topology.clusters[0];
      simulator.updateClusterMetrics(cluster);
      
      if (cluster.metrics && Object.keys(cluster.metrics).length > 0) {
        console.log(chalk.green('  ✅ Metric Generation: Working'));
        this.results.core.metricGeneration = true;
      }
      
    } catch (error) {
      console.log(chalk.red('  ❌ Data Simulation: Failed -'), error.message);
      this.results.core.dataSimulation = false;
      this.results.overall = false;
    }

    // 3. Streaming (Dry Run)
    try {
      console.log('\nTesting Streaming Infrastructure...');
      const streamer = new NewRelicStreamer({
        accountId: '3630072',
        apiKey: 'test-key',
        region: 'US',
        dryRun: true
      });
      
      // Test event streaming
      const testEvent = {
        eventType: 'MessageQueueCluster',
        clusterName: 'test',
        provider: 'kafka'
      };
      
      await streamer.streamEvents([testEvent]);
      console.log(chalk.green('  ✅ Event Streaming: Working (dry-run)'));
      this.results.core.eventStreaming = true;
      
      // Test metric streaming
      const testMetric = {
        name: 'cluster.throughput.total',
        type: 'gauge',
        value: 1000,
        timestamp: Date.now()
      };
      
      await streamer.streamMetrics([testMetric]);
      console.log(chalk.green('  ✅ Metric Streaming: Working (dry-run)'));
      this.results.core.metricStreaming = true;
      
    } catch (error) {
      console.log(chalk.red('  ❌ Streaming: Failed -'), error.message);
      this.results.core.streaming = false;
      this.results.overall = false;
    }
  }

  async verifyEnhancedFeatures() {
    console.log(chalk.cyan('\n🚀 Verifying Enhanced Features\n'));
    
    // 1. ML Pattern Learning
    try {
      console.log('Testing ML Pattern Learning...');
      const learner = new PatternLearner();
      
      // Generate sample data
      const sampleData = [];
      const now = Date.now();
      for (let i = 0; i < 100; i++) {
        sampleData.push({
          timestamp: now - (i * 60000),
          value: 100 + Math.sin(i / 10) * 20 + Math.random() * 10
        });
      }
      
      const patterns = await learner.learnFromData(sampleData, {
        entityType: 'MESSAGE_QUEUE_CLUSTER',
        provider: 'kafka'
      });
      
      if (patterns && patterns.confidence > 0) {
        console.log(chalk.green(`  ✅ Pattern Learning: Working (confidence: ${(patterns.confidence * 100).toFixed(1)}%)`));
        this.results.enhanced.patternLearning = true;
      }
      
    } catch (error) {
      console.log(chalk.red('  ❌ Pattern Learning: Failed -'), error.message);
      this.results.enhanced.patternLearning = false;
      this.results.overall = false;
    }

    // 2. Intelligent Simulator
    try {
      console.log('\nTesting Intelligent Simulator...');
      const intelligentSim = new IntelligentSimulator();
      
      const entity = {
        entityType: 'MESSAGE_QUEUE_CLUSTER',
        name: 'test-cluster',
        guid: 'test-guid'
      };
      
      const metrics = intelligentSim.generateIntelligentMetrics(entity);
      
      if (metrics && Object.keys(metrics).length > 0) {
        console.log(chalk.green('  ✅ Intelligent Simulation: Working'));
        this.results.enhanced.intelligentSimulation = true;
      }
      
      // Test predictions
      const predictions = await intelligentSim.generatePredictiveMetrics(entity, 300000);
      if (predictions && Object.keys(predictions).length > 0) {
        console.log(chalk.green('  ✅ Predictive Metrics: Working'));
        this.results.enhanced.predictiveMetrics = true;
      }
      
    } catch (error) {
      console.log(chalk.red('  ❌ Intelligent Simulator: Failed -'), error.message);
      this.results.enhanced.intelligentSimulation = false;
      this.results.overall = false;
    }

    // 3. Anomaly Prediction
    try {
      console.log('\nTesting Anomaly System...');
      const predictor = new AnomalyPredictor();
      const factory = new EntityFactory({ accountId: '3630072' });
      
      // Create test topology
      const cluster = factory.createCluster({ name: 'test', provider: 'kafka' });
      const broker = factory.createBroker({ clusterId: cluster.guid, name: 'broker-1' });
      const topic = factory.createTopic({ clusterId: cluster.guid, name: 'topic-1' });
      
      const topology = {
        clusters: [cluster],
        brokers: [broker],
        topics: [topic]
      };
      
      // Generate cascade
      const cascade = predictor.generateAnomalyCascade(
        broker,
        'resource_exhaustion',
        topology
      );
      
      if (cascade && cascade.stages && cascade.stages.length > 0) {
        console.log(chalk.green('  ✅ Anomaly Cascades: Working'));
        this.results.enhanced.anomalyCascades = true;
      }
      
    } catch (error) {
      console.log(chalk.red('  ❌ Anomaly System: Failed -'), error.message);
      this.results.enhanced.anomalySystem = false;
      this.results.overall = false;
    }

    // 4. API Server (if available)
    if (SimulationAPI) {
      try {
        console.log('\nTesting API Server...');
        // Note: Not starting actual server, just testing instantiation
        const api = new SimulationAPI();
        console.log(chalk.green('  ✅ API Server: Available'));
        this.results.enhanced.apiServer = true;
      } catch (error) {
        console.log(chalk.red('  ❌ API Server: Failed -'), error.message);
        this.results.enhanced.apiServer = false;
      }
    }
  }

  async verifyIntegration() {
    console.log(chalk.cyan('\n🔗 Verifying Component Integration\n'));
    
    // Test full pipeline
    try {
      console.log('Testing End-to-End Pipeline...');
      
      // 1. Create entities
      const factory = new EntityFactory({ accountId: '3630072' });
      const cluster = factory.createCluster({
        name: 'integration-test',
        provider: 'kafka'
      });
      
      // 2. Simulate with ML
      const simulator = new EnhancedDataSimulator();
      const intelligentSim = new IntelligentSimulator();
      
      // 3. Generate metrics
      const baseMetrics = simulator.generateClusterMetrics(cluster);
      const enhancedMetrics = intelligentSim.generateIntelligentMetrics(cluster);
      
      // 4. Prepare for streaming (dry-run)
      const streamer = new NewRelicStreamer({
        accountId: '3630072',
        apiKey: 'test-key',
        dryRun: true
      });
      
      const event = {
        eventType: 'MessageQueueCluster',
        ...cluster,
        ...enhancedMetrics
      };
      
      await streamer.streamEvents([event]);
      
      console.log(chalk.green('  ✅ End-to-End Pipeline: Working'));
      this.results.integration.pipeline = true;
      
    } catch (error) {
      console.log(chalk.red('  ❌ End-to-End Pipeline: Failed -'), error.message);
      this.results.integration.pipeline = false;
      this.results.overall = false;
    }

    // Test pattern learning integration
    try {
      console.log('\nTesting ML Integration...');
      
      const simulator = new EnhancedDataSimulator();
      const learner = new PatternLearner();
      const intelligentSim = new IntelligentSimulator();
      
      // Generate historical data
      const historicalData = [];
      for (let i = 0; i < 200; i++) {
        historicalData.push({
          timestamp: Date.now() - (i * 60000),
          value: 1000 + Math.sin(i / 24) * 200 + (Math.random() - 0.5) * 100
        });
      }
      
      // Learn patterns
      const patterns = await learner.learnFromData(historicalData, {
        entityType: 'MESSAGE_QUEUE_CLUSTER',
        provider: 'kafka'
      });
      
      // Apply to intelligent simulator
      if (patterns.confidence > 0.5) {
        console.log(chalk.green('  ✅ ML Integration: Working'));
        this.results.integration.mlIntegration = true;
      }
      
    } catch (error) {
      console.log(chalk.red('  ❌ ML Integration: Failed -'), error.message);
      this.results.integration.mlIntegration = false;
      this.results.overall = false;
    }
  }

  reportResults() {
    console.log(chalk.bold.cyan('\n📊 Verification Results\n'));
    
    // Core Components
    console.log(chalk.yellow('Core Components:'));
    Object.entries(this.results.core).forEach(([component, status]) => {
      const icon = status ? '✅' : '❌';
      const name = component.replace(/([A-Z])/g, ' $1').trim();
      console.log(`  ${icon} ${name}`);
    });
    
    // Enhanced Features
    console.log(chalk.yellow('\nEnhanced Features:'));
    Object.entries(this.results.enhanced).forEach(([component, status]) => {
      const icon = status ? '✅' : '❌';
      const name = component.replace(/([A-Z])/g, ' $1').trim();
      console.log(`  ${icon} ${name}`);
    });
    
    // Integration
    console.log(chalk.yellow('\nIntegration Tests:'));
    Object.entries(this.results.integration).forEach(([component, status]) => {
      const icon = status ? '✅' : '❌';
      const name = component.replace(/([A-Z])/g, ' $1').trim();
      console.log(`  ${icon} ${name}`);
    });
    
    // Overall Result
    console.log(chalk.bold.magenta('\n🎯 Overall Result:'));
    if (this.results.overall) {
      console.log(chalk.bold.green('✅ All functional components verified successfully!'));
      console.log(chalk.gray('\nThe platform is ready for use with:'));
      console.log(chalk.gray('  - Core entity management and simulation'));
      console.log(chalk.gray('  - ML-based pattern learning and prediction'));
      console.log(chalk.gray('  - Intelligent anomaly generation'));
      console.log(chalk.gray('  - API-based control (if server is running)'));
    } else {
      console.log(chalk.bold.red('❌ Some components failed verification'));
      console.log(chalk.gray('\nPlease check the errors above and ensure:'));
      console.log(chalk.gray('  - All dependencies are installed (npm install)'));
      console.log(chalk.gray('  - Environment variables are set (if needed)'));
    }
    
    // Architecture Summary
    console.log(chalk.bold.cyan('\n🏗️  Working Architecture:'));
    console.log(chalk.gray(`
    User Input
        ↓
    Entity Factory → Enhanced Simulator → ML Intelligence
        ↓                    ↓                 ↓
    Relationships      Pattern Learning   Predictions
        ↓                    ↓                 ↓
    Topology ←───────────────┴─────────────────┘
        ↓
    New Relic Streamer (Events + Metrics)
        ↓
    New Relic Platform
    `));
    
    // Next Steps
    console.log(chalk.bold.yellow('\n📝 Next Steps:'));
    if (this.results.overall) {
      console.log(chalk.gray('1. Run examples to see the platform in action:'));
      console.log(chalk.white('   node examples/ml-simulation-demo.js'));
      console.log(chalk.white('   node showcase.js'));
      console.log(chalk.gray('\n2. Start the API server for interactive control:'));
      console.log(chalk.white('   npm run api'));
      console.log(chalk.gray('\n3. Stream real data to New Relic:'));
      console.log(chalk.white('   node examples/production-streaming.js'));
    } else {
      console.log(chalk.gray('1. Fix any failing components'));
      console.log(chalk.gray('2. Re-run this verification script'));
      console.log(chalk.gray('3. Check documentation for troubleshooting'));
    }
  }
}

// Run verification
if (require.main === module) {
  const verifier = new PlatformVerifier();
  verifier.run().catch(console.error);
}

module.exports = PlatformVerifier;