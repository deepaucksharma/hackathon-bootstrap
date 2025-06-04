package msk

import (
	"fmt"
	"sync"

	"github.com/newrelic/infra-integrations-sdk/v3/integration"
	"github.com/newrelic/infra-integrations-sdk/v3/log"
)

// Shim provides the enhanced MSK transformation functionality with full metric coverage
type Shim struct {
	integration      *integration.Integration
	config           *Config
	aggregator       *MetricAggregator
	entityCache      *EntityCache
	systemSampler    *SystemSampleCorrelator
	transformer      *SimpleTransformer
	lagEnricher      *SimpleConsumerLagEnricher
	mu               sync.Mutex
}

// NewShim creates a new enhanced MSK shim instance
func NewShim(i *integration.Integration, config *Config) (*Shim, error) {
	if config == nil {
		return nil, fmt.Errorf("config cannot be nil")
	}

	if !config.Enabled {
		return nil, fmt.Errorf("MSK shim is not enabled")
	}

	shim := &Shim{
		integration: i,
		config:      config,
		aggregator:  NewMetricAggregator(),
		entityCache: &EntityCache{
			entities: make(map[string]*integration.Entity),
		},
	}

	// Initialize system sample correlator with regex patterns
	shim.systemSampler = NewSystemSampleCorrelator(nil, config.DiskMountRegex, config.LogMountRegex)

	// Initialize simple transformer
	shim.transformer = NewSimpleTransformer(shim)

	// Initialize consumer lag enricher if enabled
	if config.ConsumerLagEnrich {
		shim.lagEnricher = NewSimpleConsumerLagEnricher(shim)
	}

	return shim, nil
}

// IsEnabled returns whether the MSK shim is enabled
func (s *Shim) IsEnabled() bool {
	return s.config != nil && s.config.Enabled
}

// TransformBrokerMetrics transforms broker metrics to MSK format with full V2 support
func (s *Shim) TransformBrokerMetrics(brokerData map[string]interface{}) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Enrich with system metrics if available
	if hostname, ok := getStringValue(brokerData, "broker.host"); ok && s.systemSampler != nil {
		if err := s.systemSampler.EnrichBrokerWithSystemMetrics(brokerData, hostname); err != nil {
			log.Debug("Failed to enrich broker with system metrics: %v", err)
		}
	}

	return s.transformer.TransformBrokerMetricsSimple(brokerData)
}

// TransformTopicMetrics transforms topic metrics to MSK format
func (s *Shim) TransformTopicMetrics(topicData map[string]interface{}) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.transformer.TransformTopicMetricsSimple(topicData)
}

// ProcessConsumerOffset processes consumer offset data for lag enrichment
func (s *Shim) ProcessConsumerOffset(offsetData map[string]interface{}) error {
	if s.lagEnricher == nil {
		return nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	return s.lagEnricher.ProcessConsumerOffsetSampleSimple(offsetData)
}

// CreateClusterEntity creates the cluster-level entity with aggregated metrics
func (s *Shim) CreateClusterEntity() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.transformer.CreateClusterEntitySimple()
}

// GetOrCreateEntity gets an entity from cache or creates a new one
func (s *Shim) GetOrCreateEntity(entityType, entityName string) (*integration.Entity, error) {
	s.entityCache.mu.RLock()
	cacheKey := fmt.Sprintf("%s-%s", entityType, entityName)
	if entity, exists := s.entityCache.entities[cacheKey]; exists {
		s.entityCache.mu.RUnlock()
		return entity, nil
	}
	s.entityCache.mu.RUnlock()

	// Create new entity
	s.entityCache.mu.Lock()
	defer s.entityCache.mu.Unlock()

	// Double-check after acquiring write lock
	if entity, exists := s.entityCache.entities[cacheKey]; exists {
		return entity, nil
	}

	entity, err := s.integration.Entity(entityName, entityType)
	if err != nil {
		return nil, fmt.Errorf("failed to create entity: %w", err)
	}

	s.entityCache.entities[cacheKey] = entity
	return entity, nil
}

// SetSystemSampleAPI sets the Infrastructure API for system metric correlation
func (s *Shim) SetSystemSampleAPI(api InfrastructureAPI) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.systemSampler != nil {
		s.systemSampler.infraAPI = api
	}
}

// Flush performs any final aggregations and creates cluster entity
func (s *Shim) Flush() error {
	if !s.IsEnabled() {
		return nil
	}

	log.Debug("Flushing MSK shim V2 metrics")

	// Create cluster entity with final aggregations
	if err := s.CreateClusterEntity(); err != nil {
		return fmt.Errorf("failed to create cluster entity: %w", err)
	}

	// Reset aggregator for next collection cycle
	s.aggregator.Reset()

	// Clear system correlator cache
	if s.systemSampler != nil {
		s.systemSampler.ClearCache()
	}

	return nil
}

// GetConfig returns the shim configuration
func (s *Shim) GetConfig() *Config {
	return s.config
}

// GetAggregator returns the metric aggregator
func (s *Shim) GetAggregator() *MetricAggregator {
	return s.aggregator
}