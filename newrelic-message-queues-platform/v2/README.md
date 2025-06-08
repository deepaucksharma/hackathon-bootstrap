# V2 Platform Integration Layer

The v2 integration layer enables the New Relic Message Queues Platform to monitor both real infrastructure and simulated environments, providing a unified pipeline for all message queue telemetry.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Platform Orchestrator                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                  Mode Controller                      │    │
│  │  ┌────────────┐  ┌────────────────┐  ┌───────────┐  │    │
│  │  │ Simulation │  │ Infrastructure │  │  Hybrid   │  │    │
│  │  └────────────┘  └────────────────┘  └───────────┘  │    │
│  └─────────────────────────────────────────────────────┘    │
│                             │                                 │
│  ┌─────────────────────────┴─────────────────────────┐      │
│  │                  Data Pipeline                      │      │
│  │  ┌──────────┐  ┌──────┐  ┌────────────┐  ┌──────┐ │      │
│  │  │Discovery │→ │ SHIM │→ │ Foundation │→ │Stream│ │      │
│  │  └──────────┘  └──────┘  └────────────┘  └──────┘ │      │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Platform Orchestrator (`platform-orchestrator.js`)
Central coordinator that manages all v2 components and data flows.

**Key Features:**
- Component lifecycle management
- Event-driven data pipeline
- Mode-aware routing
- Unified metrics tracking

### 2. Mode Controller (`mode-controller.js`)
Manages platform operating modes and transitions.

**Supported Modes:**
- **Simulation**: Generate synthetic message queue data
- **Infrastructure**: Monitor real Kubernetes/Docker deployments
- **Hybrid**: Combine real and simulated data with configurable weights

### 3. Streaming Orchestrator (`streaming-orchestrator.js`)
Unified streaming engine for both simulation and infrastructure data.

**Features:**
- Multi-source data handling
- Automatic batching and compression
- Circuit breaker for API protection
- Source-specific metrics tracking

### 4. Configuration Manager (`config-manager.js`)
Hierarchical configuration system with environment support.

**Configuration Hierarchy:**
1. Base configuration
2. Environment-specific overrides
3. Mode-specific settings
4. Runtime environment variables

## Quick Start

### Basic Usage

```javascript
const { quickStart } = require('./v2');

// Start in simulation mode
const platform = await quickStart.simulation();

// Start in infrastructure mode
const platform = await quickStart.infrastructure();

// Start in hybrid mode
const platform = await quickStart.hybrid({
  weights: { infrastructure: 70, simulation: 30 }
});
```

### Advanced Usage

```javascript
const { createPlatform } = require('./v2');

// Create platform with custom configuration
const platform = await createPlatform({
  mode: 'hybrid',
  infrastructure: {
    discovery: {
      providers: ['kubernetes', 'docker'],
      interval: 30000
    }
  },
  hybrid: {
    weights: { infrastructure: 80, simulation: 20 },
    coordination: {
      deduplication: true,
      prioritization: 'infrastructure'
    }
  }
});

// Start the pipeline
await platform.startPipeline();

// Monitor events
platform.on('entitiesCreated', ({ source, entities }) => {
  console.log(`Created ${entities.length} entities from ${source}`);
});

// Switch modes dynamically
await platform.switchMode('infrastructure');

// Shutdown gracefully
await platform.shutdown();
```

## Configuration

### Environment Variables

```bash
# Required
export NEW_RELIC_ACCOUNT_ID="your-account-id"
export NEW_RELIC_USER_API_KEY="your-api-key"
export NEW_RELIC_INGEST_KEY="your-ingest-key"

# Optional
export NEW_RELIC_REGION="us"              # or "eu"
export V2_PLATFORM_MODE="hybrid"          # default mode
export V2_ENABLE_MONITORING="true"        # platform metrics
export V2_ENABLE_HEALTH_CHECK="true"      # health endpoint
```

### Configuration Files

Place configuration files in `config/v2/`:

```
config/v2/
├── base.json                    # Base configuration
├── environments/
│   ├── development.json        # Development overrides
│   └── production.json         # Production settings
└── modes/
    ├── simulation.json         # Simulation mode config
    ├── infrastructure.json     # Infrastructure mode config
    └── hybrid.json            # Hybrid mode config
```

## Mode Details

### Simulation Mode
Generates synthetic message queue data based on patterns and scenarios.

```javascript
{
  "simulation": {
    "scenarios": ["production", "chaos"],
    "patterns": {
      "businessHours": true,
      "anomalies": true
    },
    "entityCounts": {
      "clusters": 2,
      "brokers": 6,
      "topics": 20
    }
  }
}
```

### Infrastructure Mode
Discovers and monitors real message queue deployments.

```javascript
{
  "infrastructure": {
    "discovery": {
      "providers": ["kubernetes", "docker"],
      "kubernetes": {
        "namespaces": ["kafka", "rabbitmq"],
        "labelSelectors": {
          "kafka": "app=kafka"
        }
      }
    }
  }
}
```

### Hybrid Mode
Intelligently combines real and simulated data.

```javascript
{
  "hybrid": {
    "weights": {
      "infrastructure": 70,
      "simulation": 30
    },
    "fallback": {
      "enabled": true,
      "mode": "simulation"
    }
  }
}
```

## Integration Points

### Custom SHIM Adapters

```javascript
const { BaseShimAdapter } = require('./v2');

class CustomAdapter extends BaseShimAdapter {
  async transform(resource) {
    return {
      type: 'MESSAGE_QUEUE_TOPIC',
      name: resource.name,
      // ... custom transformation
    };
  }
}

platform.shimOrchestrator.registerAdapter('custom', new CustomAdapter());
```

### Foundation Hooks

```javascript
// Add custom data enrichment
platform.foundation.registerHook('enrichment', 'custom', async (data) => {
  return {
    ...data,
    customField: 'value'
  };
});
```

### Event Handlers

```javascript
// Monitor all platform events
platform.on('modeChanged', ({ oldMode, newMode }) => {
  console.log(`Switched from ${oldMode} to ${newMode}`);
});

platform.on('error', ({ phase, error }) => {
  console.error(`Error in ${phase}:`, error);
});
```

## Monitoring

The platform provides built-in monitoring capabilities:

### Platform Metrics
- Data flow rates
- Source distribution
- Error rates by component
- Mode transition events

### Health Endpoint
```bash
curl http://localhost:8080/health
```

### Status API
```javascript
const status = platform.getStatus();
console.log(JSON.stringify(status, null, 2));
```

## Examples

See the `examples/` directory for:
- `basic-usage.js` - Simple examples for each mode
- `advanced-integration.js` - Custom components and integrations
- `migration-example.js` - Migrating from v1

## Troubleshooting

### Common Issues

1. **No data flowing**
   - Check environment variables
   - Verify API credentials
   - Review platform status

2. **Infrastructure not discovered**
   - Ensure Docker/Kubernetes access
   - Check provider configuration
   - Review discovery logs

3. **High error rates**
   - Monitor circuit breaker status
   - Check API rate limits
   - Review error events

### Debug Mode

```javascript
const platform = await createPlatform({
  logging: { level: 'debug' }
});
```

## Performance Considerations

- **Batching**: Data is automatically batched (default: 1000 items)
- **Compression**: Enabled by default for all API calls
- **Circuit Breaker**: Protects against API failures
- **Resource Limits**: Configure based on your environment

## Future Enhancements

- Additional discovery providers (AWS, GCP)
- Machine learning for anomaly detection
- Advanced dashboard generation
- Automated remediation actions

## Support

For issues or questions:
1. Check the [Migration Guide](./MIGRATION_GUIDE.md)
2. Review [API Reference](../docs/API_REFERENCE.md)
3. Enable debug logging
4. Open an issue with platform status output