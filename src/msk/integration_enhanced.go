package msk

import (
	"os"
	
	"github.com/newrelic/infra-integrations-sdk/v3/integration"
	"github.com/newrelic/infra-integrations-sdk/v3/log"
	"github.com/newrelic/nri-kafka/src/connection"
)

// EnhancedIntegrationHook provides enhanced hooks with metric generation support
type EnhancedIntegrationHook struct {
	shim        interface{} // Can be *Shim or *EnhancedShim
	integration *integration.Integration
	mapper      *MetricMapper
	useEnhanced bool
}

// NewEnhancedIntegrationHook creates a new enhanced MSK integration hook
func NewEnhancedIntegrationHook(i *integration.Integration) *IntegrationHook {
	config := NewConfig()
	
	if !config.Enabled {
		log.Debug("MSK shim is disabled")
		return nil
	}

	// Check if enhanced mode is requested
	useEnhanced := os.Getenv("MSK_ENHANCED_MODE") == "true" || 
	              os.Getenv("MSK_GENERATE_METRICS") == "true"

	log.Info("Initializing MSK shim V2 with cluster: %s (enhanced: %v)", config.ClusterName, useEnhanced)

	var hook *IntegrationHook
	
	if useEnhanced {
		enhancedShim, err := NewEnhancedShim(i, config)
		if err != nil {
			log.Error("Failed to initialize enhanced MSK shim: %v", err)
			return nil
		}
		
		hook = &IntegrationHook{
			shim:        enhancedShim,
			integration: i,
			mapper:      NewMetricMapper(),
		}
	} else {
		regularShim, err := NewShim(i, config)
		if err != nil {
			log.Error("Failed to initialize MSK shim V2: %v", err)
			return nil
		}
		
		hook = &IntegrationHook{
			shim:        regularShim,
			integration: i,
			mapper:      NewMetricMapper(),
		}
	}

	// Set global hook for use in broker collection
	GlobalMSKHook = hook

	return hook
}

// TransformBrokerData transforms broker data with enhanced support
func (h *IntegrationHook) TransformBrokerDataEnhanced(broker *connection.Broker, data map[string]interface{}) error {
	if h == nil || h.shim == nil {
		return nil
	}

	// Add broker identification to data
	data["broker.id"] = broker.ID
	data["broker.host"] = broker.Host

	// Transform based on shim type
	switch shim := h.shim.(type) {
	case *EnhancedShim:
		return shim.TransformBrokerMetrics(data)
	case *Shim:
		return shim.TransformBrokerMetrics(data)
	default:
		return nil
	}
}

// FinalizeEnhanced performs final processing with enhanced support
func (h *IntegrationHook) FinalizeEnhanced() error {
	if h == nil || h.shim == nil {
		return nil
	}

	log.Debug("Finalizing MSK shim")
	
	switch shim := h.shim.(type) {
	case *EnhancedShim:
		return shim.Flush()
	case *Shim:
		return shim.Flush()
	default:
		return nil
	}
}

// IsEnabledEnhanced returns whether the hook is enabled
func (h *IntegrationHook) IsEnabledEnhanced() bool {
	if h == nil || h.shim == nil {
		return false
	}
	
	switch shim := h.shim.(type) {
	case *EnhancedShim:
		return shim.IsEnabled()
	case *Shim:
		return shim.IsEnabled()
	default:
		return false
	}
}