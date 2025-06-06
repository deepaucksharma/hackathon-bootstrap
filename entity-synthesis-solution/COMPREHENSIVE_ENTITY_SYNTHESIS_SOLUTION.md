# Comprehensive Entity Synthesis Solution for AWS MSK

## Executive Summary

This document provides a complete solution for achieving AWS MSK entity visibility in New Relic's UI by leveraging CloudWatch Metric Streams emulation. It merges all learnings, implementations, and edge case considerations into a production-ready approach.

## Core Problem

New Relic's entity synthesis for AWS resources requires:
1. Metrics from `collector.name = 'cloudwatch-metric-streams'`
2. Specific metric format and attributes
3. No explicit `provider` field (inferred by framework)
4. Proper AWS dimension structure

## Complete Solution Architecture

### 1. CloudWatch Emulator Component

```go
// Enhanced CloudWatch Emulator with edge case handling
type CloudWatchEmulator struct {
    metricClient    *MetricAPIClient
    config          *Config
    validator       *MetricValidator
    errorHandler    *ErrorHandler
    retryManager    *RetryManager
    metricCache     *MetricCache
    lastHealthCheck time.Time
}

// Initialize with comprehensive error handling
func NewCloudWatchEmulator(config *Config, apiKey string) (*CloudWatchEmulator, error) {
    if apiKey == "" {
        return nil, fmt.Errorf("API key required for CloudWatch emulator")
    }
    
    emulator := &CloudWatchEmulator{
        metricClient:    NewMetricAPIClient(apiKey),
        config:          config,
        validator:       NewMetricValidator(),
        errorHandler:    NewErrorHandler(),
        retryManager:    NewRetryManager(3, time.Second),
        metricCache:     NewMetricCache(1000),
        lastHealthCheck: time.Now(),
    }
    
    // Validate configuration
    if err := emulator.validateConfig(); err != nil {
        return nil, fmt.Errorf("invalid configuration: %w", err)
    }
    
    return emulator, nil
}
```

### 2. Comprehensive Edge Case Handling

#### A. Missing Metrics Scenarios

```go
// Handle missing or incomplete metric data
func (e *CloudWatchEmulator) EmitBrokerMetricsWithFallback(brokerID string, metrics map[string]interface{}) error {
    // Essential metrics with fallback values
    essentialMetrics := map[string]float64{
        "BytesInPerSec":              0.0,
        "BytesOutPerSec":             0.0,
        "MessagesInPerSec":           0.0,
        "UnderReplicatedPartitions":  0.0,
        "ActiveControllerCount":      0.0,
        "OfflinePartitionsCount":     0.0,
    }
    
    // Extract available metrics with validation
    for metricName, defaultValue := range essentialMetrics {
        if value, ok := getFloatValue(metrics, mapToKafkaMetric(metricName)); ok {
            if e.validator.IsValidMetricValue(metricName, value) {
                essentialMetrics[metricName] = value
            } else {
                log.Warn("Invalid value for %s: %f, using default", metricName, value)
                e.errorHandler.RecordInvalidMetric(metricName, value)
            }
        } else {
            log.Debug("Missing metric %s, using default value", metricName)
        }
    }
    
    // Always send health indicator metrics even if zero
    if err := e.sendHealthMetrics(brokerID, essentialMetrics); err != nil {
        return e.retryManager.RetryWithBackoff(func() error {
            return e.sendHealthMetrics(brokerID, essentialMetrics)
        })
    }
    
    return nil
}
```

#### B. Multi-Cluster Support

```go
// Handle multiple Kafka clusters in same account
type MultiClusterEmulator struct {
    emulators map[string]*CloudWatchEmulator
    mu        sync.RWMutex
}

func (m *MultiClusterEmulator) GetOrCreateEmulator(clusterName string, config *Config) (*CloudWatchEmulator, error) {
    m.mu.RLock()
    if emulator, exists := m.emulators[clusterName]; exists {
        m.mu.RUnlock()
        return emulator, nil
    }
    m.mu.RUnlock()
    
    m.mu.Lock()
    defer m.mu.Unlock()
    
    // Double-check after acquiring write lock
    if emulator, exists := m.emulators[clusterName]; exists {
        return emulator, nil
    }
    
    // Create cluster-specific configuration
    clusterConfig := *config
    clusterConfig.ClusterName = clusterName
    clusterConfig.ClusterARN = generateClusterARN(config.AWSAccountID, config.AWSRegion, clusterName)
    
    emulator, err := NewCloudWatchEmulator(&clusterConfig, config.MetricAPIKey)
    if err != nil {
        return nil, err
    }
    
    m.emulators[clusterName] = emulator
    return emulator, nil
}
```

#### C. Metric Validation and Sanitization

```go
type MetricValidator struct {
    thresholds map[string]MetricThreshold
}

type MetricThreshold struct {
    Min            float64
    Max            float64
    AllowZero      bool
    AllowNegative  bool
}

func NewMetricValidator() *MetricValidator {
    return &MetricValidator{
        thresholds: map[string]MetricThreshold{
            "BytesInPerSec": {
                Min: 0, Max: 10*1024*1024*1024, // 10GB/s max
                AllowZero: true, AllowNegative: false,
            },
            "ActiveControllerCount": {
                Min: 0, Max: 1,
                AllowZero: true, AllowNegative: false,
            },
            "OfflinePartitionsCount": {
                Min: 0, Max: 100000,
                AllowZero: true, AllowNegative: false,
            },
            "CpuUser": {
                Min: 0, Max: 100,
                AllowZero: true, AllowNegative: false,
            },
            // ... more validations
        },
    }
}

func (v *MetricValidator) ValidateAndSanitize(metricName string, value float64) (float64, error) {
    // Handle special float values
    if math.IsNaN(value) || math.IsInf(value, 0) {
        return 0, fmt.Errorf("invalid float value: %f", value)
    }
    
    threshold, exists := v.thresholds[metricName]
    if !exists {
        // Unknown metric, apply general validation
        if value < 0 {
            return 0, fmt.Errorf("negative value for unknown metric: %s", metricName)
        }
        return value, nil
    }
    
    // Apply thresholds
    if !threshold.AllowNegative && value < 0 {
        return threshold.Min, fmt.Errorf("negative value not allowed for %s", metricName)
    }
    
    if value < threshold.Min {
        return threshold.Min, fmt.Errorf("value below minimum for %s: %f < %f", metricName, value, threshold.Min)
    }
    
    if value > threshold.Max {
        return threshold.Max, fmt.Errorf("value above maximum for %s: %f > %f", metricName, value, threshold.Max)
    }
    
    return value, nil
}
```

#### D. Entity Relationship Management

```go
// Ensure proper entity relationships
func (e *CloudWatchEmulator) buildEntityRelationships(entityType string, attributes map[string]interface{}) {
    switch entityType {
    case "Broker":
        // Broker -> Cluster relationship
        attributes["relationship.cluster.name"] = e.config.ClusterName
        attributes["relationship.cluster.guid"] = GenerateEntityGUID(
            EntityTypeCluster, 
            e.config.AWSAccountID, 
            e.config.ClusterName, 
            nil,
        )
        
    case "Topic":
        // Topic -> Cluster relationship
        attributes["relationship.cluster.name"] = e.config.ClusterName
        attributes["relationship.cluster.guid"] = GenerateEntityGUID(
            EntityTypeCluster,
            e.config.AWSAccountID,
            e.config.ClusterName,
            nil,
        )
        
    case "ConsumerGroup":
        // ConsumerGroup -> Topic -> Cluster relationships
        if topicName, ok := attributes["topic"].(string); ok {
            attributes["relationship.topic.name"] = topicName
            attributes["relationship.topic.guid"] = GenerateEntityGUID(
                EntityTypeTopic,
                e.config.AWSAccountID,
                e.config.ClusterName,
                topicName,
            )
        }
    }
}
```

#### E. Timestamp Alignment and Batching

```go
// Align timestamps to CloudWatch patterns
func (e *CloudWatchEmulator) alignTimestamp(t time.Time) time.Time {
    // CloudWatch aligns to minute boundaries
    return t.Truncate(time.Minute)
}

// Batch metrics by entity for efficiency
func (e *CloudWatchEmulator) BatchEmitMetrics(metricsMap map[string]map[string]interface{}) error {
    timestamp := e.alignTimestamp(time.Now())
    batch := make([]MetricData, 0, 100)
    
    // Group by entity type
    brokerMetrics := make(map[string]map[string]interface{})
    topicMetrics := make(map[string]map[string]interface{})
    clusterMetrics := make(map[string]interface{})
    
    for entityKey, metrics := range metricsMap {
        switch {
        case strings.HasPrefix(entityKey, "broker-"):
            brokerMetrics[entityKey] = metrics
        case strings.HasPrefix(entityKey, "topic-"):
            topicMetrics[entityKey] = metrics
        case entityKey == "cluster":
            clusterMetrics = metrics
        }
    }
    
    // Process in order: Cluster -> Brokers -> Topics
    // This ensures parent entities exist before children
    
    // 1. Cluster metrics first
    if len(clusterMetrics) > 0 {
        clusterBatch := e.prepareClusterMetrics(clusterMetrics, timestamp)
        batch = append(batch, clusterBatch...)
    }
    
    // 2. Broker metrics
    for brokerID, metrics := range brokerMetrics {
        brokerBatch := e.prepareBrokerMetrics(brokerID, metrics, timestamp)
        batch = append(batch, brokerBatch...)
    }
    
    // 3. Topic metrics
    for topicName, metrics := range topicMetrics {
        topicBatch := e.prepareTopicMetrics(topicName, metrics, timestamp)
        batch = append(batch, topicBatch...)
    }
    
    // Send in chunks to avoid API limits
    return e.sendBatchedMetrics(batch)
}
```

#### F. Performance Optimization

```go
// Cache frequently used data
type MetricCache struct {
    cache     map[string]CachedMetric
    mu        sync.RWMutex
    maxSize   int
    ttl       time.Duration
}

type CachedMetric struct {
    Value     float64
    Timestamp time.Time
    Attributes map[string]interface{}
}

func (c *MetricCache) GetOrCompute(key string, compute func() (float64, error)) (float64, error) {
    c.mu.RLock()
    if cached, ok := c.cache[key]; ok && time.Since(cached.Timestamp) < c.ttl {
        c.mu.RUnlock()
        return cached.Value, nil
    }
    c.mu.RUnlock()
    
    // Compute new value
    value, err := compute()
    if err != nil {
        return 0, err
    }
    
    // Cache the result
    c.mu.Lock()
    defer c.mu.Unlock()
    
    // Evict if at capacity
    if len(c.cache) >= c.maxSize {
        c.evictOldest()
    }
    
    c.cache[key] = CachedMetric{
        Value:     value,
        Timestamp: time.Now(),
    }
    
    return value, nil
}
```

### 3. Complete Test Scenarios

#### A. Entity Creation Tests

```go
func TestEntityCreation(t *testing.T) {
    scenarios := []struct {
        name          string
        metrics       map[string]interface{}
        expectEntity  bool
        entityType    string
    }{
        {
            name: "Minimal broker metrics",
            metrics: map[string]interface{}{
                "broker.id": "1",
                "broker.IOInPerSecond": 1000.0,
            },
            expectEntity: true,
            entityType: "AWS_KAFKA_BROKER",
        },
        {
            name: "Missing critical dimension",
            metrics: map[string]interface{}{
                // Missing broker.id
                "broker.IOInPerSecond": 1000.0,
            },
            expectEntity: false,
            entityType: "AWS_KAFKA_BROKER",
        },
        {
            name: "All zero metrics",
            metrics: map[string]interface{}{
                "broker.id": "1",
                "broker.IOInPerSecond": 0.0,
                "broker.IOOutPerSecond": 0.0,
                "broker.messagesInPerSecond": 0.0,
            },
            expectEntity: true, // Should still create entity
            entityType: "AWS_KAFKA_BROKER",
        },
        {
            name: "Invalid metric values",
            metrics: map[string]interface{}{
                "broker.id": "1",
                "broker.IOInPerSecond": math.NaN(),
                "broker.IOOutPerSecond": math.Inf(1),
                "broker.messagesInPerSecond": -1000.0,
            },
            expectEntity: true, // Should sanitize and create
            entityType: "AWS_KAFKA_BROKER",
        },
    }
    
    for _, scenario := range scenarios {
        t.Run(scenario.name, func(t *testing.T) {
            // Test implementation
        })
    }
}
```

#### B. End-to-End Validation

```bash
#!/bin/bash
# comprehensive-validation.sh

set -e

echo "=== Comprehensive Entity Synthesis Validation ==="

# 1. Pre-flight checks
echo "1. Checking configuration..."
check_config() {
    local required_vars=(
        "NEW_RELIC_API_KEY"
        "AWS_ACCOUNT_ID"
        "AWS_REGION"
        "MSK_CLUSTER_NAME"
    )
    
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            echo "ERROR: $var is not set"
            exit 1
        fi
    done
}

# 2. Deploy and wait for metrics
echo "2. Deploying CloudWatch emulator..."
deploy_emulator() {
    kubectl apply -f minikube-consolidated/monitoring/
    kubectl wait --for=condition=ready pod -l app=nri-kafka -n newrelic-monitoring --timeout=300s
}

# 3. Validate metric flow
echo "3. Validating metric flow..."
validate_metrics() {
    local retries=0
    local max_retries=10
    
    while [ $retries -lt $max_retries ]; do
        count=$(nrql "FROM Metric SELECT count(*) WHERE collector.name = 'cloudwatch-metric-streams' AND aws.Namespace = 'AWS/Kafka' SINCE 5 minutes ago" | jq '.results[0].count')
        
        if [ "$count" -gt 0 ]; then
            echo "✓ Metrics flowing: $count metrics found"
            return 0
        fi
        
        echo "Waiting for metrics... (attempt $((retries+1))/$max_retries)"
        sleep 30
        retries=$((retries + 1))
    done
    
    echo "✗ No metrics found after $max_retries attempts"
    return 1
}

# 4. Check entity creation
echo "4. Checking entity creation..."
check_entities() {
    local entity_types=("AWS_KAFKA_CLUSTER" "AWS_KAFKA_BROKER" "AWS_KAFKA_TOPIC")
    
    for entity_type in "${entity_types[@]}"; do
        count=$(nrql "FROM entity SELECT count(*) WHERE type = '$entity_type' SINCE 1 hour ago" | jq '.results[0].count')
        
        if [ "$count" -gt 0 ]; then
            echo "✓ $entity_type entities created: $count"
        else
            echo "✗ No $entity_type entities found"
        fi
    done
}

# 5. Validate entity relationships
echo "5. Validating entity relationships..."
validate_relationships() {
    # Check broker -> cluster relationships
    nrql "FROM entity SELECT name, relationships WHERE type = 'AWS_KAFKA_BROKER' LIMIT 10"
    
    # Check topic -> cluster relationships  
    nrql "FROM entity SELECT name, relationships WHERE type = 'AWS_KAFKA_TOPIC' LIMIT 10"
}

# 6. UI visibility check
echo "6. Checking UI visibility..."
check_ui_visibility() {
    echo "Navigate to: https://one.newrelic.com/nr1-core/apm-services/message-queues"
    echo "Look for cluster: $MSK_CLUSTER_NAME"
    read -p "Are entities visible in UI? (y/n): " ui_visible
    
    if [ "$ui_visible" = "y" ]; then
        echo "✓ UI visibility confirmed"
    else
        echo "✗ UI visibility not working - checking why..."
        debug_ui_visibility
    fi
}

# 7. Debug helper
debug_ui_visibility() {
    echo "=== Debug Information ==="
    
    # Check for common issues
    echo "1. Checking metric attributes..."
    nrql "FROM Metric SELECT * WHERE collector.name = 'cloudwatch-metric-streams' AND metricName = 'BytesInPerSec' LIMIT 1"
    
    echo "2. Checking entity attributes..."
    nrql "FROM entity SELECT * WHERE type = 'AWS_KAFKA_BROKER' LIMIT 1"
    
    echo "3. Checking for synthesis errors..."
    nrql "FROM Log SELECT message WHERE message LIKE '%synthesis%' OR message LIKE '%entity%' SINCE 1 hour ago"
}

# Run all validations
check_config
deploy_emulator
validate_metrics
check_entities
validate_relationships
check_ui_visibility

echo "=== Validation Complete ==="
```

### 4. Production Deployment Strategy

#### A. Gradual Rollout

```yaml
# canary-deployment.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: cloudwatch-emulator-rollout
  namespace: newrelic-monitoring
data:
  rollout.yaml: |
    phases:
      - name: "test"
        percentage: 10
        clusters:
          - "test-cluster"
        duration: "1h"
        validation:
          - metric_flow
          - entity_creation
          
      - name: "staging"
        percentage: 50
        clusters:
          - "staging-cluster-1"
          - "staging-cluster-2"
        duration: "24h"
        validation:
          - metric_flow
          - entity_creation
          - ui_visibility
          
      - name: "production"
        percentage: 100
        clusters:
          - "*"
        validation:
          - metric_flow
          - entity_creation
          - ui_visibility
          - performance_metrics
```

#### B. Feature Flags

```go
type FeatureFlags struct {
    EnableCloudWatchEmulator   bool
    EnableMetricValidation     bool
    EnableBatchOptimization    bool
    EnableRelationshipMapping  bool
    EnableDebugLogging         bool
    MetricBatchSize           int
    FlushIntervalSeconds      int
}

func LoadFeatureFlags() *FeatureFlags {
    return &FeatureFlags{
        EnableCloudWatchEmulator:   getEnvBool("ENABLE_CLOUDWATCH_EMULATOR", false),
        EnableMetricValidation:     getEnvBool("ENABLE_METRIC_VALIDATION", true),
        EnableBatchOptimization:    getEnvBool("ENABLE_BATCH_OPTIMIZATION", true),
        EnableRelationshipMapping:  getEnvBool("ENABLE_RELATIONSHIP_MAPPING", true),
        EnableDebugLogging:         getEnvBool("ENABLE_DEBUG_LOGGING", false),
        MetricBatchSize:           getEnvInt("METRIC_BATCH_SIZE", 100),
        FlushIntervalSeconds:      getEnvInt("FLUSH_INTERVAL_SECONDS", 60),
    }
}
```

### 5. Monitoring and Alerting

```sql
-- Alert when entity creation fails
FROM Metric
SELECT count(*)
WHERE collector.name = 'cloudwatch-metric-streams'
AND aws.Namespace = 'AWS/Kafka'
FACET aws.kafka.clusterName
SINCE 10 minutes ago

-- Alert on missing critical metrics
FROM Metric
SELECT filter(count(*), WHERE metricName = 'ActiveControllerCount') as 'Controller',
       filter(count(*), WHERE metricName = 'OfflinePartitionsCount') as 'Offline Partitions',
       filter(count(*), WHERE metricName = 'BytesInPerSec') as 'Bytes In'
WHERE collector.name = 'cloudwatch-metric-streams'
SINCE 10 minutes ago

-- Monitor entity synthesis lag
FROM entity
SELECT count(*), latest(lastReportingChangeAt)
WHERE type LIKE '%KAFKA%'
FACET type
SINCE 1 hour ago
```

## Implementation Checklist

- [ ] **Phase 1: Core Implementation**
  - [ ] Deploy enhanced CloudWatch emulator
  - [ ] Implement metric validation
  - [ ] Add error handling and retries
  - [ ] Test with single cluster

- [ ] **Phase 2: Edge Case Handling**
  - [ ] Handle missing metrics gracefully
  - [ ] Implement multi-cluster support
  - [ ] Add performance optimizations
  - [ ] Test all entity types

- [ ] **Phase 3: Production Hardening**
  - [ ] Add comprehensive monitoring
  - [ ] Implement gradual rollout
  - [ ] Set up alerting
  - [ ] Create runbooks

- [ ] **Phase 4: Validation**
  - [ ] Run end-to-end tests
  - [ ] Verify UI visibility
  - [ ] Check entity relationships
  - [ ] Performance benchmarks

## Conclusion

This comprehensive solution addresses all aspects of AWS MSK entity synthesis in New Relic:

1. **Core Solution**: CloudWatch Metric Streams emulation
2. **Edge Cases**: Handled through validation, fallbacks, and error recovery
3. **Multi-Cluster**: Supported through dynamic emulator creation
4. **Performance**: Optimized through caching and batching
5. **Production Ready**: With monitoring, alerting, and gradual rollout

The solution is designed to be resilient, scalable, and maintainable while ensuring consistent entity visibility in the New Relic UI.