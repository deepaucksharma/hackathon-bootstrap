/**
 * End-to-End Data Pipeline Validator
 * 
 * Validates the complete data flow from collection → transformation → streaming
 * across all platform modes (Infrastructure, Simulation, Hybrid)
 */

const { EventEmitter } = require('events');
const { logger } = require('./utils/logger');
const chalk = require('chalk');

class PipelineValidator extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      timeout: options.timeout || 30000,
      retryAttempts: options.retryAttempts || 2,
      validateData: options.validateData !== false,
      validateTransformation: options.validateTransformation !== false,
      validateStreaming: options.validateStreaming !== false,
      ...options
    };
    
    this.validationHistory = [];
    this.lastValidation = null;
  }
  
  /**
   * Validate complete pipeline for a platform instance
   */
  async validatePipeline(platform) {
    const validation = {
      id: `validation-${Date.now()}`,
      timestamp: new Date().toISOString(),
      mode: platform.options.mode,
      provider: platform.options.provider,
      stages: {
        config: { status: 'pending', details: null },
        dataCollection: { status: 'pending', details: null },
        transformation: { status: 'pending', details: null },
        entityValidation: { status: 'pending', details: null },
        streaming: { status: 'pending', details: null },
        endToEnd: { status: 'pending', details: null }
      },
      overall: { status: 'pending', score: 0 },
      startTime: Date.now(),
      duration: null
    };
    
    try {
      console.log(chalk.blue(`\n🔍 Starting end-to-end pipeline validation for ${platform.options.mode} mode\n`));
      
      // Stage 1: Configuration validation
      await this.validateConfiguration(platform, validation);
      
      // Stage 2: Data collection validation
      await this.validateDataCollection(platform, validation);
      
      // Stage 3: Transformation validation
      await this.validateTransformation(platform, validation);
      
      // Stage 4: Entity validation
      await this.validateEntities(platform, validation);
      
      // Stage 5: Streaming validation
      await this.validateStreaming(platform, validation);
      
      // Stage 6: End-to-end flow validation
      await this.validateEndToEndFlow(platform, validation);
      
      // Calculate overall score and status
      this.calculateOverallResult(validation);
      
      validation.duration = Date.now() - validation.startTime;
      this.validationHistory.push(validation);
      this.lastValidation = validation;
      
      this.emit('validationComplete', validation);
      this.printValidationReport(validation);
      
      return validation;
      
    } catch (error) {
      validation.duration = Date.now() - validation.startTime;
      validation.overall.status = 'error';
      validation.overall.error = error.message;
      
      this.emit('validationError', { validation, error });
      throw error;
    }
  }
  
  /**
   * Validate platform configuration
   */
  async validateConfiguration(platform, validation) {
    console.log(chalk.cyan('📋 Validating configuration...'));
    
    const stage = validation.stages.config;
    const issues = [];
    
    try {
      // Check required configuration
      if (!platform.options.accountId) {
        issues.push('Missing New Relic Account ID');
      }
      
      if (!platform.options.apiKey && !platform.options.ingestKey) {
        issues.push('Missing API keys (User API key or Ingest key required)');
      }
      
      // Mode-specific validation
      if (platform.options.mode === 'infrastructure') {
        if (!platform.collector) {
          issues.push('Infrastructure mode requires data collector');
        }
        if (!platform.transformer) {
          issues.push('Infrastructure mode requires data transformer');
        }
      }
      
      if (!platform.streamer) {
        issues.push('Platform requires data streamer');
      }
      
      // Error recovery validation
      if (!platform.errorRecovery) {
        issues.push('Platform missing error recovery system');
      }
      
      stage.status = issues.length === 0 ? 'passed' : 'failed';
      stage.details = {
        issues,
        components: {
          collector: !!platform.collector,
          transformer: !!platform.transformer,
          streamer: !!platform.streamer,
          errorRecovery: !!platform.errorRecovery
        }
      };
      
      console.log(stage.status === 'passed' ? 
        chalk.green('✅ Configuration valid') : 
        chalk.red(`❌ Configuration issues: ${issues.join(', ')}`)
      );
      
    } catch (error) {
      stage.status = 'error';
      stage.details = { error: error.message };
      console.error(chalk.red('❌ Configuration validation failed:'), error.message);
    }
  }
  
  /**
   * Validate data collection capabilities
   */
  async validateDataCollection(platform, validation) {
    console.log(chalk.cyan('📊 Validating data collection...'));
    
    const stage = validation.stages.dataCollection;
    
    try {
      if (platform.options.mode === 'infrastructure') {
        // Test infrastructure data collection
        const testResult = await this.testInfrastructureCollection(platform);
        stage.status = testResult.success ? 'passed' : 'failed';
        stage.details = testResult;
        
      } else if (platform.options.mode === 'simulation') {
        // Test simulation data generation
        const testResult = await this.testSimulationGeneration(platform);
        stage.status = testResult.success ? 'passed' : 'failed';
        stage.details = testResult;
        
      } else if (platform.options.mode === 'hybrid') {
        // Test both infrastructure and simulation
        const infraTest = await this.testInfrastructureCollection(platform);
        const simTest = await this.testSimulationGeneration(platform);
        
        stage.status = (infraTest.success || simTest.success) ? 'passed' : 'failed';
        stage.details = {
          infrastructure: infraTest,
          simulation: simTest
        };
      }
      
      console.log(stage.status === 'passed' ? 
        chalk.green('✅ Data collection working') : 
        chalk.red('❌ Data collection issues detected')
      );
      
    } catch (error) {
      stage.status = 'error';
      stage.details = { error: error.message };
      console.error(chalk.red('❌ Data collection validation failed:'), error.message);
    }
  }
  
  /**
   * Test infrastructure data collection
   */
  async testInfrastructureCollection(platform) {
    try {
      if (!platform.collector) {
        return { success: false, reason: 'No collector available' };
      }
      
      // Test connection to New Relic
      const hasData = await platform.collector.checkKafkaIntegration();
      
      if (hasData) {
        // Try to collect a small sample
        const samples = await platform.collector.collectKafkaMetrics('1 minute ago');
        return {
          success: true,
          sampleCount: samples ? samples.length : 0,
          hasData: samples && samples.length > 0
        };
      } else {
        return {
          success: false,
          reason: 'No Kafka data found in New Relic'
        };
      }
      
    } catch (error) {
      return {
        success: false,
        reason: error.message,
        error: true
      };
    }
  }
  
  /**
   * Test simulation data generation
   */
  async testSimulationGeneration(platform) {
    try {
      if (!platform.simulator) {
        return { success: false, reason: 'No simulator available' };
      }
      
      // Create a test entity
      const testBroker = platform.entityFactory.createBroker({
        name: 'test-broker',
        brokerId: 999,
        hostname: 'test-host',
        clusterName: 'test-cluster',
        provider: platform.options.provider,
        accountId: platform.options.accountId
      });
      
      // Test metric generation
      const beforeMetrics = JSON.stringify(testBroker.goldenMetrics);
      platform.simulator.updateBrokerMetrics(testBroker);
      const afterMetrics = JSON.stringify(testBroker.goldenMetrics);
      
      return {
        success: beforeMetrics !== afterMetrics,
        metricsUpdated: beforeMetrics !== afterMetrics,
        entityCreated: true
      };
      
    } catch (error) {
      return {
        success: false,
        reason: error.message,
        error: true
      };
    }
  }
  
  /**
   * Validate data transformation
   */
  async validateTransformation(platform, validation) {
    console.log(chalk.cyan('🔄 Validating data transformation...'));
    
    const stage = validation.stages.transformation;
    
    try {
      if (platform.options.mode === 'infrastructure' && platform.transformer) {
        // Test transformation with sample data
        const sampleData = [{
          eventType: 'KafkaBrokerSample',
          'broker.id': 1,
          'broker.bytesInPerSecond': 1000,
          clusterName: 'test-cluster'
        }];
        
        const result = platform.transformer.transformSamples(sampleData);
        
        stage.status = result.entities && result.entities.length > 0 ? 'passed' : 'failed';
        stage.details = {
          inputSamples: sampleData.length,
          outputEntities: result.entities ? result.entities.length : 0,
          errors: result.errors ? result.errors.length : 0,
          transformationWorking: result.entities && result.entities.length > 0
        };
        
      } else {
        // For simulation/hybrid without infrastructure data
        stage.status = 'skipped';
        stage.details = { reason: 'No transformation needed for current mode' };
      }
      
      console.log(stage.status === 'passed' ? 
        chalk.green('✅ Data transformation working') : 
        stage.status === 'skipped' ? 
        chalk.yellow('⏭️ Transformation skipped') :
        chalk.red('❌ Transformation issues detected')
      );
      
    } catch (error) {
      stage.status = 'error';
      stage.details = { error: error.message };
      console.error(chalk.red('❌ Transformation validation failed:'), error.message);
    }
  }
  
  /**
   * Validate entity structure and consistency
   */
  async validateEntities(platform, validation) {
    console.log(chalk.cyan('🏗️ Validating entity structure...'));
    
    const stage = validation.stages.entityValidation;
    const issues = [];
    
    try {
      // Create test entities to validate structure
      const testEntities = this.createTestEntities(platform);
      
      // Validate each entity
      for (const entity of testEntities) {
        const entityIssues = this.validateEntityStructure(entity);
        issues.push(...entityIssues);
      }
      
      // Validate relationships if available
      if (platform.relationshipManager) {
        const relStats = platform.relationshipManager.getStats();
        if (relStats.totalRelationships === 0 && testEntities.length > 1) {
          issues.push('No relationships found between entities');
        }
      }
      
      stage.status = issues.length === 0 ? 'passed' : 'failed';
      stage.details = {
        entitiesValidated: testEntities.length,
        issues,
        validationRules: this.getValidationRules()
      };
      
      console.log(stage.status === 'passed' ? 
        chalk.green('✅ Entity structure valid') : 
        chalk.red(`❌ Entity validation issues: ${issues.length}`)
      );
      
    } catch (error) {
      stage.status = 'error';
      stage.details = { error: error.message };
      console.error(chalk.red('❌ Entity validation failed:'), error.message);
    }
  }
  
  /**
   * Create test entities for validation
   */
  createTestEntities(platform) {
    const entities = [];
    
    try {
      // Create cluster
      const cluster = platform.entityFactory.createCluster({
        name: 'validation-cluster',
        clusterName: 'validation-cluster',
        provider: platform.options.provider,
        accountId: platform.options.accountId
      });
      entities.push(cluster);
      
      // Create broker
      const broker = platform.entityFactory.createBroker({
        name: 'validation-broker',
        brokerId: 1,
        hostname: 'validation-host',
        clusterName: 'validation-cluster',
        provider: platform.options.provider,
        accountId: platform.options.accountId
      });
      entities.push(broker);
      
      // Create topic
      const topic = platform.entityFactory.createTopic({
        name: 'validation-topic',
        topicName: 'validation-topic',
        clusterName: 'validation-cluster',
        provider: platform.options.provider,
        accountId: platform.options.accountId
      });
      entities.push(topic);
      
    } catch (error) {
      console.warn(`Failed to create test entities: ${error.message}`);
    }
    
    return entities;
  }
  
  /**
   * Validate individual entity structure
   */
  validateEntityStructure(entity) {
    const issues = [];
    
    // Check required properties
    if (!entity.entityGuid) issues.push(`Entity ${entity.name} missing entityGuid`);
    if (!entity.entityType) issues.push(`Entity ${entity.name} missing entityType`);
    if (!entity.name) issues.push(`Entity missing name`);
    if (!entity.accountId) issues.push(`Entity ${entity.name} missing accountId`);
    if (!entity.provider) issues.push(`Entity ${entity.name} missing provider`);
    
    // Check GUID format
    if (entity.entityGuid && !entity.entityGuid.includes('|')) {
      issues.push(`Entity ${entity.name} has invalid GUID format`);
    }
    
    // Check golden metrics
    if (!entity.goldenMetrics || !Array.isArray(entity.goldenMetrics)) {
      issues.push(`Entity ${entity.name} missing or invalid golden metrics`);
    }
    
    // Check relationships
    if (!entity.relationships || !Array.isArray(entity.relationships)) {
      issues.push(`Entity ${entity.name} missing or invalid relationships array`);
    }
    
    return issues;
  }
  
  /**
   * Get validation rules
   */
  getValidationRules() {
    return [
      'Entity must have valid GUID with pipe separators',
      'Entity must have entityType, name, accountId, provider',
      'Entity must have golden metrics array',
      'Entity must have relationships array',
      'Broker entities must have brokerId and hostname',
      'Topic entities must have topicName',
      'Cluster entities must have clusterName'
    ];
  }
  
  /**
   * Validate streaming capabilities
   */
  async validateStreaming(platform, validation) {
    console.log(chalk.cyan('📡 Validating streaming...'));
    
    const stage = validation.stages.streaming;
    
    try {
      if (!platform.streamer) {
        stage.status = 'failed';
        stage.details = { reason: 'No streamer available' };
        return;
      }
      
      // Test with a minimal entity
      const testEntity = {
        entityGuid: 'TEST_ENTITY|123|kafka|validation',
        entityType: 'MESSAGE_QUEUE_BROKER',
        name: 'validation-test',
        accountId: platform.options.accountId,
        provider: platform.options.provider,
        goldenMetrics: [
          { name: 'test.metric', value: 1, unit: 'count', timestamp: new Date().toISOString() }
        ],
        toEventPayload: () => ({
          eventType: 'MessageQueue',
          entityGuid: 'TEST_ENTITY|123|kafka|validation',
          'test.metric': 1
        })
      };
      
      // Get initial stats
      const initialStats = platform.streamer.getStats();
      
      // Stream test entity
      platform.streamer.streamEvent(testEntity);
      await platform.streamer.flushEvents();
      
      // Check if streaming worked
      const finalStats = platform.streamer.getStats();
      const streamed = finalStats.eventsSent > initialStats.eventsSent;
      
      stage.status = streamed || finalStats.errors === initialStats.errors ? 'passed' : 'failed';
      stage.details = {
        initialStats,
        finalStats,
        streamed,
        errorsDuringTest: finalStats.errors - initialStats.errors
      };
      
      console.log(stage.status === 'passed' ? 
        chalk.green('✅ Streaming working') : 
        chalk.red('❌ Streaming issues detected')
      );
      
    } catch (error) {
      stage.status = 'error';
      stage.details = { error: error.message };
      console.error(chalk.red('❌ Streaming validation failed:'), error.message);
    }
  }
  
  /**
   * Validate complete end-to-end flow
   */
  async validateEndToEndFlow(platform, validation) {
    console.log(chalk.cyan('🔄 Validating end-to-end flow...'));
    
    const stage = validation.stages.endToEnd;
    
    try {
      // Simulate a complete cycle
      const startTime = Date.now();
      
      // Run a single cycle
      await platform.runCycle();
      
      const duration = Date.now() - startTime;
      
      // Check error recovery stats
      let errorRecoveryHealth = null;
      if (platform.errorRecovery) {
        errorRecoveryHealth = platform.errorRecovery.getSystemHealth();
      }
      
      stage.status = duration < this.options.timeout ? 'passed' : 'failed';
      stage.details = {
        cycleDuration: duration,
        timeout: this.options.timeout,
        completedWithinTimeout: duration < this.options.timeout,
        errorRecoveryHealth,
        timestamp: new Date().toISOString()
      };
      
      console.log(stage.status === 'passed' ? 
        chalk.green(`✅ End-to-end flow completed in ${duration}ms`) : 
        chalk.red(`❌ End-to-end flow took too long: ${duration}ms`)
      );
      
    } catch (error) {
      stage.status = 'error';
      stage.details = { error: error.message };
      console.error(chalk.red('❌ End-to-end flow validation failed:'), error.message);
    }
  }
  
  /**
   * Calculate overall validation result
   */
  calculateOverallResult(validation) {
    const stages = Object.values(validation.stages);
    const passed = stages.filter(s => s.status === 'passed').length;
    const total = stages.filter(s => s.status !== 'skipped').length;
    
    validation.overall.score = total > 0 ? Math.round((passed / total) * 100) : 0;
    
    if (validation.overall.score === 100) {
      validation.overall.status = 'passed';
    } else if (validation.overall.score >= 70) {
      validation.overall.status = 'warning';
    } else {
      validation.overall.status = 'failed';
    }
  }
  
  /**
   * Print validation report
   */
  printValidationReport(validation) {
    console.log('\n' + '='.repeat(60));
    console.log(chalk.bold.cyan('📋 PIPELINE VALIDATION REPORT'));
    console.log('='.repeat(60));
    
    console.log(`Mode: ${validation.mode}`);
    console.log(`Provider: ${validation.provider}`);
    console.log(`Duration: ${validation.duration}ms`);
    console.log(`Overall Score: ${validation.overall.score}%`);
    
    const statusIcon = validation.overall.status === 'passed' ? '✅' : 
                      validation.overall.status === 'warning' ? '⚠️' : '❌';
    console.log(`Overall Status: ${statusIcon} ${validation.overall.status.toUpperCase()}`);
    
    console.log('\nStage Results:');
    for (const [stageName, stage] of Object.entries(validation.stages)) {
      const icon = stage.status === 'passed' ? '✅' : 
                   stage.status === 'skipped' ? '⏭️' : 
                   stage.status === 'warning' ? '⚠️' : '❌';
      console.log(`  ${icon} ${stageName}: ${stage.status}`);
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
  }
  
  /**
   * Get validation history
   */
  getValidationHistory() {
    return this.validationHistory;
  }
  
  /**
   * Get last validation result
   */
  getLastValidation() {
    return this.lastValidation;
  }
}

module.exports = PipelineValidator;