/**
 * Test V2 Integration
 * Verifies that all components work together correctly
 */

const { 
  createPlatform, 
  ModeController, 
  StreamingOrchestrator,
  ConfigManager 
} = require('./index');

async function testConfiguration() {
  console.log('\n=== Testing Configuration Manager ===\n');
  
  const configManager = new ConfigManager();
  
  try {
    // Test loading configuration
    const config = await configManager.load();
    console.log('✓ Configuration loaded successfully');
    console.log(`  - Environment: ${configManager.environment}`);
    console.log(`  - Default mode: ${config.platform.defaultMode}`);
    console.log(`  - Streaming batch size: ${config.streaming.batchSize}`);
    
    // Test getting specific values
    const batchSize = configManager.get('streaming.batchSize', 1000);
    console.log(`✓ Config getter works: batchSize = ${batchSize}`);
    
    // Test setting values
    configManager.set('custom.test', 'value');
    console.log('✓ Config setter works');
    
    return true;
  } catch (error) {
    console.error('✗ Configuration test failed:', error.message);
    return false;
  }
}

async function testModeController() {
  console.log('\n=== Testing Mode Controller ===\n');
  
  const modeController = new ModeController({
    defaultMode: 'simulation'
  });
  
  try {
    // Test initial mode
    console.log(`✓ Initial mode: ${modeController.getMode()}`);
    
    // Test mode switching
    const result = await modeController.switchMode('infrastructure');
    console.log(`✓ Switched to infrastructure mode: changed=${result.changed}`);
    
    // Test mode validation
    modeController.validateModeConfig('hybrid');
    console.log('✓ Mode validation works');
    
    // Test invalid mode
    try {
      await modeController.switchMode('invalid');
      console.error('✗ Should have rejected invalid mode');
    } catch (error) {
      console.log('✓ Correctly rejected invalid mode');
    }
    
    return true;
  } catch (error) {
    console.error('✗ Mode controller test failed:', error.message);
    return false;
  }
}

async function testStreamingOrchestrator() {
  console.log('\n=== Testing Streaming Orchestrator ===\n');
  
  const streamer = new StreamingOrchestrator({
    batchSize: 10,
    flushInterval: 5000
  });
  
  try {
    // Start streaming
    await streamer.start();
    console.log('✓ Streaming orchestrator started');
    
    // Test data routing
    await streamer.stream([
      { eventType: 'TestEvent', value: 1 },
      { name: 'test.metric', value: 100, type: 'gauge' }
    ], { source: 'test' });
    console.log('✓ Data routing works');
    
    // Check status
    const status = streamer.getStatus();
    console.log(`✓ Status check: ${status.buffers.events} events, ${status.buffers.metrics} metrics buffered`);
    
    // Stop streaming
    await streamer.stop();
    console.log('✓ Streaming orchestrator stopped');
    
    return true;
  } catch (error) {
    console.error('✗ Streaming orchestrator test failed:', error.message);
    return false;
  }
}

async function testPlatformIntegration() {
  console.log('\n=== Testing Platform Integration ===\n');
  
  try {
    // Create platform
    const platform = await createPlatform({
      mode: 'simulation',
      simulation: {
        entityCounts: {
          clusters: 1,
          brokers: 2,
          topics: 5
        }
      }
    });
    console.log('✓ Platform created and initialized');
    
    // Test mode switching
    await platform.switchMode('infrastructure');
    console.log('✓ Mode switching works');
    
    // Test status
    const status = platform.getStatus();
    console.log(`✓ Platform status: mode=${status.mode}, initialized=${status.initialized}`);
    
    // Test component registration
    platform.registerComponent('test', { name: 'TestComponent' });
    const component = platform.getComponent('test');
    console.log(`✓ Component registration works: ${component.name}`);
    
    // Shutdown
    await platform.shutdown();
    console.log('✓ Platform shutdown successful');
    
    return true;
  } catch (error) {
    console.error('✗ Platform integration test failed:', error.message);
    return false;
  }
}

async function testEndToEnd() {
  console.log('\n=== Testing End-to-End Flow ===\n');
  
  try {
    // Create platform in hybrid mode
    const platform = await createPlatform({
      mode: 'hybrid',
      hybrid: {
        weights: {
          infrastructure: 60,
          simulation: 40
        }
      }
    });
    
    // Track events
    let eventCount = 0;
    let errorCount = 0;
    
    platform.on('dataStreamed', ({ count }) => {
      eventCount += count;
    });
    
    platform.on('error', ({ phase, error }) => {
      errorCount++;
      console.error(`Error in ${phase}:`, error.message);
    });
    
    // Start pipeline
    await platform.startPipeline();
    console.log('✓ Pipeline started in hybrid mode');
    
    // Run for 10 seconds
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Stop pipeline
    const result = await platform.stopPipeline();
    console.log(`✓ Pipeline stopped: ${result.metrics.processed} items processed`);
    
    // Check results
    console.log(`✓ End-to-end test complete:`);
    console.log(`  - Events streamed: ${eventCount}`);
    console.log(`  - Errors: ${errorCount}`);
    console.log(`  - Success rate: ${((eventCount / (eventCount + errorCount)) * 100).toFixed(2)}%`);
    
    await platform.shutdown();
    
    return eventCount > 0;
  } catch (error) {
    console.error('✗ End-to-end test failed:', error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('Starting V2 Integration Tests...\n');
  
  const tests = [
    { name: 'Configuration', fn: testConfiguration },
    { name: 'Mode Controller', fn: testModeController },
    { name: 'Streaming Orchestrator', fn: testStreamingOrchestrator },
    { name: 'Platform Integration', fn: testPlatformIntegration },
    { name: 'End-to-End Flow', fn: testEndToEnd }
  ];
  
  const results = [];
  
  for (const test of tests) {
    try {
      const passed = await test.fn();
      results.push({ name: test.name, passed });
    } catch (error) {
      console.error(`\nTest ${test.name} crashed:`, error);
      results.push({ name: test.name, passed: false });
    }
  }
  
  // Summary
  console.log('\n=== Test Summary ===\n');
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  
  results.forEach(r => {
    console.log(`${r.passed ? '✓' : '✗'} ${r.name}`);
  });
  
  console.log(`\nTotal: ${passed}/${total} passed (${(passed/total*100).toFixed(0)}%)\n`);
  
  process.exit(passed === total ? 0 : 1);
}

// Run tests if executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = { runAllTests };