package msk

import (
	"fmt"
	"time"
	
	"github.com/newrelic/infra-integrations-sdk/v3/log"
)

// CloudWatchEmulator emulates CloudWatch Metric Streams format
type CloudWatchEmulator struct {
	metricClient *MetricAPIClient
	config       *Config
}

// NewCloudWatchEmulator creates a new CloudWatch emulator
func NewCloudWatchEmulator(config *Config, apiKey string) *CloudWatchEmulator {
	return &CloudWatchEmulator{
		metricClient: NewMetricAPIClient(apiKey),
		config:       config,
	}
}

// EmitBrokerMetrics sends broker metrics in CloudWatch format
func (e *CloudWatchEmulator) EmitBrokerMetrics(brokerID string, metrics map[string]interface{}) error {
	log.Info("Emulating CloudWatch metrics for broker %s", brokerID)
	
	// Build base attributes that CloudWatch would send
	baseAttrs := e.buildCloudWatchAttributes("Broker", brokerID)
	
	// CloudWatch MSK metric mappings
	metricMappings := map[string]string{
		"broker.IOInPerSecond":              "BytesInPerSec",
		"broker.IOOutPerSecond":             "BytesOutPerSec",
		"broker.messagesInPerSecond":        "MessagesInPerSec",
		"replication.unreplicatedPartitions": "UnderReplicatedPartitions",
		"request.handlerIdle":               "RequestHandlerAvgIdlePercent",
		"broker.networkProcessorAvgIdlePercent": "NetworkProcessorAvgIdlePercent",
		"controller.activeControllerCount":   "ActiveControllerCount",
		"controller.offlinePartitionsCount":  "OfflinePartitionsCount",
	}
	
	// CPU and Memory metrics (with defaults if not available)
	cpuMemoryMetrics := map[string]float64{
		"CpuIdle":    getFloatValueWithDefault(metrics, "cpu.idle", 70.0),
		"CpuUser":    getFloatValueWithDefault(metrics, "cpu.user", 20.0),
		"CpuSystem":  getFloatValueWithDefault(metrics, "cpu.system", 10.0),
		"MemoryUsed": getFloatValueWithDefault(metrics, "memory.used", 50.0),
		"MemoryFree": getFloatValueWithDefault(metrics, "memory.free", 50.0),
		"KafkaDataLogDiskUsed": getFloatValueWithDefault(metrics, "disk.used", 30.0),
	}
	
	// Send regular metrics
	for kafkaMetric, cwMetric := range metricMappings {
		if value, ok := getFloatValue(metrics, kafkaMetric); ok {
			if err := e.sendCloudWatchMetric(cwMetric, value, baseAttrs); err != nil {
				log.Error("Failed to send metric %s: %v", cwMetric, err)
			}
		}
	}
	
	// Send CPU/Memory metrics
	for metricName, value := range cpuMemoryMetrics {
		if err := e.sendCloudWatchMetric(metricName, value, baseAttrs); err != nil {
			log.Error("Failed to send metric %s: %v", metricName, err)
		}
	}
	
	return nil
}

// EmitClusterMetrics sends cluster-level metrics in CloudWatch format
func (e *CloudWatchEmulator) EmitClusterMetrics(clusterMetrics map[string]interface{}) error {
	log.Info("Emulating CloudWatch metrics for cluster %s", e.config.ClusterName)
	
	// Build base attributes for cluster
	baseAttrs := e.buildCloudWatchAttributes("Cluster", "")
	
	// Cluster-level metrics
	clusterMetricMappings := map[string]string{
		"GlobalPartitionCount":      "GlobalPartitionCount",
		"GlobalTopicCount":          "GlobalTopicCount",
		"OfflinePartitionsCount":    "OfflinePartitionsCount",
		"ActiveControllerCount":     "ActiveControllerCount",
		"UnderReplicatedPartitions": "UnderReplicatedPartitions",
	}
	
	// Send cluster metrics
	for metricName, metricName2 := range clusterMetricMappings {
		value := getFloatValueWithDefault(clusterMetrics, metricName, 0.0)
		if err := e.sendCloudWatchMetric(metricName2, value, baseAttrs); err != nil {
			log.Error("Failed to send cluster metric %s: %v", metricName, err)
		}
	}
	
	return nil
}

// buildCloudWatchAttributes builds attributes as CloudWatch would send them
func (e *CloudWatchEmulator) buildCloudWatchAttributes(dimensionType string, dimensionValue string) map[string]interface{} {
	attrs := map[string]interface{}{
		// Critical: Must identify as CloudWatch
		"collector.name":           "cloudwatch-metric-streams",
		"eventType":               "Metric",
		"instrumentation.provider": "cloudwatch",
		"instrumentation.source":   "cloudwatch",
		
		// AWS namespace
		"aws.Namespace": "AWS/Kafka",
		
		// AWS account info
		"aws.accountId": e.config.AWSAccountID,
		"aws.region":    e.config.AWSRegion,
		
		// MSK specific attributes
		"aws.kafka.clusterName": e.config.ClusterName,
		"clusterName":          e.config.ClusterName,
		
		// Entity synthesis helpers
		"provider":              "AwsMsk",
		"providerAccountId":     e.config.AWSAccountID,
		"providerAccountName":   "AWS Account",
		"providerRegion":        e.config.AWSRegion,
	}
	
	// Add dimension-specific attributes
	switch dimensionType {
	case "Broker":
		attrs["aws.kafka.brokerId"] = dimensionValue
		attrs["entity.type"] = "AWS_KAFKA_BROKER"
		attrs["entity.name"] = fmt.Sprintf("%s:broker-%s", e.config.ClusterName, dimensionValue)
		attrs["entity.guid"] = GenerateEntityGUID(EntityTypeBroker, e.config.AWSAccountID, e.config.ClusterName, dimensionValue)
		
		// CloudWatch dimensions
		attrs["aws.Dimensions"] = []map[string]string{
			{"Name": "ClusterName", "Value": e.config.ClusterName},
			{"Name": "BrokerID", "Value": dimensionValue},
		}
		
	case "Cluster":
		attrs["entity.type"] = "AWS_KAFKA_CLUSTER"
		attrs["entity.name"] = e.config.ClusterName
		attrs["entity.guid"] = GenerateEntityGUID(EntityTypeCluster, e.config.AWSAccountID, e.config.ClusterName, nil)
		
		// CloudWatch dimensions
		attrs["aws.Dimensions"] = []map[string]string{
			{"Name": "ClusterName", "Value": e.config.ClusterName},
		}
		
	case "Topic":
		attrs["aws.kafka.topicName"] = dimensionValue
		attrs["entity.type"] = "AWS_KAFKA_TOPIC"
		attrs["entity.name"] = fmt.Sprintf("topic:%s", dimensionValue)
		attrs["entity.guid"] = GenerateEntityGUID(EntityTypeTopic, e.config.AWSAccountID, e.config.ClusterName, dimensionValue)
		
		// CloudWatch dimensions
		attrs["aws.Dimensions"] = []map[string]string{
			{"Name": "ClusterName", "Value": e.config.ClusterName},
			{"Name": "TopicName", "Value": dimensionValue},
		}
	}
	
	return attrs
}

// sendCloudWatchMetric sends a single metric in CloudWatch format
func (e *CloudWatchEmulator) sendCloudWatchMetric(metricName string, value float64, attributes map[string]interface{}) error {
	// CloudWatch sends metrics with specific naming
	// AWS/Kafka namespace metrics don't have prefix
	fullMetricName := metricName // Just the metric name, no prefix
	
	// Add CloudWatch-specific timestamp format
	attributes["timestamp"] = time.Now().Unix() * 1000
	
	// Add metric-specific attributes
	attributes["aws.MetricName"] = metricName
	attributes["metricName"] = fullMetricName
	
	log.Debug("Sending CloudWatch-style metric: %s = %f", fullMetricName, value)
	
	return e.metricClient.SendGaugeMetric(fullMetricName, value, attributes)
}

// EmitTopicMetrics sends topic metrics in CloudWatch format
func (e *CloudWatchEmulator) EmitTopicMetrics(topicName string, metrics map[string]interface{}) error {
	log.Info("Emulating CloudWatch metrics for topic %s", topicName)
	
	baseAttrs := e.buildCloudWatchAttributes("Topic", topicName)
	
	// Topic metrics
	topicMetricMappings := map[string]string{
		"topic.bytesInPerSecond":  "BytesInPerSec",
		"topic.bytesOutPerSecond": "BytesOutPerSec",
		"topic.messagesInPerSecond": "MessagesInPerSec",
	}
	
	for kafkaMetric, cwMetric := range topicMetricMappings {
		if value, ok := getFloatValue(metrics, kafkaMetric); ok {
			if err := e.sendCloudWatchMetric(cwMetric, value, baseAttrs); err != nil {
				log.Error("Failed to send topic metric %s: %v", cwMetric, err)
			}
		}
	}
	
	return nil
}