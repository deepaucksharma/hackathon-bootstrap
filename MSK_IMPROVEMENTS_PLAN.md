# MSK Shim Improvements Plan

Based on the verification results showing null/zero metrics and missing data, here are all the improvements needed in `src/msk/` to make the integration pass verification.

## 1. Fix Metric Name Mappings

### Current Issues:
- Metric names in `transformer_simple.go` don't match actual JMX metrics
- Many metrics map to wrong AWS MSK metrics (e.g., IOInPerSecond → NetworkRxDropped)
- Missing critical mappings for throughput metrics

### Required Changes in `transformer_simple.go`:

```go
// Fix broker metric mappings
brokerMetrics := map[string]string{
    // Throughput metrics - CRITICAL
    "broker.IOInPerSecond":          "aws.msk.BytesInPerSec",
    "broker.IOOutPerSecond":         "aws.msk.BytesOutPerSec", 
    "broker.messagesInPerSecond":    "aws.msk.MessagesInPerSec",
    
    // Fetch/Produce metrics
    "broker.totalFetchRequestsPerSecond":   "aws.msk.FetchMessageConversionsPerSec",
    "broker.totalProduceRequestsPerSecond": "aws.msk.ProduceMessageConversionsPerSec",
    
    // Replication metrics
    "replication.unreplicatedPartitions":    "aws.msk.UnderReplicatedPartitions",
    "replication.isrShrinksPerSecond":      "aws.msk.IsrShrinksPerSec",
    "replication.isrExpandsPerSecond":      "aws.msk.IsrExpandsPerSec",
    
    // Request metrics
    "request.avgTimeFetch":                 "aws.msk.FetchRequestPct",
    "request.avgTimeProduceRequest":        "aws.msk.ProduceRequestPct",
    "request.produceTime99Percentile":      "aws.msk.ProduceTotalTimeMs99thPercentile",
    "request.fetchTime99Percentile":        "aws.msk.FetchConsumerTotalTimeMs99thPercentile",
}
```

## 2. Add Missing Entity Attributes

### Current Issues:
- `broker_host` is null in all samples
- `brokerId` not properly set in MSK samples
- Missing provider attributes

### Required Changes:

```go
// In transformBrokerMetrics() add:
func (t *Transformer) transformBrokerMetrics(metric metric.Metric, ms *metric.Set) {
    // Add broker_host attribute
    if brokerHost, ok := metric.Attributes["broker_host"]; ok {
        ms.SetMetric("broker_host", brokerHost, metric.SourceType)
        ms.SetMetric("provider.brokerHost", brokerHost, metric.SourceType)
    }
    
    // Extract and set brokerId properly
    if entityName, ok := metric.Attributes["entityName"].(string); ok {
        // Extract broker ID from entityName (e.g., "broker:1" → "1")
        parts := strings.Split(entityName, ":")
        if len(parts) > 1 {
            brokerId := parts[1]
            ms.SetMetric("brokerId", brokerId, metric.SourceType)
            ms.SetMetric("provider.brokerId", brokerId, metric.SourceType)
        }
    }
}
```

## 3. Fix Topic Collection

### Current Issues:
- Topic count is 0
- Topic metrics not being transformed
- AwsMskTopicSample not created

### Required Changes:

```go
// In shim.go, add topic processing:
func (h *MSKShim) ProcessTopicData(topicSample *metric.Set, entity *integration.Entity) error {
    if !h.Enabled {
        return nil
    }
    
    // Create MSK topic entity
    topicEntity, err := entity.NewRelatedEntity("AWSMSKTOPIC", topicSample.Metrics["topic"].(string))
    if err != nil {
        return err
    }
    
    // Transform topic metrics
    mskTopicSample := topicEntity.NewMetricSet("AwsMskTopicSample")
    
    // Copy essential attributes
    mskTopicSample.SetMetric("provider.topic", topicSample.Metrics["topic"], metric.ATTRIBUTE)
    mskTopicSample.SetMetric("displayName", topicSample.Metrics["topic"], metric.ATTRIBUTE)
    mskTopicSample.SetMetric("topicName", topicSample.Metrics["topic"], metric.ATTRIBUTE)
    mskTopicSample.SetMetric("provider.clusterName", h.ClusterName, metric.ATTRIBUTE)
    
    // Transform metrics
    if bytesIn, ok := topicSample.Metrics["topic.bytesInPerSecond"]; ok {
        mskTopicSample.SetMetric("provider.bytesInPerSec.Sum", bytesIn, metric.GAUGE)
    }
    if bytesOut, ok := topicSample.Metrics["topic.bytesOutPerSecond"]; ok {
        mskTopicSample.SetMetric("provider.bytesOutPerSec.Sum", bytesOut, metric.GAUGE)
    }
    
    return nil
}
```

## 4. Fix Consumer Offset Integration

### Current Issues:
- Consumer offset samples not being processed by MSK shim
- No consumer lag data in MSK format

### Required Changes:

```go
// In kafka.go, add MSK processing for consumer offsets:
if args.MSKShimEnabled && mskHook != nil {
    for _, offsetSample := range offsetSamples {
        if err := mskHook.ProcessConsumerOffset(offsetSample, entity); err != nil {
            log.Error("Failed to process consumer offset for MSK: %v", err)
        }
    }
}

// In shim.go, implement ProcessConsumerOffset:
func (h *MSKShim) ProcessConsumerOffset(offsetSample *metric.Set, entity *integration.Entity) error {
    // Add consumer lag to topic metrics
    topicName := offsetSample.Metrics["topic"].(string)
    consumerGroup := offsetSample.Metrics["consumerGroup"].(string)
    lag := offsetSample.Metrics["consumer.lag"]
    
    // Update aggregator with consumer lag data
    h.aggregator.AddConsumerLag(h.ClusterName, topicName, consumerGroup, lag)
    
    return nil
}
```

## 5. Fix Metric Value Population

### Current Issues:
- All MSK metrics showing null values
- Metrics not being properly copied from source

### Required Changes:

```go
// In transformer_simple.go, fix metric copying:
func (t *Transformer) CopyMetricValue(from, to string, inputMetrics map[string]interface{}, outputSet *metric.Set) {
    if value, ok := inputMetrics[from]; ok && value != nil {
        // Ensure numeric values are properly typed
        switch v := value.(type) {
        case float64:
            outputSet.SetMetric(to, v, metric.GAUGE)
        case int64:
            outputSet.SetMetric(to, float64(v), metric.GAUGE)
        case int:
            outputSet.SetMetric(to, float64(v), metric.GAUGE)
        default:
            // Try to convert string to float
            if str, ok := value.(string); ok {
                if f, err := strconv.ParseFloat(str, 64); err == nil {
                    outputSet.SetMetric(to, f, metric.GAUGE)
                }
            }
        }
    }
}
```

## 6. Fix Aggregator Logic

### Current Issues:
- Broker count not tracked properly
- Topic count always 0
- Metrics not aggregated correctly

### Required Changes:

```go
// In aggregator.go:
func (a *Aggregator) AddBroker(clusterName string, brokerId string, metrics map[string]interface{}) {
    a.mu.Lock()
    defer a.mu.Unlock()
    
    cluster := a.getOrCreateCluster(clusterName)
    
    // Track unique brokers
    cluster.BrokerIds[brokerId] = true
    
    // Aggregate metrics properly
    for key, value := range metrics {
        if numVal, ok := toFloat64(value); ok {
            cluster.Metrics[key] = cluster.Metrics[key].(float64) + numVal
        }
    }
}

func (a *Aggregator) AddTopic(clusterName string, topicName string, metrics map[string]interface{}) {
    a.mu.Lock()
    defer a.mu.Unlock()
    
    cluster := a.getOrCreateCluster(clusterName)
    
    // Track unique topics
    cluster.Topics[topicName] = true
    
    // Store topic metrics
    cluster.TopicMetrics[topicName] = metrics
}
```

## 7. Add Proper Integration Hooks

### Current Issues:
- MSK shim not called for all data types
- Missing integration points in main collection flow

### Required Changes in `kafka.go`:

```go
// Ensure MSK hook is called for all collection types:

// After broker collection:
if mskHook != nil {
    for _, brokerSample := range brokerSamples {
        mskHook.ProcessBrokerMetrics(brokerSample, entity)
    }
}

// After topic collection:
if mskHook != nil && topicInventory != nil {
    for _, topic := range topicInventory {
        mskHook.ProcessTopicData(topic, entity)
    }
}

// After consumer offset collection:
if mskHook != nil {
    for _, offsetSample := range offsetSamples {
        mskHook.ProcessConsumerOffset(offsetSample, entity)
    }
}
```

## 8. Add Debug Logging

### Required Changes:

```go
// Add debug logging to trace metric transformation:
func (t *Transformer) TransformBrokerMetrics(inputMetrics map[string]interface{}, outputSet *metric.Set) {
    log.Debug("Transforming broker metrics: %v", inputMetrics)
    
    for sourceMetric, targetMetric := range t.brokerMetricMappings {
        if value, ok := inputMetrics[sourceMetric]; ok {
            log.Debug("Mapping %s (value: %v) to %s", sourceMetric, value, targetMetric)
            outputSet.SetMetric(targetMetric, value, metric.GAUGE)
        } else {
            log.Debug("Source metric %s not found in input", sourceMetric)
        }
    }
}
```

## 9. Fix Entity Naming

### Current Issues:
- Entity names not consistent with AWS MSK format
- Missing entity GUIDs

### Required Changes:

```go
// In shim.go:
func (h *MSKShim) createClusterEntity(entity *integration.Entity) (*integration.Entity, error) {
    // Use consistent naming format
    clusterEntityName := fmt.Sprintf("%s:%s:%s", h.AWSAccountID, h.AWSRegion, h.ClusterName)
    
    clusterEntity, err := entity.NewRelatedEntity("AWSMSKCLUSTER", clusterEntityName)
    if err != nil {
        return nil, err
    }
    
    // Set all required attributes
    clusterEntity.SetMetric("entityName", clusterEntityName, metric.ATTRIBUTE)
    clusterEntity.SetMetric("aws.accountId", h.AWSAccountID, metric.ATTRIBUTE)
    clusterEntity.SetMetric("aws.region", h.AWSRegion, metric.ATTRIBUTE)
    
    return clusterEntity, nil
}
```

## 10. Add Validation

### Required Changes:

```go
// Add validation to ensure required fields are present:
func (h *MSKShim) validateConfiguration() error {
    if h.ClusterName == "" {
        return fmt.Errorf("MSK_SHIM: ClusterName is required")
    }
    if h.AWSAccountID == "" {
        return fmt.Errorf("MSK_SHIM: AWS_ACCOUNT_ID is required")
    }
    if h.AWSRegion == "" {
        return fmt.Errorf("MSK_SHIM: AWS_REGION is required")
    }
    return nil
}
```

## Implementation Priority

1. **Fix metric name mappings** (Critical - causes null values)
2. **Add broker_host attribute** (Critical - missing in all samples)
3. **Fix topic collection integration** (Critical - no topics collected)
4. **Fix metric value population** (Critical - all values null/zero)
5. **Add consumer offset integration** (Important - no lag data)
6. **Fix aggregator logic** (Important - counts incorrect)
7. **Add debug logging** (Helpful for troubleshooting)
8. **Fix entity naming** (Nice to have - consistency)
9. **Add validation** (Nice to have - better errors)

## Expected Results After Implementation

After these improvements, verification should show:
- ✅ broker_host populated in all samples
- ✅ Topic count > 0
- ✅ Non-null MSK metric values
- ✅ Consumer lag data available
- ✅ Proper entity relationships
- ✅ Correct metric aggregation
- ✅ All MSK entities created with proper attributes