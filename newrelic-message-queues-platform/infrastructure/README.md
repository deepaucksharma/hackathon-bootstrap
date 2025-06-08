# Infrastructure Discovery Service

The Infrastructure Discovery Service automatically discovers message queue infrastructure across different environments including Kubernetes clusters and Docker hosts. It provides a pluggable architecture for discovering Kafka, RabbitMQ, Redis, and other message queue systems.

## Features

- **Multi-Provider Support**: Discover infrastructure from Kubernetes, Docker, and extensible to other providers
- **Automatic Detection**: Identifies message queue systems by image names, labels, ports, and environment variables
- **Change Tracking**: Monitors infrastructure changes over time with detailed history
- **Caching**: Reduces API load with intelligent caching of discovery results
- **Real-time Notifications**: Subscribe to changes and set up notification rules
- **Unified Interface**: Single API for discovering resources across all providers

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Discovery Orchestrator                      │
├─────────────────┬────────────────┬──────────────────────────┤
│                 │                │                          │
│  Kubernetes     │    Docker      │   Future Providers       │
│  Provider       │    Provider    │   (AWS, Azure, etc.)     │
│                 │                │                          │
├─────────────────┴────────────────┴──────────────────────────┤
│                      Cache Manager                           │
├──────────────────────────────────────────────────────────────┤
│                     Change Tracker                           │
└──────────────────────────────────────────────────────────────┘
```

## Quick Start

```javascript
const { createDiscoveryOrchestrator } = require('./infrastructure');

// Create orchestrator with auto-configured providers
const orchestrator = createDiscoveryOrchestrator({
  providers: {
    kubernetes: {
      type: 'kubernetes',
      allNamespaces: true
    },
    docker: {
      type: 'docker',
      includeContainers: true
    }
  }
});

// Start discovery
await orchestrator.start();

// Discover resources
const result = await orchestrator.discover();
console.log(`Found ${result.resources.length} message queue resources`);
```

## Providers

### Kubernetes Provider

Discovers message queue infrastructure in Kubernetes clusters:

- **Resources**: Services, StatefulSets, Deployments, Pods
- **Detection**: Labels, annotations, container images, ports
- **Features**: Multi-namespace support, label selectors, automatic service discovery

```javascript
const provider = new KubernetesDiscoveryProvider({
  allNamespaces: true,
  labelSelectors: ['app=kafka', 'messaging=true'],
  includeServices: true,
  includeStatefulSets: true
});
```

### Docker Provider

Discovers message queue containers and services:

- **Resources**: Containers, Swarm services, networks
- **Detection**: Image names, labels, environment variables, exposed ports
- **Features**: Remote Docker support, Swarm mode, network topology

```javascript
const provider = new DockerDiscoveryProvider({
  socketPath: '/var/run/docker.sock',
  labelFilters: ['com.docker.compose.service=kafka'],
  includeNetworks: true
});
```

## Resource Format

All discovered resources follow a unified format:

```javascript
{
  id: 'unique-resource-identifier',
  type: 'kafka',  // Message queue type
  provider: 'kubernetes',  // Infrastructure provider
  metadata: {
    name: 'kafka-broker-1',
    namespace: 'messaging',
    labels: { ... },
    annotations: { ... }
  },
  config: {
    replicas: 3,
    ports: [9092, 9093],
    env: { ... }
  },
  status: {
    state: 'running',
    ready: true,
    conditions: [ ... ]
  },
  endpoints: [
    {
      type: 'service',
      url: 'kafka.messaging.svc.cluster.local:9092'
    }
  ]
}
```

## Change Tracking

Monitor infrastructure changes over time:

```javascript
// Subscribe to all changes
orchestrator.changeTracker.subscribe('.*', (changes) => {
  console.log(`Added: ${changes.added.length}`);
  console.log(`Modified: ${changes.modified.length}`);
  console.log(`Removed: ${changes.removed.length}`);
});

// Subscribe to Kafka changes only
orchestrator.changeTracker.subscribe('kafka', (changes) => {
  // Handle Kafka-specific changes
});

// Add notification rules
orchestrator.changeTracker.addNotificationRule({
  name: 'Production Kafka Down',
  condition: {
    type: 'removed',
    pattern: 'prod.*kafka'
  },
  action: async (changes) => {
    // Send alert
  }
});
```

## Caching

Reduce API load with built-in caching:

```javascript
const orchestrator = createDiscoveryOrchestrator({
  enableCache: true,
  cacheOptions: {
    maxAge: 300000,  // 5 minutes
    maxSize: 1000,   // Maximum entries
    persistence: true,  // Persist to disk
    persistencePath: './discovery-cache'
  }
});

// Force cache bypass
const result = await orchestrator.discover({ useCache: false });
```

## Advanced Usage

### Custom Providers

Extend `BaseDiscoveryService` to create custom providers:

```javascript
class CustomProvider extends BaseDiscoveryService {
  async discoverResources() {
    // Implement resource discovery
  }
  
  async normalizeResource(resource) {
    // Convert to standard format
  }
  
  isMessageQueueResource(resource) {
    // Determine if resource is a message queue
  }
}
```

### Filtering and Search

```javascript
// Get resources by type
const kafkaResources = await orchestrator.getResourcesByType('kafka');

// Get resources by provider
const k8sResources = await orchestrator.getResourcesByProvider('kubernetes');

// Search resources
const prodResources = await orchestrator.searchResources('production');
```

### Statistics and Monitoring

```javascript
// Get discovery statistics
const stats = await orchestrator.getStatistics();
console.log(stats);
// {
//   providers: { ... },
//   totals: {
//     resources: 42,
//     byType: { kafka: 15, rabbitmq: 10, ... },
//     byProvider: { kubernetes: 30, docker: 12 }
//   }
// }

// Export resources
const csv = await orchestrator.exportResources('csv');
const summary = await orchestrator.exportResources('summary');
```

## Configuration Options

### Orchestrator Options

- `enableCache`: Enable result caching (default: true)
- `enableTracking`: Enable change tracking (default: true)
- `concurrency`: Maximum concurrent provider discoveries (default: 3)
- `discoveryTimeout`: Timeout for each provider (default: 30000ms)

### Provider Options

#### Kubernetes
- `namespace`: Specific namespace or 'default'
- `allNamespaces`: Discover across all namespaces
- `labelSelectors`: Array of label selectors
- `includeServices/StatefulSets/Deployments/Pods`: Resource types to include

#### Docker
- `socketPath`: Docker socket path
- `host/port`: Remote Docker daemon
- `labelFilters`: Container label filters
- `includeContainers/Services/Networks`: Resource types to include

## Error Handling

The service emits events for error handling:

```javascript
orchestrator.on('provider:error', ({ provider, error }) => {
  console.error(`Provider ${provider} error: ${error}`);
});

orchestrator.on('discovery:error', ({ error }) => {
  console.error(`Discovery error: ${error}`);
});
```

## Performance Considerations

1. **Caching**: Enable caching to reduce API calls
2. **Selective Discovery**: Use label selectors and filters
3. **Resource Types**: Disable unnecessary resource types
4. **Concurrency**: Adjust based on infrastructure size
5. **Refresh Intervals**: Balance freshness vs. API load

## Security

- Kubernetes: Uses in-cluster config or kubeconfig
- Docker: Supports TLS for remote connections
- No credentials are stored in discovered resources
- Sensitive environment variables are masked

## Troubleshooting

### No Kubernetes Resources Found
- Check RBAC permissions
- Verify label selectors
- Ensure resources have expected labels

### Docker Connection Failed
- Check Docker socket permissions
- Verify Docker daemon is running
- For remote Docker, check TLS configuration

### High Memory Usage
- Reduce cache size
- Limit history retention
- Filter unnecessary resource types