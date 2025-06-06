package msk

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/newrelic/infra-integrations-sdk/data/metric"
	"github.com/newrelic/infra-integrations-sdk/integration"
)

// MessageQueueTransformer handles transformation of MSK metrics to MessageQueueSample events
type MessageQueueTransformer struct {
	integration   *integration.Integration
	clusterName   string
	accountID     string
	region        string
	collectorName string
}

// NewMessageQueueTransformer creates a new transformer instance
func NewMessageQueueTransformer(i *integration.Integration, clusterName, accountID, region string) *MessageQueueTransformer {
	return &MessageQueueTransformer{
		integration:   i,
		clusterName:   clusterName,
		accountID:     accountID,
		region:        region,
		collectorName: "cloudwatch-metric-streams",
	}
}

// TransformClusterMetrics transforms cluster metrics to MessageQueueSample
func (t *MessageQueueTransformer) TransformClusterMetrics(metrics map[string]interface{}) error {
	event := t.createBaseEvent("AWSMSKCLUSTER", "kafka_cluster", t.clusterName)
	
	// Map cluster metrics
	metricMappings := map[string]string{
		"ActiveControllerCount":   "queue.activeControllers",
		"GlobalPartitionCount":    "queue.globalPartitions",
		"OfflinePartitionsCount":  "queue.offlinePartitions",
		"GlobalTopicCount":        "queue.topicCount",
		"ZooKeeperSessionState":   "queue.zookeeperState",
	}
	
	t.mapMetrics(event, metrics, metricMappings)
	
	// Add cluster-specific attributes
	event["queue.brokerCount"] = metrics["BrokerCount"]
	event["clusterArn"] = metrics["ClusterArn"]
	event["clusterState"] = metrics["State"]
	
	return t.submitEvent(event)
}

// TransformBrokerMetrics transforms broker metrics to MessageQueueSample
func (t *MessageQueueTransformer) TransformBrokerMetrics(brokerID string, metrics map[string]interface{}) error {
	brokerName := fmt.Sprintf("%s-broker-%s", t.clusterName, brokerID)
	event := t.createBaseEvent("AWSMSKBROKER", "kafka_broker", brokerName)
	
	// Add broker relationship fields
	event["awsMskBrokerId"] = brokerID
	event["brokerId"] = brokerID
	
	// Map broker metrics
	metricMappings := map[string]string{
		"BytesInPerSec":      "queue.bytesInPerSecond",
		"BytesOutPerSec":     "queue.bytesOutPerSecond",
		"MessagesInPerSec":   "queue.messagesPerSecond",
		"CpuUser":            "queue.cpuPercent",
		"CpuSystem":          "queue.cpuSystemPercent",
		"MemoryUsed":         "queue.memoryPercent",
		"RootDiskUsed":       "queue.diskUsedPercent",
		"NetworkRxDropped":   "queue.networkRxDropped",
		"NetworkTxDropped":   "queue.networkTxDropped",
		"NetworkRxErrors":    "queue.networkRxErrors",
		"NetworkTxErrors":    "queue.networkTxErrors",
	}
	
	t.mapMetrics(event, metrics, metricMappings)
	
	// Add availability zone if present
	if az, ok := metrics["AvailabilityZone"].(string); ok {
		event["aws.availabilityZone"] = az
	}
	
	// Calculate additional metrics
	if cpuUser, ok := getFloat64(metrics["CpuUser"]); ok {
		if cpuSystem, ok := getFloat64(metrics["CpuSystem"]); ok {
			event["queue.cpuTotalPercent"] = cpuUser + cpuSystem
		}
	}
	
	return t.submitEvent(event)
}

// TransformTopicMetrics transforms topic metrics to MessageQueueSample
func (t *MessageQueueTransformer) TransformTopicMetrics(topicName string, metrics map[string]interface{}) error {
	topicFullName := fmt.Sprintf("%s-%s", t.clusterName, topicName)
	event := t.createBaseEvent("AWSMSKTOPIC", "kafka_topic", topicFullName)
	
	// Add topic relationship fields
	event["topicName"] = topicName
	
	// Map topic metrics
	metricMappings := map[string]string{
		"MessagesInPerSec":       "queue.messagesPerSecond",
		"BytesInPerSec":          "queue.bytesInPerSecond",
		"BytesOutPerSec":         "queue.bytesOutPerSecond",
		"FetchRequestsPerSec":    "queue.fetchRequestsPerSecond",
		"ProduceRequestsPerSec":  "queue.produceRequestsPerSecond",
		"SumOffsetLag":           "queue.consumerLag",
		"PartitionCount":         "queue.partitionCount",
		"ReplicationFactor":      "queue.replicationFactor",
		"UnderReplicatedPartitions": "queue.underReplicatedPartitions",
	}
	
	t.mapMetrics(event, metrics, metricMappings)
	
	// Add topic configuration if available
	if retention, ok := metrics["RetentionMs"]; ok {
		event["retentionMs"] = retention
		event["retentionHours"] = getFloat64(retention) / (1000 * 60 * 60)
	}
	
	// Add consumer group information if available
	if consumerGroups, ok := metrics["ConsumerGroups"].([]string); ok {
		event["consumerGroups"] = strings.Join(consumerGroups, ",")
		event["consumerGroupCount"] = len(consumerGroups)
	}
	
	return t.submitEvent(event)
}

// createBaseEvent creates the base MessageQueueSample event
func (t *MessageQueueTransformer) createBaseEvent(entityType, queueType, entityName string) map[string]interface{} {
	return map[string]interface{}{
		"eventType":      "MessageQueueSample",
		"timestamp":      time.Now().UnixMilli(),
		"provider":       "AwsMsk",
		"collector.name": t.collectorName,
		"queue.name":     entityName,
		"queue.type":     queueType,
		"entity.name":    entityName,
		"entity.type":    entityType,
		
		// AWS context for relationships
		"awsAccountId":      t.accountID,
		"awsRegion":         t.region,
		"awsMskClusterName": t.clusterName,
		"aws.accountId":     t.accountID,
	}
}

// mapMetrics maps metrics using the provided mappings
func (t *MessageQueueTransformer) mapMetrics(event map[string]interface{}, metrics map[string]interface{}, mappings map[string]string) {
	for sourceKey, targetKey := range mappings {
		if value, ok := metrics[sourceKey]; ok {
			// Convert to float if possible
			if floatVal, ok := getFloat64(value); ok {
				event[targetKey] = floatVal
			} else {
				event[targetKey] = value
			}
			
			// Also include original metric name
			event[fmt.Sprintf("msk.%s", sourceKey)] = value
		}
		
		// Check for aggregated metrics (with .Average, .Sum, etc.)
		for _, suffix := range []string{".Average", ".Sum", ".Minimum", ".Maximum", ".SampleCount"} {
			aggregatedKey := sourceKey + suffix
			if value, ok := metrics[aggregatedKey]; ok {
				if floatVal, ok := getFloat64(value); ok {
					// For .Average, use it as the main queue metric
					if suffix == ".Average" {
						event[targetKey] = floatVal
					}
					// Store all aggregations
					event[fmt.Sprintf("msk.%s%s", sourceKey, suffix)] = floatVal
				}
			}
		}
	}
}

// submitEvent submits the event to New Relic
func (t *MessageQueueTransformer) submitEvent(event map[string]interface{}) error {
	// Option 1: Use the integration SDK's event API
	if t.integration != nil {
		entity := t.integration.NewEntity(event["entity.name"].(string), "msk")
		for key, value := range event {
			if key != "eventType" && key != "timestamp" && key != "entity.name" {
				switch v := value.(type) {
				case float64:
					entity.SetMetric(key, v, metric.GAUGE)
				case int, int64:
					entity.SetMetric(key, float64(v.(int)), metric.GAUGE)
				case string:
					entity.SetInventoryItem(key, "value", v)
				default:
					entity.SetInventoryItem(key, "value", fmt.Sprintf("%v", v))
				}
			}
		}
		return nil
	}
	
	// Option 2: Direct Event API submission (implement based on your needs)
	// This would involve making an HTTP POST to the New Relic Event API
	// Example implementation would go here
	
	return nil
}

// getFloat64 safely converts various numeric types to float64
func getFloat64(value interface{}) (float64, bool) {
	switch v := value.(type) {
	case float64:
		return v, true
	case float32:
		return float64(v), true
	case int:
		return float64(v), true
	case int64:
		return float64(v), true
	case string:
		// Try to parse string as float
		var f float64
		if _, err := fmt.Sscanf(v, "%f", &f); err == nil {
			return f, true
		}
	}
	return 0, false
}

// TransformDimensionalMetrics is the main entry point for the dimensional transformer
func (t *MessageQueueTransformer) TransformDimensionalMetrics(sample *DimensionalMetricSample) error {
	// Determine entity type from dimensions
	entityType := t.determineEntityType(sample.Dimensions)
	
	switch entityType {
	case "cluster":
		return t.TransformClusterMetrics(sample.Metrics)
	case "broker":
		if brokerID, ok := sample.Dimensions["Broker ID"]; ok {
			return t.TransformBrokerMetrics(brokerID, sample.Metrics)
		}
	case "topic":
		if topicName, ok := sample.Dimensions["Topic"]; ok {
			return t.TransformTopicMetrics(topicName, sample.Metrics)
		}
	}
	
	return fmt.Errorf("unable to determine entity type from dimensions: %v", sample.Dimensions)
}

// determineEntityType determines the entity type from CloudWatch dimensions
func (t *MessageQueueTransformer) determineEntityType(dimensions map[string]string) string {
	if _, hasBroker := dimensions["Broker ID"]; hasBroker {
		return "broker"
	}
	if _, hasTopic := dimensions["Topic"]; hasTopic {
		return "topic"
	}
	if _, hasCluster := dimensions["Cluster Name"]; hasCluster {
		return "cluster"
	}
	return ""
}

// Example integration with existing MSK shim
func IntegrateWithMSKShim(args interface{}, clusterName, accountID, region string) {
	// Create transformer
	transformer := NewMessageQueueTransformer(nil, clusterName, accountID, region)
	
	// Example: Transform a broker metric
	brokerMetrics := map[string]interface{}{
		"BytesInPerSec.Average":  1500000.0,
		"BytesOutPerSec.Average": 1200000.0,
		"CpuUser":                35.5,
		"MemoryUsed":             4500000000.0, // bytes
		"AvailabilityZone":       "us-east-1a",
	}
	
	if err := transformer.TransformBrokerMetrics("1", brokerMetrics); err != nil {
		fmt.Printf("Error transforming broker metrics: %v\n", err)
	}
}

// BatchProcessor for handling multiple events efficiently
type BatchProcessor struct {
	transformer *MessageQueueTransformer
	events      []map[string]interface{}
	maxBatch    int
	flushTimer  *time.Timer
}

// NewBatchProcessor creates a new batch processor
func NewBatchProcessor(transformer *MessageQueueTransformer, maxBatch int) *BatchProcessor {
	return &BatchProcessor{
		transformer: transformer,
		events:      make([]map[string]interface{}, 0, maxBatch),
		maxBatch:    maxBatch,
	}
}

// Add adds an event to the batch
func (b *BatchProcessor) Add(event map[string]interface{}) error {
	b.events = append(b.events, event)
	
	if len(b.events) >= b.maxBatch {
		return b.Flush()
	}
	
	// Set flush timer if not already set
	if b.flushTimer == nil {
		b.flushTimer = time.AfterFunc(30*time.Second, func() {
			b.Flush()
		})
	}
	
	return nil
}

// Flush sends all batched events
func (b *BatchProcessor) Flush() error {
	if len(b.events) == 0 {
		return nil
	}
	
	// Send events (implement actual sending logic)
	// This is where you would make the HTTP request to New Relic
	
	// Clear events
	b.events = b.events[:0]
	
	// Cancel timer
	if b.flushTimer != nil {
		b.flushTimer.Stop()
		b.flushTimer = nil
	}
	
	return nil
}