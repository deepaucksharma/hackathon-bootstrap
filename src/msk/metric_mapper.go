package msk

import (
	"fmt"
	"strings"
)

// MetricMapper provides comprehensive mapping between Kafka JMX metrics and MSK metrics
type MetricMapper struct {
	// Broker metric mappings
	brokerMappings map[string]string
	
	// Request metric mappings (with request type)
	requestMappings map[string]RequestMapping
	
	// Topic metric mappings
	topicMappings map[string]string
}

// RequestMapping defines how to map RequestMetrics beans
type RequestMapping struct {
	MetricName   string
	RequestType  string
	AttributeName string
}

// NewMetricMapper creates a comprehensive metric mapper
func NewMetricMapper() *MetricMapper {
	m := &MetricMapper{
		brokerMappings:  make(map[string]string),
		requestMappings: make(map[string]RequestMapping),
		topicMappings:   make(map[string]string),
	}
	
	m.initializeBrokerMappings()
	m.initializeRequestMappings()
	m.initializeTopicMappings()
	
	return m
}

// initializeBrokerMappings sets up broker metric mappings
func (m *MetricMapper) initializeBrokerMappings() {
	// Throughput metrics
	m.brokerMappings["broker.bytesInPerSecond"] = "provider.bytesInPerSec.Average"
	m.brokerMappings["broker.bytesOutPerSecond"] = "provider.bytesOutPerSec.Average"
	m.brokerMappings["broker.messagesInPerSecond"] = "provider.messagesInPerSec.Average"
	m.brokerMappings["broker.bytesRejectedPerSecond"] = "provider.bytesRejectedPerSec.Average"
	
	// V2 metrics
	m.brokerMappings["broker.ActiveControllerCount"] = "controller.activeCount"
	m.brokerMappings["broker.GlobalPartitionCount"] = "controller.globalPartitionCount"
	m.brokerMappings["broker.bytesReadFromTopicPerSecond"] = "provider.topicBytesOutPerSec"
	m.brokerMappings["broker.messagesProducedToTopicPerSecond"] = "provider.topicMessagesInPerSec"
	
	// Replication metrics
	m.brokerMappings["broker.underReplicatedPartitions"] = "provider.underReplicatedPartitions.Maximum"
	m.brokerMappings["replication.isrShrinksPerSecond"] = "provider.isrShrinksPerSec.Average"
	m.brokerMappings["replication.isrExpandsPerSecond"] = "provider.isrExpandsPerSec.Average"
	m.brokerMappings["replication.leaderElectionPerSecond"] = "provider.leaderElectionRateAndTimeMsMean.Average"
	m.brokerMappings["replication.uncleanLeaderElectionPerSecond"] = "provider.uncleanLeaderElectionPerSec.Average"
	
	// Handler metrics
	m.brokerMappings["broker.requestHandlerAvgIdlePercent"] = "provider.requestHandlerAvgIdlePercent.Average"
	m.brokerMappings["broker.networkProcessorAvgIdlePercent"] = "provider.networkProcessorAvgIdlePercent.Average"
	
	// Partition metrics
	m.brokerMappings["broker.partitionCount"] = "provider.partitionCount"
	m.brokerMappings["broker.leaderCount"] = "provider.leaderCount"
	
	// Controller metrics
	m.brokerMappings["cluster.offlinePartitionsCount"] = "controller.offlinePartitionsCount"
	m.brokerMappings["cluster.partitionCount"] = "controller.globalPartitionCount"
	m.brokerMappings["cluster.underMinIsrPartitionCount"] = "controller.underMinIsrPartitionCount"
	
	// Throttling metrics
	m.brokerMappings["broker.produceThrottleTimeMs"] = "provider.produceThrottleTime.Average"
	m.brokerMappings["broker.fetchThrottleTimeMs"] = "provider.fetchThrottleTime.Average"
	m.brokerMappings["broker.requestThrottleTimeMs"] = "provider.requestThrottleTime.Average"
	
	// Request rates
	m.brokerMappings["broker.totalFetchRequestsPerSecond"] = "provider.fetchConsumerTotalFetchRequestsPerSec.Average"
	m.brokerMappings["broker.totalProduceRequestsPerSecond"] = "provider.produceRequestsPerSec.Average"
}

// initializeRequestMappings sets up RequestMetrics mappings
func (m *MetricMapper) initializeRequestMappings() {
	// Fetch consumer metrics
	m.requestMappings["fetchConsumerLocalTimeMs"] = RequestMapping{
		MetricName:    "provider.fetchConsumerLocalTimeMsMean.Average",
		RequestType:   "FetchConsumer",
		AttributeName: "LocalTimeMs",
	}
	m.requestMappings["fetchConsumerRequestQueueTimeMs"] = RequestMapping{
		MetricName:    "provider.fetchConsumerRequestQueueTimeMsMean.Average",
		RequestType:   "FetchConsumer",
		AttributeName: "RequestQueueTimeMs",
	}
	m.requestMappings["fetchConsumerResponseSendTimeMs"] = RequestMapping{
		MetricName:    "provider.fetchConsumerResponseSendTimeMsMean.Average",
		RequestType:   "FetchConsumer",
		AttributeName: "ResponseSendTimeMs",
	}
	m.requestMappings["fetchConsumerTotalTimeMs"] = RequestMapping{
		MetricName:    "provider.fetchConsumerTotalTimeMsMean.Average",
		RequestType:   "FetchConsumer",
		AttributeName: "TotalTimeMs",
	}
	
	// Produce metrics
	m.requestMappings["produceLocalTimeMs"] = RequestMapping{
		MetricName:    "provider.produceLocalTimeMsMean.Average",
		RequestType:   "Produce",
		AttributeName: "LocalTimeMs",
	}
	m.requestMappings["produceRequestQueueTimeMs"] = RequestMapping{
		MetricName:    "provider.produceRequestQueueTimeMsMean.Average",
		RequestType:   "Produce",
		AttributeName: "RequestQueueTimeMs",
	}
	m.requestMappings["produceResponseSendTimeMs"] = RequestMapping{
		MetricName:    "provider.produceResponseSendTimeMsMean.Average",
		RequestType:   "Produce",
		AttributeName: "ResponseSendTimeMs",
	}
	m.requestMappings["produceTotalTimeMs"] = RequestMapping{
		MetricName:    "provider.produceTotalTimeMsMean.Average",
		RequestType:   "Produce",
		AttributeName: "TotalTimeMs",
	}
}

// initializeTopicMappings sets up topic metric mappings
func (m *MetricMapper) initializeTopicMappings() {
	// Throughput metrics
	m.topicMappings["topic.bytesInPerSecond"] = "provider.bytesInPerSec.Average"
	m.topicMappings["topic.bytesOutPerSecond"] = "provider.bytesOutPerSec.Average"
	m.topicMappings["topic.messagesInPerSecond"] = "provider.messagesInPerSec.Average"
	m.topicMappings["topic.bytesRejectedPerSecond"] = "provider.bytesRejectedPerSec.Average"
	
	// Configuration metrics
	m.topicMappings["topic.partitionCount"] = "provider.partitionCount"
	m.topicMappings["topic.replicationFactor"] = "provider.replicationFactor"
	m.topicMappings["topic.minInSyncReplicas"] = "provider.minInSyncReplicas"
	m.topicMappings["topic.underReplicatedPartitions"] = "provider.underReplicatedPartitions"
	
	// Size metrics
	m.topicMappings["topic.sizeInBytes"] = "provider.sizeInBytes"
}

// MapBrokerMetric maps a broker metric name to MSK format
func (m *MetricMapper) MapBrokerMetric(kafkaMetric string) (string, bool) {
	if mskMetric, exists := m.brokerMappings[kafkaMetric]; exists {
		return mskMetric, true
	}
	return "", false
}

// MapRequestMetric maps a request metric to MSK format
func (m *MetricMapper) MapRequestMetric(metricType string) (RequestMapping, bool) {
	if mapping, exists := m.requestMappings[metricType]; exists {
		return mapping, true
	}
	return RequestMapping{}, false
}

// MapTopicMetric maps a topic metric name to MSK format
func (m *MetricMapper) MapTopicMetric(kafkaMetric string) (string, bool) {
	if mskMetric, exists := m.topicMappings[kafkaMetric]; exists {
		return mskMetric, true
	}
	return "", false
}

// GetJMXBeanForMetric returns the JMX bean pattern for a given metric
func GetJMXBeanForMetric(metricName string) string {
	beans := map[string]string{
		// Broker metrics
		"broker.bytesInPerSecond":        "kafka.server:type=BrokerTopicMetrics,name=BytesInPerSec",
		"broker.bytesOutPerSecond":       "kafka.server:type=BrokerTopicMetrics,name=BytesOutPerSec",
		"broker.messagesInPerSecond":     "kafka.server:type=BrokerTopicMetrics,name=MessagesInPerSec",
		"broker.bytesRejectedPerSecond":  "kafka.server:type=BrokerTopicMetrics,name=BytesRejectedPerSec",
		
		// Controller metrics
		"broker.ActiveControllerCount":    "kafka.controller:type=KafkaController,name=ActiveControllerCount",
		"broker.GlobalPartitionCount":     "kafka.controller:type=KafkaController,name=GlobalPartitionCount",
		"cluster.offlinePartitionsCount":  "kafka.controller:type=KafkaController,name=OfflinePartitionsCount",
		"cluster.underMinIsrPartitionCount": "kafka.cluster:type=Partition,name=UnderMinIsr,topic=*,partition=*",
		
		// Replication metrics
		"broker.underReplicatedPartitions": "kafka.server:type=ReplicaManager,name=UnderReplicatedPartitions",
		"replication.isrShrinksPerSecond":  "kafka.server:type=ReplicaManager,name=IsrShrinksPerSec",
		"replication.isrExpandsPerSecond":  "kafka.server:type=ReplicaManager,name=IsrExpandsPerSec",
		"replication.leaderElectionPerSecond": "kafka.controller:type=ControllerStats,name=LeaderElectionRateAndTimeMs",
		"replication.uncleanLeaderElectionPerSecond": "kafka.controller:type=ControllerStats,name=UncleanLeaderElectionsPerSec",
		
		// Handler metrics
		"broker.requestHandlerAvgIdlePercent": "kafka.server:type=KafkaRequestHandlerPool,name=RequestHandlerAvgIdlePercent",
		"broker.networkProcessorAvgIdlePercent": "kafka.network:type=SocketServer,name=NetworkProcessorAvgIdlePercent",
		
		// Throttling metrics
		"broker.produceThrottleTimeMs": "kafka.server:type=BrokerTopicMetrics,name=ProduceThrottleTimeMs",
		"broker.fetchThrottleTimeMs": "kafka.server:type=KafkaRequestHandlerPool,name=FetchThrottleTimeMs",
		"broker.requestThrottleTimeMs": "kafka.server:type=KafkaRequestHandlerPool,name=RequestThrottleTimeMs",
		
		// Topic metrics (with topic parameter)
		"topic.bytesInPerSecond": "kafka.server:type=BrokerTopicMetrics,name=BytesInPerSec,topic=*",
		"topic.bytesOutPerSecond": "kafka.server:type=BrokerTopicMetrics,name=BytesOutPerSec,topic=*",
		"topic.messagesInPerSecond": "kafka.server:type=BrokerTopicMetrics,name=MessagesInPerSec,topic=*",
		"topic.bytesRejectedPerSecond": "kafka.server:type=BrokerTopicMetrics,name=BytesRejectedPerSec,topic=*",
	}
	
	if bean, exists := beans[metricName]; exists {
		return bean
	}
	
	return ""
}

// IsRequestMetric checks if a metric is from RequestMetrics
func IsRequestMetric(metricName string) bool {
	requestMetrics := []string{
		"LocalTimeMs", "RequestQueueTimeMs", "ResponseSendTimeMs", "TotalTimeMs",
		"RemoteTimeMs", "ThrottleTimeMs", "ResponseQueueTimeMs",
	}
	
	for _, rm := range requestMetrics {
		if strings.Contains(metricName, rm) {
			return true
		}
	}
	
	return false
}

// GetRequestMetricBean returns the JMX bean for a request metric
func GetRequestMetricBean(metricType, requestType string) string {
	return fmt.Sprintf("kafka.network:type=RequestMetrics,name=%s,request=%s", metricType, requestType)
}