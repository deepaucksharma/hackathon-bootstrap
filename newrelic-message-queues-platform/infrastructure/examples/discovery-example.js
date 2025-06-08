/**
 * Infrastructure Discovery Example
 * 
 * Demonstrates how to use the infrastructure discovery service
 * to automatically discover message queue systems.
 */

const {
  createDiscoveryOrchestrator,
  detectAvailableProviders,
  MESSAGE_QUEUE_TYPES
} = require('../index');

async function main() {
  console.log('Infrastructure Discovery Service Example\n');
  
  try {
    // 1. Detect available providers
    console.log('Detecting available infrastructure providers...');
    const availableProviders = await detectAvailableProviders();
    console.log(`Available providers: ${availableProviders.join(', ') || 'none'}\n`);
    
    // 2. Create orchestrator with configuration
    const orchestrator = createDiscoveryOrchestrator({
      enableCache: true,
      cacheOptions: {
        maxAge: 300000, // 5 minutes
        maxSize: 500
      },
      enableTracking: true,
      trackingOptions: {
        maxHistorySize: 100
      },
      providers: {
        kubernetes: {
          type: 'kubernetes',
          allNamespaces: true,
          includeServices: true,
          includeStatefulSets: true,
          includeDeployments: true,
          includePods: false, // Skip pods for performance
          labelSelectors: [
            'app.kubernetes.io/component=message-queue',
            'messaging=true'
          ]
        },
        docker: {
          type: 'docker',
          includeContainers: true,
          includeServices: true,
          labelFilters: [
            'com.docker.compose.project',
            'messaging.enabled=true'
          ]
        }
      }
    });
    
    // 3. Subscribe to discovery events
    orchestrator.on('discovery:start', ({ providers }) => {
      console.log(`Starting discovery for providers: ${providers.join(', ')}`);
    });
    
    orchestrator.on('discovery:complete', ({ totalResources, resourcesByProvider }) => {
      console.log(`Discovery complete. Total resources: ${totalResources}`);
      console.log('Resources by provider:', resourcesByProvider);
    });
    
    orchestrator.on('discovery:changes', (changes) => {
      console.log('\nChanges detected:');
      console.log(`- Added: ${changes.added.length}`);
      console.log(`- Modified: ${changes.modified.length}`);
      console.log(`- Removed: ${changes.removed.length}`);
    });
    
    orchestrator.on('provider:error', ({ provider, error }) => {
      console.error(`Error in provider ${provider}: ${error}`);
    });
    
    // 4. Subscribe to specific resource changes
    const changeTracker = orchestrator.changeTracker;
    if (changeTracker) {
      // Subscribe to Kafka changes
      const kafkaSubscription = changeTracker.subscribe(
        'kafka',
        (changes) => {
          console.log('\nKafka infrastructure changes detected:');
          changes.added.forEach(change => {
            console.log(`+ Added: ${change.resource.metadata.name}`);
          });
          changes.modified.forEach(change => {
            console.log(`~ Modified: ${change.current.metadata.name}`);
          });
          changes.removed.forEach(change => {
            console.log(`- Removed: ${change.resource.metadata.name}`);
          });
        }
      );
      
      // Add notification rule for critical changes
      changeTracker.addNotificationRule({
        name: 'Critical Service Down',
        condition: {
          type: 'removed',
          pattern: 'kafka|rabbitmq'
        },
        action: (changes) => {
          console.log('\n⚠️  ALERT: Critical message queue service removed!');
          changes.removed.forEach(change => {
            console.log(`   - ${change.resource.type}: ${change.resource.metadata.name}`);
          });
        }
      });
    }
    
    // 5. Start the orchestrator
    console.log('\nStarting discovery orchestrator...');
    await orchestrator.start();
    
    // 6. Perform initial discovery
    console.log('\nPerforming initial discovery...');
    const discoveryResult = await orchestrator.discover();
    
    // 7. Display discovered resources
    console.log('\n=== Discovered Message Queue Resources ===\n');
    
    // Group by type
    const resourcesByType = {};
    for (const resource of discoveryResult.resources) {
      if (!resourcesByType[resource.type]) {
        resourcesByType[resource.type] = [];
      }
      resourcesByType[resource.type].push(resource);
    }
    
    // Display by type
    for (const [type, resources] of Object.entries(resourcesByType)) {
      console.log(`\n${type.toUpperCase()} (${resources.length}):`);
      
      for (const resource of resources) {
        console.log(`  - ${resource.metadata.name}`);
        console.log(`    Provider: ${resource.provider}`);
        console.log(`    Status: ${resource.status.state || resource.status.phase || 'unknown'}`);
        
        if (resource.endpoints && resource.endpoints.length > 0) {
          console.log(`    Endpoints:`);
          resource.endpoints.forEach(ep => {
            console.log(`      - ${ep.type}: ${ep.url || ep.host}:${ep.port}`);
          });
        }
      }
    }
    
    // 8. Search for specific resources
    console.log('\n=== Search Examples ===\n');
    
    const kafkaResources = await orchestrator.getResourcesByType(MESSAGE_QUEUE_TYPES.KAFKA);
    console.log(`Found ${kafkaResources.length} Kafka resources`);
    
    const productionResources = await orchestrator.searchResources('prod');
    console.log(`Found ${productionResources.length} production resources`);
    
    // 9. Get statistics
    const stats = await orchestrator.getStatistics();
    console.log('\n=== Discovery Statistics ===');
    console.log(JSON.stringify(stats, null, 2));
    
    // 10. Export resources
    if (discoveryResult.resources.length > 0) {
      console.log('\n=== Exporting Resources ===');
      
      const summary = await orchestrator.exportResources('summary');
      console.log('\nSummary:');
      console.log(JSON.stringify(summary, null, 2));
    }
    
    // 11. Simulate continuous discovery
    console.log('\n=== Starting Continuous Discovery ===');
    console.log('Press Ctrl+C to stop...\n');
    
    // Keep running and show periodic updates
    setInterval(async () => {
      try {
        const result = await orchestrator.discover({ useCache: false });
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] Resources: ${result.resources.length}`);
      } catch (error) {
        console.error(`Discovery error: ${error.message}`);
      }
    }, 30000); // Every 30 seconds
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\nShutting down discovery service...');
  process.exit(0);
});

// Run the example
if (require.main === module) {
  main();
}