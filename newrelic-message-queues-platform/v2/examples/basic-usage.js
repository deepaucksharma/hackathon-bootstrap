/**
 * Basic Usage Example for v2 Platform
 * Demonstrates the three modes and basic operations
 */

const { createPlatform, quickStart } = require('../index');

async function basicSimulation() {
  console.log('\n=== Starting Simulation Mode ===\n');
  
  // Quick start simulation
  const platform = await quickStart.simulation({
    simulation: {
      entityCounts: {
        clusters: 1,
        brokers: 3,
        topics: 10
      }
    }
  });
  
  // Monitor for 2 minutes
  setTimeout(async () => {
    const status = platform.getStatus();
    console.log('Platform Status:', JSON.stringify(status, null, 2));
    
    await platform.shutdown();
    console.log('Simulation shutdown complete');
  }, 120000);
  
  // Listen to events
  platform.on('dataStreamed', ({ count }) => {
    console.log(`Streamed ${count} data points`);
  });
  
  platform.on('error', ({ phase, error }) => {
    console.error(`Error in ${phase}:`, error.message);
  });
}

async function basicInfrastructure() {
  console.log('\n=== Starting Infrastructure Mode ===\n');
  
  // Create platform with custom configuration
  const platform = await createPlatform({
    mode: 'infrastructure',
    infrastructure: {
      discovery: {
        providers: ['docker'], // Start with Docker only
        interval: 30000 // 30 seconds
      }
    }
  });
  
  // Start the pipeline
  await platform.startPipeline();
  
  // Monitor discovery
  platform.on('entitiesCreated', ({ source, entities }) => {
    console.log(`Discovered ${entities.length} entities from ${source}`);
    entities.forEach(entity => {
      console.log(`  - ${entity.type}: ${entity.name}`);
    });
  });
  
  // Run for 5 minutes
  setTimeout(async () => {
    await platform.shutdown();
    console.log('Infrastructure mode shutdown complete');
  }, 300000);
}

async function basicHybrid() {
  console.log('\n=== Starting Hybrid Mode ===\n');
  
  const platform = await quickStart.hybrid({
    hybrid: {
      weights: {
        infrastructure: 60,
        simulation: 40
      }
    }
  });
  
  // Track sources
  const sourceCounts = new Map();
  
  platform.on('dataStreamed', ({ count }) => {
    console.log(`Streamed ${count} data points`);
  });
  
  platform.on('entitiesCreated', ({ source, entities }) => {
    const current = sourceCounts.get(source) || 0;
    sourceCounts.set(source, current + entities.length);
    
    console.log(`Source stats:`, Array.from(sourceCounts.entries()));
  });
  
  // Switch modes after 2 minutes
  setTimeout(async () => {
    console.log('\nSwitching to infrastructure-only mode...');
    await platform.switchMode('infrastructure');
  }, 120000);
  
  // Shutdown after 5 minutes
  setTimeout(async () => {
    await platform.shutdown();
    console.log('Hybrid mode shutdown complete');
  }, 300000);
}

// Main execution
async function main() {
  const mode = process.argv[2] || 'simulation';
  
  try {
    switch (mode) {
      case 'simulation':
        await basicSimulation();
        break;
      case 'infrastructure':
        await basicInfrastructure();
        break;
      case 'hybrid':
        await basicHybrid();
        break;
      default:
        console.error('Unknown mode:', mode);
        console.log('Usage: node basic-usage.js [simulation|infrastructure|hybrid]');
        process.exit(1);
    }
  } catch (error) {
    console.error('Failed to start platform:', error);
    process.exit(1);
  }
}

// Handle shutdown
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, shutting down gracefully...');
  process.exit(0);
});

if (require.main === module) {
  main();
}