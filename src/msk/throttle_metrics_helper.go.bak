package msk

import (
	"fmt"
	"github.com/newrelic/infra-integrations-sdk/v3/log"
)

// ThrottleMetricsHelper handles version-specific throttle metric collection
type ThrottleMetricsHelper struct {
	kafkaVersion string
}

// NewThrottleMetricsHelper creates a new throttle metrics helper
func NewThrottleMetricsHelper(kafkaVersion string) *ThrottleMetricsHelper {
	return &ThrottleMetricsHelper{
		kafkaVersion: kafkaVersion,
	}
}

// GetThrottleMetricBeans returns the appropriate JMX beans for throttle metrics based on Kafka version
func (t *ThrottleMetricsHelper) GetThrottleMetricBeans() []string {
	beans := []string{}

	// Kafka 2.4+ uses RequestHandlerPool
	beans = append(beans, 
		"kafka.server:type=KafkaRequestHandlerPool,name=ProduceThrottleTimeMs",
		"kafka.server:type=KafkaRequestHandlerPool,name=FetchThrottleTimeMs",
		"kafka.server:type=KafkaRequestHandlerPool,name=RequestThrottleTimeMs",
	)

	// Kafka < 2.4 uses BrokerTopicMetrics
	beans = append(beans,
		"kafka.server:type=BrokerTopicMetrics,name=ProduceThrottleTimeMs",
		"kafka.server:type=BrokerTopicMetrics,name=FetchThrottleTimeMs",
		"kafka.server:type=BrokerTopicMetrics,name=RequestThrottleTimeMs",
	)

	// Also check request-specific metrics
	beans = append(beans,
		"kafka.network:type=RequestMetrics,name=ThrottleTimeMs,request=Produce",
		"kafka.network:type=RequestMetrics,name=ThrottleTimeMs,request=FetchConsumer",
		"kafka.network:type=RequestMetrics,name=ThrottleTimeMs,request=FetchFollower",
	)

	return beans
}

// ExtractThrottleMetrics attempts to extract throttle metrics from various sources
func (t *ThrottleMetricsHelper) ExtractThrottleMetrics(brokerData map[string]interface{}) map[string]float64 {
	metrics := map[string]float64{
		"produceThrottle": -1,
		"fetchThrottle":   -1,
		"requestThrottle": -1,
	}

	// Try multiple metric sources for produce throttle
	produceKeys := []string{
		"broker.produceThrottleTimeMs",
		"broker.produceThrottleTime",
		"broker.ProduceThrottleTimeMs",
		"broker.throttleTimeMs.Produce",
		"broker.RequestMetrics.ThrottleTimeMs.Produce.mean",
	}

	for _, key := range produceKeys {
		if val := getFloatValue(brokerData, key, -1); val >= 0 {
			metrics["produceThrottle"] = val
			log.Debug("Found produce throttle metric at %s: %f", key, val)
			break
		}
	}

	// Try multiple metric sources for fetch throttle
	fetchKeys := []string{
		"broker.fetchThrottleTimeMs",
		"broker.fetchThrottleTime",
		"broker.FetchThrottleTimeMs",
		"broker.throttleTimeMs.FetchConsumer",
		"broker.RequestMetrics.ThrottleTimeMs.FetchConsumer.mean",
	}

	for _, key := range fetchKeys {
		if val := getFloatValue(brokerData, key, -1); val >= 0 {
			metrics["fetchThrottle"] = val
			log.Debug("Found fetch throttle metric at %s: %f", key, val)
			break
		}
	}

	// Try multiple metric sources for request throttle
	requestKeys := []string{
		"broker.requestThrottleTimeMs",
		"broker.requestThrottleTime",
		"broker.RequestThrottleTimeMs",
		"broker.throttleTimeMs.Request",
	}

	for _, key := range requestKeys {
		if val := getFloatValue(brokerData, key, -1); val >= 0 {
			metrics["requestThrottle"] = val
			log.Debug("Found request throttle metric at %s: %f", key, val)
			break
		}
	}

	// If still not found, check for generic throttle time
	if metrics["produceThrottle"] < 0 && metrics["fetchThrottle"] < 0 {
		if val := getFloatValue(brokerData, "broker.throttleTimeMs", -1); val >= 0 {
			// Use generic throttle time for both if specific ones not found
			metrics["produceThrottle"] = val
			metrics["fetchThrottle"] = val
			log.Debug("Using generic throttle time for produce/fetch: %f", val)
		}
	}

	return metrics
}

// GetThrottleMetricJMXQueries returns JMX queries for throttle metrics
func (t *ThrottleMetricsHelper) GetThrottleMetricJMXQueries() []map[string]string {
	queries := []map[string]string{
		// Kafka 2.4+ format
		{
			"object_name": "kafka.server:type=KafkaRequestHandlerPool,name=*ThrottleTimeMs",
			"attributes":  "Mean,Count",
		},
		// Kafka < 2.4 format
		{
			"object_name": "kafka.server:type=BrokerTopicMetrics,name=*ThrottleTimeMs",
			"attributes":  "Mean,Count",
		},
		// Request-specific metrics
		{
			"object_name": "kafka.network:type=RequestMetrics,name=ThrottleTimeMs,request=*",
			"attributes":  "Mean,50thPercentile,99thPercentile",
		},
	}

	return queries
}

// NormalizeThrottleMetricValue ensures throttle metric values are in milliseconds
func (t *ThrottleMetricsHelper) NormalizeThrottleMetricValue(value float64, metricName string) float64 {
	// Some versions report in microseconds, normalize to milliseconds
	if value > 1000000 {
		log.Debug("Normalizing throttle metric %s from microseconds to milliseconds: %f -> %f", 
			metricName, value, value/1000)
		return value / 1000
	}
	return value
}

// GetVersionSpecificThrottleConfig returns version-specific configuration for throttle metrics
func (t *ThrottleMetricsHelper) GetVersionSpecificThrottleConfig() map[string]interface{} {
	config := map[string]interface{}{
		"useRequestHandlerPool": true,
		"useBrokerTopicMetrics": true,
		"useRequestMetrics":     true,
	}

	// Adjust based on Kafka version if known
	if t.kafkaVersion != "" {
		// Version-specific adjustments can be added here
		// For now, we'll try all sources
	}

	return config
}