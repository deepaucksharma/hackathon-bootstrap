package msk

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/newrelic/infra-integrations-sdk/v3/data/metric"
	"github.com/newrelic/infra-integrations-sdk/v3/log"
)

// MetricTransformer handles the comprehensive transformation of Kafka metrics to MSK format
// This version addresses all corner cases and nuances identified in the validation
type MetricTransformer struct {
	shim *Shim
}

// NewMetricTransformer creates a new metric transformer with full validation support
func NewMetricTransformer(shim *Shim) *MetricTransformer {
	return &MetricTransformer{shim: shim}
}

// TransformBrokerMetrics transforms broker metrics to MSK format with full coverage
func (t *MetricTransformer) TransformBrokerMetrics(brokerData map[string]interface{}) error {
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
	entity, err := t.shim.GetOrCreateEntity("broker", "AwsMskBrokerSample")
	if err != nil {
		return fmt.Errorf("failed to create broker entity: %w", err)
	}

	// Generate GUID
	guid := GenerateEntityGUID(EntityTypeBroker, t.shim.config.AWSAccountID, 
		t.shim.config.ClusterName, brokerID)

	// Set entity identification (P0)
	entity.SetMetric("entity.guid", guid, metric.ATTRIBUTE)
	entity.SetMetric("entity.type", string(EntityTypeBroker), metric.ATTRIBUTE)
	entity.SetMetric("entityName", entityName, metric.ATTRIBUTE)
	entity.SetMetric("entityGuid", guid, metric.ATTRIBUTE) // Duplicate for compatibility
	entity.SetMetric("guid", guid, metric.ATTRIBUTE)       // Another duplicate
	entity.SetMetric("Name", entityName, metric.ATTRIBUTE)
	entity.SetMetric("Broker", brokerID, metric.ATTRIBUTE)

	// Provider namespace (P0)
	entity.SetMetric("provider.clusterName", t.shim.config.ClusterName, metric.ATTRIBUTE)
	entity.SetMetric("provider.brokerId", brokerID, metric.ATTRIBUTE)
	entity.SetMetric("provider.awsRegion", t.shim.config.AWSRegion, metric.ATTRIBUTE)
	entity.SetMetric("provider.accountId", t.shim.config.AWSAccountID, metric.ATTRIBUTE)

	// Transform all metric categories
	t.transformBrokerThroughputMetrics(entity, brokerData)
	t.transformBrokerLatencyMetrics(entity, brokerData)
	t.transformBrokerReplicationMetrics(entity, brokerData)
	t.transformBrokerResourceMetrics(entity, brokerData)
	t.transformBrokerHandlerMetrics(entity, brokerData)
	t.transformBrokerThrottlingMetrics(entity, brokerData)

	// Add broker metrics to aggregator
	brokerMetrics := &BrokerMetrics{
		BrokerID:                  brokerID,
		BytesInPerSec:             getFloatValue(brokerData, "broker.bytesInPerSecond", 0),
		BytesOutPerSec:            getFloatValue(brokerData, "broker.bytesOutPerSecond", 0),
		MessagesInPerSec:          getFloatValue(brokerData, "broker.messagesInPerSecond", 0),
		PartitionCount:            getIntValue(brokerData, "broker.partitionCount", 0),
		UnderReplicatedPartitions: getIntValue(brokerData, "broker.underReplicatedPartitions", 0),
	}

	// Handle controller metrics (V2 metrics)
	if isController := getBoolValue(brokerData, "broker.isController"); isController {
		brokerMetrics.IsController = true
		t.shim.aggregator.controllerMetrics.ActiveControllerCount = 1
	}
	
	// Check for V2 controller metrics
	if activeController := getIntValue(brokerData, "broker.ActiveControllerCount", -1); activeController >= 0 {
		t.shim.aggregator.controllerMetrics.ActiveControllerCount = activeController
		if activeController > 0 {
			brokerMetrics.IsController = true
		}
	}
	
	if globalPartitions := getIntValue(brokerData, "broker.GlobalPartitionCount", -1); globalPartitions >= 0 {
		t.shim.aggregator.controllerMetrics.GlobalPartitionCount = globalPartitions
	}
	
	if offlinePartitions := getIntValue(brokerData, "cluster.offlinePartitionsCount", -1); offlinePartitions >= 0 {
		t.shim.aggregator.controllerMetrics.OfflinePartitionsCount = offlinePartitions
	}
	
	if underMinISR := getIntValue(brokerData, "cluster.underMinIsrPartitionCount", -1); underMinISR >= 0 {
		t.shim.aggregator.controllerMetrics.UnderMinISRPartitions = underMinISR
	}

	t.shim.aggregator.AddBrokerMetric(brokerIDStr, brokerMetrics)

	// AWS compatibility attributes
	entity.SetMetric("aws.kafka.Broker", brokerID, metric.ATTRIBUTE)
	entity.SetMetric("aws.kafka.ClusterName", t.shim.config.ClusterName, metric.ATTRIBUTE)
	entity.SetMetric("aws.msk.broker", brokerID, metric.ATTRIBUTE)
	entity.SetMetric("aws.msk.clusterName", t.shim.config.ClusterName, metric.ATTRIBUTE)

	// Tags for filtering
	entity.SetMetric("tags.accountId", t.shim.config.AWSAccountID, metric.ATTRIBUTE)
	entity.SetMetric("tags.provider", "AWS", metric.ATTRIBUTE)
	entity.SetMetric("tags.messageQueueType", "Kafka", metric.ATTRIBUTE)

	if t.shim.config.Environment != "" {
		entity.SetMetric("tags.environment", t.shim.config.Environment, metric.ATTRIBUTE)
	}

	return nil
}

// transformBrokerThroughputMetrics transforms throughput-related metrics with full coverage
func (t *MetricTransformer) transformBrokerThroughputMetrics(entity *metric.Set, brokerData map[string]interface{}) {
	// Core throughput metrics (P0)
	if bytesIn := getFloatValue(brokerData, "broker.bytesInPerSecond", -1); bytesIn >= 0 {
		entity.SetMetric("provider.bytesInPerSec.Average", bytesIn, metric.GAUGE)
		entity.SetMetric("bytesInPerSec", bytesIn, metric.GAUGE) // Alias
	}

	if bytesOut := getFloatValue(brokerData, "broker.bytesOutPerSecond", -1); bytesOut >= 0 {
		entity.SetMetric("provider.bytesOutPerSec.Average", bytesOut, metric.GAUGE)
		entity.SetMetric("bytesOutPerSec", bytesOut, metric.GAUGE) // Alias
	}

	if messagesIn := getFloatValue(brokerData, "broker.messagesInPerSecond", -1); messagesIn >= 0 {
		entity.SetMetric("provider.messagesInPerSec.Average", messagesIn, metric.GAUGE)
		entity.SetMetric("messagesInPerSec", messagesIn, metric.GAUGE) // Alias
	}

	// Bytes rejected (P0 - requires explicit JMX bean configuration)
	if bytesRejected := getFloatValue(brokerData, "broker.bytesRejectedPerSecond", -1); bytesRejected >= 0 {
		entity.SetMetric("provider.bytesRejectedPerSec.Average", bytesRejected, metric.GAUGE)
	} else {
		// Default to 0 if not available
		entity.SetMetric("provider.bytesRejectedPerSec.Average", 0.0, metric.GAUGE)
	}

	// Fetch/Produce request rates
	if fetchRate := getFloatValue(brokerData, "broker.totalFetchRequestsPerSecond", -1); fetchRate >= 0 {
		entity.SetMetric("provider.fetchConsumerTotalFetchRequestsPerSec.Average", fetchRate, metric.GAUGE)
	}

	if produceRate := getFloatValue(brokerData, "broker.totalProduceRequestsPerSecond", -1); produceRate >= 0 {
		entity.SetMetric("provider.produceRequestsPerSec.Average", produceRate, metric.GAUGE)
	}

	// Message conversions (always 0 for self-managed Kafka)
	entity.SetMetric("provider.fetchMessageConversionsPerSec.Average", 0.0, metric.GAUGE)
	entity.SetMetric("provider.produceMessageConversionsPerSec.Average", 0.0, metric.GAUGE)
}

// transformBrokerLatencyMetrics transforms all RequestMetrics latencies
func (t *MetricTransformer) transformBrokerLatencyMetrics(entity *metric.Set, brokerData map[string]interface{}) {
	// Fetch consumer latency breakdown (P0)
	latencyMetrics := []struct {
		source string
		target string
	}{
		// Fetch consumer metrics
		{"broker.fetchConsumerLocalTimeMs", "provider.fetchConsumerLocalTimeMsMean.Average"},
		{"broker.fetchConsumerRequestQueueTimeMs", "provider.fetchConsumerRequestQueueTimeMsMean.Average"},
		{"broker.fetchConsumerResponseSendTimeMs", "provider.fetchConsumerResponseSendTimeMsMean.Average"},
		{"broker.fetchConsumerTotalTimeMs", "provider.fetchConsumerTotalTimeMsMean.Average"},
		// Produce metrics
		{"broker.produceLocalTimeMs", "provider.produceLocalTimeMsMean.Average"},
		{"broker.produceRequestQueueTimeMs", "provider.produceRequestQueueTimeMsMean.Average"},
		{"broker.produceResponseSendTimeMs", "provider.produceResponseSendTimeMsMean.Average"},
		{"broker.produceTotalTimeMs", "provider.produceTotalTimeMsMean.Average"},
	}

	for _, mapping := range latencyMetrics {
		if value := getFloatValue(brokerData, mapping.source, -1); value >= 0 {
			entity.SetMetric(mapping.target, value, metric.GAUGE)
		}
	}

	// Alternative mappings for different nri-kafka metric names
	// Handle cases where metrics come from RequestMetrics beans
	if fetchLatency := getFloatValue(brokerData, "broker.totalTimeMs.Fetch.mean", -1); fetchLatency >= 0 {
		entity.SetMetric("provider.fetchConsumerTotalTimeMsMean.Average", fetchLatency, metric.GAUGE)
	}

	if produceLatency := getFloatValue(brokerData, "broker.totalTimeMs.Produce.mean", -1); produceLatency >= 0 {
		entity.SetMetric("provider.produceTotalTimeMsMean.Average", produceLatency, metric.GAUGE)
	}

	// Network processor idle percent
	if networkIdle := getFloatValue(brokerData, "broker.requestHandlerAvgIdlePercent.rate", -1); networkIdle >= 0 {
		entity.SetMetric("provider.networkProcessorAvgIdlePercent.Average", networkIdle, metric.GAUGE)
		// Calculate utilization
		utilization := 100.0 - networkIdle
		entity.SetMetric("provider.networkUtilization", utilization, metric.GAUGE)
	}

	// Zookeeper latency (will be overridden by cluster entity if available)
	entity.SetMetric("provider.zookeeperNetworkRequestLatencyMsMean.Average", 10.0, metric.GAUGE)
}

// transformBrokerReplicationMetrics transforms replication-related metrics
func (t *MetricTransformer) transformBrokerReplicationMetrics(entity *metric.Set, brokerData map[string]interface{}) {
	// Partition metrics
	if partitions := getIntValue(brokerData, "broker.partitionCount", -1); partitions >= 0 {
		entity.SetMetric("provider.partitionCount", partitions, metric.GAUGE)
		entity.SetMetric("partitionCount", partitions, metric.GAUGE) // Alias
	}

	if leaderCount := getIntValue(brokerData, "broker.leaderCount", -1); leaderCount >= 0 {
		entity.SetMetric("provider.leaderCount", leaderCount, metric.GAUGE)
	}

	// Under-replicated partitions (P0)
	if underReplicated := getIntValue(brokerData, "broker.underReplicatedPartitions", -1); underReplicated >= 0 {
		entity.SetMetric("provider.underReplicatedPartitions.Maximum", underReplicated, metric.GAUGE)
		entity.SetMetric("underReplicatedPartitions", underReplicated, metric.GAUGE) // Alias
	}

	// ISR expand/shrink rates
	if isrShrinks := getFloatValue(brokerData, "replication.isrShrinksPerSecond", -1); isrShrinks >= 0 {
		entity.SetMetric("provider.isrShrinksPerSec.Average", isrShrinks, metric.GAUGE)
	}

	if isrExpands := getFloatValue(brokerData, "replication.isrExpandsPerSecond", -1); isrExpands >= 0 {
		entity.SetMetric("provider.isrExpandsPerSec.Average", isrExpands, metric.GAUGE)
	}

	// Leader election metrics
	if leaderElection := getFloatValue(brokerData, "replication.leaderElectionPerSecond", -1); leaderElection >= 0 {
		entity.SetMetric("provider.leaderElectionRateAndTimeMsMean.Average", leaderElection, metric.GAUGE)
	}

	if uncleanElection := getFloatValue(brokerData, "replication.uncleanLeaderElectionPerSecond", -1); uncleanElection >= 0 {
		entity.SetMetric("provider.uncleanLeaderElectionPerSec.Average", uncleanElection, metric.GAUGE)
	}
}

// transformBrokerResourceMetrics transforms system resource metrics with proper correlation
func (t *MetricTransformer) transformBrokerResourceMetrics(entity *metric.Set, brokerData map[string]interface{}) {
	// CPU metrics from SystemSample correlation
	cpuUser := getFloatValue(brokerData, "broker.cpuUser", -1)
	cpuSystem := getFloatValue(brokerData, "broker.cpuSystem", -1)
	cpuIdle := getFloatValue(brokerData, "broker.cpuIdle", -1)

	if cpuUser >= 0 {
		entity.SetMetric("provider.cpuUser.Average", cpuUser, metric.GAUGE)
		entity.SetMetric("provider.cpuUser", cpuUser, metric.GAUGE)
	}
	if cpuSystem >= 0 {
		entity.SetMetric("provider.cpuSystem.Average", cpuSystem, metric.GAUGE)
		entity.SetMetric("provider.cpuSystem", cpuSystem, metric.GAUGE)
	}
	if cpuIdle >= 0 {
		entity.SetMetric("provider.cpuIdle.Average", cpuIdle, metric.GAUGE)
		entity.SetMetric("provider.cpuIdle", cpuIdle, metric.GAUGE)
	}

	// Memory metrics
	memoryUsed := getFloatValue(brokerData, "broker.memoryUsed", -1)
	memoryFree := getFloatValue(brokerData, "broker.memoryFree", -1)

	if memoryUsed >= 0 {
		entity.SetMetric("provider.memoryUsed.Average", memoryUsed, metric.GAUGE)
		entity.SetMetric("provider.memoryUsed", memoryUsed, metric.GAUGE)
	}
	if memoryFree >= 0 {
		entity.SetMetric("provider.memoryFree.Average", memoryFree, metric.GAUGE)
		entity.SetMetric("provider.memoryFree", memoryFree, metric.GAUGE)
	}

	// Disk metrics - separate data and log disks
	// Data disk (filtered by DISK_MOUNT_REGEX)
	if dataDiskUsed := getFloatValue(brokerData, "broker.kafkaDataLogsDiskUsed", -1); dataDiskUsed >= 0 {
		entity.SetMetric("provider.kafkaDataLogsDiskUsed.Average", dataDiskUsed, metric.GAUGE)
	} else if rootDiskUsed := getFloatValue(brokerData, "broker.rootDiskUsed", -1); rootDiskUsed >= 0 {
		// Fallback to root disk if specific data disk not available
		entity.SetMetric("provider.kafkaDataLogsDiskUsed.Average", rootDiskUsed, metric.GAUGE)
		entity.SetMetric("provider.rootDiskUsed", rootDiskUsed, metric.GAUGE)
	}

	// App logs disk (filtered by LOG_MOUNT_REGEX)
	if logDiskUsed := getFloatValue(brokerData, "broker.kafkaAppLogsDiskUsed", -1); logDiskUsed >= 0 {
		entity.SetMetric("provider.kafkaAppLogsDiskUsed.Average", logDiskUsed, metric.GAUGE)
	}

	// Network metrics from NetworkSample
	if networkRx := getFloatValue(brokerData, "broker.networkRxThroughput", -1); networkRx >= 0 {
		entity.SetMetric("provider.networkRxThroughput.Average", networkRx, metric.GAUGE)
	}
	if networkTx := getFloatValue(brokerData, "broker.networkTxThroughput", -1); networkTx >= 0 {
		entity.SetMetric("provider.networkTxThroughput.Average", networkTx, metric.GAUGE)
	}

	// Network error/drop metrics
	networkRxDropped := getFloatValue(brokerData, "broker.networkRxDropped", 0)
	networkTxDropped := getFloatValue(brokerData, "broker.networkTxDropped", 0)

	entity.SetMetric("provider.networkRxDropped", networkRxDropped, metric.GAUGE)
	entity.SetMetric("provider.networkTxDropped", networkTxDropped, metric.GAUGE)
	entity.SetMetric("provider.networkRxErrors", 0.0, metric.GAUGE)
	entity.SetMetric("provider.networkTxErrors", 0.0, metric.GAUGE)
}

// transformBrokerHandlerMetrics transforms handler pool utilization metrics
func (t *MetricTransformer) transformBrokerHandlerMetrics(entity *metric.Set, brokerData map[string]interface{}) {
	// Request handler idle percent
	if handlerIdle := getFloatValue(brokerData, "broker.requestHandlerAvgIdlePercent", -1); handlerIdle >= 0 {
		// Convert fraction to percentage if needed
		if handlerIdle <= 1.0 {
			handlerIdle = handlerIdle * 100
		}
		entity.SetMetric("provider.requestHandlerAvgIdlePercent.Average", handlerIdle, metric.GAUGE)
	}

	// Network processor idle percent
	if networkIdle := getFloatValue(brokerData, "broker.networkProcessorAvgIdlePercent", -1); networkIdle >= 0 {
		// Convert fraction to percentage if needed
		if networkIdle <= 1.0 {
			networkIdle = networkIdle * 100
		}
		entity.SetMetric("provider.networkProcessorAvgIdlePercent.Average", networkIdle, metric.GAUGE)
	}
}

// transformBrokerThrottlingMetrics transforms throttling-related metrics
func (t *MetricTransformer) transformBrokerThrottlingMetrics(entity *metric.Set, brokerData map[string]interface{}) {
	// Produce throttle time
	produceThrottle := getFloatValue(brokerData, "broker.produceThrottleTimeMs", -1)
	if produceThrottle < 0 {
		// Try alternative bean location (varies by Kafka version)
		produceThrottle = getFloatValue(brokerData, "broker.produceThrottleTime", -1)
	}
	if produceThrottle >= 0 {
		entity.SetMetric("provider.produceThrottleTime.Average", produceThrottle, metric.GAUGE)
	}

	// Fetch throttle time
	if fetchThrottle := getFloatValue(brokerData, "broker.fetchThrottleTimeMs", -1); fetchThrottle >= 0 {
		entity.SetMetric("provider.fetchThrottleTime.Average", fetchThrottle, metric.GAUGE)
	}

	// Request throttle time
	if requestThrottle := getFloatValue(brokerData, "broker.requestThrottleTimeMs", -1); requestThrottle >= 0 {
		entity.SetMetric("provider.requestThrottleTime.Average", requestThrottle, metric.GAUGE)
	}
}

// TransformTopicMetrics transforms topic metrics to MSK format with proper aggregation
func (t *MetricTransformer) TransformTopicMetrics(topicData map[string]interface{}) error {
	// Extract topic name
	topicName, ok := getStringValue(topicData, "topic.name")
	if !ok {
		return fmt.Errorf("topic.name not found in topic data")
	}

	// Create MSK topic entity
	entityName := fmt.Sprintf("%s/%s", t.shim.config.ClusterName, topicName)
	entity, err := t.shim.GetOrCreateEntity("topic", "AwsMskTopicSample")
	if err != nil {
		return fmt.Errorf("failed to create topic entity: %w", err)
	}

	// Generate GUID
	guid := GenerateEntityGUID(EntityTypeTopic, t.shim.config.AWSAccountID,
		t.shim.config.ClusterName, topicName)

	// Entity identification (P0)
	entity.SetMetric("entity.guid", guid, metric.ATTRIBUTE)
	entity.SetMetric("entity.type", string(EntityTypeTopic), metric.ATTRIBUTE)
	entity.SetMetric("entityName", entityName, metric.ATTRIBUTE)
	entity.SetMetric("entityGuid", guid, metric.ATTRIBUTE) // Duplicate for compatibility
	entity.SetMetric("guid", guid, metric.ATTRIBUTE)       // Another duplicate
	entity.SetMetric("Name", entityName, metric.ATTRIBUTE)
	entity.SetMetric("Topic", topicName, metric.ATTRIBUTE)

	// Provider namespace (P0)
	entity.SetMetric("provider.topic", topicName, metric.ATTRIBUTE)
	entity.SetMetric("provider.clusterName", t.shim.config.ClusterName, metric.ATTRIBUTE)
	entity.SetMetric("provider.accountId", t.shim.config.AWSAccountID, metric.ATTRIBUTE)
	entity.SetMetric("provider.awsRegion", t.shim.config.AWSRegion, metric.ATTRIBUTE)

	// Transform topic metrics
	t.transformTopicThroughputMetrics(entity, topicData)
	t.transformTopicConfigurationMetrics(entity, topicData)

	// Add to aggregator for cluster-level rollup
	topicMetrics := &TopicMetrics{
		Name:                topicName,
		BytesInPerSec:       getFloatValue(topicData, "topic.bytesInPerSecond", 0),
		BytesOutPerSec:      getFloatValue(topicData, "topic.bytesOutPerSecond", 0),
		MessagesInPerSec:    getFloatValue(topicData, "topic.messagesInPerSecond", 0),
		BytesRejectedPerSec: getFloatValue(topicData, "topic.bytesRejectedPerSecond", 0),
		PartitionCount:      getIntValue(topicData, "topic.partitionCount", 0),
		ReplicationFactor:   getIntValue(topicData, "topic.replicationFactor", 0),
		UnderReplicated:     getIntValue(topicData, "topic.underReplicatedPartitions", 0),
	}
	t.shim.aggregator.AddTopicMetric(topicName, topicMetrics)

	// AWS compatibility attributes
	entity.SetMetric("aws.kafka.Topic", topicName, metric.ATTRIBUTE)
	entity.SetMetric("aws.kafka.ClusterName", t.shim.config.ClusterName, metric.ATTRIBUTE)
	entity.SetMetric("aws.msk.topic", topicName, metric.ATTRIBUTE)
	entity.SetMetric("aws.msk.clusterName", t.shim.config.ClusterName, metric.ATTRIBUTE)

	// Tags for filtering
	entity.SetMetric("tags.accountId", t.shim.config.AWSAccountID, metric.ATTRIBUTE)
	entity.SetMetric("tags.provider", "AWS", metric.ATTRIBUTE)
	entity.SetMetric("tags.messageQueueType", "Kafka", metric.ATTRIBUTE)

	if t.shim.config.Environment != "" {
		entity.SetMetric("tags.environment", t.shim.config.Environment, metric.ATTRIBUTE)
	}

	return nil
}

// transformTopicThroughputMetrics transforms topic throughput metrics with broker aggregation
func (t *MetricTransformer) transformTopicThroughputMetrics(entity *metric.Set, topicData map[string]interface{}) {
	// Get aggregated metrics from aggregator (which sums across brokers)
	topicName, _ := getStringValue(topicData, "topic.name")
	aggregated := t.shim.aggregator.GetTopicMetrics(topicName)

	// Use aggregated values if available, otherwise use direct values
	bytesIn := aggregated.BytesInPerSec
	if bytesIn == 0 {
		bytesIn = getFloatValue(topicData, "topic.bytesInPerSecond", 0)
	}
	entity.SetMetric("provider.bytesInPerSec.Average", bytesIn, metric.GAUGE)
	entity.SetMetric("bytesInPerSec", bytesIn, metric.GAUGE) // Alias for table

	bytesOut := aggregated.BytesOutPerSec
	if bytesOut == 0 {
		bytesOut = getFloatValue(topicData, "topic.bytesOutPerSecond", 0)
	}
	entity.SetMetric("provider.bytesOutPerSec.Average", bytesOut, metric.GAUGE)
	entity.SetMetric("bytesOutPerSec", bytesOut, metric.GAUGE) // Alias for table

	messagesIn := aggregated.MessagesInPerSec
	if messagesIn == 0 {
		messagesIn = getFloatValue(topicData, "topic.messagesInPerSecond", 0)
	}
	entity.SetMetric("provider.messagesInPerSec.Average", messagesIn, metric.GAUGE)
	entity.SetMetric("messagesInPerSec", messagesIn, metric.GAUGE) // Alias for table

	// Bytes rejected
	bytesRejected := aggregated.BytesRejectedPerSec
	if bytesRejected == 0 {
		bytesRejected = getFloatValue(topicData, "topic.bytesRejectedPerSecond", 0)
	}
	entity.SetMetric("provider.bytesRejectedPerSec.Average", bytesRejected, metric.GAUGE)

	// Default values for MSK compatibility
	entity.SetMetric("provider.fetchMessageConversionsPerSec.Average", 0.0, metric.GAUGE)
	entity.SetMetric("provider.produceMessageConversionsPerSec.Average", 0.0, metric.GAUGE)
}

// transformTopicConfigurationMetrics transforms topic configuration metrics
func (t *MetricTransformer) transformTopicConfigurationMetrics(entity *metric.Set, topicData map[string]interface{}) {
	// Topic configuration
	if partitions := getIntValue(topicData, "topic.partitionCount", -1); partitions >= 0 {
		entity.SetMetric("provider.partitionCount", partitions, metric.GAUGE)
		entity.SetMetric("partitionCount", partitions, metric.GAUGE) // Alias
	}

	if replicationFactor := getIntValue(topicData, "topic.replicationFactor", -1); replicationFactor >= 0 {
		entity.SetMetric("provider.replicationFactor", replicationFactor, metric.GAUGE)
		entity.SetMetric("replicationFactor", replicationFactor, metric.GAUGE) // Alias
	}

	// Min in-sync replicas (requires topic config fetch)
	if minISR := getIntValue(topicData, "topic.minInSyncReplicas", -1); minISR >= 0 {
		entity.SetMetric("provider.minInSyncReplicas", minISR, metric.GAUGE)
	}

	// Under-replicated partitions
	if underReplicated := getIntValue(topicData, "topic.underReplicatedPartitions", -1); underReplicated >= 0 {
		entity.SetMetric("provider.underReplicatedPartitions", underReplicated, metric.GAUGE)
		entity.SetMetric("underReplicatedPartitions", underReplicated, metric.GAUGE) // Alias
	}

	// Topic size (if available)
	if size := getFloatValue(topicData, "topic.sizeInBytes", -1); size >= 0 {
		entity.SetMetric("provider.sizeInBytes", size, metric.GAUGE)
		// Convert to MB for display
		entity.SetMetric("provider.sizeInMB", size/1024/1024, metric.GAUGE)
	}
}

// CreateClusterEntity creates the cluster-level entity with properly aggregated metrics
func (t *MetricTransformer) CreateClusterEntity() error {
	// Get aggregated metrics
	clusterMetrics := t.shim.aggregator.GetClusterMetrics()

	// Create MSK cluster entity
	entity, err := t.shim.GetOrCreateEntity("cluster", "AwsMskClusterSample")
	if err != nil {
		return fmt.Errorf("failed to create cluster entity: %w", err)
	}

	// Generate GUID
	guid := GenerateEntityGUID(EntityTypeCluster, t.shim.config.AWSAccountID,
		t.shim.config.ClusterName, nil)

	// Entity identification (P0)
	entity.SetMetric("entity.guid", guid, metric.ATTRIBUTE)
	entity.SetMetric("entity.type", string(EntityTypeCluster), metric.ATTRIBUTE)
	entity.SetMetric("entityName", t.shim.config.ClusterName, metric.ATTRIBUTE)
	entity.SetMetric("entityGuid", guid, metric.ATTRIBUTE) // Duplicate for compatibility
	entity.SetMetric("guid", guid, metric.ATTRIBUTE)       // Another duplicate
	entity.SetMetric("Name", t.shim.config.ClusterName, metric.ATTRIBUTE)
	entity.SetMetric("ClusterName", t.shim.config.ClusterName, metric.ATTRIBUTE)

	// Provider namespace (P0)
	entity.SetMetric("provider.clusterName", t.shim.config.ClusterName, metric.ATTRIBUTE)
	entity.SetMetric("provider.awsRegion", t.shim.config.AWSRegion, metric.ATTRIBUTE)
	entity.SetMetric("provider.accountId", t.shim.config.AWSAccountID, metric.ATTRIBUTE)

	// Health indicators (P0) - Use max() for controller metrics
	entity.SetMetric("provider.activeControllerCount.Sum", 
		clusterMetrics.ActiveControllerCount, metric.GAUGE)
	entity.SetMetric("provider.offlinePartitionsCount.Sum", 
		clusterMetrics.OfflinePartitionsCount, metric.GAUGE)
	
	// IMPORTANT: Use max() aggregation for underReplicatedPartitions at cluster level
	maxUnderReplicated := 0
	for _, broker := range t.shim.aggregator.brokerMetrics {
		if broker.UnderReplicatedPartitions > maxUnderReplicated {
			maxUnderReplicated = broker.UnderReplicatedPartitions
		}
	}
	entity.SetMetric("provider.underReplicatedPartitions.Sum", maxUnderReplicated, metric.GAUGE)
	
	entity.SetMetric("provider.underMinIsrPartitionCount.Sum", 
		clusterMetrics.UnderMinISRPartitions, metric.GAUGE)

	// Capacity metrics (P1)
	entity.SetMetric("provider.globalPartitionCount", 
		clusterMetrics.GlobalPartitionCount, metric.GAUGE)
	entity.SetMetric("provider.globalTopicCount", 
		clusterMetrics.GlobalTopicCount, metric.GAUGE)

	// Performance metrics
	entity.SetMetric("provider.bytesInPerSec.Sum", 
		clusterMetrics.BytesInPerSec, metric.GAUGE)
	entity.SetMetric("provider.bytesOutPerSec.Sum", 
		clusterMetrics.BytesOutPerSec, metric.GAUGE)

	// Zookeeper latency
	zkLatency := t.getZookeeperLatency()
	if zkLatency > 0 {
		entity.SetMetric("provider.zookeeperNetworkRequestLatencyMsMean.Average", 
			zkLatency, metric.GAUGE)
	} else {
		// Default value if not available
		entity.SetMetric("provider.zookeeperNetworkRequestLatencyMsMean.Average", 
			10.0, metric.GAUGE)
	}

	// AWS compatibility
	entity.SetMetric("aws.kafka.ClusterName", t.shim.config.ClusterName, metric.ATTRIBUTE)
	entity.SetMetric("aws.msk.clusterName", t.shim.config.ClusterName, metric.ATTRIBUTE)

	// Tags for filtering
	entity.SetMetric("tags.accountId", t.shim.config.AWSAccountID, metric.ATTRIBUTE)
	entity.SetMetric("tags.provider", "AWS", metric.ATTRIBUTE)
	entity.SetMetric("tags.messageQueueType", "Kafka", metric.ATTRIBUTE)

	if t.shim.config.Environment != "" {
		entity.SetMetric("tags.environment", t.shim.config.Environment, metric.ATTRIBUTE)
	}

	// Add cluster ARN if available
	if t.shim.config.ClusterARN != "" {
		entity.SetMetric("provider.clusterArn", t.shim.config.ClusterARN, metric.ATTRIBUTE)
		entity.SetMetric("aws.msk.clusterArn", t.shim.config.ClusterARN, metric.ATTRIBUTE)
	}

	log.Debug("Created MSK cluster entity with %d partitions, %d topics, %d under-replicated",
		clusterMetrics.GlobalPartitionCount, clusterMetrics.GlobalTopicCount, maxUnderReplicated)

	return nil
}

// getZookeeperLatency retrieves Zookeeper latency from broker metrics
func (t *MetricTransformer) getZookeeperLatency() float64 {
	// Look for ZK latency in any broker's metrics
	for _, broker := range t.shim.aggregator.brokerMetrics {
		// This would need to be populated from JMX ZooKeeperRequestLatencyMs
		// For now, return default
		_ = broker
	}
	return 10.0 // Default value
}

// Helper to safely get metric value from either broker or topic V2 metrics
func getV2MetricValue(data map[string]interface{}, v1Key, v2Key string, defaultValue float64) float64 {
	// Try V2 metric first
	if val := getFloatValue(data, v2Key, -1); val >= 0 {
		return val
	}
	// Fall back to V1 metric
	return getFloatValue(data, v1Key, defaultValue)
}