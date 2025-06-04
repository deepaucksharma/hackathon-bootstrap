package msk

import (
	"fmt"
	"os"
	"sync"

	"github.com/newrelic/infra-integrations-sdk/v3/integration"
	"github.com/newrelic/infra-integrations-sdk/v3/log"
)

// EnhancedShim provides MSK transformation with fallback metric generation
type EnhancedShim struct {
	integration      *integration.Integration
	config           *Config
	aggregator       *MetricAggregator
	entityCache      *EntityCache
	transformer      interface{} // Can be SimpleTransformer or EnhancedTransformer
	enhancedMode     bool
	lagEnricher      *SimpleConsumerLagEnricher
	mu               sync.Mutex
	metricsCollected int
}

// NewEnhancedShim creates a new enhanced MSK shim instance
func NewEnhancedShim(i *integration.Integration, config *Config) (*EnhancedShim, error) {
	if config == nil {
		return nil, fmt.Errorf("config cannot be nil")
	}

	if !config.Enabled {
		return nil, fmt.Errorf("MSK shim is not enabled")
	}

	shim := &EnhancedShim{
		integration: i,
		config:      config,
		aggregator:  NewMetricAggregator(),
		entityCache: &EntityCache{
			entities: make(map[string]*integration.Entity),
		},
		enhancedMode: os.Getenv("MSK_ENHANCED_MODE") == "true",
	}

	// Initialize transformer based on mode
	if shim.enhancedMode {
		log.Info("MSK shim running in ENHANCED mode with metric generation")
		shim.transformer = NewEnhancedTransformer(shim.ToShim())
	} else {
		shim.transformer = NewSimpleTransformer(shim.ToShim())
	}

	// Initialize consumer lag enricher if enabled
	if config.ConsumerLagEnrich {
		shim.lagEnricher = NewSimpleConsumerLagEnricher(shim.ToShim())
	}

	return shim, nil
}

// ToShim converts EnhancedShim to regular Shim for compatibility
func (s *EnhancedShim) ToShim() *Shim {
	return &Shim{
		integration: s.integration,
		config:      s.config,
		aggregator:  s.aggregator,
		entityCache: s.entityCache,
		transformer: nil, // Will be set separately
		lagEnricher: s.lagEnricher,
	}
}

// IsEnabled returns whether the MSK shim is enabled
func (s *EnhancedShim) IsEnabled() bool {
	return s.config != nil && s.config.Enabled
}

// TransformBrokerMetrics transforms broker metrics with auto-switching to enhanced mode
func (s *EnhancedShim) TransformBrokerMetrics(brokerData map[string]interface{}) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Check if we're getting real metrics
	hasRealMetrics := false
	criticalMetrics := []string{"broker.bytesInPerSecond", "broker.messagesInPerSecond", "broker.IOInPerSecond"}
	
	for _, metric := range criticalMetrics {
		if val, exists := brokerData[metric]; exists && val != nil && val != 0 {
			hasRealMetrics = true
			break
		}
	}

	// Auto-switch to enhanced mode if no real metrics after several attempts
	if !hasRealMetrics {
		s.metricsCollected++
		if s.metricsCollected > 5 && !s.enhancedMode {
			log.Warn("No real metrics detected after %d attempts, switching to enhanced mode", s.metricsCollected)
			s.enhancedMode = true
			s.transformer = NewEnhancedTransformer(s.ToShim())
		}
	}

	// Use appropriate transformer
	if s.enhancedMode {
		if enhanced, ok := s.transformer.(*EnhancedTransformer); ok {
			return enhanced.TransformBrokerMetricsEnhanced(brokerData)
		}
	}
	
	if simple, ok := s.transformer.(*SimpleTransformer); ok {
		return simple.TransformBrokerMetricsSimple(brokerData)
	}

	return fmt.Errorf("invalid transformer type")
}

// TransformTopicMetrics transforms topic metrics with enhanced mode support
func (s *EnhancedShim) TransformTopicMetrics(topicData map[string]interface{}) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.enhancedMode {
		if enhanced, ok := s.transformer.(*EnhancedTransformer); ok {
			return enhanced.TransformTopicMetricsEnhanced(topicData)
		}
	}
	
	if simple, ok := s.transformer.(*SimpleTransformer); ok {
		return simple.TransformTopicMetricsSimple(topicData)
	}

	return fmt.Errorf("invalid transformer type")
}

// ProcessConsumerOffset processes consumer offset data
func (s *EnhancedShim) ProcessConsumerOffset(offsetData map[string]interface{}) error {
	if s.lagEnricher == nil {
		return nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	return s.lagEnricher.ProcessConsumerOffsetSampleSimple(offsetData)
}

// CreateClusterEntity creates the cluster-level entity
func (s *EnhancedShim) CreateClusterEntity() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.enhancedMode {
		if enhanced, ok := s.transformer.(*EnhancedTransformer); ok {
			return enhanced.CreateClusterEntityEnhanced()
		}
	}
	
	if simple, ok := s.transformer.(*SimpleTransformer); ok {
		return simple.CreateClusterEntitySimple()
	}

	return fmt.Errorf("invalid transformer type")
}

// GetOrCreateEntity gets an entity from cache or creates a new one
func (s *EnhancedShim) GetOrCreateEntity(entityType, entityName string) (*integration.Entity, error) {
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

// SetSystemSampleAPI sets the Infrastructure API (not implemented in enhanced version)
func (s *EnhancedShim) SetSystemSampleAPI(api InfrastructureAPI) {
	// Not implemented in enhanced version
}

// Flush performs final aggregations and creates cluster entity
func (s *EnhancedShim) Flush() error {
	if !s.IsEnabled() {
		return nil
	}

	log.Debug("Flushing MSK enhanced shim metrics (enhanced mode: %v)", s.enhancedMode)

	// Create cluster entity with final aggregations
	if err := s.CreateClusterEntity(); err != nil {
		return fmt.Errorf("failed to create cluster entity: %w", err)
	}

	// Reset aggregator for next collection cycle
	s.aggregator.Reset()

	return nil
}

// GetConfig returns the shim configuration
func (s *EnhancedShim) GetConfig() *Config {
	return s.config
}

// GetAggregator returns the metric aggregator
func (s *EnhancedShim) GetAggregator() *MetricAggregator {
	return s.aggregator
}