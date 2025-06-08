# V2 Platform Migration Guide

This guide helps you migrate from the v1 simulation-only platform to the v2 dual-mode platform that supports both simulation and real infrastructure monitoring.

## Overview

The v2 platform introduces:
- **Infrastructure Mode**: Monitor real Kubernetes and Docker message queue deployments
- **Hybrid Mode**: Combine real infrastructure data with simulated data
- **Unified Streaming**: Single pipeline for both simulation and infrastructure data
- **Foundation Layer**: Advanced data transformation and enrichment
- **Mode Switching**: Dynamic switching between modes without restart

## Key Changes

### 1. New Directory Structure
```
newrelic-message-queues-platform/
├── v2/                      # New v2 components
│   ├── platform-orchestrator.js
│   ├── mode-controller.js
│   ├── streaming-orchestrator.js
│   └── config-manager.js
├── infrastructure/          # Infrastructure discovery
├── shim/                   # SHIM transformation layer
├── foundation/             # Data processing pipeline
└── [existing v1 folders]
```

### 2. Configuration Changes

V1 configuration:
```javascript
{
  accountId: "YOUR_ACCOUNT_ID",
  apiKey: "YOUR_API_KEY",
  simulation: {
    // simulation settings
  }
}
```

V2 configuration:
```javascript
{
  accountId: "YOUR_ACCOUNT_ID",
  apiKey: "YOUR_API_KEY",
  mode: "hybrid", // New: mode selection
  infrastructure: {
    discovery: {
      providers: ["kubernetes", "docker"]
    }
  },
  simulation: {
    // existing simulation settings
  },
  hybrid: {
    weights: {
      infrastructure: 70,
      simulation: 30
    }
  }
}
```

## Migration Steps

### Step 1: Install Dependencies

```bash
cd newrelic-message-queues-platform
npm install
```

### Step 2: Update Environment Variables

Add new v2-specific environment variables:

```bash
# Existing variables (keep these)
export NEW_RELIC_ACCOUNT_ID="your-account-id"
export NEW_RELIC_USER_API_KEY="your-api-key"
export NEW_RELIC_INGEST_KEY="your-ingest-key"

# New v2 variables
export V2_PLATFORM_MODE="hybrid"  # or "simulation" or "infrastructure"
export V2_ENABLE_MONITORING="true"
export V2_ENABLE_HEALTH_CHECK="true"
```

### Step 3: Update Your Code

#### Basic Migration (Minimal Changes)

If you're using the simple streaming example:

**V1 Code:**
```javascript
const { EntityFactory, DataSimulator, NewRelicStreamer } = require('./index');

const factory = new EntityFactory();
const simulator = new DataSimulator();
const streamer = new NewRelicStreamer({ accountId, apiKey });

// Create entities and stream
const cluster = factory.createCluster({ name: 'my-cluster' });
simulator.updateClusterMetrics(cluster);
await streamer.streamEvents([cluster]);
```

**V2 Code (Simulation Mode - Compatible):**
```javascript
const { quickStart } = require('./v2');

// Quick start in simulation mode (backwards compatible)
const platform = await quickStart.simulation({
  simulation: {
    entityCounts: { clusters: 1 }
  }
});

// Platform handles everything automatically
```

#### Advanced Migration (Full Features)

**V1 Code:**
```javascript
// Manual setup of all components
const factory = new EntityFactory();
const simulator = new DataSimulator();
const streamer = new NewRelicStreamer(config);

// Manual entity creation
const cluster = factory.createCluster(clusterConfig);
const brokers = [];
for (let i = 0; i < 3; i++) {
  brokers.push(factory.createBroker({ cluster }));
}

// Manual streaming loop
setInterval(async () => {
  simulator.updateClusterMetrics(cluster);
  brokers.forEach(b => simulator.updateBrokerMetrics(b));
  await streamer.streamEvents([cluster, ...brokers]);
}, 30000);
```

**V2 Code (Hybrid Mode):**
```javascript
const { createPlatform } = require('./v2');

// Create platform with hybrid configuration
const platform = await createPlatform({
  mode: 'hybrid',
  hybrid: {
    weights: { infrastructure: 70, simulation: 30 }
  }
});

// Start the platform
await platform.startPipeline();

// Platform automatically:
// - Discovers real infrastructure
// - Generates simulation data
// - Merges and deduplicates
// - Streams to New Relic
```

### Step 4: Leverage New Features

#### Infrastructure Discovery
```javascript
// Monitor real Kubernetes Kafka deployment
const platform = await createPlatform({
  mode: 'infrastructure',
  infrastructure: {
    discovery: {
      providers: ['kubernetes'],
      kubernetes: {
        namespaces: ['kafka'],
        labelSelectors: {
          kafka: 'app=kafka'
        }
      }
    }
  }
});
```

#### Dynamic Mode Switching
```javascript
// Start in simulation
const platform = await quickStart.simulation();

// Switch to infrastructure when ready
await platform.switchMode('infrastructure');

// Switch to hybrid for best of both
await platform.switchMode('hybrid', {
  weights: { infrastructure: 80, simulation: 20 }
});
```

#### Custom Data Enrichment
```javascript
// Add custom enrichment
platform.foundation.registerHook('enrichment', 'my-tags', async (data) => {
  return {
    ...data,
    tags: {
      ...data.tags,
      team: 'platform',
      environment: 'production'
    }
  };
});
```

## Compatibility Notes

### Backwards Compatibility
- All v1 components remain available
- Existing code continues to work
- V2 is opt-in via the `v2/` directory

### Breaking Changes
- None for existing v1 code
- V2 requires Node.js 14+ (was 12+)
- Some configuration keys renamed in v2 config

### Deprecated Features
- Direct use of `NewRelicStreamer` (use `StreamingOrchestrator`)
- Manual entity-to-metric mapping (use Foundation layer)
- Hardcoded provider logic (use SHIM adapters)

## Common Migration Scenarios

### Scenario 1: Gradual Migration
Keep v1 code running while testing v2:

```javascript
// Run v1 and v2 side by side
const v1Platform = require('./index');
const v2Platform = require('./v2');

// Use v1 for production
const v1Stream = startV1Streaming();

// Test v2 in parallel
const v2Test = await v2Platform.quickStart.simulation({
  accountId: 'test-account'
});
```

### Scenario 2: Feature Flag Migration
Use environment variables to switch:

```javascript
const useV2 = process.env.USE_V2_PLATFORM === 'true';

if (useV2) {
  const { quickStart } = require('./v2');
  await quickStart.hybrid();
} else {
  // Existing v1 code
  const { startSimulation } = require('./index');
  startSimulation();
}
```

### Scenario 3: Infrastructure-First Migration
Start monitoring real infrastructure immediately:

```javascript
const { createPlatform } = require('./v2');

const platform = await createPlatform({
  mode: 'infrastructure',
  infrastructure: {
    discovery: {
      providers: ['docker'] // Start with Docker
    }
  }
});

await platform.startPipeline();

// Add simulation later
setTimeout(() => {
  platform.switchMode('hybrid');
}, 300000); // After 5 minutes
```

## Troubleshooting

### Issue: Platform won't start
```bash
# Check configuration
node -e "const {ConfigManager} = require('./v2'); new ConfigManager().load().then(c => console.log(JSON.stringify(c, null, 2))).catch(console.error)"
```

### Issue: No infrastructure discovered
```bash
# Test discovery directly
node v2/examples/test-discovery.js
```

### Issue: Mode switching fails
```javascript
// Enable debug logging
const platform = await createPlatform({
  logging: { level: 'debug' }
});

platform.on('error', ({ phase, error }) => {
  console.error(`Error in ${phase}:`, error);
});
```

## Best Practices

1. **Start Simple**: Begin with simulation mode to verify setup
2. **Test Infrastructure**: Use infrastructure mode with one provider first
3. **Monitor Metrics**: Watch the platform metrics during migration
4. **Gradual Rollout**: Use hybrid mode to gradually increase infrastructure percentage
5. **Custom Dashboards**: Create v2-specific dashboards to monitor both modes

## Getting Help

- Check the [examples directory](./examples/) for working code
- Review the [API documentation](../docs/API_REFERENCE.md)
- Enable debug logging for troubleshooting
- Use the verification tools to validate your setup

## Next Steps

After migration:
1. Explore the new Foundation hooks for data enrichment
2. Create custom SHIM adapters for your specific infrastructure
3. Build monitoring dashboards for the v2 platform itself
4. Implement automated mode switching based on conditions