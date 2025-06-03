# MSK Shim Package

This package provides the MSK shim functionality for nri-kafka, allowing self-managed Kafka clusters to be monitored through New Relic's AWS MSK Message Queues & Streams UI.

## Package Structure

```
msk/
├── shim.go              # Main orchestrator for MSK transformation
├── config.go            # Configuration management and validation
├── guid.go              # Entity GUID generation for AWS compatibility
├── transformer.go       # Comprehensive metric transformation with full coverage
├── aggregator.go        # Cluster-level metric aggregation
├── system_correlator.go # Enhanced Infrastructure agent metrics correlation
├── integration.go       # Integration hooks for nri-kafka
├── metric_interceptor.go # Real-time metric interception
├── metric_mapper.go     # JMX to MSK metric mapping utilities
├── consumer_lag_enrichment.go # Consumer lag calculation and enrichment
└── shim_test.go         # Unit tests
```

## Key Components

### Shim
The main orchestrator that coordinates all MSK transformation activities.

### Config
Manages environment-based configuration with validation:
- `MSK_SHIM_ENABLED` - Enable/disable the shim
- `AWS_ACCOUNT_ID` - AWS account ID (required)
- `AWS_REGION` - AWS region (required)
- `KAFKA_CLUSTER_NAME` - Cluster name (required)

### GUID Generator
Creates AWS-compatible entity GUIDs in the format:
```
{accountId}|INFRA|{entityType}|{base64(identifier)}
```

### Transformer
Converts JMX metrics to MSK-compatible format:
- Adds `provider.` prefix to all metrics
- Maps JMX metric names to MSK equivalents
- Handles version compatibility

### Aggregator
Creates cluster-level metrics from broker data:
- Uses appropriate aggregation methods (SUM vs MAX)
- Tracks controller metrics
- Maintains topic aggregations

### System Correlator
Enriches metrics with Infrastructure agent data:
- CPU, memory, disk, network metrics
- Disk mount pattern matching
- Fallback to defaults when unavailable

## Usage

The MSK shim is integrated into nri-kafka through hooks at:
1. Initialization (kafka.go)
2. Broker collection (broker_collection.go)
3. Topic collection (topic_collection.go)
4. Finalization for cluster entity creation

## Testing

Run unit tests:
```bash
go test ./src/msk/...
```

## Metric Priority Levels

- **P0**: Critical metrics for basic UI functionality
- **P1**: Important metrics for resource monitoring
- **P2**: Detailed metrics for advanced diagnostics

See [MSK-SHIM-UI-MAPPING.md](../../docs/MSK-SHIM-UI-MAPPING.md) for detailed metric purposes.