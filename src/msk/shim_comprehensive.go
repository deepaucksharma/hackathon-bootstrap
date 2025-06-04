package msk

import (
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/newrelic/infra-integrations-sdk/v3/data/metric"
	"github.com/newrelic/infra-integrations-sdk/v3/integration"
	"github.com/newrelic/infra-integrations-sdk/v3/log"
)

// ComprehensiveMSKShim implements a complete MSK transformation layer
type ComprehensiveMSKShim struct {
	enabled          bool
	config           Config
	transformer      *ComprehensiveTransformer
	aggregator       *MetricAggregator
	entityCache      map[string]*integration.Entity
	mutex            sync.RWMutex
	integration      *integration.Integration
	
	// Enhanced mode tracking
	enhancedMode     bool
	metricsReceived  int
	lastMetricTime   time.Time
	emptyMetricCount int
	
	// Debug support
	debugMode        bool
}

// NewComprehensiveMSKShim creates a new comprehensive MSK shim
func NewComprehensiveMSKShim(config Config) *ComprehensiveMSKShim {
	shim := &ComprehensiveMSKShim{
		enabled:      config.Enabled,
		config:       config,
		aggregator:   NewMetricAggregator(),
		entityCache:  make(map[string]*integration.Entity),
		debugMode:    false, // Could be controlled by config later
		integration:  nil,   // Will be set later via SetIntegration
	}
	
	// Start with simple transformer
	shim.transformer = NewComprehensiveTransformer(config.ClusterName)
	
	return shim
}

// ProcessBrokerMetrics transforms broker metrics to MSK format
func (s *ComprehensiveMSKShim) ProcessBrokerMetrics(brokerSample *metric.Set, entity *integration.Entity) error {
	if !s.enabled {
		return nil
	}
	
	s.debugLog("Processing broker metrics for entity: %v", brokerSample.Metrics["entityName"])
	
	// Check if we have real metrics
	if s.hasRealMetrics(brokerSample) {
		s.metricsReceived++
		s.lastMetricTime = time.Now()
		s.emptyMetricCount = 0
		if s.enhancedMode {
			log.Info("MSK Shim: Switching back to real metrics mode")
			s.enhancedMode = false
			// Transformer remains the same
		}
	} else {
		s.emptyMetricCount++
		// Switch to enhanced mode after 5 consecutive empty metrics
		if !s.enhancedMode && s.emptyMetricCount > 5 {
			log.Info("MSK Shim: Switching to enhanced mode due to lack of real metrics")
			s.enhancedMode = true
			// Could switch to different transformer implementation here if needed
		}
	}
	
	// Extract broker information
	brokerInfo := s.extractBrokerInfo(brokerSample)
	if brokerInfo.ID == "" {
		return fmt.Errorf("unable to extract broker ID from sample")
	}
	
	// Create or get MSK broker entity
	brokerEntity, err := s.getOrCreateBrokerEntity(entity, brokerInfo)
	if err != nil {
		return fmt.Errorf("failed to create broker entity: %v", err)
	}
	
	// Create MSK broker sample
	mskSample := brokerEntity.NewMetricSet("AwsMskBrokerSample")
	
	// Set required attributes first
	s.setBrokerAttributes(mskSample, brokerInfo)
	
	// Transform metrics
	if err := s.transformer.TransformBrokerMetrics(brokerSample.Metrics, mskSample); err != nil {
		return fmt.Errorf("failed to transform broker metrics: %v", err)
	}
	
	// Add to aggregator for cluster-level metrics
	brokerMetric := &BrokerMetrics{
		BrokerID: func() int { id, _ := strconv.Atoi(brokerInfo.ID); return id }(),
	}
	if val, ok := mskSample.Metrics["aws.msk.BytesInPerSec"]; ok {
		brokerMetric.BytesInPerSec, _ = toFloat64(val)
	}
	if val, ok := mskSample.Metrics["aws.msk.BytesOutPerSec"]; ok {
		brokerMetric.BytesOutPerSec, _ = toFloat64(val)
	}
	if val, ok := mskSample.Metrics["aws.msk.MessagesInPerSec"]; ok {
		brokerMetric.MessagesInPerSec, _ = toFloat64(val)
	}
	s.aggregator.AddBrokerMetric(brokerInfo.ID, brokerMetric)
	
	s.debugLog("Successfully processed broker %s with %d metrics", brokerInfo.ID, len(mskSample.Metrics))
	
	return nil
}

// ProcessTopicMetrics transforms topic metrics to MSK format
func (s *ComprehensiveMSKShim) ProcessTopicMetrics(topicSample *metric.Set, entity *integration.Entity) error {
	if !s.enabled {
		return nil
	}
	
	topicName, ok := topicSample.Metrics["topic"].(string)
	if !ok || topicName == "" {
		return fmt.Errorf("topic name not found in sample")
	}
	
	s.debugLog("Processing topic metrics for: %s", topicName)
	
	// Create or get MSK topic entity
	topicEntity, err := s.getOrCreateTopicEntity(entity, topicName)
	if err != nil {
		return fmt.Errorf("failed to create topic entity: %v", err)
	}
	
	// Create MSK topic sample
	mskSample := topicEntity.NewMetricSet("AwsMskTopicSample")
	
	// Set required attributes
	s.setTopicAttributes(mskSample, topicName)
	
	// Transform metrics
	if err := s.transformer.TransformTopicMetrics(topicSample.Metrics, mskSample); err != nil {
		return fmt.Errorf("failed to transform topic metrics: %v", err)
	}
	
	// Add to aggregator
	topicMetric := &TopicMetrics{
		Name: topicName,
	}
	if val, ok := mskSample.Metrics["aws.msk.BytesInPerSec"]; ok {
		topicMetric.BytesInPerSec, _ = toFloat64(val)
	}
	if val, ok := mskSample.Metrics["aws.msk.BytesOutPerSec"]; ok {
		topicMetric.BytesOutPerSec, _ = toFloat64(val)
	}
	if val, ok := mskSample.Metrics["aws.msk.MessagesInPerSec"]; ok {
		topicMetric.MessagesInPerSec, _ = toFloat64(val)
	}
	s.aggregator.AddTopicMetric(topicName, topicMetric)
	
	return nil
}

// ProcessConsumerOffsetSample transforms consumer offset metrics
func (s *ComprehensiveMSKShim) ProcessConsumerOffsetSample(offsetSample *metric.Set, entity *integration.Entity) error {
	if !s.enabled {
		return nil
	}
	
	// Extract consumer group and topic
	consumerGroup, _ := offsetSample.Metrics["consumerGroup"].(string)
	topicName, _ := offsetSample.Metrics["topic"].(string)
	lag, _ := offsetSample.Metrics["consumer.lag"]
	
	if consumerGroup == "" || topicName == "" {
		return fmt.Errorf("consumer group or topic not found in offset sample")
	}
	
	s.debugLog("Processing consumer offset for group: %s, topic: %s, lag: %v", consumerGroup, topicName, lag)
	
	// Add consumer lag to aggregator for enrichment
	if lagFloat, err := toFloat64(lag); err == nil {
		s.aggregator.AddConsumerLag(topicName, consumerGroup, lagFloat)
	}
	
	// Also create a consumer group entity if needed
	if topicEntity, err := s.getOrCreateTopicEntity(entity, topicName); err == nil {
		// Add consumer lag as a metric on the topic
		topicSample := topicEntity.NewMetricSet("AwsMskTopicSample")
		topicSample.SetMetric("consumerGroup", consumerGroup, metric.ATTRIBUTE)
		if lagFloat, err := toFloat64(lag); err == nil {
			topicSample.SetMetric("aws.msk.ConsumerLag", lagFloat, metric.GAUGE)
			topicSample.SetMetric("provider.consumerLag", lagFloat, metric.GAUGE)
		}
	}
	
	return nil
}

// ProcessClusterMetrics creates cluster-level aggregated metrics
func (s *ComprehensiveMSKShim) ProcessClusterMetrics(entity *integration.Entity) error {
	if !s.enabled {
		return nil
	}
	
	s.debugLog("Processing cluster-level metrics")
	
	// Get or create cluster entity
	clusterEntity, err := s.getOrCreateClusterEntity(entity)
	if err != nil {
		return fmt.Errorf("failed to create cluster entity: %v", err)
	}
	
	// Get aggregated data
	clusterData := s.aggregator.GetClusterMetrics()
	if clusterData == nil {
		return fmt.Errorf("no cluster data available")
	}
	
	// Create cluster sample
	clusterSample := clusterEntity.NewMetricSet("AwsMskClusterSample")
	
	// Set cluster attributes
	s.setClusterAttributes(clusterSample)
	
	// Set aggregated metrics
	s.setClusterMetrics(clusterSample, clusterData)
	
	s.debugLog("Created cluster sample with %d topics", 
		clusterData.GlobalTopicCount)
	
	return nil
}

// Helper methods

func (s *ComprehensiveMSKShim) hasRealMetrics(sample *metric.Set) bool {
	// Check if key metrics have non-zero values
	keyMetrics := []string{
		"broker.messagesInPerSecond",
		"broker.IOInPerSecond",
		"broker.IOOutPerSecond",
	}
	
	for _, metricName := range keyMetrics {
		if value, ok := sample.Metrics[metricName]; ok {
			if floatVal, err := toFloat64(value); err == nil && floatVal > 0 {
				return true
			}
		}
	}
	
	return false
}

type brokerInfo struct {
	ID   string
	Host string
}

func (s *ComprehensiveMSKShim) extractBrokerInfo(sample *metric.Set) brokerInfo {
	info := brokerInfo{}
	
	// Try to get broker ID from entityName (format: "broker:ID")
	if entityName, ok := sample.Metrics["entityName"].(string); ok {
		if strings.HasPrefix(entityName, "broker:") {
			info.ID = strings.TrimPrefix(entityName, "broker:")
		}
	}
	
	// Try to get broker host
	if host, ok := sample.Metrics["broker_host"].(string); ok {
		info.Host = host
	} else if host, ok := sample.Metrics["host"].(string); ok {
		info.Host = host
	} else if host, ok := sample.Metrics["hostname"].(string); ok {
		info.Host = host
	}
	
	// If no ID found, try to extract from host
	if info.ID == "" && info.Host != "" {
		// Format might be: kafka-0, production-kafka-0, etc.
		parts := strings.Split(info.Host, "-")
		if len(parts) > 0 {
			info.ID = parts[len(parts)-1]
		}
	}
	
	return info
}

func (s *ComprehensiveMSKShim) getOrCreateBrokerEntity(parentEntity *integration.Entity, info brokerInfo) (*integration.Entity, error) {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	
	entityKey := fmt.Sprintf("broker:%s", info.ID)
	if cached, ok := s.entityCache[entityKey]; ok {
		return cached, nil
	}
	
	// Create entity name in MSK format
	entityName := fmt.Sprintf("%s:%s:%s:broker-%s", 
		s.config.AWSAccountID, s.config.AWSRegion, s.config.ClusterName, info.ID)
	
	// Create entity with integration
	var brokerEntity *integration.Entity
	var err error
	if s.integration != nil {
		brokerEntity, err = s.integration.Entity(entityName, "AWSMSKBROKER")
		if err != nil {
			return nil, err
		}
	} else {
		// Fallback - create minimal entity
		brokerEntity = &integration.Entity{}
	}
	
	// Entity metadata is set when creating metric sets, not on entity itself
	
	s.entityCache[entityKey] = brokerEntity
	return brokerEntity, nil
}

func (s *ComprehensiveMSKShim) setBrokerAttributes(sample *metric.Set, info brokerInfo) {
	// Required attributes for AwsMskBrokerSample
	sample.SetMetric("brokerId", info.ID, metric.ATTRIBUTE)
	sample.SetMetric("provider.brokerId", info.ID, metric.ATTRIBUTE)
	sample.SetMetric("clusterName", s.config.ClusterName, metric.ATTRIBUTE)
	sample.SetMetric("provider.clusterName", s.config.ClusterName, metric.ATTRIBUTE)
	
	// Fix the missing broker_host issue
	if info.Host != "" {
		sample.SetMetric("broker_host", info.Host, metric.ATTRIBUTE)
		sample.SetMetric("provider.brokerHost", info.Host, metric.ATTRIBUTE)
	}
	
	// AWS specific attributes
	sample.SetMetric("provider.awsAccountId", s.config.AWSAccountID, metric.ATTRIBUTE)
	sample.SetMetric("provider.awsRegion", s.config.AWSRegion, metric.ATTRIBUTE)
}

func (s *ComprehensiveMSKShim) getOrCreateTopicEntity(parentEntity *integration.Entity, topicName string) (*integration.Entity, error) {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	
	entityKey := fmt.Sprintf("topic:%s", topicName)
	if cached, ok := s.entityCache[entityKey]; ok {
		return cached, nil
	}
	
	// Create entity name in MSK format
	entityName := fmt.Sprintf("%s:%s:%s:topic-%s",
		s.config.AWSAccountID, s.config.AWSRegion, s.config.ClusterName, topicName)
	
	// Create entity with integration
	var topicEntity *integration.Entity
	var err error
	if s.integration != nil {
		topicEntity, err = s.integration.Entity(entityName, "AWSMSKTOPIC")
		if err != nil {
			return nil, err
		}
	} else {
		// Fallback - create minimal entity
		topicEntity = &integration.Entity{}
	}
	
	// Entity metadata is set when creating metric sets, not on entity itself
	
	s.entityCache[entityKey] = topicEntity
	return topicEntity, nil
}

func (s *ComprehensiveMSKShim) setTopicAttributes(sample *metric.Set, topicName string) {
	sample.SetMetric("topic", topicName, metric.ATTRIBUTE)
	sample.SetMetric("topicName", topicName, metric.ATTRIBUTE)
	sample.SetMetric("displayName", topicName, metric.ATTRIBUTE)
	sample.SetMetric("provider.topic", topicName, metric.ATTRIBUTE)
	sample.SetMetric("clusterName", s.config.ClusterName, metric.ATTRIBUTE)
	sample.SetMetric("provider.clusterName", s.config.ClusterName, metric.ATTRIBUTE)
}

func (s *ComprehensiveMSKShim) getOrCreateClusterEntity(parentEntity *integration.Entity) (*integration.Entity, error) {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	
	entityKey := "cluster"
	if cached, ok := s.entityCache[entityKey]; ok {
		return cached, nil
	}
	
	// Create entity name in MSK format
	entityName := fmt.Sprintf("%s:%s:%s",
		s.config.AWSAccountID, s.config.AWSRegion, s.config.ClusterName)
	
	// Create entity with integration
	var clusterEntity *integration.Entity
	var err error
	if s.integration != nil {
		clusterEntity, err = s.integration.Entity(entityName, "AWSMSKCLUSTER")
		if err != nil {
			return nil, err
		}
	} else {
		// Fallback - create minimal entity
		clusterEntity = &integration.Entity{}
	}
	
	// Entity metadata is set when creating metric sets, not on entity itself
	
	s.entityCache[entityKey] = clusterEntity
	return clusterEntity, nil
}

func (s *ComprehensiveMSKShim) setClusterAttributes(sample *metric.Set) {
	sample.SetMetric("clusterName", s.config.ClusterName, metric.ATTRIBUTE)
	sample.SetMetric("provider.clusterName", s.config.ClusterName, metric.ATTRIBUTE)
	sample.SetMetric("provider.awsAccountId", s.config.AWSAccountID, metric.ATTRIBUTE)
	sample.SetMetric("provider.awsRegion", s.config.AWSRegion, metric.ATTRIBUTE)
	sample.SetMetric("provider.clusterArn", s.generateClusterARN(), metric.ATTRIBUTE)
}

func (s *ComprehensiveMSKShim) setClusterMetrics(sample *metric.Set, data *ClusterAggregatedMetrics) {
	// Broker and topic counts
	sample.SetMetric("provider.brokerCount", float64(s.aggregator.GetBrokerCount()), metric.GAUGE)
	sample.SetMetric("provider.topicCount", float64(data.GlobalTopicCount), metric.GAUGE)
	
	// Active controller (always 1 for healthy cluster)
	// Active controller
	sample.SetMetric("provider.activeControllerCount.Sum", float64(data.ActiveControllerCount), metric.GAUGE)
	
	// Aggregate metrics from brokers
	sample.SetMetric("provider.globalPartitionCount.Average", float64(data.GlobalPartitionCount), metric.GAUGE)
	sample.SetMetric("provider.offlinePartitionsCount.Sum", float64(data.OfflinePartitionsCount), metric.GAUGE)
	sample.SetMetric("provider.underReplicatedPartitions.Sum", float64(data.UnderReplicatedPartitions), metric.GAUGE)
}

func (s *ComprehensiveMSKShim) generateClusterARN() string {
	return fmt.Sprintf("arn:aws:kafka:%s:%s:cluster/%s",
		s.config.AWSRegion, s.config.AWSAccountID, s.config.ClusterName)
}

func (s *ComprehensiveMSKShim) debugLog(format string, args ...interface{}) {
	if s.debugMode {
		log.Debug("[MSK_SHIM] "+format, args...)
	}
}

// Add methods to implement MSKShim interface
func (s *ComprehensiveMSKShim) IsEnabled() bool {
	return s.enabled
}

func (s *ComprehensiveMSKShim) TransformBrokerMetrics(brokerData map[string]interface{}) error {
	if !s.enabled {
		return nil
	}
	
	// Create a temporary sample for transformation
	tempSample := &metric.Set{
		Metrics: make(map[string]interface{}),
	}
	
	// Copy data to sample
	for k, v := range brokerData {
		tempSample.Metrics[k] = v
	}
	
	// Get the local entity from integration
	var entity *integration.Entity
	if s.integration != nil {
		entity = s.integration.LocalEntity()
	}
	if entity == nil {
		// Fallback to temporary entity
		entity = &integration.Entity{}
	}
	
	// Process with existing method
	return s.ProcessBrokerMetrics(tempSample, entity)
}

func (s *ComprehensiveMSKShim) TransformTopicMetrics(topicData map[string]interface{}) error {
	if !s.enabled {
		return nil
	}
	
	// Create a temporary sample for transformation
	tempSample := &metric.Set{
		Metrics: make(map[string]interface{}),
	}
	
	// Copy data to sample
	for k, v := range topicData {
		tempSample.Metrics[k] = v
	}
	
	// Get the local entity from integration
	var entity *integration.Entity
	if s.integration != nil {
		entity = s.integration.LocalEntity()
	}
	if entity == nil {
		// Fallback to temporary entity
		entity = &integration.Entity{}
	}
	
	// Process with existing method
	return s.ProcessTopicMetrics(tempSample, entity)
}

func (s *ComprehensiveMSKShim) ProcessConsumerOffset(offsetData map[string]interface{}) error {
	if !s.enabled {
		return nil
	}
	
	// Create a temporary sample for transformation
	tempSample := &metric.Set{
		Metrics: make(map[string]interface{}),
	}
	
	// Copy data to sample
	for k, v := range offsetData {
		tempSample.Metrics[k] = v
	}
	
	// Get the local entity from integration
	var entity *integration.Entity
	if s.integration != nil {
		entity = s.integration.LocalEntity()
	}
	if entity == nil {
		// Fallback to temporary entity
		entity = &integration.Entity{}
	}
	
	// Process with existing method
	return s.ProcessConsumerOffsetSample(tempSample, entity)
}

func (s *ComprehensiveMSKShim) SetSystemSampleAPI(api InfrastructureAPI) {
	// Not implemented in comprehensive shim
}

func (s *ComprehensiveMSKShim) Flush() error {
	if !s.enabled {
		return nil
	}
	
	// Create cluster metrics if we have an integration
	if s.integration != nil {
		entity := s.integration.LocalEntity()
		if entity != nil {
			// Process cluster-level metrics
			if err := s.ProcessClusterMetrics(entity); err != nil {
				log.Error("Failed to process cluster metrics: %v", err)
			}
		}
	}
	
	// Reset aggregator for next collection cycle
	s.aggregator = NewMetricAggregator()
	
	return nil
}

// SetIntegration sets the integration instance for entity creation
func (s *ComprehensiveMSKShim) SetIntegration(i *integration.Integration) {
	s.integration = i
}