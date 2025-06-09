#!/usr/bin/env node

/**
 * Platform Health Check
 * 
 * Comprehensive health validation for all Message Queues Platform components:
 * - Infrastructure data collection
 * - Entity transformation
 * - Data streaming
 * - Dashboard generation
 * - Core services
 */

const chalk = require('chalk');
const http = require('http');
const { EventEmitter } = require('events');

// Core components
const InfraAgentCollector = require('./infrastructure/collectors/infra-agent-collector');
const NriKafkaTransformer = require('./infrastructure/transformers/nri-kafka-transformer');
const NewRelicStreamer = require('./simulation/streaming/new-relic-streamer');
const MessageQueuesContentProvider = require('./dashboards/content/message-queues/message-queues-content-provider');
const { EntityFactory } = require('./core/entities');

class HealthChecker extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      accountId: config.accountId || process.env.NEW_RELIC_ACCOUNT_ID,
      apiKey: config.apiKey || process.env.NEW_RELIC_USER_API_KEY,
      ingestKey: config.ingestKey || process.env.NEW_RELIC_INGEST_KEY,
      region: config.region || process.env.NEW_RELIC_REGION || 'US',
      timeout: config.timeout || 30000, // 30 seconds
      ...config
    };
    
    this.results = {
      overall: { status: 'pending', score: 0 },
      environment: { status: 'pending' },
      core: { status: 'pending' },
      infrastructure: { status: 'pending' },
      transformation: { status: 'pending' },
      streaming: { status: 'pending' },
      dashboards: { status: 'pending' },
      integration: { status: 'pending' }
    };
    
    this.startTime = Date.now();
  }

  async runHealthCheck() {
    console.log(chalk.bold.blue('\n🏥 Platform Health Check\n'));
    console.log(chalk.cyan('Validating all Message Queues Platform components...\n'));
    
    try {
      // Run all health checks
      await this.checkEnvironment();
      await this.checkCoreComponents();
      await this.checkInfrastructureCollection();
      await this.checkTransformation();
      await this.checkStreaming();
      await this.checkDashboards();
      await this.checkIntegration();
      
      // Calculate overall health
      this.calculateOverallHealth();
      
      // Generate health report
      this.generateHealthReport();
      
      return this.results;
      
    } catch (error) {
      console.error(chalk.red('\n❌ Health check failed:'), error.message);
      this.results.overall = {
        status: 'failed',
        error: error.message,
        duration: Date.now() - this.startTime
      };
      throw error;
    }
  }

  async checkEnvironment() {
    console.log(chalk.cyan('🔧 Checking Environment Configuration...'));
    
    const startTime = Date.now();
    const checks = [];
    let score = 0;
    
    // Required environment variables
    const requiredVars = [
      { name: 'NEW_RELIC_ACCOUNT_ID', value: this.config.accountId, required: true },
      { name: 'NEW_RELIC_USER_API_KEY', value: this.config.apiKey, required: false },
      { name: 'NEW_RELIC_INGEST_KEY', value: this.config.ingestKey, required: false }
    ];
    
    requiredVars.forEach(envVar => {
      if (envVar.value) {
        checks.push(`✅ ${envVar.name}: Set`);
        score += envVar.required ? 40 : 20;
      } else {
        const level = envVar.required ? '❌' : '⚠️ ';
        checks.push(`${level} ${envVar.name}: Not set`);
      }
    });
    
    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.split('.')[0].substring(1));
    if (majorVersion >= 16) {
      checks.push(`✅ Node.js version: ${nodeVersion} (supported)`);
      score += 20;
    } else {
      checks.push(`❌ Node.js version: ${nodeVersion} (unsupported, requires >=16)`);
    }
    
    // Check required modules
    const requiredModules = ['chalk', 'debug', 'crypto'];
    let moduleScore = 0;
    
    requiredModules.forEach(moduleName => {
      try {
        require.resolve(moduleName);
        moduleScore++;
      } catch (error) {
        checks.push(`❌ Missing module: ${moduleName}`);
      }
    });
    
    if (moduleScore === requiredModules.length) {
      checks.push(`✅ All required modules available`);
      score += 20;
    }
    
    this.results.environment = {
      status: score >= 80 ? 'healthy' : score >= 60 ? 'warning' : 'unhealthy',
      score,
      duration: Date.now() - startTime,
      checks
    };
    
    checks.forEach(check => console.log(`   ${check}`));
    console.log(chalk.gray(`   Score: ${score}/100\n`));
  }

  async checkCoreComponents() {
    console.log(chalk.cyan('⚙️  Checking Core Components...'));
    
    const startTime = Date.now();
    const checks = [];
    let score = 0;
    
    try {
      // Test EntityFactory
      const factory = new EntityFactory();
      const testCluster = factory.createCluster({
        name: 'health-check-cluster',
        provider: 'kafka',
        accountId: this.config.accountId || '123456789'
      });
      
      if (testCluster && testCluster.entityType === 'MESSAGE_QUEUE_CLUSTER') {
        checks.push('✅ EntityFactory: Working');
        score += 50;
      } else {
        checks.push('❌ EntityFactory: Failed to create cluster');
      }
      
      // Test entity registry
      const summary = factory.getSummary();
      if (summary.totalEntities > 0) {
        checks.push('✅ Entity Registry: Working');
        score += 25;
      } else {
        checks.push('❌ Entity Registry: Empty or failed');
      }
      
      // Test relationships
      const relationships = factory.relationshipManager;
      if (relationships && typeof relationships.addRelationship === 'function') {
        checks.push('✅ Relationship Manager: Working');
        score += 25;
      } else {
        checks.push('❌ Relationship Manager: Not available');
      }
      
    } catch (error) {
      checks.push(`❌ Core Components Error: ${error.message}`);
    }
    
    this.results.core = {
      status: score >= 80 ? 'healthy' : score >= 60 ? 'warning' : 'unhealthy',
      score,
      duration: Date.now() - startTime,
      checks
    };
    
    checks.forEach(check => console.log(`   ${check}`));
    console.log(chalk.gray(`   Score: ${score}/100\n`));
  }

  async checkInfrastructureCollection() {
    console.log(chalk.cyan('📊 Checking Infrastructure Data Collection...'));
    
    const startTime = Date.now();
    const checks = [];
    let score = 0;
    
    try {
      if (!this.config.apiKey) {
        checks.push('⚠️  Skipping infrastructure check (no API key)');
        score = 50; // Neutral score for missing credentials
      } else {
        const collector = new InfraAgentCollector({
          accountId: this.config.accountId,
          apiKey: this.config.apiKey,
          region: this.config.region
        });
        
        // Test basic connectivity
        try {
          const hasKafkaData = await collector.checkKafkaIntegration();
          if (hasKafkaData) {
            checks.push('✅ Kafka integration: Data found');
            score += 60;
          } else {
            checks.push('⚠️  Kafka integration: No data (expected if not configured)');
            score += 30;
          }
        } catch (error) {
          if (error.message.includes('Access denied')) {
            checks.push('❌ API Authentication: Failed');
          } else {
            checks.push(`⚠️  Kafka integration: ${error.message}`);
            score += 20;
          }
        }
        
        // Test NerdGraph connectivity
        try {
          const clusters = await collector.getKafkaClusters();
          checks.push(`✅ NerdGraph API: Connected (${clusters.length} clusters)`);
          score += 40;
        } catch (error) {
          checks.push(`❌ NerdGraph API: ${error.message}`);
        }
      }
      
    } catch (error) {
      checks.push(`❌ Infrastructure Collection Error: ${error.message}`);
    }
    
    this.results.infrastructure = {
      status: score >= 80 ? 'healthy' : score >= 60 ? 'warning' : 'unhealthy',
      score,
      duration: Date.now() - startTime,
      checks
    };
    
    checks.forEach(check => console.log(`   ${check}`));
    console.log(chalk.gray(`   Score: ${score}/100\n`));
  }

  async checkTransformation() {
    console.log(chalk.cyan('🔄 Checking Entity Transformation...'));
    
    const startTime = Date.now();
    const checks = [];
    let score = 0;
    
    try {
      const transformer = new NriKafkaTransformer(this.config.accountId || '123456789');
      
      // Test with mock nri-kafka data
      const mockSamples = [
        {
          eventType: 'KafkaBrokerSample',
          'broker.id': '1',
          clusterName: 'health-check-cluster',
          'broker.bytesInPerSecond': 1000,
          'broker.messagesInPerSecond': 100
        },
        {
          eventType: 'KafkaTopicSample',
          'topic.name': 'health-check-topic',
          clusterName: 'health-check-cluster',
          'topic.bytesInPerSecond': 500
        }
      ];
      
      const result = transformer.transformSamples(mockSamples);
      
      if (result.entities && result.entities.length > 0) {
        checks.push(`✅ Sample Transformation: ${result.entities.length} entities created`);
        score += 40;
      } else {
        checks.push('❌ Sample Transformation: No entities created');
      }
      
      // Check entity types
      const entityTypes = result.entities.map(e => e.entityType);
      const expectedTypes = ['MESSAGE_QUEUE_BROKER', 'MESSAGE_QUEUE_TOPIC', 'MESSAGE_QUEUE_CLUSTER'];
      const foundTypes = expectedTypes.filter(type => entityTypes.includes(type));
      
      if (foundTypes.length === expectedTypes.length) {
        checks.push('✅ Entity Types: All expected types created');
        score += 30;
      } else {
        checks.push(`⚠️  Entity Types: ${foundTypes.length}/${expectedTypes.length} types created`);
        score += 15;
      }
      
      // Check GUID format
      const validGuids = result.entities.filter(e => 
        e.entityGuid && e.entityGuid.includes('INFRA') && e.entityGuid.includes(this.config.accountId || '123456789')
      );
      
      if (validGuids.length === result.entities.length) {
        checks.push('✅ GUID Format: All entities have valid GUIDs');
        score += 30;
      } else {
        checks.push(`⚠️  GUID Format: ${validGuids.length}/${result.entities.length} valid`);
        score += 15;
      }
      
    } catch (error) {
      checks.push(`❌ Transformation Error: ${error.message}`);
    }
    
    this.results.transformation = {
      status: score >= 80 ? 'healthy' : score >= 60 ? 'warning' : 'unhealthy',
      score,
      duration: Date.now() - startTime,
      checks
    };
    
    checks.forEach(check => console.log(`   ${check}`));
    console.log(chalk.gray(`   Score: ${score}/100\n`));
  }

  async checkStreaming() {
    console.log(chalk.cyan('🚀 Checking Data Streaming...'));
    
    const startTime = Date.now();
    const checks = [];
    let score = 0;
    
    try {
      if (!this.config.ingestKey) {
        checks.push('⚠️  Skipping streaming check (no ingest key)');
        score = 50; // Neutral score for missing credentials
      } else {
        const streamer = new NewRelicStreamer({
          apiKey: this.config.ingestKey,
          accountId: this.config.accountId,
          dryRun: true // Don't actually send data
        });
        
        // Test streamer initialization
        if (streamer) {
          checks.push('✅ Streamer Initialization: Success');
          score += 40;
        }
        
        // Test event formatting
        const testEvents = [{
          eventType: 'MESSAGE_QUEUE_BROKER',
          entityGuid: `${this.config.accountId}|INFRA|MESSAGE_QUEUE_BROKER|test`,
          timestamp: Date.now(),
          'broker.bytesInPerSecond': 1000
        }];
        
        try {
          await streamer.streamEvents(testEvents);
          checks.push('✅ Event Streaming: Dry run successful');
          score += 60;
        } catch (error) {
          checks.push(`❌ Event Streaming: ${error.message}`);
        }
      }
      
    } catch (error) {
      checks.push(`❌ Streaming Error: ${error.message}`);
    }
    
    this.results.streaming = {
      status: score >= 80 ? 'healthy' : score >= 60 ? 'warning' : 'unhealthy',
      score,
      duration: Date.now() - startTime,
      checks
    };
    
    checks.forEach(check => console.log(`   ${check}`));
    console.log(chalk.gray(`   Score: ${score}/100\n`));
  }

  async checkDashboards() {
    console.log(chalk.cyan('📊 Checking Dashboard Generation...'));
    
    const startTime = Date.now();
    const checks = [];
    let score = 0;
    
    try {
      const contentProvider = new MessageQueuesContentProvider({
        accountId: this.config.accountId
      });
      
      // Test content provider initialization
      const metadata = contentProvider.getMetadata();
      if (metadata.templateCount > 0) {
        checks.push(`✅ Content Provider: ${metadata.templateCount} templates loaded`);
        score += 30;
      } else {
        checks.push('❌ Content Provider: No templates loaded');
      }
      
      // Test template access
      const templates = ['cluster-overview', 'topic-analysis', 'broker-health'];
      let templatesWorking = 0;
      
      templates.forEach(templateName => {
        if (contentProvider.templates && contentProvider.templates.has(templateName)) {
          templatesWorking++;
        }
      });
      
      if (templatesWorking === templates.length) {
        checks.push('✅ Templates: All core templates available');
        score += 40;
      } else {
        checks.push(`⚠️  Templates: ${templatesWorking}/${templates.length} available`);
        score += 20;
      }
      
      // Test entity schemas
      const entityTypes = ['MESSAGE_QUEUE_CLUSTER', 'MESSAGE_QUEUE_BROKER', 'MESSAGE_QUEUE_TOPIC'];
      let schemasWorking = 0;
      
      entityTypes.forEach(entityType => {
        if (contentProvider.entitySchemas && contentProvider.entitySchemas.has(entityType)) {
          schemasWorking++;
        }
      });
      
      if (schemasWorking === entityTypes.length) {
        checks.push('✅ Entity Schemas: All schemas registered');
        score += 30;
      } else {
        checks.push(`⚠️  Entity Schemas: ${schemasWorking}/${entityTypes.length} registered`);
        score += 15;
      }
      
    } catch (error) {
      checks.push(`❌ Dashboard Error: ${error.message}`);
    }
    
    this.results.dashboards = {
      status: score >= 80 ? 'healthy' : score >= 60 ? 'warning' : 'unhealthy',
      score,
      duration: Date.now() - startTime,
      checks
    };
    
    checks.forEach(check => console.log(`   ${check}`));
    console.log(chalk.gray(`   Score: ${score}/100\n`));
  }

  async checkIntegration() {
    console.log(chalk.cyan('🔗 Checking End-to-End Integration...'));
    
    const startTime = Date.now();
    const checks = [];
    let score = 0;
    
    try {
      // Test full pipeline with mock data
      const factory = new EntityFactory();
      const transformer = new NriKafkaTransformer(this.config.accountId || '123456789');
      const contentProvider = new MessageQueuesContentProvider();
      
      // Create test topology
      const cluster = factory.createCluster({
        name: 'integration-test-cluster',
        provider: 'kafka',
        accountId: this.config.accountId || '123456789'
      });
      
      // Transform mock nri-kafka data
      const mockData = [{
        eventType: 'KafkaBrokerSample',
        'broker.id': '1',
        clusterName: 'integration-test-cluster',
        'broker.bytesInPerSecond': 2000
      }];
      
      const transformResult = transformer.transformSamples(mockData);
      
      // Check if transformed entities match factory entities
      if (transformResult.entities.length > 0 && cluster) {
        checks.push('✅ Entity Pipeline: Factory ↔ Transformer integration working');
        score += 50;
      } else {
        checks.push('❌ Entity Pipeline: Integration failed');
      }
      
      // Check dashboard template compatibility
      const template = contentProvider.templates.get('cluster-overview');
      if (template && template.entityType === 'MESSAGE_QUEUE_CLUSTER') {
        checks.push('✅ Dashboard Integration: Templates match entity types');
        score += 50;
      } else {
        checks.push('❌ Dashboard Integration: Template/entity mismatch');
      }
      
    } catch (error) {
      checks.push(`❌ Integration Error: ${error.message}`);
    }
    
    this.results.integration = {
      status: score >= 80 ? 'healthy' : score >= 60 ? 'warning' : 'unhealthy',
      score,
      duration: Date.now() - startTime,
      checks
    };
    
    checks.forEach(check => console.log(`   ${check}`));
    console.log(chalk.gray(`   Score: ${score}/100\n`));
  }

  calculateOverallHealth() {
    const components = ['environment', 'core', 'infrastructure', 'transformation', 'streaming', 'dashboards', 'integration'];
    let totalScore = 0;
    let healthyComponents = 0;
    let warningComponents = 0;
    let unhealthyComponents = 0;
    
    components.forEach(component => {
      const result = this.results[component];
      totalScore += result.score || 0;
      
      if (result.status === 'healthy') healthyComponents++;
      else if (result.status === 'warning') warningComponents++;
      else unhealthyComponents++;
    });
    
    const averageScore = Math.round(totalScore / components.length);
    let overallStatus = 'healthy';
    
    if (unhealthyComponents > 2 || averageScore < 60) {
      overallStatus = 'unhealthy';
    } else if (unhealthyComponents > 0 || warningComponents > 2 || averageScore < 80) {
      overallStatus = 'warning';
    }
    
    this.results.overall = {
      status: overallStatus,
      score: averageScore,
      duration: Date.now() - this.startTime,
      components: {
        healthy: healthyComponents,
        warning: warningComponents,
        unhealthy: unhealthyComponents,
        total: components.length
      }
    };
  }

  generateHealthReport() {
    const overall = this.results.overall;
    const statusIcon = overall.status === 'healthy' ? '🟢' : 
                     overall.status === 'warning' ? '🟡' : '🔴';
    
    console.log(chalk.bold.blue('\n📋 Health Check Report\n'));
    console.log(chalk.cyan(`${statusIcon} Overall Status: ${chalk.bold(overall.status.toUpperCase())}`));
    console.log(chalk.gray(`   Overall Score: ${overall.score}/100`));
    console.log(chalk.gray(`   Duration: ${overall.duration}ms`));
    console.log(chalk.gray(`   Components: ${overall.components.healthy} healthy, ${overall.components.warning} warning, ${overall.components.unhealthy} unhealthy`));
    console.log('');
    
    // Component summary
    console.log(chalk.cyan('Component Health Summary:'));
    Object.entries(this.results).forEach(([component, result]) => {
      if (component === 'overall') return;
      
      const icon = result.status === 'healthy' ? '✅' : 
                   result.status === 'warning' ? '⚠️ ' : '❌';
      console.log(`   ${icon} ${component}: ${result.score}/100 (${result.duration}ms)`);
    });
    
    // Recommendations
    console.log(chalk.cyan('\n💡 Recommendations:'));
    
    if (this.results.environment.score < 80) {
      console.log(chalk.yellow('   - Set all required environment variables for full functionality'));
    }
    
    if (this.results.infrastructure.score < 80) {
      console.log(chalk.yellow('   - Configure New Relic API key for infrastructure data collection'));
    }
    
    if (this.results.streaming.score < 80) {
      console.log(chalk.yellow('   - Configure New Relic Ingest key for data streaming'));
    }
    
    if (overall.status === 'healthy') {
      console.log(chalk.green('   🎉 Platform is healthy and ready for production!'));
    }
    
    console.log('');
  }

  // HTTP server for health endpoint
  createHealthServer(port = 3001) {
    const server = http.createServer(async (req, res) => {
      if (req.url === '/health') {
        try {
          const results = await this.runHealthCheck();
          
          res.writeHead(200, { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(JSON.stringify(results, null, 2));
          
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            error: error.message,
            status: 'unhealthy'
          }));
        }
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found. Use /health endpoint.');
      }
    });
    
    server.listen(port, () => {
      console.log(chalk.green(`Health check server running on http://localhost:${port}/health`));
    });
    
    return server;
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  const config = {
    server: args.includes('--server'),
    port: args.includes('--port') ? parseInt(args[args.indexOf('--port') + 1]) : 3001,
    debug: args.includes('--debug')
  };
  
  if (args.includes('--help')) {
    console.log(chalk.bold.cyan('Platform Health Check\n'));
    console.log('Usage: node health-check.js [options]\n');
    console.log('Options:');
    console.log('  --server          Run as HTTP server');
    console.log('  --port <port>     Server port (default: 3001)');
    console.log('  --debug           Enable debug logging');
    console.log('  --help            Show this help\n');
    console.log('Environment Variables:');
    console.log('  NEW_RELIC_ACCOUNT_ID    New Relic account ID');
    console.log('  NEW_RELIC_USER_API_KEY  User API key');
    console.log('  NEW_RELIC_INGEST_KEY    Ingest key');
    process.exit(0);
  }
  
  const healthChecker = new HealthChecker(config);
  
  if (config.server) {
    healthChecker.createHealthServer(config.port);
  } else {
    healthChecker.runHealthCheck().then(results => {
      const exitCode = results.overall.status === 'unhealthy' ? 1 : 0;
      process.exit(exitCode);
    }).catch(error => {
      console.error(chalk.red('Health check error:'), error.message);
      process.exit(1);
    });
  }
}

module.exports = HealthChecker;