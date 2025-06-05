package msk

import (
	"fmt"
	"sync"

	"github.com/newrelic/infra-integrations-sdk/v3/integration"
	"github.com/newrelic/infra-integrations-sdk/v3/log"
)

// MSKShim is the consolidated MSK shim implementation
type MSKShim struct {
	config                 Config
	integration            *integration.Integration
	aggregator             *MetricAggregator
	entityCache            *EntityCache
	systemAPI              InfrastructureAPI
	dimensionalTransformer *DimensionalTransformer
	mu                     sync.Mutex
}

// EntityCache manages entities to avoid duplicates
type EntityCache struct {
	mu       sync.RWMutex
	entities map[string]*integration.Entity
}

// NewMSKShim creates a new consolidated MSK shim
func NewMSKShim(config Config) *MSKShim {
	shim := &MSKShim{
		config:     config,
		aggregator: NewMetricAggregator(),
		entityCache: &EntityCache{
			entities: make(map[string]*integration.Entity),
		},
	}
	
	log.Info("MSK shim initialized for cluster: %s in region: %s", 
		config.ClusterName, config.AWSRegion)
	
	return shim
}

// SetIntegration sets the integration instance
func (s *MSKShim) SetIntegration(i *integration.Integration) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.integration = i
	
	// Initialize dimensional transformer if integration is set
	if i != nil {
		s.dimensionalTransformer = NewDimensionalTransformer(i, &s.config)
	}
}

// IsEnabled returns whether the MSK shim is enabled
func (s *MSKShim) IsEnabled() bool {
	return s.config.Enabled
}

// TransformBrokerMetrics transforms broker metrics to MSK format
func (s *MSKShim) TransformBrokerMetrics(brokerData map[string]interface{}) error {
	brokerID, ok := getIntValue(brokerData, "broker.id")
	if !ok {
		return fmt.Errorf("broker ID not found in broker data")
	}
	
	log.Debug("Transforming broker metrics for broker %d", brokerID)
	
	// Use simple transformer
	return s.SimpleTransformBrokerMetrics(brokerData)
}

// TransformTopicMetrics transforms topic metrics to MSK format
func (s *MSKShim) TransformTopicMetrics(topicData map[string]interface{}) error {
	topicName, ok := getStringValue(topicData, "topic.name")
	if !ok {
		return fmt.Errorf("topic name not found in topic data")
	}
	
	log.Debug("Transforming topic metrics for topic %s", topicName)
	
	// Use simple transformer
	return s.SimpleTransformTopicMetrics(topicData)
}

// ProcessConsumerOffset processes consumer offset data with MSK enhancements
func (s *MSKShim) ProcessConsumerOffset(offsetData map[string]interface{}) error {
	log.Debug("Processing consumer offset data")
	
	// Use simple transformer
	return s.SimpleTransformConsumerOffset(offsetData)
}

// SetSystemSampleAPI sets the system sample API for enrichment
func (s *MSKShim) SetSystemSampleAPI(api InfrastructureAPI) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.systemAPI = api
}

// Stop stops the MSK shim and flushes any pending metrics
func (s *MSKShim) Stop() {
	if s.dimensionalTransformer != nil {
		s.dimensionalTransformer.Stop()
	}
}

// Flush performs final aggregations and creates cluster entity
func (s *MSKShim) Flush() error {
	if s.integration == nil {
		return fmt.Errorf("integration not set")
	}
	
	log.Info("Flushing MSK shim data for cluster: %s", s.config.ClusterName)
	
	// Create cluster entity with aggregated metrics
	if err := s.SimpleTransformClusterMetrics(); err != nil {
		log.Error("Failed to create cluster entity: %v", err)
		return err
	}
	
	// Flush dimensional metrics if enabled
	if s.dimensionalTransformer != nil {
		if err := s.dimensionalTransformer.Flush(); err != nil {
			log.Error("Failed to flush dimensional metrics: %v", err)
		}
	}
	
	// Log summary
	s.logSummary()
	
	return nil
}

// GetOrCreateEntity gets an existing entity or creates a new one
func (s *MSKShim) GetOrCreateEntity(entityType, eventType string) (*integration.Entity, error) {
	s.entityCache.mu.Lock()
	defer s.entityCache.mu.Unlock()
	
	entityKey := fmt.Sprintf("%s:%s", entityType, eventType)
	
	if entity, exists := s.entityCache.entities[entityKey]; exists {
		return entity, nil
	}
	
	// Create new entity
	entity, err := s.integration.Entity(entityKey, "aws-msk")
	if err != nil {
		return nil, fmt.Errorf("failed to create entity for %s: %v", entityKey, err)
	}
	
	s.entityCache.entities[entityKey] = entity
	return entity, nil
}

// logSummary logs a summary of the MSK shim activity
func (s *MSKShim) logSummary() {
	brokerCount := len(s.aggregator.GetBrokerMetrics())
	topicCount := s.aggregator.GetTopicCount()
	
	log.Info("MSK shim summary - Cluster: %s, Brokers: %d, Topics: %d",
		s.config.ClusterName, brokerCount, topicCount)
}

// Helper functions are defined in types.go