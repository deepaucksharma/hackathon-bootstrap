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
	m.brokerMappings["broker.bytesInPerSecond"] = "kafka.broker.bytesIn"
	m.brokerMappings["broker.bytesOutPerSecond"] = "kafka.broker.bytesOut"
	m.brokerMappings["broker.messagesInPerSecond"] = "kafka.broker.messagesIn"
	m.brokerMappings["broker.bytesRejectedPerSecond"] = "kafka.broker.bytesRejected"
	
	// V2 metrics
	m.brokerMappings["broker.ActiveControllerCount"] = "kafka.broker.activeControllerCount"
	m.brokerMappings["broker.GlobalPartitionCount"] = "kafka.broker.globalPartitionCount"
	m.brokerMappings["broker.bytesReadFromTopicPerSecond"] = "kafka.broker.topicBytesOut"
	m.brokerMappings["broker.messagesProducedToTopicPerSecond"] = "kafka.broker.topicMessagesIn"
	
	// Replication metrics
	m.brokerMappings["broker.underReplicatedPartitions"] = "kafka.broker.underReplicatedPartitions"
	m.brokerMappings["replication.isrShrinksPerSecond"] = "kafka.broker.isrShrinks"
	m.brokerMappings["replication.isrExpandsPerSecond"] = "kafka.broker.isrExpands"
	m.brokerMappings["replication.leaderElectionPerSecond"] = "kafka.broker.leaderElectionRate"
	m.brokerMappings["replication.uncleanLeaderElectionPerSecond"] = "kafka.broker.uncleanLeaderElection"
	
	// Handler metrics
	m.brokerMappings["broker.requestHandlerAvgIdlePercent"] = "kafka.broker.requestHandlerIdlePercent"
	m.brokerMappings["broker.networkProcessorAvgIdlePercent"] = "kafka.broker.networkProcessorIdlePercent"
	
	// Partition metrics
	m.brokerMappings["broker.partitionCount"] = "kafka.broker.partitionCount"
	m.brokerMappings["broker.leaderCount"] = "kafka.broker.leaderCount"
	
	// Controller metrics
	m.brokerMappings["cluster.offlinePartitionsCount"] = "kafka.cluster.offlinePartitionsCount"
	m.brokerMappings["cluster.partitionCount"] = "kafka.cluster.partitionCount"
	m.brokerMappings["cluster.underMinIsrPartitionCount"] = "kafka.cluster.underMinIsrPartitionCount"
	
	// Throttling metrics
	m.brokerMappings["broker.produceThrottleTimeMs"] = "kafka.broker.produceThrottleTime"
	m.brokerMappings["broker.fetchThrottleTimeMs"] = "kafka.broker.fetchThrottleTime"
	m.brokerMappings["broker.requestThrottleTimeMs"] = "kafka.broker.requestThrottleTime"
	
	// Request rates
	m.brokerMappings["broker.totalFetchRequestsPerSecond"] = "kafka.broker.fetchConsumerRequestsPerSec"
	m.brokerMappings["broker.totalProduceRequestsPerSecond"] = "kafka.broker.produceRequestsPerSec"
}

// initializeRequestMappings sets up RequestMetrics mappings
func (m *MetricMapper) initializeRequestMappings() {
	// Fetch consumer metrics
	m.requestMappings["fetchConsumerLocalTimeMs"] = RequestMapping{
		MetricName:    "kafka.broker.fetchConsumerLocalTime",
		RequestType:   "FetchConsumer",
		AttributeName: "LocalTimeMs",
	}
	m.requestMappings["fetchConsumerRequestQueueTimeMs"] = RequestMapping{
		MetricName:    "kafka.broker.fetchConsumerRequestQueueTime",
		RequestType:   "FetchConsumer",
		AttributeName: "RequestQueueTimeMs",
	}
	m.requestMappings["fetchConsumerResponseSendTimeMs"] = RequestMapping{
		MetricName:    "kafka.broker.fetchConsumerResponseSendTime",
		RequestType:   "FetchConsumer",
		AttributeName: "ResponseSendTimeMs",
	}
	m.requestMappings["fetchConsumerTotalTimeMs"] = RequestMapping{
		MetricName:    "kafka.broker.fetchConsumerTotalTime",
		RequestType:   "FetchConsumer",
		AttributeName: "TotalTimeMs",
	}
	
	// Produce metrics
	m.requestMappings["produceLocalTimeMs"] = RequestMapping{
		MetricName:    "kafka.broker.produceLocalTime",
		RequestType:   "Produce",
		AttributeName: "LocalTimeMs",
	}
	m.requestMappings["produceRequestQueueTimeMs"] = RequestMapping{
		MetricName:    "kafka.broker.produceRequestQueueTime",
		RequestType:   "Produce",
		AttributeName: "RequestQueueTimeMs",
	}
	m.requestMappings["produceResponseSendTimeMs"] = RequestMapping{
		MetricName:    "kafka.broker.produceResponseSendTime",
		RequestType:   "Produce",
		AttributeName: "ResponseSendTimeMs",
	}
	m.requestMappings["produceTotalTimeMs"] = RequestMapping{
		MetricName:    "kafka.broker.produceTotalTime",
		RequestType:   "Produce",
		AttributeName: "TotalTimeMs",
	}
}

// initializeTopicMappings sets up topic metric mappings
func (m *MetricMapper) initializeTopicMappings() {
	// Throughput metrics
	m.topicMappings["topic.bytesInPerSecond"] = "kafka.topic.bytesIn"
	m.topicMappings["topic.bytesOutPerSecond"] = "kafka.topic.bytesOut"
	m.topicMappings["topic.messagesInPerSecond"] = "kafka.topic.messagesIn"
	m.topicMappings["topic.bytesRejectedPerSecond"] = "kafka.topic.bytesRejected"
	
	// Configuration metrics
	m.topicMappings["topic.partitionCount"] = "kafka.topic.partitionCount"
	m.topicMappings["topic.replicationFactor"] = "kafka.topic.replicationFactor"
	m.topicMappings["topic.minInSyncReplicas"] = "kafka.topic.minInSyncReplicas"
	m.topicMappings["topic.underReplicatedPartitions"] = "kafka.topic.underReplicatedPartitions"
	
	// Size metrics
	m.topicMappings["topic.sizeInBytes"] = "kafka.topic.sizeInBytes"
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