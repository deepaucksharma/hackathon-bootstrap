/**
 * V2 Platform Showcase
 * Interactive demonstration of all v2 features
 */

const readline = require('readline');
const { createPlatform } = require('./index');

class V2Showcase {
  constructor() {
    this.platform = null;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    this.running = false;
  }

  async start() {
    console.clear();
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║     New Relic Message Queues Platform v2.0 Showcase       ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');
    
    await this.initialize();
    await this.mainMenu();
  }

  async initialize() {
    console.log('Initializing platform...\n');
    
    try {
      this.platform = await createPlatform({
        mode: 'simulation', // Start with simulation
        logging: { level: 'info' }
      });
      
      // Set up event listeners
      this.setupEventListeners();
      
      console.log('✓ Platform initialized successfully\n');
    } catch (error) {
      console.error('Failed to initialize platform:', error.message);
      process.exit(1);
    }
  }

  setupEventListeners() {
    this.platform.on('modeChanged', ({ oldMode, newMode }) => {
      console.log(`\n📌 Mode changed: ${oldMode} → ${newMode}`);
    });
    
    this.platform.on('entitiesCreated', ({ source, entities }) => {
      console.log(`📊 Created ${entities.length} entities from ${source}`);
    });
    
    this.platform.on('dataStreamed', ({ count }) => {
      console.log(`📤 Streamed ${count} data points`);
    });
    
    this.platform.on('error', ({ phase, error }) => {
      console.error(`❌ Error in ${phase}: ${error.message}`);
    });
  }

  async mainMenu() {
    const choices = [
      '1. Start/Stop Pipeline',
      '2. Switch Mode',
      '3. View Status',
      '4. Simulate Scenarios',
      '5. Configure Platform',
      '6. View Metrics',
      '7. Advanced Features',
      '8. Exit'
    ];
    
    console.log('\n=== Main Menu ===');
    choices.forEach(choice => console.log(choice));
    
    const answer = await this.prompt('\nSelect option: ');
    
    switch (answer) {
      case '1':
        await this.togglePipeline();
        break;
      case '2':
        await this.switchMode();
        break;
      case '3':
        await this.viewStatus();
        break;
      case '4':
        await this.simulateScenarios();
        break;
      case '5':
        await this.configurePlatform();
        break;
      case '6':
        await this.viewMetrics();
        break;
      case '7':
        await this.advancedFeatures();
        break;
      case '8':
        await this.exit();
        return;
      default:
        console.log('Invalid option');
    }
    
    await this.mainMenu();
  }

  async togglePipeline() {
    if (this.running) {
      console.log('\nStopping pipeline...');
      const result = await this.platform.stopPipeline();
      console.log(`✓ Pipeline stopped. Processed: ${result.metrics.processed} items`);
      this.running = false;
    } else {
      console.log('\nStarting pipeline...');
      await this.platform.startPipeline();
      console.log('✓ Pipeline started');
      this.running = true;
      
      // Show real-time updates for 10 seconds
      console.log('\nShowing real-time updates for 10 seconds...\n');
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }

  async switchMode() {
    const currentMode = this.platform.modeController.getMode();
    console.log(`\nCurrent mode: ${currentMode}`);
    console.log('\nAvailable modes:');
    console.log('1. Simulation');
    console.log('2. Infrastructure');
    console.log('3. Hybrid');
    
    const choice = await this.prompt('\nSelect mode: ');
    const modes = ['', 'simulation', 'infrastructure', 'hybrid'];
    const newMode = modes[parseInt(choice)];
    
    if (newMode && newMode !== currentMode) {
      console.log(`\nSwitching to ${newMode} mode...`);
      
      if (newMode === 'hybrid') {
        const infra = await this.prompt('Infrastructure weight (0-100): ');
        const sim = 100 - parseInt(infra);
        
        await this.platform.switchMode('hybrid', {
          weights: {
            infrastructure: parseInt(infra),
            simulation: sim
          }
        });
      } else {
        await this.platform.switchMode(newMode);
      }
      
      console.log(`✓ Switched to ${newMode} mode`);
    }
  }

  async viewStatus() {
    const status = this.platform.getStatus();
    
    console.log('\n=== Platform Status ===');
    console.log(`Mode: ${status.mode}`);
    console.log(`Pipeline: ${status.pipelineActive ? 'Running' : 'Stopped'}`);
    console.log(`Initialized: ${status.initialized}`);
    
    if (status.metrics.startTime) {
      console.log(`\nRuntime: ${Math.floor(status.metrics.runtime / 1000)}s`);
      console.log(`Processed: ${status.metrics.processed}`);
      console.log(`Errors: ${status.metrics.errors}`);
      console.log(`Throughput: ${status.metrics.throughput.toFixed(2)}/sec`);
    }
    
    if (status.components.streaming) {
      const streaming = status.components.streaming;
      console.log(`\nBuffered Events: ${streaming.buffers.events}`);
      console.log(`Buffered Metrics: ${streaming.buffers.metrics}`);
      
      if (streaming.sources.length > 0) {
        console.log('\nData Sources:');
        streaming.sources.forEach(source => {
          console.log(`  - ${source.name}: ${source.count} items`);
        });
      }
    }
    
    await this.prompt('\nPress Enter to continue...');
  }

  async simulateScenarios() {
    if (this.platform.modeController.getMode() === 'infrastructure') {
      console.log('\n⚠️  Scenarios only available in simulation or hybrid mode');
      return;
    }
    
    console.log('\n=== Simulation Scenarios ===');
    console.log('1. Traffic Spike');
    console.log('2. Broker Failure');
    console.log('3. Consumer Lag');
    console.log('4. Anomaly Injection');
    
    const choice = await this.prompt('\nSelect scenario: ');
    
    switch (choice) {
      case '1':
        console.log('\n🚀 Simulating traffic spike...');
        // Implement traffic spike
        break;
      case '2':
        console.log('\n💥 Simulating broker failure...');
        // Implement broker failure
        break;
      case '3':
        console.log('\n🐌 Simulating consumer lag...');
        // Implement consumer lag
        break;
      case '4':
        console.log('\n⚡ Injecting anomalies...');
        // Implement anomaly injection
        break;
    }
    
    console.log('✓ Scenario activated');
  }

  async configurePlatform() {
    console.log('\n=== Platform Configuration ===');
    console.log('1. Streaming Settings');
    console.log('2. Discovery Settings');
    console.log('3. Mode-specific Settings');
    console.log('4. Export Configuration');
    
    const choice = await this.prompt('\nSelect option: ');
    
    switch (choice) {
      case '1':
        await this.configureStreaming();
        break;
      case '2':
        await this.configureDiscovery();
        break;
      case '3':
        await this.configureModeSettings();
        break;
      case '4':
        await this.exportConfiguration();
        break;
    }
  }

  async configureStreaming() {
    console.log('\n=== Streaming Configuration ===');
    const current = this.platform.config.streaming;
    
    console.log(`Current batch size: ${current.batchSize}`);
    const batchSize = await this.prompt('New batch size (or Enter to keep): ');
    if (batchSize) {
      this.platform.config.streaming.batchSize = parseInt(batchSize);
    }
    
    console.log(`Current flush interval: ${current.flushInterval}ms`);
    const interval = await this.prompt('New flush interval in ms (or Enter to keep): ');
    if (interval) {
      this.platform.config.streaming.flushInterval = parseInt(interval);
    }
    
    console.log('✓ Streaming configuration updated');
  }

  async configureDiscovery() {
    if (this.platform.modeController.getMode() === 'simulation') {
      console.log('\n⚠️  Discovery settings only available in infrastructure or hybrid mode');
      return;
    }
    
    console.log('\n=== Discovery Configuration ===');
    console.log('1. Enable/Disable Providers');
    console.log('2. Set Discovery Interval');
    console.log('3. Configure Namespaces');
    
    const choice = await this.prompt('\nSelect option: ');
    // Implement discovery configuration
  }

  async configureModeSettings() {
    const mode = this.platform.modeController.getMode();
    console.log(`\n=== ${mode.charAt(0).toUpperCase() + mode.slice(1)} Mode Settings ===`);
    
    // Mode-specific configuration
    switch (mode) {
      case 'simulation':
        console.log('1. Entity Counts');
        console.log('2. Update Patterns');
        console.log('3. Anomaly Settings');
        break;
      case 'infrastructure':
        console.log('1. Provider Settings');
        console.log('2. Cache Settings');
        console.log('3. Label Selectors');
        break;
      case 'hybrid':
        console.log('1. Weight Distribution');
        console.log('2. Coordination Rules');
        console.log('3. Fallback Settings');
        break;
    }
    
    const choice = await this.prompt('\nSelect option: ');
    // Implement mode-specific configuration
  }

  async exportConfiguration() {
    const config = this.platform.config;
    const filename = `v2-config-${Date.now()}.json`;
    
    console.log('\n=== Configuration Export ===');
    console.log(JSON.stringify(config, null, 2));
    console.log(`\n✓ Configuration would be saved to: ${filename}`);
  }

  async viewMetrics() {
    console.log('\n=== Platform Metrics ===');
    
    const metrics = this.platform.getMetrics();
    const status = this.platform.getStatus();
    
    // Overall metrics
    console.log('\nOverall Performance:');
    console.log(`  Runtime: ${Math.floor(metrics.runtime / 1000)}s`);
    console.log(`  Total Processed: ${metrics.processed}`);
    console.log(`  Total Errors: ${metrics.errors}`);
    console.log(`  Success Rate: ${((metrics.processed / (metrics.processed + metrics.errors)) * 100).toFixed(2)}%`);
    console.log(`  Throughput: ${metrics.throughput.toFixed(2)} items/sec`);
    
    // Source breakdown
    if (status.components.streaming?.sources?.length > 0) {
      console.log('\nSource Breakdown:');
      status.components.streaming.sources.forEach(source => {
        console.log(`  ${source.name}:`);
        console.log(`    Items: ${source.count}`);
        console.log(`    Sent: ${source.metrics?.sent || 0}`);
        console.log(`    Errors: ${source.metrics?.errors || 0}`);
      });
    }
    
    await this.prompt('\nPress Enter to continue...');
  }

  async advancedFeatures() {
    console.log('\n=== Advanced Features ===');
    console.log('1. Custom SHIM Adapter');
    console.log('2. Foundation Hooks');
    console.log('3. Mode Transitions');
    console.log('4. Circuit Breaker Status');
    console.log('5. Generate Dashboard');
    
    const choice = await this.prompt('\nSelect feature: ');
    
    switch (choice) {
      case '1':
        console.log('\n📝 Custom SHIM adapter registration example shown in console');
        console.log(`
class CustomAdapter extends BaseShimAdapter {
  async transform(resource) {
    return {
      type: 'MESSAGE_QUEUE_QUEUE',
      name: resource.name,
      // ... transformation logic
    };
  }
}
platform.shimOrchestrator.registerAdapter('custom', new CustomAdapter());
        `);
        break;
        
      case '2':
        console.log('\n🪝 Foundation hooks allow data transformation:');
        console.log(`
platform.foundation.registerHook('enrichment', 'tags', async (data) => {
  return { ...data, tags: { team: 'platform' } };
});
        `);
        break;
        
      case '3':
        console.log('\n🔄 Mode transitions can be automated:');
        console.log(`
platform.modeController.onModeTransition('simulation', 'infrastructure', async () => {
  console.log('Preparing for real data...');
});
        `);
        break;
        
      case '4':
        const cb = this.platform.streamingOrchestrator?.circuitBreaker;
        if (cb) {
          console.log('\n⚡ Circuit Breaker Status:');
          console.log(`  State: ${cb.state}`);
          console.log(`  Failures: ${cb.failures}`);
          console.log(`  Threshold: ${cb.threshold}`);
        }
        break;
        
      case '5':
        console.log('\n📊 Dashboard generation would create monitoring dashboards');
        console.log('Integration with dashboard framework available');
        break;
    }
    
    await this.prompt('\nPress Enter to continue...');
  }

  async exit() {
    console.log('\nShutting down platform...');
    
    if (this.running) {
      await this.platform.stopPipeline();
    }
    
    await this.platform.shutdown();
    this.rl.close();
    
    console.log('✓ Platform shutdown complete');
    console.log('\nThank you for using the V2 Platform Showcase!');
    process.exit(0);
  }

  prompt(question) {
    return new Promise(resolve => {
      this.rl.question(question, answer => {
        resolve(answer.trim());
      });
    });
  }
}

// ASCII Art Banner
function showBanner() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║   ███╗   ██╗███████╗██╗    ██╗    ██████╗ ███████╗██╗     ██╗    ║
║   ████╗  ██║██╔════╝██║    ██║    ██╔══██╗██╔════╝██║     ██║    ║
║   ██╔██╗ ██║█████╗  ██║ █╗ ██║    ██████╔╝█████╗  ██║     ██║    ║
║   ██║╚██╗██║██╔══╝  ██║███╗██║    ██╔══██╗██╔══╝  ██║     ██║    ║
║   ██║ ╚████║███████╗╚███╔███╔╝    ██║  ██║███████╗███████╗██║    ║
║   ╚═╝  ╚═══╝╚══════╝ ╚══╝╚══╝     ╚═╝  ╚═╝╚══════╝╚══════╝╚═╝    ║
║                                                                   ║
║          Message Queues Platform v2.0 - Interactive Demo          ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
  `);
}

// Main execution
if (require.main === module) {
  showBanner();
  
  const showcase = new V2Showcase();
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\nReceived interrupt signal...');
    await showcase.exit();
  });
  
  showcase.start().catch(console.error);
}

module.exports = V2Showcase;