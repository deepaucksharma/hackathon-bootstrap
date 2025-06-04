# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

nri-kafka is New Relic's integration for monitoring Apache Kafka clusters. It collects performance metrics via JMX, inventory data from Zookeeper, and supports AWS MSK compatibility through the MSK shim feature.

## Common Development Commands

### Build and Test
```bash
# Build the integration
make build              # Clean, test, and compile
make compile            # Compile to bin/nri-kafka
make test               # Run unit tests with race detector
make integration-test   # Run integration tests (requires NRJMX_VERSION)
make generate           # Generate test mocks

# Lint and format
make lint               # Run linters (golangci-lint)
make fmt                # Format code

# Run the binary
./bin/nri-kafka -help
./bin/nri-kafka -verbose
```

### Release Process
```bash
make release            # Full release cycle
make release/build      # Build binaries with goreleaser
make rt-update-changelog # Update CHANGELOG.md
```

### Kubernetes Testing
```bash
# Run on a specific pod
make run-on-pod POD_NAME=agent NAMESPACE=test-kafka ARGS="..."
```

## High-Level Architecture

### Core Components

1. **Main Entry Point** (`src/kafka.go`)
   - Orchestrates all collection activities
   - Integrates MSK shim when enabled
   - Manages worker pools for concurrent collection

2. **Connection Layer** (`src/connection/`)
   - JMX connections for metrics collection
   - Sarama client for Kafka broker API
   - Connection pooling with configurable limits
   - SASL/SCRAM authentication support

3. **Collection Modules**
   - **Broker** (`src/broker/`) - Collects broker metrics, topic offsets/sizes
   - **Topic** (`src/topic/`) - Topic and partition information
   - **Client** (`src/client/`) - Producer and consumer JMX metrics
   - **Consumer Offset** (`src/consumeroffset/`) - Consumer group lag calculation
   - **Zookeeper** (`src/zookeeper/`) - Alternative discovery method

4. **MSK Shim** (`src/msk/`)
   - Transforms metrics to AWS MSK format
   - Creates MSK-compatible entities (Cluster, Broker, Topic samples)
   - Correlates with system metrics from Infrastructure agent
   - Key files: `shim.go`, `transformer_simple.go`, `aggregator.go`

### Key Concepts

1. **Discovery Strategies**
   - Bootstrap: Uses Kafka brokers for discovery (preferred)
   - Zookeeper: Legacy discovery method

2. **Collection Modes**
   - Core collection: brokers, topics, producers, consumers
   - Consumer offset collection: Separate mode for consumer lag
   - Local-only: Collect from specified brokers only

3. **Worker Pools**
   - Broker workers: 3 concurrent
   - Topic workers: 5 concurrent
   - Client workers: 3 concurrent each for producers/consumers

4. **MSK Shim Mode**
   - Enable with `MSK_SHIM_ENABLED=true`
   - Requires `AWS_ACCOUNT_ID`, `AWS_REGION`, `KAFKA_CLUSTER_NAME`
   - Transforms self-managed Kafka metrics to MSK format

### Important Configuration

1. **JMX Requirements**: Must be enabled on all Kafka components for metric collection

2. **Topic Limits**: Maximum 10,000 topics. Use topic filtering for larger clusters:
   ```yaml
   topic_mode: regex
   topic_regex: ["^important-.*", "^critical-.*"]
   ```

3. **Connection Pooling**: Default 10 connections max to prevent overwhelming brokers

4. **MSK Shim Configuration**: See `kafka-msk-config.yml.sample` for complete example

## Testing Strategies

- Unit tests use mocks extensively (see `src/*/mocks/`)
- Integration tests require Docker environment
- MSK shim has dry-run mode for testing transformations
- Use `-verbose` flag for debugging collection issues

## Kubernetes Deployment

The consolidated Kubernetes deployment is in `k8s-consolidated/`:

```bash
# Deploy everything
cd k8s-consolidated/scripts
./deploy.sh

# Verify metrics
./verify-metrics.sh

# Clean up old files
./cleanup.sh
```

Key configurations:
- **Kafka cluster**: `k8s-consolidated/kafka/01-kafka-cluster.yaml`
- **NRI-Kafka config**: `k8s-consolidated/nri-kafka/01-configmap.yaml`
- **Standard deployment**: `k8s-consolidated/nri-kafka/02-standard-deployment.yaml`
- **MSK shim deployment**: `k8s-consolidated/nri-kafka/03-msk-shim-deployment.yaml`

The deployment sets cluster name to `kafka-k8s-monitoring` and enables both standard and MSK shim metrics collection.