# Custom Metrics Definition Guide

This guide explains how to define, implement, and use custom metrics in the New Relic Message Queues Platform.

## Overview

Custom metrics allow you to:
- Define business-specific metrics beyond standard infrastructure metrics
- Create composite metrics from multiple data sources
- Implement custom calculations and aggregations
- Add provider-specific or domain-specific metrics
- Build SLA and compliance metrics

## Quick Start

### 1. Create a Custom Metric File

Create a YAML file in the `custom-metrics/` directory:

```yaml
# custom-metrics/my-metrics.yaml
message_processing_efficiency:
  description: "Ratio of successfully processed messages"
  unit: "percentage"
  type: "gauge"
  entityTypes: ["MESSAGE_QUEUE_TOPIC"]
  provider: "calculation"
  formula: "(context.topic.successCount / context.topic.totalCount) * 100"
  validation:
    min: 0
    max: 100
  tags:
    category: "performance"
    sla: true
```

### 2. Start Platform with Custom Metrics

```bash
# Custom metrics are auto-loaded from custom-metrics/ directory
node platform.js --mode simulation

# Or specify a custom path
node platform.js --mode simulation --custom-metric-path ./my-metrics
```

### 3. Access Custom Metrics

Custom metrics are automatically collected and streamed alongside standard metrics.

## Metric Definition Structure

### Basic Structure

```yaml
metric_name:
  description: "Human-readable description"
  unit: "unit_of_measurement"
  type: "gauge|counter|histogram|summary"
  entityTypes: ["MESSAGE_QUEUE_BROKER", "MESSAGE_QUEUE_TOPIC"]
  validation:
    min: 0
    max: 100
    required: true
  tags:
    category: "performance"
    custom_tag: "value"
```

### Available Fields

| Field | Required | Description | Options |
|-------|----------|-------------|---------|
| `description` | Yes | Metric description | String |
| `unit` | Yes | Unit of measurement | Any string (e.g., "percentage", "bytes/sec", "count") |
| `type` | Yes | Metric type | `gauge`, `counter`, `histogram`, `summary` |
| `entityTypes` | No | Entity types this metric applies to | Array of entity types |
| `provider` | No | Metric provider type | `calculation`, `composite`, `threshold` |
| `validation` | No | Validation rules | Object with `min`, `max`, `required` |
| `tags` | No | Metric tags for filtering | Key-value pairs |
| `dimensions` | No | Metric dimensions | Array of dimension names |

## Metric Providers

### 1. Calculation Provider

Executes a formula to calculate metric value:

```yaml
cpu_efficiency:
  provider: "calculation"
  formula: "(100 - context.broker.cpuUsage) / 100"
```

#### Supported Formula Syntax
- Basic math: `+`, `-`, `*`, `/`, `()`
- Context variables: `context.broker.cpuUsage`
- Numbers and decimals: `100`, `3.14`

#### Complex Calculations

```yaml
weighted_health_score:
  provider: "calculation"
  formula: |
    const cpu = context.broker.cpuUsage || 0;
    const memory = context.broker.memoryUsage || 0;
    const lag = context.broker.consumerLag || 0;
    return 100 - (cpu * 0.4 + memory * 0.3 + lag * 0.3);
```

### 2. Composite Provider

Combines multiple metrics into one:

```yaml
infrastructure_saturation:
  provider: "composite"
  sources:
    - name: "cpu"
      path: "broker.cpuUsage"
      weight: 0.35
    - name: "memory"
      path: "broker.memoryUsage"
      weight: 0.35
    - name: "network"
      path: "broker.networkUsage"
      weight: 0.30
  combine: |
    return sources.reduce((total, source) => {
      return total + (values[source.name] || 0) * source.weight;
    }, 0);
```

### 3. Threshold Provider

Maps values to scores based on thresholds:

```yaml
sla_compliance_level:
  provider: "threshold"
  source:
    path: "topic.processingTime"
  thresholds:
    - condition: "> 5000"
      score: 0      # Failed SLA
    - condition: "> 1000"
      score: 50     # At risk
    - condition: "> 500"
      score: 75     # Warning
    - condition: "<= 500"
      score: 100    # Healthy
  defaultScore: 0
```

## Advanced Examples

### Business Value Metrics

```yaml
# Business impact of message processing
revenue_per_second:
  description: "Estimated revenue from processed messages"
  unit: "dollars/second"
  type: "gauge"
  entityTypes: ["MESSAGE_QUEUE_TOPIC"]
  provider: "calculation"
  formula: |
    const messagesPerSec = context.topic.messagesPerSecond || 0;
    const revenuePerMessage = context.topic.tags?.revenuePerMessage || 0.50;
    return messagesPerSec * revenuePerMessage;
  validation:
    min: 0
  tags:
    category: "business"
    dashboard: "executive"

# Cost efficiency
cost_per_thousand_messages:
  description: "Infrastructure cost per 1000 messages"
  unit: "dollars"
  type: "gauge"
  entityTypes: ["MESSAGE_QUEUE_CLUSTER"]
  provider: "calculation"
  formula: |
    const hourlyRate = context.cluster.tags?.hourlyInfrastructureCost || 50;
    const messagesPerHour = (context.cluster.messagesPerSecond || 0) * 3600;
    return messagesPerHour > 0 ? (hourlyRate / messagesPerHour) * 1000 : 0;
```

### SLA and Compliance Metrics

```yaml
# Message freshness SLA
data_freshness_sla:
  description: "Percentage of messages meeting freshness SLA"
  unit: "percentage"
  type: "gauge"
  entityTypes: ["MESSAGE_QUEUE_CONSUMER_GROUP"]
  provider: "threshold"
  source:
    path: "consumer.maxLag"
  thresholds:
    - condition: "> 60000"    # > 1 minute
      score: 0
    - condition: "> 10000"    # > 10 seconds
      score: 50
    - condition: "> 5000"     # > 5 seconds
      score: 75
    - condition: "<= 5000"    # <= 5 seconds
      score: 100
  tags:
    sla: "freshness"
    critical: true

# Processing time percentiles
processing_time_p99_sla:
  description: "99th percentile processing time SLA compliance"
  unit: "percentage"
  type: "gauge"
  entityTypes: ["MESSAGE_QUEUE_TOPIC"]
  provider: "calculation"
  formula: |
    const p99 = context.topic.processingTimeP99 || 0;
    const slaTarget = context.topic.tags?.slaTargetMs || 1000;
    return p99 <= slaTarget ? 100 : Math.max(0, 100 - ((p99 - slaTarget) / slaTarget * 100));
```

### Capacity Planning Metrics

```yaml
# Capacity utilization
capacity_headroom:
  description: "Available capacity before hitting limits"
  unit: "percentage"
  type: "gauge"
  entityTypes: ["MESSAGE_QUEUE_BROKER"]
  provider: "composite"
  sources:
    - name: "cpu"
      path: "broker.cpuUsage"
      limit: 80
    - name: "memory"
      path: "broker.memoryUsage"
      limit: 85
    - name: "connections"
      path: "broker.connectionCount"
      limit: 1000
  combine: |
    let minHeadroom = 100;
    sources.forEach(source => {
      const usage = values[source.name] || 0;
      const headroom = source.limit - usage;
      const headroomPercent = (headroom / source.limit) * 100;
      minHeadroom = Math.min(minHeadroom, headroomPercent);
    });
    return Math.max(0, minHeadroom);

# Growth projection
projected_capacity_days:
  description: "Days until capacity exhaustion at current growth rate"
  unit: "days"
  type: "gauge"
  entityTypes: ["MESSAGE_QUEUE_CLUSTER"]
  provider: "calculation"
  formula: |
    const currentUsage = context.cluster.diskUsageGB || 0;
    const totalCapacity = context.cluster.diskCapacityGB || 1000;
    const dailyGrowthGB = context.cluster.dailyGrowthRateGB || 10;
    const remainingGB = totalCapacity - currentUsage;
    return dailyGrowthGB > 0 ? Math.floor(remainingGB / dailyGrowthGB) : 999;
```

## Using Custom Metrics

### In Dashboards

Custom metrics are available in New Relic dashboards:

```sql
-- Query custom metrics
FROM MessageQueue 
SELECT latest(custom.message_processing_efficiency) 
FACET topicName 
WHERE entityType = 'MESSAGE_QUEUE_TOPIC'

-- Business metrics
FROM MessageQueue 
SELECT sum(custom.revenue_per_second) as 'Revenue/sec'
WHERE provider = 'kafka' 
TIMESERIES
```

### In Alerts

Create alerts on custom metrics:

```sql
-- Alert when SLA compliance drops
FROM MessageQueue 
SELECT average(custom.data_freshness_sla) 
WHERE entityType = 'MESSAGE_QUEUE_CONSUMER_GROUP' 
  AND custom.data_freshness_sla < 90
```

### Via API

Access custom metrics through the platform API:

```bash
# Get all custom metrics
curl http://localhost:3000/api/metrics/custom

# Get specific metric values
curl http://localhost:3000/api/metrics/custom/revenue_per_second
```

## File Formats

### YAML Format

```yaml
# custom-metrics/performance.yaml
metric_one:
  description: "First metric"
  unit: "count"
  type: "gauge"
  
metric_two:
  description: "Second metric"
  unit: "percentage"
  type: "gauge"
```

### JSON Format

```json
{
  "metric_one": {
    "description": "First metric",
    "unit": "count",
    "type": "gauge"
  },
  "metric_two": {
    "description": "Second metric",
    "unit": "percentage",
    "type": "gauge"
  }
}
```

## Best Practices

### 1. Naming Conventions

Use descriptive, hierarchical names:
```yaml
# Good
broker_cpu_efficiency_percentage:
topic_message_value_rate_dollars:
cluster_replication_health_score:

# Avoid
cpu_eff:
msg_val:
health:
```

### 2. Validation

Always add validation rules:
```yaml
my_metric:
  validation:
    min: 0
    max: 100
    required: false  # Make optional if source data might be missing
```

### 3. Performance

Avoid expensive calculations:
```yaml
# Good - Simple calculation
simple_ratio:
  formula: "context.success / context.total * 100"

# Avoid - Complex loops or heavy computation
complex_calculation:
  formula: |
    // Avoid iterating over large arrays
    let sum = 0;
    for (let i = 0; i < context.largeArray.length; i++) {
      sum += expensiveCalculation(context.largeArray[i]);
    }
```

### 4. Error Handling

Provide defaults for missing data:
```yaml
safe_metric:
  formula: |
    const value = context.topic?.messageCount || 0;
    const total = context.topic?.totalCapacity || 1;
    return total > 0 ? (value / total) * 100 : 0;
```

### 5. Documentation

Document complex metrics:
```yaml
complex_business_metric:
  description: |
    Calculates the business impact score based on:
    - Message processing rate (40% weight)
    - Error rate (30% weight)
    - Consumer lag (30% weight)
    
    Score ranges:
    - 0-50: Critical impact
    - 51-70: Significant impact
    - 71-85: Moderate impact
    - 86-100: Minimal impact
```

## Troubleshooting

### Metric Not Appearing

1. Check file is in correct directory
2. Verify YAML/JSON syntax
3. Check for validation errors in logs
4. Ensure entity type matches

### Validation Errors

```bash
# Check logs for validation errors
docker logs message-queues-platform | grep "metric validation"

# Test metric file validity
node -e "console.log(require('js-yaml').load(fs.readFileSync('./custom-metrics/my-metrics.yaml', 'utf8')))"
```

### Formula Errors

Enable debug mode to see formula evaluation:
```bash
DEBUG=metrics:* node platform.js
```

### Performance Issues

Monitor custom metric collection time:
```bash
# Look for slow metric warnings
docker logs message-queues-platform | grep "slow metric"
```

## Migration from Legacy Metrics

### Converting JMX Metrics

From JMX:
```xml
<mbean name="kafka.server:type=BrokerTopicMetrics,name=MessagesInPerSec">
  <attribute name="Count" type="gauge"/>
</mbean>
```

To Custom Metric:
```yaml
broker_messages_in_per_sec:
  description: "Messages received per second"
  unit: "messages/second"
  type: "gauge"
  entityTypes: ["MESSAGE_QUEUE_BROKER"]
  provider: "calculation"
  formula: "context.broker.messagesInPerSecond || 0"
```

## Advanced Topics

### Dynamic Metric Generation

Create metrics based on tags or metadata:
```yaml
tagged_performance_metric:
  description: "Performance adjusted by criticality"
  provider: "calculation"
  formula: |
    const basePerformance = context.topic.performanceScore || 0;
    const criticality = context.topic.tags?.criticality || 'normal';
    const multipliers = {
      'critical': 1.5,
      'high': 1.2,
      'normal': 1.0,
      'low': 0.8
    };
    return basePerformance * (multipliers[criticality] || 1.0);
```

### Cross-Entity Metrics

Reference related entities:
```yaml
consumer_to_producer_ratio:
  description: "Ratio of consumers to producers"
  entityTypes: ["MESSAGE_QUEUE_TOPIC"]
  provider: "calculation"
  formula: |
    const consumers = context.topic.consumerCount || 0;
    const producers = context.topic.producerCount || 1;
    return consumers / producers;
```

### Time-Based Metrics

Include time-based calculations:
```yaml
peak_hour_efficiency:
  description: "Efficiency during peak hours"
  provider: "calculation"
  formula: |
    const hour = new Date().getHours();
    const isPeakHour = hour >= 9 && hour <= 17;
    const efficiency = context.broker.efficiency || 0;
    return isPeakHour ? efficiency * 0.8 : efficiency;
```

## Conclusion

Custom metrics provide powerful extensibility to monitor business-specific KPIs, SLAs, and specialized calculations. Start with simple metrics and gradually build more sophisticated measurements as your monitoring needs evolve.