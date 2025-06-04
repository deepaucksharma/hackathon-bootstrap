package msk

import (
	"github.com/newrelic/infra-integrations-sdk/v3/integration"
	"github.com/newrelic/infra-integrations-sdk/v3/log"
	"github.com/newrelic/nri-kafka/src/connection"
)

// GlobalMSKHook is a global instance of the MSK integration hook
var GlobalMSKHook *IntegrationHook

// IntegrationHook provides hooks into the nri-kafka integration flow
type IntegrationHook struct {
	shim        *MSKShim
	integration *integration.Integration
}

// NewIntegrationHook creates a new MSK integration hook (always returns active hook)
func NewIntegrationHook(i *integration.Integration) *IntegrationHook {
	return NewMSKHook(i)
}

// NewMSKHook creates a new MSK integration hook with consolidated shim
func NewMSKHook(i *integration.Integration) *IntegrationHook {
	config := NewConfig()
	
	if !config.Enabled {
		log.Debug("MSK shim is disabled")
		return nil
	}

	log.Info("Initializing MSK shim with cluster: %s", config.ClusterName)

	// Use consolidated MSK shim
	shim := NewMSKShim(*config)
	shim.SetIntegration(i)

	hook := &IntegrationHook{
		shim:        shim,
		integration: i,
	}

	// Set global hook for broker collection access
	GlobalMSKHook = hook

	return hook
}

// TransformBrokerData transforms broker metrics to MSK format
func (h *IntegrationHook) TransformBrokerData(broker interface{}, brokerData map[string]interface{}) error {
	if h.shim == nil || !h.shim.IsEnabled() {
		return nil
	}

	// Extract broker ID from broker interface
	if b, ok := broker.(*connection.Broker); ok {
		brokerData["broker.id"] = b.ID
	}

	// Use simple transformer for now
	return h.shim.SimpleTransformBrokerMetrics(brokerData)
}

// TransformTopicData transforms topic metrics to MSK format
func (h *IntegrationHook) TransformTopicData(topicName string, topicData map[string]interface{}) error {
	if h.shim == nil || !h.shim.IsEnabled() {
		return nil
	}

	// Add topic name to data for transformer
	topicData["topic.name"] = topicName

	return h.shim.TransformTopicMetrics(topicData)
}

// ProcessConsumerOffset processes consumer offset data
func (h *IntegrationHook) ProcessConsumerOffset(offsetData map[string]interface{}) error {
	if h.shim == nil || !h.shim.IsEnabled() {
		return nil
	}

	return h.shim.ProcessConsumerOffset(offsetData)
}

// Flush performs final aggregations and cleanup
func (h *IntegrationHook) Flush() error {
	if h.shim == nil || !h.shim.IsEnabled() {
		return nil
	}

	// Call shim's Flush method which creates cluster metrics
	return h.shim.Flush()
}

// IsEnabled returns whether the MSK hook is enabled
func (h *IntegrationHook) IsEnabled() bool {
	return h.shim != nil && h.shim.IsEnabled()
}