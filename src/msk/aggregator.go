package msk

import (
	"sync"
	"time"
)

// MetricAggregator aggregates metrics across brokers for cluster-level and topic-level metrics
type MetricAggregator struct {
	mu                sync.RWMutex
	brokerMetrics     map[string]*BrokerMetrics
	topicMetrics      map[string]*TopicMetrics
	controllerMetrics *ControllerMetrics
	consumerLagMetrics map[string]map[string]float64 // topic -> consumerGroup -> lag
	lastAggregation   time.Time
}

// BrokerMetrics holds metrics for a single broker
type BrokerMetrics struct {
	BrokerID                  int
	IsController              bool
	BytesInPerSec             float64
	BytesOutPerSec            float64
	MessagesInPerSec          float64
	PartitionCount            int
	UnderReplicatedPartitions int
	LastUpdated               time.Time
}

// TopicMetrics holds aggregated metrics for a topic
type TopicMetrics struct {
	Name                 string
	BytesInPerSec        float64
	BytesOutPerSec       float64
	MessagesInPerSec     float64
	BytesRejectedPerSec  float64
	PartitionCount       int
	ReplicationFactor    int
	UnderReplicated      int
}

// ControllerMetrics holds controller-specific metrics
type ControllerMetrics struct {
	ActiveControllerCount    int
	OfflinePartitionsCount   int
	GlobalPartitionCount     int
	UnderMinISRPartitions    int
}

// ClusterAggregatedMetrics holds cluster-wide aggregated metrics
type ClusterAggregatedMetrics struct {
	ActiveControllerCount     int
	OfflinePartitionsCount    int
	UnderReplicatedPartitions int
	GlobalPartitionCount      int
	GlobalTopicCount          int
	BytesInPerSec             float64
	BytesOutPerSec            float64
	UnderMinISRPartitions     int
}

// NewMetricAggregator creates a new metric aggregator
func NewMetricAggregator() *MetricAggregator {
	return &MetricAggregator{
		brokerMetrics:      make(map[string]*BrokerMetrics),
		topicMetrics:       make(map[string]*TopicMetrics),
		controllerMetrics:  &ControllerMetrics{},
		consumerLagMetrics: make(map[string]map[string]float64),
		lastAggregation:    time.Now(),
	}
}

// AddBrokerMetric adds or updates metrics for a broker
func (a *MetricAggregator) AddBrokerMetric(brokerID string, metric *BrokerMetrics) {
	a.mu.Lock()
	defer a.mu.Unlock()

	a.brokerMetrics[brokerID] = metric

	// Update controller metrics if this is the controller
	if metric.IsController {
		a.controllerMetrics.ActiveControllerCount = 1
	}
}

// AddTopicMetric adds or updates metrics for a topic
func (a *MetricAggregator) AddTopicMetric(topicName string, metric *TopicMetrics) {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.topicMetrics[topicName] == nil {
		a.topicMetrics[topicName] = metric
	} else {
		// Aggregate with existing metrics
		existing := a.topicMetrics[topicName]
		existing.BytesInPerSec += metric.BytesInPerSec
		existing.BytesOutPerSec += metric.BytesOutPerSec
		existing.MessagesInPerSec += metric.MessagesInPerSec
		existing.BytesRejectedPerSec += metric.BytesRejectedPerSec
	}
}

// GetClusterMetrics returns aggregated cluster-wide metrics
func (a *MetricAggregator) GetClusterMetrics() *ClusterAggregatedMetrics {
	a.mu.RLock()
	defer a.mu.RUnlock()

	result := &ClusterAggregatedMetrics{
		ActiveControllerCount:  a.controllerMetrics.ActiveControllerCount,
		OfflinePartitionsCount: a.controllerMetrics.OfflinePartitionsCount,
		GlobalTopicCount:       len(a.topicMetrics),
	}

	// Aggregate across all brokers
	for _, broker := range a.brokerMetrics {
		result.GlobalPartitionCount += broker.PartitionCount
		result.UnderReplicatedPartitions += broker.UnderReplicatedPartitions
		result.BytesInPerSec += broker.BytesInPerSec
		result.BytesOutPerSec += broker.BytesOutPerSec
	}

	return result
}

// GetTopicMetrics returns aggregated metrics for a specific topic
func (a *MetricAggregator) GetTopicMetrics(topicName string) *TopicMetrics {
	a.mu.RLock()
	defer a.mu.RUnlock()

	if metric, exists := a.topicMetrics[topicName]; exists {
		return metric
	}

	return &TopicMetrics{Name: topicName}
}

// Reset clears all aggregated metrics
func (a *MetricAggregator) Reset() {
	a.mu.Lock()
	defer a.mu.Unlock()

	a.brokerMetrics = make(map[string]*BrokerMetrics)
	a.topicMetrics = make(map[string]*TopicMetrics)
	a.controllerMetrics = &ControllerMetrics{}
	a.consumerLagMetrics = make(map[string]map[string]float64)
	a.lastAggregation = time.Now()
}

// AddConsumerLag adds consumer lag metrics for a topic and consumer group
func (a *MetricAggregator) AddConsumerLag(topicName, consumerGroup string, lag float64) {
	a.mu.Lock()
	defer a.mu.Unlock()

	if _, exists := a.consumerLagMetrics[topicName]; !exists {
		a.consumerLagMetrics[topicName] = make(map[string]float64)
	}
	a.consumerLagMetrics[topicName][consumerGroup] = lag
}

// AddSimpleBrokerMetric adds a simple broker metric (for use by transformer)
func (a *MetricAggregator) AddSimpleBrokerMetric(metricName string, value interface{}) {
	// This is a simplified version - in production you'd track per broker
	// For now, we just track that metrics are being added
}

// AddSimpleTopicMetric adds a simple topic metric (for use by transformer)  
func (a *MetricAggregator) AddSimpleTopicMetric(topicName, metricName string, value interface{}) {
	// This is a simplified version - in production you'd track per topic
	// For now, we just track that metrics are being added
}

// GetBrokerMetrics returns all broker metrics
func (a *MetricAggregator) GetBrokerMetrics() map[string]map[string]interface{} {
	a.mu.RLock()
	defer a.mu.RUnlock()
	
	// Convert to map[string]interface{} for compatibility
	result := make(map[string]map[string]interface{})
	for brokerID, metrics := range a.brokerMetrics {
		brokerData := make(map[string]interface{})
		brokerData["broker.id"] = brokerID
		brokerData["broker.IOInPerSecond"] = metrics.BytesInPerSec
		brokerData["broker.IOOutPerSecond"] = metrics.BytesOutPerSec
		brokerData["broker.messagesInPerSecond"] = metrics.MessagesInPerSec
		brokerData["replication.unreplicatedPartitions"] = float64(metrics.UnderReplicatedPartitions)
		result[brokerID] = brokerData
	}
	return result
}

// GetBrokerCount returns the number of brokers
func (a *MetricAggregator) GetBrokerCount() int {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return len(a.brokerMetrics)
}

// GetTopicCount returns the number of topics
func (a *MetricAggregator) GetTopicCount() int {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return len(a.topicMetrics)
}

// GetAggregatedMetrics returns aggregated metrics for cluster level
func (a *MetricAggregator) GetAggregatedMetrics() map[string]interface{} {
	a.mu.RLock()
	defer a.mu.RUnlock()
	
	// Return empty map for now - in production this would calculate aggregates
	return make(map[string]interface{})
}

// AddBrokerMetrics adds broker metrics from a data map (for transformer)
func (a *MetricAggregator) AddBrokerMetrics(brokerID string, brokerData map[string]interface{}) {
	a.mu.Lock()
	defer a.mu.Unlock()
	
	// Convert to BrokerMetrics struct
	metric := &BrokerMetrics{
		LastUpdated: time.Now(),
	}
	
	// Extract metrics from brokerData
	if idInt, ok := getIntValue(brokerData, "broker.id"); ok {
		metric.BrokerID = idInt
	}
	
	if bytesIn, ok := getFloatValue(brokerData, "broker.IOInPerSecond"); ok {
		metric.BytesInPerSec = bytesIn
	}
	
	if bytesOut, ok := getFloatValue(brokerData, "broker.IOOutPerSecond"); ok {
		metric.BytesOutPerSec = bytesOut
	}
	
	if messagesIn, ok := getFloatValue(brokerData, "broker.messagesInPerSecond"); ok {
		metric.MessagesInPerSec = messagesIn
	}
	
	if underReplicated, ok := getFloatValue(brokerData, "replication.unreplicatedPartitions"); ok {
		metric.UnderReplicatedPartitions = int(underReplicated)
	}
	
	a.brokerMetrics[brokerID] = metric
}

// AddTopicMetrics adds topic metrics from a data map (for transformer)
func (a *MetricAggregator) AddTopicMetrics(topicName string, topicData map[string]interface{}) {
	a.mu.Lock()
	defer a.mu.Unlock()
	
	// Convert to TopicMetrics struct
	metric := &TopicMetrics{
		Name: topicName,
	}
	
	// Extract metrics from topicData
	if bytesIn, ok := getFloatValue(topicData, "topic.bytesInPerSecond"); ok {
		metric.BytesInPerSec = bytesIn
	}
	
	if bytesOut, ok := getFloatValue(topicData, "topic.bytesOutPerSecond"); ok {
		metric.BytesOutPerSec = bytesOut
	}
	
	if messagesIn, ok := getFloatValue(topicData, "topic.messagesInPerSecond"); ok {
		metric.MessagesInPerSec = messagesIn
	}
	
	a.topicMetrics[topicName] = metric
}

// AddConsumerLagMetrics adds consumer lag metrics (for transformer)
func (a *MetricAggregator) AddConsumerLagMetrics(consumerGroup, topic string, offsetData map[string]interface{}) {
	a.mu.Lock()
	defer a.mu.Unlock()
	
	if _, exists := a.consumerLagMetrics[topic]; !exists {
		a.consumerLagMetrics[topic] = make(map[string]float64)
	}
	
	if lag, ok := getFloatValue(offsetData, "consumerLag"); ok {
		a.consumerLagMetrics[topic][consumerGroup] = lag
	}
}