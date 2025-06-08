/**
 * Advanced Integration Example
 * Shows how to use the v2 platform with custom components and integrations
 */

const { 
  PlatformOrchestrator,
  ConfigManager,
  Foundation,
  DiscoveryOrchestrator,
  ShimOrchestrator
} = require('../index');

class AdvancedIntegration {
  constructor() {
    this.platform = null;
    this.customHooks = new Map();
    this.metrics = {
      infrastructure: { discovered: 0, transformed: 0 },
      simulation: { generated: 0 },
      streaming: { sent: 0, failed: 0 }
    };
  }

  async initialize() {
    console.log('Initializing advanced integration...\n');
    
    // Load and customize configuration
    const configManager = new ConfigManager();
    const config = await configManager.load();
    
    // Add custom configuration
    configManager.update({
      custom: {
        enrichment: {
          addRegion: true,
          addEnvironment: true,
          addCustomTags: ['team', 'service-tier']
        },
        alerting: {
          thresholds: {
            errorRate: 0.05,
            latencyP99: 100
          }
        }
      }
    });
    
    // Create platform with custom config
    this.platform = new PlatformOrchestrator(configManager.export());
    
    // Register custom components
    this.registerCustomComponents();
    
    // Set up custom event handlers
    this.setupEventHandlers();
    
    // Initialize platform
    await this.platform.initialize();
    
    console.log('Advanced integration initialized successfully\n');
  }

  /**
   * Register custom components
   */
  registerCustomComponents() {
    // Register custom foundation hook
    const foundation = this.platform.foundation;
    
    // Custom enrichment hook
    foundation.registerHook('enrichment', 'custom-tags', async (data) => {
      return {
        ...data,
        tags: {
          ...data.tags,
          environment: process.env.ENVIRONMENT || 'development',
          region: process.env.AWS_REGION || 'us-east-1',
          version: '2.0.0'
        }
      };
    });
    
    // Custom validation hook
    foundation.registerHook('validation', 'rate-limit', async (data) => {
      // Simple rate limiting
      const key = `${data.source}-${data.type}`;
      const now = Date.now();
      
      if (!this.rateLimits) {
        this.rateLimits = new Map();
      }
      
      const limit = this.rateLimits.get(key) || { count: 0, reset: now + 60000 };
      
      if (now > limit.reset) {
        limit.count = 0;
        limit.reset = now + 60000;
      }
      
      limit.count++;
      this.rateLimits.set(key, limit);
      
      if (limit.count > 1000) {
        throw new Error(`Rate limit exceeded for ${key}`);
      }
      
      return data;
    });
    
    // Register custom SHIM adapter for AWS SQS
    this.registerSQSAdapter();
  }

  /**
   * Register custom SQS SHIM adapter
   */
  registerSQSAdapter() {
    const { BaseShimAdapter } = require('../../shim');
    
    class SQSShimAdapter extends BaseShimAdapter {
      constructor() {
        super('sqs');
      }
      
      async transform(resource) {
        // Transform SQS queue to MESSAGE_QUEUE_QUEUE entity
        return {
          type: 'MESSAGE_QUEUE_QUEUE',
          name: resource.metadata.name,
          guid: this.generateGUID('queue', resource.metadata.name),
          provider: 'sqs',
          attributes: {
            region: resource.metadata.labels?.region || 'us-east-1',
            arn: resource.metadata.annotations?.arn,
            visibilityTimeout: parseInt(resource.spec?.visibilityTimeout || 30),
            messageRetention: parseInt(resource.spec?.messageRetention || 345600)
          },
          metrics: this.transformMetrics(resource.metrics)
        };
      }
      
      transformMetrics(metrics) {
        return {
          'queue.messages.visible': metrics.ApproximateNumberOfMessagesVisible || 0,
          'queue.messages.notVisible': metrics.ApproximateNumberOfMessagesNotVisible || 0,
          'queue.messages.delayed': metrics.ApproximateNumberOfMessagesDelayed || 0,
          'queue.age.oldest': metrics.ApproximateAgeOfOldestMessage || 0
        };
      }
    }
    
    // Register with SHIM orchestrator
    if (this.platform.shimOrchestrator) {
      this.platform.shimOrchestrator.registerAdapter('sqs', new SQSShimAdapter());
    }
  }

  /**
   * Set up custom event handlers
   */
  setupEventHandlers() {
    // Track all data flows
    this.platform.on('entitiesCreated', ({ source, entities }) => {
      this.metrics.infrastructure.discovered += entities.length;
      this.logEvent('ENTITIES', `Created ${entities.length} entities from ${source}`);
    });
    
    this.platform.on('metricsProcessed', ({ source, count }) => {
      if (source === 'infrastructure') {
        this.metrics.infrastructure.transformed += count;
      } else {
        this.metrics.simulation.generated += count;
      }
    });
    
    this.platform.on('dataStreamed', ({ count }) => {
      this.metrics.streaming.sent += count;
      this.logEvent('STREAMING', `Sent ${count} data points`);
    });
    
    this.platform.on('error', ({ phase, error }) => {
      this.metrics.streaming.failed++;
      this.logEvent('ERROR', `${phase}: ${error.message}`, 'error');
    });
    
    // Mode change handler
    this.platform.on('modeChanged', ({ oldMode, newMode }) => {
      this.logEvent('MODE', `Changed from ${oldMode} to ${newMode}`, 'info');
      this.adjustForMode(newMode);
    });
  }

  /**
   * Adjust behavior based on mode
   */
  adjustForMode(mode) {
    switch (mode) {
      case 'infrastructure':
        // Increase discovery frequency in infrastructure mode
        if (this.platform.discoveryOrchestrator) {
          this.platform.discoveryOrchestrator.updateInterval(30000); // 30s
        }
        break;
        
      case 'simulation':
        // Adjust simulation patterns
        const simulator = this.platform.getComponent('simulator');
        if (simulator) {
          simulator.enablePattern('chaos');
        }
        break;
        
      case 'hybrid':
        // Balance resources
        console.log('Adjusting resource allocation for hybrid mode');
        break;
    }
  }

  /**
   * Custom monitoring dashboard
   */
  async createMonitoringDashboard() {
    const DashboardFramework = require('../../dashboards/framework/core/dashboard-framework');
    
    const framework = new DashboardFramework({
      accountId: this.platform.config.accountId,
      apiKey: this.platform.config.apiKey
    });
    
    // Create custom dashboard for v2 platform monitoring
    const dashboard = {
      name: 'V2 Platform Monitoring',
      description: 'Real-time monitoring of v2 platform components',
      pages: [
        {
          name: 'Overview',
          widgets: [
            {
              title: 'Data Flow Rates',
              visualization: 'line',
              query: `
                SELECT rate(sum(platform.data.streamed), 1 minute) as 'Streaming Rate',
                       rate(sum(platform.entities.created), 1 minute) as 'Discovery Rate'
                FROM PlatformMetric 
                SINCE 1 hour ago
                TIMESERIES
              `
            },
            {
              title: 'Mode Distribution',
              visualization: 'pie',
              query: `
                SELECT count(*) 
                FROM PlatformMetric 
                FACET mode 
                SINCE 1 hour ago
              `
            },
            {
              title: 'Error Rate by Component',
              visualization: 'bar',
              query: `
                SELECT rate(sum(platform.errors), 1 minute) 
                FROM PlatformMetric 
                FACET component 
                SINCE 1 hour ago
              `
            }
          ]
        }
      ]
    };
    
    return await framework.deploy(dashboard);
  }

  /**
   * Run integration demo
   */
  async runDemo() {
    try {
      // Initialize
      await this.initialize();
      
      // Start in hybrid mode
      console.log('Starting platform in hybrid mode...\n');
      await this.platform.startPipeline({
        mode: 'hybrid'
      });
      
      // Create monitoring dashboard
      console.log('Creating monitoring dashboard...\n');
      const dashboardUrl = await this.createMonitoringDashboard();
      console.log(`Dashboard created: ${dashboardUrl}\n`);
      
      // Demonstrate mode switching
      setTimeout(async () => {
        console.log('\nSwitching to infrastructure mode...');
        await this.platform.switchMode('infrastructure');
      }, 60000);
      
      setTimeout(async () => {
        console.log('\nSwitching to simulation mode...');
        await this.platform.switchMode('simulation');
      }, 120000);
      
      setTimeout(async () => {
        console.log('\nSwitching back to hybrid mode...');
        await this.platform.switchMode('hybrid');
      }, 180000);
      
      // Print metrics every 30 seconds
      const metricsInterval = setInterval(() => {
        this.printMetrics();
      }, 30000);
      
      // Run for 5 minutes
      setTimeout(async () => {
        clearInterval(metricsInterval);
        await this.shutdown();
      }, 300000);
      
    } catch (error) {
      console.error('Demo failed:', error);
      await this.shutdown();
    }
  }

  /**
   * Print current metrics
   */
  printMetrics() {
    console.log('\n=== Platform Metrics ===');
    console.log('Infrastructure:');
    console.log(`  Discovered: ${this.metrics.infrastructure.discovered}`);
    console.log(`  Transformed: ${this.metrics.infrastructure.transformed}`);
    console.log('Simulation:');
    console.log(`  Generated: ${this.metrics.simulation.generated}`);
    console.log('Streaming:');
    console.log(`  Sent: ${this.metrics.streaming.sent}`);
    console.log(`  Failed: ${this.metrics.streaming.failed}`);
    console.log(`  Success Rate: ${(this.metrics.streaming.sent / (this.metrics.streaming.sent + this.metrics.streaming.failed) * 100).toFixed(2)}%`);
    console.log('=======================\n');
  }

  /**
   * Log events with formatting
   */
  logEvent(category, message, level = 'info') {
    const timestamp = new Date().toISOString();
    const color = {
      info: '\x1b[36m',
      error: '\x1b[31m',
      warn: '\x1b[33m'
    }[level] || '\x1b[0m';
    
    console.log(`${color}[${timestamp}] [${category}] ${message}\x1b[0m`);
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('\nShutting down advanced integration...');
    this.printMetrics();
    
    if (this.platform) {
      await this.platform.shutdown();
    }
    
    console.log('Shutdown complete');
    process.exit(0);
  }
}

// Main execution
if (require.main === module) {
  const integration = new AdvancedIntegration();
  
  // Handle shutdown
  process.on('SIGINT', async () => {
    await integration.shutdown();
  });
  
  // Run demo
  integration.runDemo().catch(console.error);
}