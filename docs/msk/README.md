# MSK Shim Quick Reference

## Overview

The MSK shim allows self-managed Kafka clusters to be monitored through New Relic's AWS MSK UI.

## Quick Start

```bash
# Enable MSK shim
export MSK_SHIM_ENABLED=true
export AWS_ACCOUNT_ID=123456789012
export AWS_REGION=us-east-1
export KAFKA_CLUSTER_NAME=my-cluster

# Run integration
./bin/nri-kafka
```

## Configuration Files

- **[kafka-msk-config.yml.sample](./kafka-msk-config.yml.sample)** - Sample configuration with MSK shim enabled
- **[jmx-config-msk.yml](./jmx-config-msk.yml)** - JMX beans configuration for MSK metrics

## Documentation

See the complete documentation in the [`docs/`](./docs/) directory:

- **[Complete Guide](./docs/README-MSK-SHIM.md)** - Full implementation and configuration guide
- **[UI Mapping](./docs/MSK-SHIM-UI-MAPPING.md)** - How metrics map to UI features
- **[Technical Details](./docs/msk-shim-unified-implementation.md)** - Implementation specifics

## Key Features

✅ **P0 Metrics** - Health status, throughput, scale indicators
✅ **P1 Metrics** - CPU, memory, disk, replication health  
✅ **P2 Metrics** - Detailed latencies, request queuing
✅ **UI Compatible** - Works with Message Queues & Streams UI
✅ **Easy Setup** - Just 4 required environment variables

## Troubleshooting

```bash
# Verify MSK entities are created
./bin/nri-kafka -pretty | jq '.data[].entity.type' | grep awsmsk

# Check metrics have provider prefix
./bin/nri-kafka -pretty | jq '.data[].metrics[].metrics | keys' | grep provider
```

For detailed troubleshooting, see the [main guide](./docs/README-MSK-SHIM.md#troubleshooting).