package msk

import (
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"math"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/newrelic/infra-integrations-sdk/v3/integration"
	"github.com/newrelic/infra-integrations-sdk/v3/log"
)

const (
	// Max batch size for metric API
	MaxBatchSize = 1000
	// Version for instrumentation
	Version = "1.0.0"
	// Max metric age before considered stale
	MaxMetricAge = 5 * time.Minute
	// GUID cache size
	GUIDCacheSize = 10000
)

// DimensionalTransformer sends Kafka metrics as dimensional metrics to New Relic
type DimensionalTransformer struct {
	integration      *integration.Integration
	config           *Config
	metricClient     *MetricAPIClient
	batchCollector   *BatchCollector
	enabled          bool
	mu               sync.Mutex
	guidCache        *GUIDCache
	errorCollector   *ErrorCollector
	validationReport *ValidationReport
	lastMetricTime   time.Time
}

// Metric represents a dimensional metric
type Metric struct {
	Name       string
	Type       string
	Value      float64
	Timestamp  int64
	Attributes map[string]interface{}
}

// NewDimensionalTransformer creates a new dimensional transformer
func NewDimensionalTransformer(integration *integration.Integration, config *Config) *DimensionalTransformer {
	// Check if dimensional metrics are enabled - check both variations
	enabled := os.Getenv("MSK_USE_DIMENSIONAL") == "true" || os.Getenv("NRI_KAFKA_USE_DIMENSIONAL") == "true"
	if !enabled {
		log.Info("Dimensional metrics are disabled. Set MSK_USE_DIMENSIONAL=true or NRI_KAFKA_USE_DIMENSIONAL=true to enable")
		return &DimensionalTransformer{
			integration: integration,
			config:      config,
			enabled:     false,
		}
	}
	
	log.Info("Dimensional metrics ENABLED - initializing transformer")

	// Get API key from environment
	apiKey := os.Getenv("NEW_RELIC_API_KEY")
	if apiKey == "" {
		// Try license key as fallback
		apiKey = os.Getenv("NRIA_LICENSE_KEY")
	}

	if apiKey == "" {
		log.Error("No API key found for dimensional metrics. Set NEW_RELIC_API_KEY or NRIA_LICENSE_KEY")
		// For now, continue without API key but log warning
		log.Warn("Continuing without dimensional metrics API client")
	}
	
	log.Info("Dimensional metrics API key found, length: %d", len(apiKey))

	// Create metric API client
	metricClient := NewMetricAPIClient(apiKey)
	
	// Create batch collector with 100 metric batch size and 30 second flush interval
	batchCollector := NewBatchCollector(metricClient, 100, 30*time.Second)
	
	log.Info("Dimensional transformer initialized for cluster: %s", config.ClusterName)

	return &DimensionalTransformer{
		integration:      integration,
		config:           config,
		metricClient:     metricClient,
		batchCollector:   batchCollector,
		enabled:          true,
		guidCache:        NewGUIDCache(GUIDCacheSize),
		errorCollector:   NewErrorCollector(),
		validationReport: NewValidationReport(),
		lastMetricTime:   time.Now(),
	}
}

// ========================================================================================
// BROKER METRICS TRANSFORMATIONS
// ========================================================================================

// transformBytesInPerSec transforms broker bytes in metric
func (dt *DimensionalTransformer) transformBytesInPerSec(sample map[string]interface{}) *Metric {
	// Extended field mappings with all possible variations
	fieldMappings := []string{
		"bytesInPerSecOneMinuteRate",
		"broker.bytesInPerSec",
		"broker.IOInPerSec",
		"net.bytesInPerSec",
		"broker.IOInPerSecond",
		"broker.BytesInPerSec.OneMinuteRate",
		"kafka.server:type=BrokerTopicMetrics,name=BytesInPerSec.OneMinuteRate",
		"kafka.server:type=BrokerTopicMetrics,name=BytesInPerSec,OneMinuteRate",
	}
	
	value := dt.extractValueFromFields(sample, fieldMappings)
	if value < 0 {
		dt.errorCollector.AddError(TransformationError{
			EventType: "KafkaBrokerSample",
			Field:     "bytesInPerSec",
			Reason:    "no valid value found",
			Sample:    sample,
		})
		return nil
	}
	
	// Enhanced validation with edge case handling
	if err := dt.validateMetricValue(value, "kafka.broker.BytesInPerSec"); err != nil {
		dt.errorCollector.AddError(TransformationError{
			EventType: "KafkaBrokerSample",
			Field:     "bytesInPerSec",
			Reason:    err.Error(),
			Sample:    sample,
		})
		return nil
	}
	
	dt.validationReport.IncrementValid()
	
	return &Metric{
		Name:       "kafka.broker.BytesInPerSec",
		Type:       "gauge",
		Value:      value,
		Timestamp:  dt.getCurrentTimestamp(),
		Attributes: dt.buildBrokerAttributes(sample),
	}
}

// transformBytesOutPerSec transforms broker bytes out metric
func (dt *DimensionalTransformer) transformBytesOutPerSec(sample map[string]interface{}) *Metric {
	value := getFloatValueWithDefault(sample, "bytesOutPerSecOneMinuteRate", -1)
	
	// Fallback fields
	if value < 0 {
		value = getFloatValueWithDefault(sample, "broker.bytesOutPerSec", -1)
	}
	if value < 0 {
		value = getFloatValueWithDefault(sample, "broker.IOOutPerSec", -1)
	}
	if value < 0 {
		value = getFloatValueWithDefault(sample, "net.bytesOutPerSec", -1)
	}
	if value < 0 {
		value = getFloatValueWithDefault(sample, "broker.IOOutPerSecond", -1)
	}
	
	if value < 0 {
		return nil
	}
	
	if !validateMetricValue(value, "kafka.broker.BytesOutPerSec") {
		return nil
	}
	
	return &Metric{
		Name:       "kafka.broker.BytesOutPerSec",
		Type:       "gauge",
		Value:      value,
		Timestamp:  time.Now().UnixNano() / 1e6,
		Attributes: dt.buildBrokerAttributes(sample),
	}
}

// transformMessagesInPerSec transforms broker messages in metric
func (dt *DimensionalTransformer) transformMessagesInPerSec(sample map[string]interface{}) *Metric {
	value := getFloatValueWithDefault(sample, "messagesInPerSecOneMinuteRate", -1)
	
	// Fallback
	if value < 0 {
		value = getFloatValueWithDefault(sample, "broker.messagesInPerSec", -1)
	}
	if value < 0 {
		value = getFloatValueWithDefault(sample, "broker.messagesInPerSecond", -1)
	}
	
	if value < 0 {
		return nil
	}
	
	if !validateMetricValue(value, "kafka.broker.MessagesInPerSec") {
		return nil
	}
	
	return &Metric{
		Name:       "kafka.broker.MessagesInPerSec",
		Type:       "gauge",
		Value:      value,
		Timestamp:  time.Now().UnixNano() / 1e6,
		Attributes: dt.buildBrokerAttributes(sample),
	}
}

// transformTotalFetchRequestsPerSec transforms fetch requests metric
func (dt *DimensionalTransformer) transformTotalFetchRequestsPerSec(sample map[string]interface{}) *Metric {
	value := getFloatValueWithDefault(sample, "fetchConsumerRequestsPerSec", -1)
	
	// Alternative field names
	if value < 0 {
		value = getFloatValueWithDefault(sample, "broker.fetchConsumerRequestsPerSec", -1)
	}
	if value < 0 {
		value = getFloatValueWithDefault(sample, "fetchRequestsPerSec", -1)
	}
	if value < 0 {
		value = getFloatValueWithDefault(sample, "request.fetchConsumerRequestsPerSecond", -1)
	}
	
	if value < 0 {
		return nil
	}
	
	if !validateMetricValue(value, "kafka.broker.TotalFetchRequestsPerSec") {
		return nil
	}
	
	return &Metric{
		Name:       "kafka.broker.TotalFetchRequestsPerSec",
		Type:       "gauge",
		Value:      value,
		Timestamp:  time.Now().UnixNano() / 1e6,
		Attributes: dt.buildBrokerAttributes(sample),
	}
}

// transformTotalProduceRequestsPerSec transforms produce requests metric
func (dt *DimensionalTransformer) transformTotalProduceRequestsPerSec(sample map[string]interface{}) *Metric {
	value := getFloatValueWithDefault(sample, "produceRequestsPerSec", -1)
	
	if value < 0 {
		value = getFloatValueWithDefault(sample, "broker.produceRequestsPerSec", -1)
	}
	if value < 0 {
		value = getFloatValueWithDefault(sample, "request.produceRequestsPerSecond", -1)
	}
	
	if value < 0 {
		return nil
	}
	
	if !validateMetricValue(value, "kafka.broker.TotalProduceRequestsPerSec") {
		return nil
	}
	
	return &Metric{
		Name:       "kafka.broker.TotalProduceRequestsPerSec",
		Type:       "gauge",
		Value:      value,
		Timestamp:  time.Now().UnixNano() / 1e6,
		Attributes: dt.buildBrokerAttributes(sample),
	}
}

// TransformBrokerMetrics transforms all broker metrics
func (dt *DimensionalTransformer) TransformBrokerMetrics(brokerID string, metrics map[string]interface{}) error {
	if !dt.enabled {
		return nil
	}

	log.Info("Transforming broker metrics for broker %s with %d fields", brokerID, len(metrics))
	
	// Add broker ID to metrics for attribute building
	metrics["broker.id"] = brokerID
	
	// Transform each metric
	metricsToSend := []*Metric{}
	
	if metric := dt.transformBytesInPerSec(metrics); metric != nil {
		metricsToSend = append(metricsToSend, metric)
	}
	
	if metric := dt.transformBytesOutPerSec(metrics); metric != nil {
		metricsToSend = append(metricsToSend, metric)
	}
	
	if metric := dt.transformMessagesInPerSec(metrics); metric != nil {
		metricsToSend = append(metricsToSend, metric)
	}
	
	if metric := dt.transformTotalFetchRequestsPerSec(metrics); metric != nil {
		metricsToSend = append(metricsToSend, metric)
	}
	
	if metric := dt.transformTotalProduceRequestsPerSec(metrics); metric != nil {
		metricsToSend = append(metricsToSend, metric)
	}
	
	// Additional broker metrics if available
	dt.transformAdditionalBrokerMetrics(metrics, &metricsToSend)
	
	// Send metrics
	for _, metric := range metricsToSend {
		dt.batchCollector.AddMetric(metric.Name, metric.Value, metric.Attributes)
	}
	
	log.Info("Transformed %d broker metrics for broker %s", len(metricsToSend), brokerID)
	
	return nil
}

// transformAdditionalBrokerMetrics transforms additional broker metrics
func (dt *DimensionalTransformer) transformAdditionalBrokerMetrics(metrics map[string]interface{}, metricsToSend *[]*Metric) {
	// UnderReplicatedPartitions
	if value := getFloatValueWithDefault(metrics, "replication.unreplicatedPartitions", -1); value >= 0 {
		*metricsToSend = append(*metricsToSend, &Metric{
			Name:       "kafka.broker.UnderReplicatedPartitions",
			Type:       "gauge",
			Value:      value,
			Timestamp:  time.Now().UnixNano() / 1e6,
			Attributes: dt.buildBrokerAttributes(metrics),
		})
	}
	
	// Additional metrics as needed
}

// ========================================================================================
// CLUSTER METRICS TRANSFORMATIONS
// ========================================================================================

// transformClusterBytesInPerSec transforms cluster bytes in metric
func (dt *DimensionalTransformer) transformClusterBytesInPerSec(sample map[string]interface{}) *Metric {
	value := extractProviderMetric(sample, "bytesInPerSec", "Sum")
	
	if value < 0 {
		return nil
	}
	
	if !validateMetricValue(value, "kafka.cluster.BytesInPerSec") {
		return nil
	}
	
	return &Metric{
		Name:       "kafka.cluster.BytesInPerSec",
		Type:       "gauge",
		Value:      value,
		Timestamp:  time.Now().UnixNano() / 1e6,
		Attributes: dt.buildClusterAttributes(sample),
	}
}

// transformClusterBytesOutPerSec transforms cluster bytes out metric
func (dt *DimensionalTransformer) transformClusterBytesOutPerSec(sample map[string]interface{}) *Metric {
	value := extractProviderMetric(sample, "bytesOutPerSec", "Sum")
	
	if value < 0 {
		return nil
	}
	
	if !validateMetricValue(value, "kafka.cluster.BytesOutPerSec") {
		return nil
	}
	
	return &Metric{
		Name:       "kafka.cluster.BytesOutPerSec",
		Type:       "gauge",
		Value:      value,
		Timestamp:  time.Now().UnixNano() / 1e6,
		Attributes: dt.buildClusterAttributes(sample),
	}
}

// transformClusterMessagesInPerSec transforms cluster messages in metric
func (dt *DimensionalTransformer) transformClusterMessagesInPerSec(sample map[string]interface{}) *Metric {
	value := extractProviderMetric(sample, "messagesInPerSec", "Sum")
	
	if value < 0 {
		return nil
	}
	
	if !validateMetricValue(value, "kafka.cluster.MessagesInPerSec") {
		return nil
	}
	
	return &Metric{
		Name:       "kafka.cluster.MessagesInPerSec",
		Type:       "gauge",
		Value:      value,
		Timestamp:  time.Now().UnixNano() / 1e6,
		Attributes: dt.buildClusterAttributes(sample),
	}
}

// transformActiveControllerCount transforms active controller count metric
func (dt *DimensionalTransformer) transformActiveControllerCount(sample map[string]interface{}) *Metric {
	value := extractProviderMetric(sample, "activeControllerCount", "Sum")
	
	// Also try without provider prefix
	if value < 0 {
		value = getFloatValueWithDefault(sample, "activeControllerCount", -1)
	}
	
	if value < 0 {
		// Default to 1 for healthy cluster
		value = 1
	}
	
	// Always validate this critical metric
	validateMetricValue(value, "kafka.cluster.ActiveControllerCount")
	
	return &Metric{
		Name:       "kafka.cluster.ActiveControllerCount",
		Type:       "gauge",
		Value:      value,
		Timestamp:  time.Now().UnixNano() / 1e6,
		Attributes: dt.buildClusterAttributes(sample),
	}
}

// transformOfflinePartitionsCount transforms offline partitions count metric
func (dt *DimensionalTransformer) transformOfflinePartitionsCount(sample map[string]interface{}) *Metric {
	value := extractProviderMetric(sample, "offlinePartitionsCount", "Sum")
	
	if value < 0 {
		value = getFloatValueWithDefault(sample, "offlinePartitionsCount", 0)
	}
	
	// Always send this metric (0 is good)
	validateMetricValue(value, "kafka.cluster.OfflinePartitionsCount")
	
	return &Metric{
		Name:       "kafka.cluster.OfflinePartitionsCount",
		Type:       "gauge",
		Value:      value,
		Timestamp:  time.Now().UnixNano() / 1e6,
		Attributes: dt.buildClusterAttributes(sample),
	}
}

// transformUnderReplicatedPartitions transforms under replicated partitions metric
func (dt *DimensionalTransformer) transformUnderReplicatedPartitions(sample map[string]interface{}) *Metric {
	value := extractProviderMetric(sample, "underReplicatedPartitions", "Sum")
	
	if value < 0 {
		value = getFloatValueWithDefault(sample, "underReplicatedPartitions", 0)
	}
	
	validateMetricValue(value, "kafka.cluster.UnderReplicatedPartitions")
	
	return &Metric{
		Name:       "kafka.cluster.UnderReplicatedPartitions",
		Type:       "gauge",
		Value:      value,
		Timestamp:  time.Now().UnixNano() / 1e6,
		Attributes: dt.buildClusterAttributes(sample),
	}
}

// TransformClusterMetrics transforms cluster-level metrics
func (dt *DimensionalTransformer) TransformClusterMetrics(metrics map[string]interface{}) error {
	if !dt.enabled {
		return nil
	}

	log.Debug("Transforming cluster metrics for cluster %s", dt.config.ClusterName)
	
	// Always send critical cluster health metrics
	if metric := dt.transformActiveControllerCount(metrics); metric != nil {
		dt.batchCollector.AddMetric(metric.Name, metric.Value, metric.Attributes)
	}
	
	if metric := dt.transformOfflinePartitionsCount(metrics); metric != nil {
		dt.batchCollector.AddMetric(metric.Name, metric.Value, metric.Attributes)
	}
	
	if metric := dt.transformUnderReplicatedPartitions(metrics); metric != nil {
		dt.batchCollector.AddMetric(metric.Name, metric.Value, metric.Attributes)
	}
	
	// Throughput metrics
	if metric := dt.transformClusterBytesInPerSec(metrics); metric != nil {
		dt.batchCollector.AddMetric(metric.Name, metric.Value, metric.Attributes)
	}
	
	if metric := dt.transformClusterBytesOutPerSec(metrics); metric != nil {
		dt.batchCollector.AddMetric(metric.Name, metric.Value, metric.Attributes)
	}
	
	if metric := dt.transformClusterMessagesInPerSec(metrics); metric != nil {
		dt.batchCollector.AddMetric(metric.Name, metric.Value, metric.Attributes)
	}
	
	return nil
}

// ========================================================================================
// TOPIC METRICS TRANSFORMATIONS
// ========================================================================================

// transformTopicBytesInPerSec transforms topic bytes in metric
func (dt *DimensionalTransformer) transformTopicBytesInPerSec(sample map[string]interface{}) *Metric {
	topicName := getStringValueWithDefault(sample, "topic", "")
	if topicName == "" {
		topicName = getStringValueWithDefault(sample, "topicName", "")
	}
	
	if topicName == "" {
		return nil // Topic name required
	}
	
	value := getFloatValueWithDefault(sample, "topic.bytesInPerSec", -1)
	if value < 0 {
		value = getFloatValueWithDefault(sample, "bytesInPerSec", -1)
	}
	if value < 0 {
		value = getFloatValueWithDefault(sample, "topic.bytesInPerSecond", -1)
	}
	if value < 0 {
		// Check for provider.* attributes (AwsMskTopicSample)
		value = getFloatValueWithDefault(sample, "provider.bytesInPerSec.Average", -1)
	}
	if value < 0 {
		value = getFloatValueWithDefault(sample, "provider.bytesInPerSec.Sum", -1)
	}
	
	if value < 0 {
		return nil
	}
	
	if !validateMetricValue(value, "kafka.topic.BytesInPerSec") {
		return nil
	}
	
	attrs := dt.buildTopicAttributes(sample)
	attrs["topic"] = topicName
	
	return &Metric{
		Name:       "kafka.topic.BytesInPerSec",
		Type:       "gauge",
		Value:      value,
		Timestamp:  time.Now().UnixNano() / 1e6,
		Attributes: attrs,
	}
}

// transformTopicBytesOutPerSec transforms topic bytes out metric
func (dt *DimensionalTransformer) transformTopicBytesOutPerSec(sample map[string]interface{}) *Metric {
	topicName := getStringValueWithDefault(sample, "topic", "")
	if topicName == "" {
		topicName = getStringValueWithDefault(sample, "topicName", "")
	}
	
	if topicName == "" {
		return nil
	}
	
	value := getFloatValueWithDefault(sample, "topic.bytesOutPerSec", -1)
	if value < 0 {
		value = getFloatValueWithDefault(sample, "bytesOutPerSec", -1)
	}
	if value < 0 {
		value = getFloatValueWithDefault(sample, "topic.bytesOutPerSecond", -1)
	}
	if value < 0 {
		// Check for provider.* attributes (AwsMskTopicSample)
		value = getFloatValueWithDefault(sample, "provider.bytesOutPerSec.Average", -1)
	}
	if value < 0 {
		value = getFloatValueWithDefault(sample, "provider.bytesOutPerSec.Sum", -1)
	}
	
	if value < 0 {
		return nil
	}
	
	if !validateMetricValue(value, "kafka.topic.BytesOutPerSec") {
		return nil
	}
	
	attrs := dt.buildTopicAttributes(sample)
	attrs["topic"] = topicName
	
	return &Metric{
		Name:       "kafka.topic.BytesOutPerSec",
		Type:       "gauge",
		Value:      value,
		Timestamp:  time.Now().UnixNano() / 1e6,
		Attributes: attrs,
	}
}

// transformTopicMessagesInPerSec transforms topic messages in metric
func (dt *DimensionalTransformer) transformTopicMessagesInPerSec(sample map[string]interface{}) *Metric {
	topicName := getStringValueWithDefault(sample, "topic", "")
	if topicName == "" {
		topicName = getStringValueWithDefault(sample, "topicName", "")
	}
	
	if topicName == "" {
		return nil
	}
	
	value := getFloatValueWithDefault(sample, "topic.messagesInPerSec", -1)
	if value < 0 {
		value = getFloatValueWithDefault(sample, "messagesInPerSec", -1)
	}
	if value < 0 {
		value = getFloatValueWithDefault(sample, "topic.messagesInPerSecond", -1)
	}
	if value < 0 {
		// Check for provider.* attributes (AwsMskTopicSample)
		value = getFloatValueWithDefault(sample, "provider.messagesInPerSec.Average", -1)
	}
	if value < 0 {
		value = getFloatValueWithDefault(sample, "provider.messagesInPerSec.Sum", -1)
	}
	
	if value < 0 {
		return nil
	}
	
	if !validateMetricValue(value, "kafka.topic.MessagesInPerSec") {
		return nil
	}
	
	attrs := dt.buildTopicAttributes(sample)
	attrs["topic"] = topicName
	
	return &Metric{
		Name:       "kafka.topic.MessagesInPerSec",
		Type:       "gauge",
		Value:      value,
		Timestamp:  time.Now().UnixNano() / 1e6,
		Attributes: attrs,
	}
}

// TransformTopicMetrics transforms topic metrics
func (dt *DimensionalTransformer) TransformTopicMetrics(topicName string, metrics map[string]interface{}) error {
	if !dt.enabled {
		return nil
	}

	log.Debug("Transforming topic metrics for topic %s", topicName)
	
	// Ensure topic name is in metrics
	metrics["topic"] = topicName
	
	// Transform each metric
	if metric := dt.transformTopicBytesInPerSec(metrics); metric != nil {
		dt.batchCollector.AddMetric(metric.Name, metric.Value, metric.Attributes)
	}
	
	if metric := dt.transformTopicBytesOutPerSec(metrics); metric != nil {
		dt.batchCollector.AddMetric(metric.Name, metric.Value, metric.Attributes)
	}
	
	if metric := dt.transformTopicMessagesInPerSec(metrics); metric != nil {
		dt.batchCollector.AddMetric(metric.Name, metric.Value, metric.Attributes)
	}
	
	return nil
}

// ========================================================================================
// CONSUMER GROUP METRICS TRANSFORMATIONS
// ========================================================================================

// transformConsumerMaxLag transforms consumer max lag metric
func (dt *DimensionalTransformer) transformConsumerMaxLag(groupId string, samples []map[string]interface{}) *Metric {
	maxLag := float64(0)
	
	// Find max lag across all partitions
	for _, sample := range samples {
		lag := getFloatValueWithDefault(sample, "consumer.lag", 0)
		if lag < 0 {
			lag = getFloatValueWithDefault(sample, "consumerLag", 0)
		}
		if lag < 0 {
			lag = getFloatValueWithDefault(sample, "lag", 0)
		}
		
		if lag > maxLag {
			maxLag = lag
		}
	}
	
	if !validateMetricValue(maxLag, "kafka.consumer.MaxLag") {
		return nil
	}
	
	// Use first sample for attributes
	attrs := dt.buildConsumerGroupAttributes(groupId, samples[0])
	
	return &Metric{
		Name:       "kafka.consumer.MaxLag",
		Type:       "gauge",
		Value:      maxLag,
		Timestamp:  time.Now().UnixNano() / 1e6,
		Attributes: attrs,
	}
}

// transformConsumerTotalLag transforms consumer total lag metric
func (dt *DimensionalTransformer) transformConsumerTotalLag(groupId string, samples []map[string]interface{}) *Metric {
	totalLag := float64(0)
	
	// Sum lag across all partitions
	for _, sample := range samples {
		lag := getFloatValueWithDefault(sample, "consumer.lag", 0)
		if lag < 0 {
			lag = getFloatValueWithDefault(sample, "consumerLag", 0)
		}
		if lag < 0 {
			lag = getFloatValueWithDefault(sample, "lag", 0)
		}
		
		if lag > 0 {
			totalLag += lag
		}
	}
	
	if !validateMetricValue(totalLag, "kafka.consumer.TotalLag") {
		return nil
	}
	
	// Use first sample for attributes
	attrs := dt.buildConsumerGroupAttributes(groupId, samples[0])
	
	return &Metric{
		Name:       "kafka.consumer.TotalLag",
		Type:       "gauge",
		Value:      totalLag,
		Timestamp:  time.Now().UnixNano() / 1e6,
		Attributes: attrs,
	}
}

// TransformConsumerMetrics transforms consumer group metrics
func (dt *DimensionalTransformer) TransformConsumerMetrics(consumerGroup string, topic string, metrics map[string]interface{}) error {
	if !dt.enabled {
		return nil
	}

	log.Debug("Transforming consumer metrics for group %s, topic %s", consumerGroup, topic)
	
	// For single sample, just transform directly
	samples := []map[string]interface{}{metrics}
	
	if metric := dt.transformConsumerMaxLag(consumerGroup, samples); metric != nil {
		dt.batchCollector.AddMetric(metric.Name, metric.Value, metric.Attributes)
	}
	
	if metric := dt.transformConsumerTotalLag(consumerGroup, samples); metric != nil {
		dt.batchCollector.AddMetric(metric.Name, metric.Value, metric.Attributes)
	}
	
	return nil
}

// TransformConsumerOffsetSamples transforms multiple consumer offset samples with aggregation
func (dt *DimensionalTransformer) TransformConsumerOffsetSamples(samples []map[string]interface{}) error {
	if !dt.enabled || len(samples) == 0 {
		return nil
	}
	
	// Group by consumer group
	grouped := groupByConsumerGroup(samples)
	
	for groupId, groupSamples := range grouped {
		if metric := dt.transformConsumerMaxLag(groupId, groupSamples); metric != nil {
			dt.batchCollector.AddMetric(metric.Name, metric.Value, metric.Attributes)
		}
		
		if metric := dt.transformConsumerTotalLag(groupId, groupSamples); metric != nil {
			dt.batchCollector.AddMetric(metric.Name, metric.Value, metric.Attributes)
		}
	}
	
	return nil
}

// ========================================================================================
// ATTRIBUTE BUILDERS
// ========================================================================================

// buildCommonAttributes builds common attributes for all metrics
func (dt *DimensionalTransformer) buildCommonAttributes() map[string]interface{} {
	return map[string]interface{}{
		"collector.name":           "cloudwatch-metric-streams",
		"instrumentation.name":     "com.newrelic.kafka",
		"instrumentation.source":   "msk-shim",
		"instrumentation.version":  Version,
	}
}

// buildBrokerAttributes builds broker-specific attributes
func (dt *DimensionalTransformer) buildBrokerAttributes(sample map[string]interface{}) map[string]interface{} {
	attrs := dt.buildCommonAttributes()
	
	// Required attributes
	attrs["entity.type"] = "AWS_KAFKA_BROKER"
	
	// Extract and sanitize cluster name
	clusterName := getStringValueWithDefault(sample, "clusterName", dt.config.ClusterName)
	clusterName = dt.sanitizeEntityName(clusterName)
	attrs["cluster.name"] = clusterName
	
	// Extract broker ID with comprehensive fallbacks
	brokerId := dt.extractBrokerIdWithFallbacks(sample)
	attrs["broker.id"] = brokerId
	attrs["entity.name"] = fmt.Sprintf("%s:broker-%s", clusterName, brokerId)
	attrs["entity.guid"] = dt.generateBrokerGUID(clusterName, brokerId)
	
	// Critical AWS fields for UI visibility
	attrs["provider"] = "AwsMsk"
	attrs["awsAccountId"] = dt.config.AWSAccountID
	attrs["awsRegion"] = dt.config.AWSRegion
	attrs["providerAccountId"] = dt.config.AWSAccountID
	attrs["providerExternalId"] = dt.config.AWSAccountID // Required for AWS account mapping
	attrs["aws.Namespace"] = "AWS/Kafka"
	
	// Optional but recommended
	if host := getStringValueWithDefault(sample, "host", ""); host != "" {
		attrs["host"] = host
	}
	if port := getStringValueWithDefault(sample, "port", ""); port != "" {
		attrs["port"] = port
	}
	
	// Add any existing GUID if present
	if existingGuid := getStringValueWithDefault(sample, "entityGuid", ""); existingGuid != "" {
		// Validate GUID format
		if dt.validateGUID(existingGuid) {
			attrs["entity.guid"] = existingGuid
		}
	}
	
	// Ensure all values are strings
	return dt.stringifyAttributes(attrs)
}

// buildTopicAttributes builds topic-specific attributes
func (dt *DimensionalTransformer) buildTopicAttributes(sample map[string]interface{}) map[string]interface{} {
	attrs := dt.buildCommonAttributes()
	
	attrs["entity.type"] = "AWS_KAFKA_TOPIC"
	attrs["cluster.name"] = getStringValueWithDefault(sample, "clusterName", dt.config.ClusterName)
	
	topicName := getStringValueWithDefault(sample, "topic", "")
	if topicName == "" {
		topicName = getStringValueWithDefault(sample, "topicName", "")
	}
	
	attrs["entity.name"] = fmt.Sprintf("topic:%s", topicName)
	attrs["entity.guid"] = dt.generateTopicGUID(attrs["cluster.name"].(string), topicName)
	
	// Critical AWS fields for UI visibility
	attrs["provider"] = "AwsMsk"
	attrs["awsAccountId"] = dt.config.AWSAccountID
	attrs["awsRegion"] = dt.config.AWSRegion
	attrs["providerAccountId"] = dt.config.AWSAccountID
	attrs["providerExternalId"] = dt.config.AWSAccountID // Required for AWS account mapping
	attrs["aws.Namespace"] = "AWS/Kafka"
	
	// Include broker that reported this metric
	if brokerId := extractBrokerId(sample); brokerId != "unknown" {
		attrs["broker.id"] = brokerId
	}
	
	return dt.stringifyAttributes(attrs)
}

// buildConsumerGroupAttributes builds consumer group attributes
func (dt *DimensionalTransformer) buildConsumerGroupAttributes(groupId string, sample map[string]interface{}) map[string]interface{} {
	attrs := dt.buildCommonAttributes()
	
	attrs["entity.type"] = "AWS_KAFKA_CONSUMER_GROUP"
	attrs["cluster.name"] = getStringValueWithDefault(sample, "clusterName", dt.config.ClusterName)
	attrs["consumer.group.id"] = groupId
	attrs["entity.name"] = fmt.Sprintf("consumer-group:%s", groupId)
	attrs["entity.guid"] = dt.generateConsumerGroupGUID(attrs["cluster.name"].(string), groupId)
	
	// Critical AWS fields for UI visibility
	attrs["provider"] = "AwsMsk"
	attrs["awsAccountId"] = dt.config.AWSAccountID
	attrs["awsRegion"] = dt.config.AWSRegion
	attrs["providerAccountId"] = dt.config.AWSAccountID
	attrs["providerExternalId"] = dt.config.AWSAccountID // Required for AWS account mapping
	attrs["aws.Namespace"] = "AWS/Kafka"
	
	if topic := getStringValueWithDefault(sample, "topic", ""); topic != "" {
		attrs["topic"] = topic
	}
	
	return dt.stringifyAttributes(attrs)
}

// buildClusterAttributes builds cluster attributes
func (dt *DimensionalTransformer) buildClusterAttributes(sample map[string]interface{}) map[string]interface{} {
	attrs := dt.buildCommonAttributes()
	
	clusterName := getStringValueWithDefault(sample, "clusterName", dt.config.ClusterName)
	attrs["entity.type"] = "AWS_KAFKA_CLUSTER"
	attrs["cluster.name"] = clusterName
	attrs["entity.name"] = fmt.Sprintf("aws-msk-cluster:%s", clusterName)
	attrs["entity.guid"] = dt.generateClusterGUID(clusterName)
	
	// Critical AWS fields for UI visibility
	attrs["provider"] = "AwsMsk"
	attrs["awsAccountId"] = dt.config.AWSAccountID
	attrs["awsRegion"] = dt.config.AWSRegion
	attrs["providerAccountId"] = dt.config.AWSAccountID
	attrs["providerExternalId"] = dt.config.AWSAccountID // Required for AWS account mapping
	attrs["aws.Namespace"] = "AWS/Kafka"
	
	// Add AWS-specific attributes if available
	if arn := getStringValueWithDefault(sample, "clusterArn", ""); arn != "" {
		attrs["aws.arn"] = arn
	}
	if region := getStringValueWithDefault(sample, "awsRegion", dt.config.AWSRegion); region != "" {
		attrs["aws.region"] = region
	}
	
	return dt.stringifyAttributes(attrs)
}

// stringifyAttributes ensures all attribute values are strings
func (dt *DimensionalTransformer) stringifyAttributes(attrs map[string]interface{}) map[string]interface{} {
	result := make(map[string]interface{})
	for k, v := range attrs {
		// Handle nil values
		if v == nil {
			continue
		}
		// Convert to string
		result[k] = fmt.Sprintf("%v", v)
	}
	return result
}

// extractBrokerIdWithFallbacks extracts broker ID using multiple strategies
func (dt *DimensionalTransformer) extractBrokerIdWithFallbacks(sample map[string]interface{}) string {
	// Strategy 1: Direct broker ID fields
	if id := getStringValueWithDefault(sample, "brokerId", ""); id != "" {
		return id
	}
	if id := getStringValueWithDefault(sample, "broker.id", ""); id != "" {
		return id
	}
	if id := getIntValueWithDefault(sample, "brokerId", -1); id >= 0 {
		return fmt.Sprintf("%d", id)
	}
	if id := getIntValueWithDefault(sample, "broker.id", -1); id >= 0 {
		return fmt.Sprintf("%d", id)
	}
	
	// Strategy 2: Extract from provider.brokerId (for AwsMsk samples)
	if id, ok := getFloatValue(sample, "provider.brokerId"); ok && id >= 0 {
		return fmt.Sprintf("%.0f", id)
	}
	
	// Strategy 3: Entity name parsing
	if entityName := getStringValueWithDefault(sample, "entityName", ""); entityName != "" {
		// Try patterns: "broker-1", "kafka-broker-1", "broker1"
		patterns := []string{
			`broker-(\d+)`,
			`broker(\d+)`,
			`kafka-broker-(\d+)`,
			`b(\d+)`,
		}
		
		for _, pattern := range patterns {
			if match := regexp.MustCompile(pattern).FindStringSubmatch(entityName); len(match) > 1 {
				return match[1]
			}
		}
	}
	
	// Strategy 4: Host-based extraction
	if host := getStringValueWithDefault(sample, "host", ""); host != "" {
		// Extract from hostnames like "kafka-broker-1.example.com"
		if idx := strings.Index(host, "broker-"); idx >= 0 {
			afterBroker := host[idx+7:]
			if dotIdx := strings.Index(afterBroker, "."); dotIdx > 0 {
				return afterBroker[:dotIdx]
			}
		}
	}
	
	// Strategy 5: JMX ObjectName parsing
	for key := range sample {
		if strings.Contains(key, "broker-id=") {
			if match := regexp.MustCompile(`broker-id=(\d+)`).FindStringSubmatch(key); len(match) > 1 {
				return match[1]
			}
		}
	}
	
	// Final fallback: generate from hash
	log.Warn("Could not extract broker ID, generating from hash")
	
	// Use deterministic hash of available data
	data := fmt.Sprintf("%v:%v:%v",
		getStringValueWithDefault(sample, "clusterName", ""),
		getStringValueWithDefault(sample, "entityName", ""),
		getStringValueWithDefault(sample, "host", ""))
	
	hash := sha256.Sum256([]byte(data))
	return fmt.Sprintf("auto-%x", hash[:4])
}

// validateGUID validates GUID format
func (dt *DimensionalTransformer) validateGUID(guid string) bool {
	// Decode base64
	decoded, err := base64.StdEncoding.DecodeString(guid)
	if err != nil {
		return false
	}
	
	// Check format: accountID|INFRA|NA|hashInt
	parts := strings.Split(string(decoded), "|")
	if len(parts) != 4 {
		return false
	}
	
	// Validate parts
	if parts[1] != "INFRA" || parts[2] != "NA" {
		return false
	}
	
	// Validate hash is numeric
	if _, err := strconv.ParseInt(parts[3], 10, 64); err != nil {
		return false
	}
	
	return true
}

// ========================================================================================
// ENTITY GUID GENERATION
// ========================================================================================

// generateBrokerGUID generates a consistent entity GUID for a broker
func (dt *DimensionalTransformer) generateBrokerGUID(clusterName string, brokerId string) string {
	return dt.guidCache.GetOrGenerate("AWS_KAFKA_BROKER", clusterName, brokerId)
}

// generateTopicGUID generates a consistent entity GUID for a topic
func (dt *DimensionalTransformer) generateTopicGUID(clusterName string, topicName string) string {
	return dt.guidCache.GetOrGenerate("AWS_KAFKA_TOPIC", clusterName, topicName)
}

// generateConsumerGroupGUID generates a consistent entity GUID for a consumer group
func (dt *DimensionalTransformer) generateConsumerGroupGUID(clusterName string, groupId string) string {
	return dt.guidCache.GetOrGenerate("AWS_KAFKA_CONSUMER_GROUP", clusterName, groupId)
}

// generateClusterGUID generates a consistent entity GUID for a cluster
func (dt *DimensionalTransformer) generateClusterGUID(clusterName string) string {
	return dt.guidCache.GetOrGenerate("AWS_KAFKA_CLUSTER", clusterName, "")
}

// ========================================================================================
// SAMPLE TRANSFORMATION (Event API to Dimensional)
// ========================================================================================

// TransformSample transforms Event API samples into dimensional metrics
func (dt *DimensionalTransformer) TransformSample(sample map[string]interface{}) error {
	if !dt.enabled {
		return nil
	}
	
	eventType, ok := getStringValue(sample, "eventType")
	if !ok {
		return nil
	}
	
	switch eventType {
	case "KafkaBrokerSample":
		return dt.transformKafkaBrokerSample(sample)
	case "AwsMskBrokerSample":
		return dt.transformAwsMskBrokerSample(sample)
	case "AwsMskClusterSample":
		return dt.transformAwsMskClusterSample(sample)
	case "KafkaTopicSample", "AwsMskTopicSample":
		return dt.transformTopicSample(sample)
	case "KafkaOffsetSample":
		return dt.transformOffsetSample(sample)
	}
	
	return nil
}

// transformKafkaBrokerSample transforms a KafkaBrokerSample into dimensional metrics
func (dt *DimensionalTransformer) transformKafkaBrokerSample(sample map[string]interface{}) error {
	// Extract broker ID
	brokerID := extractBrokerId(sample)
	if brokerID == "unknown" {
		log.Warn("Could not extract broker ID from sample")
		return nil
	}
	
	// Transform broker metrics
	return dt.TransformBrokerMetrics(brokerID, sample)
}

// transformAwsMskBrokerSample transforms an AwsMskBrokerSample into dimensional metrics
func (dt *DimensionalTransformer) transformAwsMskBrokerSample(sample map[string]interface{}) error {
	clusterName := getStringValueWithDefault(sample, "clusterName", dt.config.ClusterName)
	entityGuid := getStringValueWithDefault(sample, "entityGuid", "")
	
	// Extract broker ID from provider.brokerId
	brokerId := ""
	if id, ok := getFloatValue(sample, "provider.brokerId"); ok {
		brokerId = fmt.Sprintf("%.0f", id)
	} else if id := extractBrokerId(sample); id != "unknown" {
		brokerId = id
	}
	
	if brokerId == "" || brokerId == "unknown" {
		log.Warn("Could not extract broker ID from AwsMskBrokerSample")
		return nil
	}
	
	// Build base attributes
	baseAttrs := map[string]interface{}{
		"entity.type": "AWS_KAFKA_BROKER",
		"entity.guid": entityGuid,
		"entity.name": fmt.Sprintf("%s:broker-%s", clusterName, brokerId),
		"cluster.name": clusterName,
		"broker.id": brokerId,
		"instrumentation.provider": "nri-kafka",
		"instrumentation.source": "msk-shim",
	}
	
	// Transform provider.* metrics to kafka.broker.* metrics
	brokerProviderMappings := map[string]string{
		"provider.bytesInPerSec.Average": "kafka.broker.BytesInPerSec",
		"provider.bytesInPerSec.Sum": "kafka.broker.BytesInPerSec",
		"provider.bytesOutPerSec.Average": "kafka.broker.BytesOutPerSec", 
		"provider.bytesOutPerSec.Sum": "kafka.broker.BytesOutPerSec",
		"provider.messagesInPerSec.Average": "kafka.broker.MessagesInPerSec",
		"provider.messagesInPerSec.Sum": "kafka.broker.MessagesInPerSec",
		"provider.fetchConsumerRequestsPerSec.Average": "kafka.broker.TotalFetchRequestsPerSec",
		"provider.produceRequestsPerSec.Average": "kafka.broker.TotalProduceRequestsPerSec",
		"provider.underReplicatedPartitions": "kafka.broker.UnderReplicatedPartitions",
	}
	
	// Transform each provider metric
	for providerField, metricName := range brokerProviderMappings {
		if value, ok := getFloatValue(sample, providerField); ok && value >= 0 {
			if validateMetricValue(value, metricName) {
				dt.batchCollector.AddMetric(metricName, value, dt.stringifyAttributes(baseAttrs))
			}
		}
	}
	
	return nil
}

// transformAwsMskClusterSample transforms cluster-level metrics
func (dt *DimensionalTransformer) transformAwsMskClusterSample(sample map[string]interface{}) error {
	clusterName := getStringValueWithDefault(sample, "clusterName", dt.config.ClusterName)
	entityGuid := getStringValueWithDefault(sample, "entityGuid", "")
	
	// Generate entity GUID if not present
	if entityGuid == "" {
		entityGuid = dt.generateClusterGUID(clusterName)
	}
	
	// Build base attributes
	baseAttrs := map[string]interface{}{
		"entity.type": "AWS_KAFKA_CLUSTER",
		"entity.guid": entityGuid,
		"entity.name": fmt.Sprintf("aws-msk-cluster:%s", clusterName),
		"cluster.name": clusterName,
		"instrumentation.provider": "nri-kafka",
		"instrumentation.source": "msk-shim",
	}
	
	// Transform provider.* cluster metrics
	clusterProviderMappings := map[string]string{
		"provider.bytesInPerSec.Sum": "kafka.cluster.BytesInPerSec",
		"provider.bytesOutPerSec.Sum": "kafka.cluster.BytesOutPerSec",
		"provider.messagesInPerSec.Sum": "kafka.cluster.MessagesInPerSec",
		"provider.activeControllerCount.Sum": "kafka.cluster.ActiveControllerCount",
		"provider.offlinePartitionsCount.Sum": "kafka.cluster.OfflinePartitionsCount",
		"provider.underReplicatedPartitions.Sum": "kafka.cluster.UnderReplicatedPartitions",
		"provider.globalPartitionCount": "kafka.cluster.GlobalPartitionCount",
		"provider.globalTopicCount": "kafka.cluster.GlobalTopicCount",
	}
	
	// Transform each provider metric
	for providerField, metricName := range clusterProviderMappings {
		if value, ok := getFloatValue(sample, providerField); ok && value >= 0 {
			// Always send critical health metrics even if 0
			if metricName == "kafka.cluster.OfflinePartitionsCount" || 
			   metricName == "kafka.cluster.UnderReplicatedPartitions" {
				validateMetricValue(value, metricName)
				dt.batchCollector.AddMetric(metricName, value, dt.stringifyAttributes(baseAttrs))
			} else if validateMetricValue(value, metricName) {
				dt.batchCollector.AddMetric(metricName, value, dt.stringifyAttributes(baseAttrs))
			}
		}
	}
	
	// Special handling for ActiveControllerCount (default to 1 if not present)
	if _, ok := getFloatValue(sample, "provider.activeControllerCount.Sum"); !ok {
		dt.batchCollector.AddMetric("kafka.cluster.ActiveControllerCount", 1, dt.stringifyAttributes(baseAttrs))
	}
	
	return nil
}

// transformTopicSample transforms topic samples into dimensional metrics
func (dt *DimensionalTransformer) transformTopicSample(sample map[string]interface{}) error {
	topicName := getStringValueWithDefault(sample, "topic", "")
	if topicName == "" {
		topicName = getStringValueWithDefault(sample, "topicName", "")
	}
	
	if topicName == "" {
		return nil
	}
	
	return dt.TransformTopicMetrics(topicName, sample)
}

// transformOffsetSample transforms consumer offset samples into dimensional metrics
func (dt *DimensionalTransformer) transformOffsetSample(sample map[string]interface{}) error {
	consumerGroup := getStringValueWithDefault(sample, "consumerGroup", "")
	topic := getStringValueWithDefault(sample, "topic", "")
	
	if consumerGroup == "" || topic == "" {
		return nil
	}
	
	return dt.TransformConsumerMetrics(consumerGroup, topic, sample)
}

// ========================================================================================
// LIFECYCLE METHODS
// ========================================================================================

// Flush forces sending all collected metrics
func (dt *DimensionalTransformer) Flush() error {
	if !dt.enabled || dt.batchCollector == nil {
		return nil
	}

	return dt.batchCollector.Flush()
}

// Stop stops the dimensional transformer
func (dt *DimensionalTransformer) Stop() {
	if dt.enabled && dt.batchCollector != nil {
		dt.batchCollector.Stop()
	}
}

// ========================================================================================
// BATCH HANDLING
// ========================================================================================

// sendMetricBatches splits large batches and sends them
func (dt *DimensionalTransformer) sendMetricBatches(metrics []MetricData) error {
	for i := 0; i < len(metrics); i += MaxBatchSize {
		end := i + MaxBatchSize
		if end > len(metrics) {
			end = len(metrics)
		}
		
		batch := metrics[i:end]
		if err := dt.metricClient.SendMetrics(batch); err != nil {
			return err
		}
	}
	return nil
}

// ========================================================================================
// HELPER METHODS
// ========================================================================================

// extractValueFromFields tries multiple field mappings to extract a value
func (dt *DimensionalTransformer) extractValueFromFields(sample map[string]interface{}, fields []string) float64 {
	for _, field := range fields {
		if val, ok := getFloatValue(sample, field); ok && val >= 0 {
			return val
		}
	}
	return -1
}

// validateMetricValue performs comprehensive validation on metric values
func (dt *DimensionalTransformer) validateMetricValue(value float64, metricName string) error {
	// Check for NaN/Inf
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return fmt.Errorf("invalid float value: %f", value)
	}
	
	// Check negative values (most metrics should be non-negative)
	if value < 0 {
		return fmt.Errorf("negative value: %f", value)
	}
	
	// Metric-specific validations
	switch metricName {
	case "kafka.broker.BytesInPerSec", "kafka.broker.BytesOutPerSec":
		// Check for unreasonable throughput (> 10GB/sec)
		if value > 10*1024*1024*1024 {
			log.Warn("Unusually high throughput for %s: %f bytes/sec", metricName, value)
		}
	case "kafka.broker.MessagesInPerSec":
		// Check for unreasonable message rate (> 10M msgs/sec)
		if value > 10_000_000 {
			log.Warn("Unusually high message rate: %f msgs/sec", value)
		}
	case "kafka.cluster.ActiveControllerCount":
		if value != 0 && value != 1 {
			log.Warn("Abnormal ActiveControllerCount: %f (expected 0 or 1)", value)
		}
	case "kafka.cluster.OfflinePartitionsCount":
		if value > 0 {
			log.Error("CRITICAL: %f offline partitions detected", value)
		}
	case "kafka.consumer.MaxLag", "kafka.consumer.TotalLag":
		// Very high lag (> 1M) should log warning
		if value > 1_000_000 {
			log.Warn("Very high consumer lag detected: %f", value)
		}
	}
	
	return nil
}

// getCurrentTimestamp returns current time in milliseconds with validation
func (dt *DimensionalTransformer) getCurrentTimestamp() int64 {
	now := time.Now()
	dt.lastMetricTime = now
	return now.UnixNano() / 1e6
}

// sanitizeEntityName cleans entity names to remove problematic characters
func (dt *DimensionalTransformer) sanitizeEntityName(name string) string {
	// Trim whitespace
	name = strings.TrimSpace(name)
	if name == "" {
		return "unknown"
	}
	
	// Replace problematic characters
	replacer := strings.NewReplacer(
		":", "_",
		"/", "_",
		"@", "_",
		"#", "_",
		" ", "_",
		"\n", "",
		"\r", "",
		"\t", "_",
	)
	
	return replacer.Replace(name)
}

// ========================================================================================
// ERROR HANDLING
// ========================================================================================

// TransformationError represents an error during metric transformation
type TransformationError struct {
	EventType string
	Field     string
	Reason    string
	Sample    map[string]interface{}
}

func (e TransformationError) Error() string {
	return fmt.Sprintf("transformation failed for %s.%s: %s", e.EventType, e.Field, e.Reason)
}

// ErrorCollector collects transformation errors
type ErrorCollector struct {
	errors []TransformationError
	mu     sync.Mutex
}

func NewErrorCollector() *ErrorCollector {
	return &ErrorCollector{
		errors: make([]TransformationError, 0),
	}
}

func (ec *ErrorCollector) AddError(err TransformationError) {
	ec.mu.Lock()
	defer ec.mu.Unlock()
	ec.errors = append(ec.errors, err)
}

func (ec *ErrorCollector) GetSummary() string {
	ec.mu.Lock()
	defer ec.mu.Unlock()
	
	// Group errors by type
	errorCounts := make(map[string]int)
	for _, err := range ec.errors {
		key := fmt.Sprintf("%s.%s: %s", err.EventType, err.Field, err.Reason)
		errorCounts[key]++
	}
	
	// Build summary
	var summary strings.Builder
	summary.WriteString(fmt.Sprintf("Total transformation errors: %d\n", len(ec.errors)))
	for errType, count := range errorCounts {
		summary.WriteString(fmt.Sprintf("  %s: %d occurrences\n", errType, count))
	}
	
	return summary.String()
}

// ========================================================================================
// VALIDATION REPORTING
// ========================================================================================

// ValidationReport tracks validation statistics
type ValidationReport struct {
	TotalMetrics   int64
	ValidMetrics   int64
	InvalidMetrics int64
	StartTime      time.Time
	mu             sync.Mutex
}

func NewValidationReport() *ValidationReport {
	return &ValidationReport{
		StartTime: time.Now(),
	}
}

func (vr *ValidationReport) IncrementValid() {
	vr.mu.Lock()
	defer vr.mu.Unlock()
	vr.TotalMetrics++
	vr.ValidMetrics++
}

func (vr *ValidationReport) IncrementInvalid() {
	vr.mu.Lock()
	defer vr.mu.Unlock()
	vr.TotalMetrics++
	vr.InvalidMetrics++
}

func (vr *ValidationReport) GetSummary() string {
	vr.mu.Lock()
	defer vr.mu.Unlock()
	
	duration := time.Since(vr.StartTime)
	successRate := float64(0)
	if vr.TotalMetrics > 0 {
		successRate = float64(vr.ValidMetrics) / float64(vr.TotalMetrics) * 100
	}
	
	return fmt.Sprintf(
		"Validation Report: Duration=%v, Total=%d, Valid=%d (%.2f%%), Invalid=%d",
		duration, vr.TotalMetrics, vr.ValidMetrics, successRate, vr.InvalidMetrics,
	)
}

// ========================================================================================
// GUID CACHE FOR CONSISTENCY
// ========================================================================================

// GUIDCache maintains consistent GUIDs for entities
type GUIDCache struct {
	cache map[string]string
	mu    sync.RWMutex
	maxSize int
}

func NewGUIDCache(maxSize int) *GUIDCache {
	return &GUIDCache{
		cache: make(map[string]string),
		maxSize: maxSize,
	}
}

func (gc *GUIDCache) GetOrGenerate(entityType, clusterName, resourceID string) string {
	key := fmt.Sprintf("%s:%s:%s", entityType, clusterName, resourceID)
	
	// Check cache first
	gc.mu.RLock()
	if guid, exists := gc.cache[key]; exists {
		gc.mu.RUnlock()
		return guid
	}
	gc.mu.RUnlock()
	
	// Generate new GUID
	gc.mu.Lock()
	defer gc.mu.Unlock()
	
	// Double-check after acquiring write lock
	if guid, exists := gc.cache[key]; exists {
		return guid
	}
	
	// Check cache size
	if len(gc.cache) >= gc.maxSize {
		// Simple eviction: remove first item found
		for k := range gc.cache {
			delete(gc.cache, k)
			break
		}
	}
	
	guid := generateEntityGUID(entityType, clusterName, resourceID)
	gc.cache[key] = guid
	
	return guid
}

// Helper function for GUID generation (moved from method)
func generateEntityGUID(entityType, clusterName, resourceID string) string {
	// Get account ID from environment or use default
	accountID := os.Getenv("AWS_ACCOUNT_ID")
	if accountID == "" {
		accountID = "3630072"
	}
	
	// Entity identifier format is critical
	var entityIdentifier string
	switch entityType {
	case "AWS_KAFKA_BROKER":
		entityIdentifier = fmt.Sprintf("%s:%s:broker-%s", entityType, clusterName, resourceID)
	case "AWS_KAFKA_TOPIC":
		entityIdentifier = fmt.Sprintf("%s:%s:%s", entityType, clusterName, resourceID)
	case "AWS_KAFKA_CONSUMER_GROUP":
		entityIdentifier = fmt.Sprintf("%s:%s:%s", entityType, clusterName, resourceID)
	case "AWS_KAFKA_CLUSTER":
		entityIdentifier = fmt.Sprintf("%s:%s", entityType, clusterName)
	}
	
	// Hash the identifier
	hash := sha256.Sum256([]byte(entityIdentifier))
	hashInt := int64(0)
	for i := 0; i < 8; i++ {
		hashInt = (hashInt << 8) | int64(hash[i])
	}
	
	// Make hashInt positive
	if hashInt < 0 {
		hashInt = -hashInt
	}
	
	// Format: accountID|INFRA|NA|hashInt
	guidString := fmt.Sprintf("%s|INFRA|NA|%d", accountID, hashInt)
	return base64.StdEncoding.EncodeToString([]byte(guidString))
}