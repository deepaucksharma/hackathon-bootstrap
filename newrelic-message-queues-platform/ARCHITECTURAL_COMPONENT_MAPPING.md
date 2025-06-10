# New Relic Message Queues Platform - Architectural Component Mapping

## Overview
This document provides a comprehensive mapping of where each architectural component exists in the current implementation of the New Relic Message Queues Platform.

## 1. Main Orchestrator & Mode Selection

### Core Platform Entry Point
- **Location**: `/platform.js`
- **Class**: `MessageQueuesPlatform`
- **Key Features**:
  - Mode selection (infrastructure, simulation, hybrid)
  - Component initialization
  - Run cycle management
  - Error recovery coordination
  - Configuration validation

### CLI Entry Points
- **Primary CLI**: `/tools/cli/mq-platform.js`
  - Commands: simulate, dashboard, entity, verify, config
  - Interactive mode support
- **Platform Launch**: `/launch.js`
  - Direct platform launcher

### Mode-Specific Components
- **Infrastructure Mode**: Lines 230-315 in platform.js
- **Simulation Mode**: Lines 317-353 in platform.js  
- **Hybrid Mode**: Lines 355-389 in platform.js

## 2. Data Collection Components

### Infrastructure Collectors
- **Base Collector**: `/infrastructure/collectors/infra-agent-collector.js`
  - Class: `InfraAgentCollector`
  - Queries New Relic for nri-kafka data
  - Circuit breaker protection
  - NRQL query execution

- **Enhanced Collector**: `/infrastructure/collectors/enhanced-kafka-collector.js`
  - Class: `EnhancedKafkaCollector`
  - Parallel data collection
  - Worker pool support
  - Performance optimizations

- **Multi-Cluster Collector**: `/infrastructure/collectors/multi-cluster-collector.js`
  - Class: `MultiClusterCollector`
  - Cross-cluster monitoring
  - Cluster discovery

- **Consumer Offset Collector**: `/infrastructure/collectors/consumer-offset-collector.js`
  - Class: `ConsumerOffsetCollector`
  - Consumer lag tracking
  - Offset monitoring

### Simulation Engine
- **Primary Simulator**: `/simulation/engines/data-simulator.js`
  - Class: `DataSimulator`
  - Topology creation
  - Metric generation
  - Business patterns
  - Anomaly injection

- **Enhanced Simulator**: `/simulation/engines/enhanced-data-simulator.js`
  - Advanced patterns
  - Complex scenarios

## 3. Transformation & Entity Synthesis

### Main Transformer
- **Location**: `/infrastructure/transformers/nri-kafka-transformer.js`
- **Class**: `NriKafkaTransformer`
- **Key Features**:
  - Converts nri-kafka samples to MESSAGE_QUEUE entities
  - GUID generation
  - Metric validation
  - Enhanced error handling
  - Per-topic-broker metrics support
  - Cluster aggregation

### Entity Factory & Models
- **Factory**: `/core/entities/entity-factory.js`
  - Creates all entity types
  - Entity registry management

- **Entity Types**:
  - `/core/entities/message-queue-broker.js`
  - `/core/entities/message-queue-topic.js`
  - `/core/entities/message-queue-cluster.js`
  - `/core/entities/message-queue-queue.js`
  - `/core/entities/base-entity.js` (base class)

## 4. Streaming to New Relic

### Main Streamer
- **Location**: `/simulation/streaming/new-relic-streamer.js`
- **Class**: `NewRelicStreamer`
- **Features**:
  - Event API streaming
  - Metric API streaming
  - Batching and rate limiting
  - Circuit breaker protection
  - Queue management

### HTTP Client
- **Location**: `/core/http/new-relic-client.js`
- **Class**: `NewRelicClient`
- **Handles**:
  - Event API requests
  - Metric API requests
  - NerdGraph queries
  - Rate limiting

## 5. Dashboard Generation

### Framework Components
- **Core Framework**: `/dashboards/framework/core/dashboard-framework.js`
  - Class: `DashboardFramework`
  - Template processing
  - Widget building
  - Layout optimization

- **Orchestrator**: `/dashboards/framework/core/orchestrator.js`
  - Dashboard build coordination
  - Deployment management

- **Layout Engine**: `/dashboards/framework/core/layout-engine.js`
  - Widget positioning
  - Responsive layouts

- **Query Builder**: `/dashboards/framework/core/query-builder.js`
  - NRQL query generation
  - Variable substitution

### Content Providers
- **Message Queues Provider**: `/dashboards/content/message-queues/message-queues-content-provider.js`
  - Templates for message queue dashboards
  - Visualization configurations
  - Domain-specific logic

### Dashboard API
- **NerdGraph Client**: `/dashboards/framework/utils/nerdgraph-client.js`
  - Dashboard creation
  - Dashboard updates
  - GraphQL operations

### Dashboard CLI
- **Location**: `/dashboards/cli/dashgen.js`
- **Features**:
  - Template selection
  - Variable configuration
  - Preview generation

## 6. Verification System

### Main Verifier
- **Location**: `/verification/engines/dashboard-verifier.js`
- **Class**: `DashboardVerifier`
- **Tests**:
  - Widget functionality
  - Performance benchmarks
  - Mobile compatibility
  - NRQL validation
  - Load testing
  - Accessibility

### Verification Runner
- **Location**: `/verification/runners/verification-runner.js`
- **Features**:
  - Batch verification
  - Report generation
  - Multi-format output

### Test Framework
- **Location**: `/verification/testing/test-framework.js`
- **Provides**:
  - Unit testing
  - Integration testing
  - Performance testing

## 7. Supporting Components

### Configuration Management
- **Config Manager**: `/core/config/config-manager.js`
  - Centralized configuration
  - Environment variable management
  - Validation

- **Config Validator**: `/core/config-validator.js`
  - Schema validation
  - Required field checking

### Error Handling
- **Circuit Breaker**: `/core/circuit-breaker.js`
  - Failure protection
  - Automatic recovery
  - State management

- **Error Recovery Manager**: `/core/error-recovery-manager.js`
  - Component monitoring
  - Recovery strategies
  - Health checks

### Logging & Monitoring
- **Logger**: `/core/utils/logger.js`
  - Structured logging
  - Color-coded output
  - Debug levels

- **Health Check Service**: `/core/health/health-check.js`
  - Component health monitoring
  - Status reporting

- **Prometheus Exporter**: `/core/metrics/prometheus-exporter.js`
  - Metrics export
  - Performance tracking

### Data Management
- **Relationship Manager**: `/core/relationships/relationship-manager.js`
  - Entity relationships
  - Hierarchy building

- **Data Model Extractor**: `/core/data-models/data-model-extractor.js`
  - Schema extraction
  - Documentation generation

- **Worker Pool**: `/core/workers/worker-pool.js`
  - Parallel processing
  - Task distribution

### API Server
- **Main Server**: `/api/server.js`
  - REST API endpoints
  - Health endpoints
  - Control endpoints

- **API Routers**:
  - `/api/health-router.js`
  - `/api/control-router.js`
  - `/api/data-router.js`

## Data Flow

1. **Infrastructure Mode**:
   ```
   InfraAgentCollector → NriKafkaTransformer → EntityFactory → NewRelicStreamer
   ```

2. **Simulation Mode**:
   ```
   DataSimulator → EntityFactory → NewRelicStreamer
   ```

3. **Hybrid Mode**:
   ```
   InfraAgentCollector + DataSimulator → HybridModeManager → EntityFactory → NewRelicStreamer
   ```

4. **Dashboard Generation**:
   ```
   ContentProvider → DashboardFramework → LayoutEngine → NerdGraphClient
   ```

5. **Verification**:
   ```
   DashboardVerifier → VerificationRunner → Report Generation
   ```

## Key Integration Points

1. **Entity Creation**: All modes use EntityFactory for consistent entity structure
2. **Streaming**: All entities flow through NewRelicStreamer for data transmission
3. **Configuration**: ConfigManager provides centralized configuration to all components
4. **Error Handling**: CircuitBreaker and ErrorRecoveryManager protect all external calls
5. **Monitoring**: Health checks and metrics are integrated throughout the platform

## Directory Structure Summary

```
/newrelic-message-queues-platform/
├── platform.js                    # Main orchestrator
├── core/                         # Core components
│   ├── entities/                 # Entity models
│   ├── config/                   # Configuration
│   ├── http/                     # HTTP clients
│   ├── workers/                  # Worker pools
│   └── utils/                    # Utilities
├── infrastructure/               # Infrastructure mode
│   ├── collectors/               # Data collectors
│   └── transformers/             # Data transformers
├── simulation/                   # Simulation mode
│   ├── engines/                  # Simulation engines
│   └── streaming/                # Streaming components
├── dashboards/                   # Dashboard generation
│   ├── framework/                # Core framework
│   ├── content/                  # Content providers
│   └── cli/                      # CLI tools
├── verification/                 # Verification system
│   ├── engines/                  # Test engines
│   └── runners/                  # Test runners
├── api/                         # API server
└── tools/                       # CLI and utilities
    └── cli/                     # Command-line interface
```

This mapping provides a complete overview of where each architectural component is implemented in the codebase, making it easy to navigate and understand the system's structure.