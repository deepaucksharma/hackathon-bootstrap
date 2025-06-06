# Key Code Snippets

## 1. The Problem: SDK Override

### What We Tried (Didn't Work)
```go
// src/msk/simple_transformer.go
ms := entity.NewMetricSet("AwsMskBrokerSample",
    attribute.Attribute{Key: "provider", Value: "AwsMsk"}, // ❌ Gets overridden
    attribute.Attribute{Key: "entity.type", Value: "AWS_KAFKA_BROKER"}, // ❌ Doesn't make it through
)
```

### What Actually Happened
```json
{
  "event_type": "AwsMskBrokerSample",
  "provider": "AwsMskBroker",  // SDK extracted from event_type
  // entity.type missing entirely
}
```

## 2. The Solution: CloudWatch Emulator

### Building CloudWatch Attributes
```go
// src/msk/cloudwatch_emulator.go
func (e *CloudWatchEmulator) buildCloudWatchAttributes(dimensionType string, dimensionValue string) map[string]interface{} {
    attrs := map[string]interface{}{
        // Critical: Must identify as CloudWatch
        "collector.name":           "cloudwatch-metric-streams",
        "eventType":               "Metric",
        "instrumentation.provider": "cloudwatch",
        
        // AWS namespace
        "aws.Namespace": "AWS/Kafka",
        
        // AWS account info
        "aws.accountId": e.config.AWSAccountID,
        "aws.region":    e.config.AWSRegion,
        
        // MSK specific attributes
        "aws.kafka.clusterName": e.config.ClusterName,
    }
    
    // Add dimension-specific attributes
    switch dimensionType {
    case "Broker":
        attrs["aws.kafka.brokerId"] = dimensionValue
        attrs["entity.type"] = "AWS_KAFKA_BROKER"
        attrs["entity.guid"] = GenerateEntityGUID(...)
    }
    
    return attrs
}
```

### Sending CloudWatch Metrics
```go
func (e *CloudWatchEmulator) sendCloudWatchMetric(metricName string, value float64, attributes map[string]interface{}) error {
    // CloudWatch sends metrics with specific naming
    fullMetricName := metricName // No prefix for CloudWatch
    
    // Add CloudWatch-specific attributes
    attributes["aws.MetricName"] = metricName
    attributes["metricName"] = fullMetricName
    
    // Send as dimensional metric
    return e.metricClient.SendGaugeMetric(fullMetricName, value, attributes)
}
```

## 3. Integration with MSK Shim

### Initialization
```go
// src/msk/shim.go
func (s *MSKShim) SetIntegration(i *integration.Integration) {
    s.mu.Lock()
    defer s.mu.Unlock()
    s.integration = i
    
    // Initialize CloudWatch emulator if enabled
    if s.config.UseCloudWatchFormat && s.config.MetricAPIKey != "" {
        s.cloudwatchEmulator = NewCloudWatchEmulator(&s.config, s.config.MetricAPIKey)
        log.Info("CloudWatch emulator initialized for entity synthesis")
    }
}
```

### Broker Metrics Transformation
```go
// src/msk/simple_transformer.go
func (s *MSKShim) SimpleTransformBrokerMetrics(brokerData map[string]interface{}) error {
    // ... standard transformation ...
    
    // Send metrics via CloudWatch emulator if available
    if s.cloudwatchEmulator != nil {
        if err := s.cloudwatchEmulator.EmitBrokerMetrics(brokerIDStr, brokerData); err != nil {
            log.Error("Failed to emit CloudWatch metrics for broker: %v", err)
        }
    }
    
    return nil
}
```

## 4. Configuration

### Environment Variables
```go
// src/msk/config.go
config := &Config{
    // ... other config ...
    EnableDimensionalMetrics: os.Getenv("MSK_USE_DIMENSIONAL") == "true" || 
                             os.Getenv("MSK_USE_CLOUDWATCH_FORMAT") == "true",
    MetricAPIKey:            apiKey,
    UseCloudWatchFormat:     os.Getenv("MSK_USE_CLOUDWATCH_FORMAT") == "true",
}
```

### Kubernetes ConfigMap
```yaml
env:
  MSK_SHIM_ENABLED: "true"
  AWS_ACCOUNT_ID: "123456789012"
  AWS_REGION: "us-east-1"
  MSK_USE_DIMENSIONAL: "true"
  MSK_USE_CLOUDWATCH_FORMAT: "true"  # ← Enable CloudWatch emulator
```

## 5. Metric API Client

### Sending Dimensional Metrics
```go
// src/msk/metric_api_client.go
func (c *MetricAPIClient) SendGaugeMetric(name string, value float64, attributes map[string]interface{}) error {
    metric := map[string]interface{}{
        "name":       name,
        "type":       "gauge",
        "value":      value,
        "timestamp":  time.Now().Unix() * 1000,
        "attributes": attributes,
    }
    
    // Add to batch
    c.metrics = append(c.metrics, metric)
    
    // Flush if batch is full
    if len(c.metrics) >= c.batchSize {
        return c.Flush()
    }
    
    return nil
}
```

## 6. The Magic: Entity Synthesis

### What Happens in New Relic Backend
```
1. Metrics arrive with collector.name = "cloudwatch-metric-streams"
2. Entity synthesis recognizes CloudWatch pattern
3. Creates entity with:
   - type: Derived from aws.Namespace + dimensions
   - guid: Generated from account + region + resource
   - name: Extracted from dimensions
4. Entity appears in UI
```

### Query to Verify
```sql
-- Check for CloudWatch format metrics
FROM Metric 
SELECT count(*) 
WHERE collector.name = 'cloudwatch-metric-streams' 
AND aws.Namespace = 'AWS/Kafka'
SINCE 5 minutes ago

-- Check for entities
FROM AwsMskBrokerSample 
SELECT latest(entity.guid), latest(provider) 
SINCE 5 minutes ago
```

## 7. Testing Script

### Automated Verification
```bash
#!/bin/bash
# test-cloudwatch-format.sh

# Enable CloudWatch format
export MSK_USE_CLOUDWATCH_FORMAT=true
export MSK_USE_DIMENSIONAL=true

# Build and deploy
go build -o nri-kafka ./src
docker build -t custom-nri-kafka:latest .
kubectl apply -f minikube-consolidated/monitoring/

# Check results
kubectl logs -n newrelic $(kubectl get pods -n newrelic | grep nri-kafka | awk '{print $1}') | \
  grep "CloudWatch emulator"
```

## Key Takeaways

1. **Don't fight the SDK** - Use alternative paths when blocked
2. **Mimic successful patterns** - CloudWatch Metric Streams works, so copy it
3. **Entity synthesis is complex** - Different paths have different rules
4. **Testing is crucial** - Verify each step of the transformation