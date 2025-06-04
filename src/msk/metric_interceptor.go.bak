package msk

import (
	"github.com/newrelic/infra-integrations-sdk/v3/data/metric"
	"github.com/newrelic/infra-integrations-sdk/v3/log"
)

// MetricInterceptor intercepts metrics before they are sent to New Relic
type MetricInterceptor struct {
	shim *Shim
}

// NewMetricInterceptor creates a new metric interceptor
func NewMetricInterceptor(shim *Shim) *MetricInterceptor {
	return &MetricInterceptor{shim: shim}
}

// InterceptBrokerSample intercepts broker metric samples and transforms them to MSK format
func (m *MetricInterceptor) InterceptBrokerSample(sample *metric.Set) error {
	if m.shim == nil || !m.shim.IsEnabled() {
		return nil
	}

	// Extract broker data from the sample
	brokerData := make(map[string]interface{})
	
	// Copy all metrics from the sample
	for metricName, metricValue := range sample.Metrics {
		brokerData[metricName] = metricValue.Value
	}

	// Extract broker ID from attributes
	if brokerID, exists := sample.Metrics["broker.id"]; exists {
		brokerData["broker.id"] = brokerID.Value
	}

	// Extract hostname if available
	if hostname, exists := sample.Metrics["broker.hostname"]; exists {
		brokerData["broker.host"] = hostname.Value
	}

	// Map standard Kafka metrics to expected format
	m.mapBrokerMetrics(sample, brokerData)

	// Transform to MSK format
	if err := m.shim.TransformBrokerMetrics(brokerData); err != nil {
		log.Warn("Failed to transform broker metrics to MSK format: %v", err)
		// Don't fail the entire collection
		return nil
	}

	return nil
}

// InterceptTopicSample intercepts topic metric samples and transforms them to MSK format
func (m *MetricInterceptor) InterceptTopicSample(sample *metric.Set, topicName string) error {
	if m.shim == nil || !m.shim.IsEnabled() {
		return nil
	}

	// Extract topic data from the sample
	topicData := make(map[string]interface{})
	topicData["topic.name"] = topicName

	// Copy all metrics from the sample
	for metricName, metricValue := range sample.Metrics {
		topicData[metricName] = metricValue.Value
	}

	// Map standard Kafka metrics to expected format
	m.mapTopicMetrics(sample, topicData)

	// Transform to MSK format
	if err := m.shim.TransformTopicMetrics(topicData); err != nil {
		log.Warn("Failed to transform topic metrics to MSK format: %v", err)
		// Don't fail the entire collection
		return nil
	}

	return nil
}

// mapBrokerMetrics maps standard Kafka JMX metrics to the format expected by the transformer
func (m *MetricInterceptor) mapBrokerMetrics(sample *metric.Set, data map[string]interface{}) {
	// Map throughput metrics
	if val, exists := getMetricValue(sample, "broker.messagesInPerSecond"); exists {
		data["broker.messagesInPerSecond"] = val
	}
	if val, exists := getMetricValue(sample, "broker.bytesInPerSecond"); exists {
		data["broker.bytesInPerSecond"] = val
	}
	if val, exists := getMetricValue(sample, "broker.bytesOutPerSecond"); exists {
		data["broker.bytesOutPerSecond"] = val
	}

	// Map partition and replication metrics
	if val, exists := getMetricValue(sample, "broker.partitionCount"); exists {
		data["broker.partitionCount"] = val
	}
	if val, exists := getMetricValue(sample, "broker.underReplicatedPartitions"); exists {
		data["broker.underReplicatedPartitions"] = val
	}
	if val, exists := getMetricValue(sample, "replication.isrShrinksPerSecond"); exists {
		data["replication.isrShrinksPerSecond"] = val
	}
	if val, exists := getMetricValue(sample, "replication.isrExpandsPerSecond"); exists {
		data["replication.isrExpandsPerSecond"] = val
	}

	// Map request metrics
	if val, exists := getMetricValue(sample, "broker.totalFetchRequestsPerSecond"); exists {
		data["broker.totalFetchRequestsPerSecond"] = val
	}
	if val, exists := getMetricValue(sample, "broker.totalProduceRequestsPerSecond"); exists {
		data["broker.totalProduceRequestsPerSecond"] = val
	}

	// Map latency metrics
	if val, exists := getMetricValue(sample, "broker.totalTimeMs.Fetch.mean"); exists {
		data["broker.totalTimeMs.Fetch.mean"] = val
	}
	if val, exists := getMetricValue(sample, "broker.totalTimeMs.Produce.mean"); exists {
		data["broker.totalTimeMs.Produce.mean"] = val
	}

	// Map controller metrics
	if val, exists := getMetricValue(sample, "cluster.offlinePartitionsCount"); exists {
		data["cluster.offlinePartitionsCount"] = val
		data["broker.isController"] = "true"
	}
	if val, exists := getMetricValue(sample, "cluster.partitionCount"); exists {
		data["cluster.partitionCount"] = val
	}
	if val, exists := getMetricValue(sample, "cluster.underMinIsrPartitionCount"); exists {
		data["cluster.underMinIsrPartitionCount"] = val
	}

	// Map network metrics
	if val, exists := getMetricValue(sample, "broker.requestHandlerAvgIdlePercent.rate"); exists {
		data["broker.requestHandlerAvgIdlePercent.rate"] = val
	}
}

// mapTopicMetrics maps standard Kafka topic metrics to the format expected by the transformer
func (m *MetricInterceptor) mapTopicMetrics(sample *metric.Set, data map[string]interface{}) {
	// Map throughput metrics
	if val, exists := getMetricValue(sample, "topic.messagesInPerSecond"); exists {
		data["topic.messagesInPerSecond"] = val
	}
	if val, exists := getMetricValue(sample, "topic.bytesInPerSecond"); exists {
		data["topic.bytesInPerSecond"] = val
	}
	if val, exists := getMetricValue(sample, "topic.bytesOutPerSecond"); exists {
		data["topic.bytesOutPerSecond"] = val
	}

	// Map partition metrics
	if val, exists := getMetricValue(sample, "topic.partitionCount"); exists {
		data["topic.partitionCount"] = val
	}
	if val, exists := getMetricValue(sample, "topic.replicationFactor"); exists {
		data["topic.replicationFactor"] = val
	}
	if val, exists := getMetricValue(sample, "topic.underReplicatedPartitions"); exists {
		data["topic.underReplicatedPartitions"] = val
	}

	// Map size metrics
	if val, exists := getMetricValue(sample, "topic.sizeInBytes"); exists {
		data["topic.sizeInBytes"] = val
	}
}

// getMetricValue safely retrieves a metric value from a sample
func getMetricValue(sample *metric.Set, metricName string) (interface{}, bool) {
	if metric, exists := sample.Metrics[metricName]; exists {
		return metric.Value, true
	}
	return nil, false
}