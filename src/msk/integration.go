package msk

import (
	"strings"
	
	"github.com/newrelic/infra-integrations-sdk/v3/integration"
	"github.com/newrelic/infra-integrations-sdk/v3/log"
	"github.com/newrelic/nri-kafka/src/connection"
)

// GlobalMSKHook is a global instance of the MSK integration hook
var GlobalMSKHook *IntegrationHook

// IntegrationHook provides enhanced hooks into the nri-kafka integration flow
type IntegrationHook struct {
	shim        *Shim
	integration *integration.Integration
	mapper      *MetricMapper
}

// NewIntegrationHook creates a new enhanced MSK integration hook
func NewIntegrationHook(i *integration.Integration) *IntegrationHook {
	config := NewConfig()
	
	if !config.Enabled {
		log.Debug("MSK shim is disabled")
		return nil
	}

	log.Info("Initializing MSK shim V2 with cluster: %s", config.ClusterName)

	shim, err := NewShim(i, config)
	if err != nil {
		log.Error("Failed to initialize MSK shim V2: %v", err)
		return nil
	}

	hook := &IntegrationHook{
		shim:        shim,
		integration: i,
		mapper:      NewMetricMapper(),
	}

	// Set global hook for use in broker collection
	GlobalMSKHook = hook

	return hook
}

// TransformBrokerData transforms broker data after collection with V2 support
func (h *IntegrationHook) TransformBrokerData(broker *connection.Broker, data map[string]interface{}) error {
	if h == nil || h.shim == nil {
		return nil
	}

	// Add broker identification to data
	data["broker.id"] = broker.ID
	data["broker.host"] = broker.Host

	// Transform to MSK format
	return h.shim.TransformBrokerMetrics(data)
}

// TransformTopicData transforms topic data after collection
func (h *IntegrationHook) TransformTopicData(topicName string, data map[string]interface{}) error {
	if h == nil || h.shim == nil {
		return nil
	}

	// Add topic identification to data
	data["topic.name"] = topicName

	// Transform to MSK format
	return h.shim.TransformTopicMetrics(data)
}

// ProcessConsumerOffset processes consumer offset data for lag enrichment
func (h *IntegrationHook) ProcessConsumerOffset(offsetData map[string]interface{}) error {
	if h == nil || h.shim == nil {
		return nil
	}

	return h.shim.ProcessConsumerOffset(offsetData)
}

// EnrichBrokerWithRequestMetrics adds RequestMetrics data to broker metrics
func (h *IntegrationHook) EnrichBrokerWithRequestMetrics(brokerData map[string]interface{}, requestMetrics map[string]interface{}) {
	if h == nil || h.mapper == nil {
		return
	}

	// Map FetchConsumer metrics
	fetchMetrics := []string{"LocalTimeMs", "RequestQueueTimeMs", "ResponseSendTimeMs", "TotalTimeMs"}
	for _, metric := range fetchMetrics {
		key := "FetchConsumer." + metric + ".Mean"
		if value, exists := requestMetrics[key]; exists {
			brokerData["broker.fetchConsumer"+metric] = value
		}
	}

	// Map Produce metrics
	for _, metric := range fetchMetrics {
		key := "Produce." + metric + ".Mean"
		if value, exists := requestMetrics[key]; exists {
			brokerData["broker.produce"+metric] = value
		}
	}
}

// EnrichBrokerWithSystemMetrics adds system metrics to broker data
func (h *IntegrationHook) EnrichBrokerWithSystemMetrics(broker *connection.Broker) error {
	if h == nil || h.shim == nil {
		return nil
	}

	// The V2 shim handles this internally during transformation
	// This method exists for compatibility
	return nil
}

// SetInfrastructureAPI sets the Infrastructure API for system correlation
func (h *IntegrationHook) SetInfrastructureAPI(api InfrastructureAPI) {
	if h != nil && h.shim != nil {
		h.shim.SetSystemSampleAPI(api)
	}
}

// Finalize performs final processing and creates cluster entity
func (h *IntegrationHook) Finalize() error {
	if h == nil || h.shim == nil {
		return nil
	}

	log.Debug("Finalizing MSK shim V2")
	return h.shim.Flush()
}

// IsEnabled returns whether the MSK hook is enabled
func (h *IntegrationHook) IsEnabled() bool {
	return h != nil && h.shim != nil && h.shim.IsEnabled()
}

// GetRequiredJMXBeans returns the list of JMX beans required for MSK compatibility
func (h *IntegrationHook) GetRequiredJMXBeans() []string {
	return []string{
		// Broker metrics
		"kafka.server:type=BrokerTopicMetrics,name=BytesInPerSec",
		"kafka.server:type=BrokerTopicMetrics,name=BytesOutPerSec",
		"kafka.server:type=BrokerTopicMetrics,name=MessagesInPerSec",
		"kafka.server:type=BrokerTopicMetrics,name=BytesRejectedPerSec",
		
		// Controller metrics
		"kafka.controller:type=KafkaController,name=ActiveControllerCount",
		"kafka.controller:type=KafkaController,name=GlobalPartitionCount",
		"kafka.controller:type=KafkaController,name=OfflinePartitionsCount",
		
		// Replication metrics
		"kafka.server:type=ReplicaManager,name=UnderReplicatedPartitions",
		"kafka.server:type=ReplicaManager,name=IsrShrinksPerSec",
		"kafka.server:type=ReplicaManager,name=IsrExpandsPerSec",
		"kafka.controller:type=ControllerStats,name=LeaderElectionRateAndTimeMs",
		"kafka.controller:type=ControllerStats,name=UncleanLeaderElectionsPerSec",
		
		// Request metrics - FetchConsumer
		"kafka.network:type=RequestMetrics,name=LocalTimeMs,request=FetchConsumer",
		"kafka.network:type=RequestMetrics,name=RequestQueueTimeMs,request=FetchConsumer",
		"kafka.network:type=RequestMetrics,name=ResponseSendTimeMs,request=FetchConsumer",
		"kafka.network:type=RequestMetrics,name=TotalTimeMs,request=FetchConsumer",
		
		// Request metrics - Produce
		"kafka.network:type=RequestMetrics,name=LocalTimeMs,request=Produce",
		"kafka.network:type=RequestMetrics,name=RequestQueueTimeMs,request=Produce",
		"kafka.network:type=RequestMetrics,name=ResponseSendTimeMs,request=Produce",
		"kafka.network:type=RequestMetrics,name=TotalTimeMs,request=Produce",
		
		// Handler metrics
		"kafka.server:type=KafkaRequestHandlerPool,name=RequestHandlerAvgIdlePercent",
		"kafka.network:type=SocketServer,name=NetworkProcessorAvgIdlePercent",
		
		// Throttling metrics
		"kafka.server:type=BrokerTopicMetrics,name=ProduceThrottleTimeMs",
		"kafka.server:type=KafkaRequestHandlerPool,name=ProduceThrottleTimeMs",
		"kafka.server:type=KafkaRequestHandlerPool,name=FetchThrottleTimeMs",
		"kafka.server:type=KafkaRequestHandlerPool,name=RequestThrottleTimeMs",
		
		// Topic metrics
		"kafka.server:type=BrokerTopicMetrics,name=BytesInPerSec,topic=*",
		"kafka.server:type=BrokerTopicMetrics,name=BytesOutPerSec,topic=*",
		"kafka.server:type=BrokerTopicMetrics,name=MessagesInPerSec,topic=*",
		"kafka.server:type=BrokerTopicMetrics,name=BytesRejectedPerSec,topic=*",
	}
}

// ValidateJMXConfiguration checks if required beans are configured
func (h *IntegrationHook) ValidateJMXConfiguration(availableBeans []string) []string {
	if h == nil {
		return nil
	}

	requiredBeans := h.GetRequiredJMXBeans()
	missingBeans := []string{}

	beanMap := make(map[string]bool)
	for _, bean := range availableBeans {
		beanMap[bean] = true
	}

	for _, required := range requiredBeans {
		found := false
		for available := range beanMap {
			if matchesPattern(required, available) {
				found = true
				break
			}
		}
		if !found {
			missingBeans = append(missingBeans, required)
		}
	}

	if len(missingBeans) > 0 {
		log.Warn("Missing JMX beans for full MSK compatibility: %v", missingBeans)
	}

	return missingBeans
}

// matchesPattern checks if a JMX bean pattern matches
func matchesPattern(pattern, bean string) bool {
	// Simple pattern matching for wildcards
	if pattern == bean {
		return true
	}
	
	// Handle topic=* wildcard
	if strings.Contains(pattern, "topic=*") {
		basePattern := strings.Replace(pattern, ",topic=*", "", 1)
		return strings.HasPrefix(bean, basePattern) && strings.Contains(bean, "topic=")
	}
	
	return false
}