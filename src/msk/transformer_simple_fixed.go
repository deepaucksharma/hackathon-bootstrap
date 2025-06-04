package msk

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/newrelic/infra-integrations-sdk/v3/data/metric"
	"github.com/newrelic/infra-integrations-sdk/v3/log"
)

// TransformerFixed is an improved version of the transformer with correct metric mappings
type TransformerFixed struct {
	clusterName string
}

// NewTransformerFixed creates a new fixed transformer
func NewTransformerFixed(clusterName string) *TransformerFixed {
	return &TransformerFixed{
		clusterName: clusterName,
	}
}

// GetBrokerMetricMappings returns the correct mappings for broker metrics
func (t *TransformerFixed) GetBrokerMetricMappings() map[string]string {
	return map[string]string{
		// Critical throughput metrics - these were wrong in original
		"broker.messagesInPerSecond":          "aws.msk.MessagesInPerSec",
		"broker.IOInPerSecond":                "aws.msk.BytesInPerSec",
		"broker.IOOutPerSecond":               "aws.msk.BytesOutPerSec",
		"broker.bytesWrittenToDiscPerSecond":  "aws.msk.BytesWrittenPerSec",
		
		// Fetch/Produce request rates
		"broker.totalFetchRequestsPerSecond":   "aws.msk.FetchMessageConversionsPerSec",
		"broker.totalProduceRequestsPerSecond": "aws.msk.ProduceMessageConversionsPerSec",
		
		// Replication health metrics
		"replication.unreplicatedPartitions":   "aws.msk.UnderReplicatedPartitions",
		"replication.isrShrinksPerSecond":      "aws.msk.IsrShrinksPerSec",
		"replication.isrExpandsPerSecond":      "aws.msk.IsrExpandsPerSec",
		"replication.leaderElectionPerSecond":  "aws.msk.LeaderElectionRateAndTimeMs",
		
		// Request performance metrics
		"request.avgTimeFetch":                "aws.msk.RequestTime.Fetch.Mean",
		"request.avgTimeProduceRequest":       "aws.msk.RequestTime.Produce.Mean",
		"request.fetchTime99Percentile":       "aws.msk.FetchConsumerTotalTimeMs99thPercentile",
		"request.produceTime99Percentile":     "aws.msk.ProduceTotalTimeMs99thPercentile",
		"request.avgTimeUpdateMetadata":       "aws.msk.RequestTime.UpdateMetadata.Mean",
		
		// Network and partition metrics
		"net.bytesRejectedPerSecond":          "aws.msk.NetworkRxDropped",
		"broker.partitionCount":               "aws.msk.PartitionCount",
		"controller.activeControllerCount":    "aws.msk.ActiveControllerCount",
		"controller.offlinePartitionsCount":   "aws.msk.OfflinePartitionsCount",
		
		// Consumer metrics
		"consumer.requestsExpiredPerSecond":   "aws.msk.ExpiredFetchResponsesPerSec",
		"consumer.avgFetchSizeBytes":          "aws.msk.FetchMessageConversionsPerSec",
		
		// Disk usage metrics
		"broker.logSize":                      "aws.msk.KafkaDataLogsDiskUsed",
		"broker.diskUsedPercent":              "aws.msk.RootDiskUsed",
	}
}

// TransformBrokerMetrics transforms broker metrics with proper value handling
func (t *TransformerFixed) TransformBrokerMetrics(inputMetrics map[string]interface{}, outputSet *metric.Set) error {
	log.Debug("TransformBrokerMetrics: Starting transformation for cluster %s", t.clusterName)
	
	// First, ensure critical attributes are set
	t.ensureBrokerAttributes(inputMetrics, outputSet)
	
	// Transform metrics using correct mappings
	mappings := t.GetBrokerMetricMappings()
	for sourceMetric, targetMetric := range mappings {
		if err := t.copyMetricValue(sourceMetric, targetMetric, inputMetrics, outputSet); err != nil {
			log.Debug("Failed to copy metric %s: %v", sourceMetric, err)
		}
	}
	
	// Add provider-specific metrics
	t.addProviderMetrics(inputMetrics, outputSet)
	
	return nil
}

// ensureBrokerAttributes adds missing broker attributes
func (t *TransformerFixed) ensureBrokerAttributes(inputMetrics map[string]interface{}, outputSet *metric.Set) {
	// Fix missing broker_host
	if brokerHost, ok := inputMetrics["broker_host"]; ok && brokerHost != nil {
		outputSet.SetMetric("broker_host", brokerHost, metric.ATTRIBUTE)
		outputSet.SetMetric("provider.brokerHost", brokerHost, metric.ATTRIBUTE)
		log.Debug("Set broker_host: %v", brokerHost)
	}
	
	// Extract and set brokerId from entityName
	if entityName, ok := inputMetrics["entityName"].(string); ok {
		// entityName format is usually "broker:ID"
		if strings.HasPrefix(entityName, "broker:") {
			brokerId := strings.TrimPrefix(entityName, "broker:")
			outputSet.SetMetric("brokerId", brokerId, metric.ATTRIBUTE)
			outputSet.SetMetric("provider.brokerId", brokerId, metric.ATTRIBUTE)
			log.Debug("Extracted brokerId: %s from entityName: %s", brokerId, entityName)
		}
	}
	
	// Ensure cluster name is set
	outputSet.SetMetric("clusterName", t.clusterName, metric.ATTRIBUTE)
	outputSet.SetMetric("provider.clusterName", t.clusterName, metric.ATTRIBUTE)
}

// copyMetricValue properly copies and converts metric values
func (t *TransformerFixed) copyMetricValue(from, to string, inputMetrics map[string]interface{}, outputSet *metric.Set) error {
	value, exists := inputMetrics[from]
	if !exists {
		return fmt.Errorf("metric %s not found in input", from)
	}
	
	if value == nil {
		return fmt.Errorf("metric %s has nil value", from)
	}
	
	// Convert to float64 for numeric metrics
	floatValue, err := toFloat64(value)
	if err != nil {
		return fmt.Errorf("failed to convert metric %s value %v to float64: %v", from, value, err)
	}
	
	outputSet.SetMetric(to, floatValue, metric.GAUGE)
	log.Debug("Copied metric %s (%.2f) to %s", from, floatValue, to)
	
	return nil
}

// addProviderMetrics adds MSK provider-specific metric formats
func (t *TransformerFixed) addProviderMetrics(inputMetrics map[string]interface{}, outputSet *metric.Set) {
	// Add provider.* prefixed versions for MSK compatibility
	providerMappings := map[string]string{
		"broker.messagesInPerSecond":         "provider.messagesInPerSec.Average",
		"broker.IOInPerSecond":               "provider.bytesInPerSec.Average",
		"broker.IOOutPerSecond":              "provider.bytesOutPerSec.Average",
		"replication.unreplicatedPartitions": "provider.underReplicatedPartitions.Sum",
		"controller.activeControllerCount":   "provider.activeControllerCount.Sum",
		"controller.offlinePartitionsCount":  "provider.offlinePartitionsCount.Sum",
	}
	
	for source, target := range providerMappings {
		if value, ok := inputMetrics[source]; ok && value != nil {
			if floatVal, err := toFloat64(value); err == nil {
				outputSet.SetMetric(target, floatVal, metric.GAUGE)
			}
		}
	}
}

// TransformTopicMetrics transforms topic-level metrics
func (t *TransformerFixed) TransformTopicMetrics(topicName string, inputMetrics map[string]interface{}, outputSet *metric.Set) error {
	// Set topic identification
	outputSet.SetMetric("topic", topicName, metric.ATTRIBUTE)
	outputSet.SetMetric("topicName", topicName, metric.ATTRIBUTE)
	outputSet.SetMetric("displayName", topicName, metric.ATTRIBUTE)
	outputSet.SetMetric("provider.topic", topicName, metric.ATTRIBUTE)
	outputSet.SetMetric("provider.clusterName", t.clusterName, metric.ATTRIBUTE)
	
	// Transform topic metrics
	topicMappings := map[string]string{
		"topic.bytesInPerSecond":       "provider.bytesInPerSec.Sum",
		"topic.bytesOutPerSecond":      "provider.bytesOutPerSec.Sum",
		"topic.messagesInPerSecond":    "provider.messagesInPerSec.Sum",
		"topic.partitionCount":         "provider.partitionCount",
		"topic.replicationFactor":      "provider.replicationFactor",
		"topic.underReplicatedPartitions": "provider.underReplicatedPartitions",
	}
	
	for source, target := range topicMappings {
		if err := t.copyMetricValue(source, target, inputMetrics, outputSet); err != nil {
			log.Debug("Topic metric %s not available: %v", source, err)
		}
	}
	
	// Also add AWS MSK specific format
	if bytesIn, ok := inputMetrics["topic.bytesInPerSecond"]; ok {
		if floatVal, err := toFloat64(bytesIn); err == nil {
			outputSet.SetMetric("aws.msk.BytesInPerSec", floatVal, metric.GAUGE)
		}
	}
	
	if bytesOut, ok := inputMetrics["topic.bytesOutPerSecond"]; ok {
		if floatVal, err := toFloat64(bytesOut); err == nil {
			outputSet.SetMetric("aws.msk.BytesOutPerSec", floatVal, metric.GAUGE)
		}
	}
	
	return nil
}

// TransformClusterMetrics creates cluster-level aggregated metrics
func (t *TransformerFixed) TransformClusterMetrics(aggregatedData map[string]interface{}, outputSet *metric.Set) error {
	// Set cluster identification
	outputSet.SetMetric("clusterName", t.clusterName, metric.ATTRIBUTE)
	outputSet.SetMetric("provider.clusterName", t.clusterName, metric.ATTRIBUTE)
	
	// Transform cluster-level metrics
	clusterMappings := map[string]string{
		"totalBrokers":               "provider.brokerCount",
		"totalTopics":                "provider.topicCount",
		"totalPartitions":            "provider.globalPartitionCount.Average",
		"activeControllerCount":      "provider.activeControllerCount.Sum",
		"offlinePartitionsCount":     "provider.offlinePartitionsCount.Sum",
		"underReplicatedPartitions":  "provider.underReplicatedPartitions.Sum",
	}
	
	for source, target := range clusterMappings {
		if value, ok := aggregatedData[source]; ok && value != nil {
			if floatVal, err := toFloat64(value); err == nil {
				outputSet.SetMetric(target, floatVal, metric.GAUGE)
			}
		}
	}
	
	return nil
}

// toFloat64 converts various types to float64
func toFloat64(value interface{}) (float64, error) {
	switch v := value.(type) {
	case float64:
		return v, nil
	case float32:
		return float64(v), nil
	case int:
		return float64(v), nil
	case int32:
		return float64(v), nil
	case int64:
		return float64(v), nil
	case string:
		return strconv.ParseFloat(v, 64)
	default:
		return 0, fmt.Errorf("unsupported type %T for conversion to float64", value)
	}
}