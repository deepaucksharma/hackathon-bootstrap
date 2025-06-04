package msk

import (
	"fmt"
	"strconv"

	"github.com/newrelic/infra-integrations-sdk/v3/data/attribute"
	"github.com/newrelic/infra-integrations-sdk/v3/data/metric"
	"github.com/newrelic/infra-integrations-sdk/v3/log"
)

// SimpleTransformer provides a simplified transformation approach
type SimpleTransformer struct {
	shim *Shim
}

// NewSimpleTransformer creates a new simple transformer
func NewSimpleTransformer(shim *Shim) *SimpleTransformer {
	return &SimpleTransformer{shim: shim}
}

// TransformBrokerMetricsSimple transforms broker metrics to MSK format
func (t *SimpleTransformer) TransformBrokerMetricsSimple(brokerData map[string]interface{}) error {
	// Extract broker ID
	brokerIDStr, ok := getStringValue(brokerData, "broker.id")
	if !ok {
		return fmt.Errorf("broker.id not found in broker data")
	}

	brokerID, err := strconv.Atoi(brokerIDStr)
	if err != nil {
		return fmt.Errorf("invalid broker ID: %s", brokerIDStr)
	}

	// Create MSK broker entity
	entityName := fmt.Sprintf("%s-broker-%d", t.shim.config.ClusterName, brokerID)
	entity, err := t.shim.GetOrCreateEntity("AwsMskBrokerSample", entityName)
	if err != nil {
		return fmt.Errorf("failed to create broker entity: %w", err)
	}

	// Generate GUID
	guid := GenerateEntityGUID(EntityTypeBroker, t.shim.config.AWSAccountID, 
		t.shim.config.ClusterName, brokerID)

	// Create metric set with all attributes
	ms := entity.NewMetricSet("AwsMskBrokerSample",
		attribute.Attribute{Key: "entity.guid", Value: guid},
		attribute.Attribute{Key: "entity.type", Value: string(EntityTypeBroker)},
		attribute.Attribute{Key: "entityName", Value: entityName},
		attribute.Attribute{Key: "entityGuid", Value: guid},
		attribute.Attribute{Key: "guid", Value: guid},
		attribute.Attribute{Key: "Name", Value: entityName},
		attribute.Attribute{Key: "BrokerId", Value: brokerID},
		attribute.Attribute{Key: "provider.clusterName", Value: t.shim.config.ClusterName},
		attribute.Attribute{Key: "provider.brokerId", Value: brokerID},
		attribute.Attribute{Key: "provider.accountId", Value: t.shim.config.AWSAccountID},
		attribute.Attribute{Key: "provider.region", Value: t.shim.config.AWSRegion},
		attribute.Attribute{Key: "provider.clusterArn", Value: t.shim.config.ClusterARN},
		attribute.Attribute{Key: "ClusterName", Value: t.shim.config.ClusterName},
		attribute.Attribute{Key: "ClusterArn", Value: t.shim.config.ClusterARN},
		attribute.Attribute{Key: "AccountId", Value: t.shim.config.AWSAccountID},
		attribute.Attribute{Key: "Region", Value: t.shim.config.AWSRegion},
		attribute.Attribute{Key: "Environment", Value: t.shim.config.Environment},
	)

	// Transform and add metrics
	metricMappings := map[string]string{
		"broker.bytesInPerSecond": "aws.msk.broker.BytesInPerSec",
		"broker.bytesOutPerSecond": "aws.msk.broker.BytesOutPerSec",
		"broker.messagesInPerSecond": "aws.msk.broker.MessagesInPerSec",
		"broker.IOInPerSecond": "aws.msk.broker.NetworkRxDropped",
		"broker.IOOutPerSecond": "aws.msk.broker.NetworkTxDropped",
		"replication.isrExpandsPerSecond": "aws.msk.broker.IsrExpandsPerSec",
		"replication.isrShrinksPerSecond": "aws.msk.broker.IsrShrinksPerSec",
		"replication.unreplicatedPartitions": "aws.msk.broker.UnderReplicatedPartitions",
		"request.avgTimeFetch": "aws.msk.broker.FetchConsumerTotalTimeMs",
		"request.avgTimeProduceRequest": "aws.msk.broker.ProduceTotalTimeMs",
		"request.handlerIdle": "aws.msk.broker.RequestHandlerAvgIdlePercent",
		"net.networkProcessorAvgIdlePercent": "aws.msk.broker.NetworkProcessorAvgIdlePercent",
		"request.clientFetchesFailedPerSecond": "aws.msk.broker.FetchConsumerRequestsPerSec",
	}

	for kafkaMetric, mskMetric := range metricMappings {
		if value, exists := brokerData[kafkaMetric]; exists {
			if err := ms.SetMetric(mskMetric, value, metric.GAUGE); err != nil {
				log.Debug("Failed to set metric %s: %v", mskMetric, err)
			}
			
			// Also aggregate for cluster level
			t.shim.aggregator.AddBrokerMetric(mskMetric, value)
		}
	}

	// Add system metrics if available
	if cpuPercent, ok := getFloatValue(brokerData, "system.cpuPercent"); ok {
		ms.SetMetric("aws.msk.broker.CpuUser", cpuPercent, metric.GAUGE)
		t.shim.aggregator.AddBrokerMetric("aws.msk.broker.CpuUser", cpuPercent)
	}

	if memUsed, ok := getFloatValue(brokerData, "system.memoryUsedPercent"); ok {
		ms.SetMetric("aws.msk.broker.MemoryUsed", memUsed, metric.GAUGE)
		t.shim.aggregator.AddBrokerMetric("aws.msk.broker.MemoryUsed", memUsed)
	}

	if diskUsed, ok := getFloatValue(brokerData, "system.diskUsedPercent"); ok {
		ms.SetMetric("aws.msk.broker.RootDiskUsed", diskUsed, metric.GAUGE)
		t.shim.aggregator.AddBrokerMetric("aws.msk.broker.RootDiskUsed", diskUsed)
	}

	return nil
}

// TransformTopicMetricsSimple transforms topic metrics to MSK format  
func (t *SimpleTransformer) TransformTopicMetricsSimple(topicData map[string]interface{}) error {
	// Extract topic name
	topicName, ok := getStringValue(topicData, "topic.name")
	if !ok {
		return fmt.Errorf("topic.name not found in topic data")
	}

	// Create MSK topic entity
	entityName := fmt.Sprintf("%s-topic-%s", t.shim.config.ClusterName, topicName)
	entity, err := t.shim.GetOrCreateEntity("AwsMskTopicSample", entityName)
	if err != nil {
		return fmt.Errorf("failed to create topic entity: %w", err)
	}

	// Generate GUID
	guid := GenerateEntityGUID(EntityTypeTopic, t.shim.config.AWSAccountID,
		t.shim.config.ClusterName, topicName)

	// Create metric set with all attributes
	ms := entity.NewMetricSet("AwsMskTopicSample",
		attribute.Attribute{Key: "entity.guid", Value: guid},
		attribute.Attribute{Key: "entity.type", Value: string(EntityTypeTopic)},
		attribute.Attribute{Key: "entityName", Value: entityName},
		attribute.Attribute{Key: "entityGuid", Value: guid},
		attribute.Attribute{Key: "guid", Value: guid},
		attribute.Attribute{Key: "Name", Value: entityName},
		attribute.Attribute{Key: "Topic", Value: topicName},
		attribute.Attribute{Key: "provider.topic", Value: topicName},
		attribute.Attribute{Key: "provider.clusterName", Value: t.shim.config.ClusterName},
		attribute.Attribute{Key: "provider.accountId", Value: t.shim.config.AWSAccountID},
		attribute.Attribute{Key: "provider.region", Value: t.shim.config.AWSRegion},
		attribute.Attribute{Key: "provider.clusterArn", Value: t.shim.config.ClusterARN},
		attribute.Attribute{Key: "ClusterName", Value: t.shim.config.ClusterName},
		attribute.Attribute{Key: "ClusterArn", Value: t.shim.config.ClusterARN},
		attribute.Attribute{Key: "AccountId", Value: t.shim.config.AWSAccountID},
		attribute.Attribute{Key: "Region", Value: t.shim.config.AWSRegion},
		attribute.Attribute{Key: "Environment", Value: t.shim.config.Environment},
	)

	// Transform and add metrics
	topicMetricMappings := map[string]string{
		"topic.bytesInPerSecond": "aws.msk.topic.BytesInPerSec",
		"topic.bytesOutPerSecond": "aws.msk.topic.BytesOutPerSec",
		"topic.messagesInPerSecond": "aws.msk.topic.MessagesInPerSec",
		"topic.bytesRejectedPerSecond": "aws.msk.topic.BytesRejectedPerSec",
		"topic.partitionsCount": "aws.msk.topic.PartitionCount",
		"topic.replicationFactor": "aws.msk.topic.ReplicationFactor",
		"topic.underReplicatedPartitions": "aws.msk.topic.UnderReplicatedPartitions",
		"topic.minInsyncReplicas": "aws.msk.topic.MinInSyncReplicas",
	}

	for kafkaMetric, mskMetric := range topicMetricMappings {
		if value, exists := topicData[kafkaMetric]; exists {
			if err := ms.SetMetric(mskMetric, value, metric.GAUGE); err != nil {
				log.Debug("Failed to set metric %s: %v", mskMetric, err)
			}
			
			// Also aggregate for cluster level
			t.shim.aggregator.AddTopicMetric(topicName, mskMetric, value)
		}
	}

	return nil
}

// CreateClusterEntitySimple creates the cluster-level entity with aggregated metrics
func (t *SimpleTransformer) CreateClusterEntitySimple() error {
	entityName := t.shim.config.ClusterName
	entity, err := t.shim.GetOrCreateEntity("AwsMskClusterSample", entityName)
	if err != nil {
		return fmt.Errorf("failed to create cluster entity: %w", err)
	}

	// Generate GUID
	guid := GenerateEntityGUID(EntityTypeCluster, t.shim.config.AWSAccountID,
		t.shim.config.ClusterName, 0)

	// Create metric set with all attributes
	ms := entity.NewMetricSet("AwsMskClusterSample",
		attribute.Attribute{Key: "entity.guid", Value: guid},
		attribute.Attribute{Key: "entity.type", Value: string(EntityTypeCluster)},
		attribute.Attribute{Key: "entityName", Value: entityName},
		attribute.Attribute{Key: "entityGuid", Value: guid},
		attribute.Attribute{Key: "guid", Value: guid},
		attribute.Attribute{Key: "Name", Value: entityName},
		attribute.Attribute{Key: "provider.clusterName", Value: t.shim.config.ClusterName},
		attribute.Attribute{Key: "provider.accountId", Value: t.shim.config.AWSAccountID},
		attribute.Attribute{Key: "provider.region", Value: t.shim.config.AWSRegion},
		attribute.Attribute{Key: "provider.clusterArn", Value: t.shim.config.ClusterARN},
		attribute.Attribute{Key: "ClusterName", Value: t.shim.config.ClusterName},
		attribute.Attribute{Key: "ClusterArn", Value: t.shim.config.ClusterARN},
		attribute.Attribute{Key: "AccountId", Value: t.shim.config.AWSAccountID},
		attribute.Attribute{Key: "Region", Value: t.shim.config.AWSRegion},
		attribute.Attribute{Key: "Environment", Value: t.shim.config.Environment},
	)

	// Add aggregated metrics
	aggregatedMetrics := t.shim.aggregator.GetAggregatedMetrics()
	for metricName, value := range aggregatedMetrics {
		if err := ms.SetMetric(metricName, value, metric.GAUGE); err != nil {
			log.Debug("Failed to set aggregated metric %s: %v", metricName, err)
		}
	}

	// Add broker and topic counts
	ms.SetMetric("aws.msk.cluster.BrokerCount", t.shim.aggregator.GetBrokerCount(), metric.GAUGE)
	ms.SetMetric("aws.msk.cluster.TopicCount", t.shim.aggregator.GetTopicCount(), metric.GAUGE)

	return nil
}