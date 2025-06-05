package msk

import (
	"encoding/base64"
	"fmt"
	"math"
	"strconv"
	"strings"
	
	"github.com/newrelic/infra-integrations-sdk/v3/log"
)


// InfrastructureAPI defines the interface for accessing infrastructure data
type InfrastructureAPI interface {
	GetSystemSample(hostname string) (map[string]interface{}, error)
}


// Helper variables
var base64StdEncoding = base64.StdEncoding

// Helper functions for extracting values from maps
func getStringValue(data map[string]interface{}, key string) (string, bool) {
	if val, ok := data[key]; ok {
		if str, ok := val.(string); ok {
			return str, true
		}
	}
	return "", false
}

// getStringValueWithDefault returns string value with a default
func getStringValueWithDefault(data map[string]interface{}, key string, defaultValue string) string {
	if val, ok := getStringValue(data, key); ok {
		return val
	}
	return defaultValue
}

func getIntValue(data map[string]interface{}, key string) (int, bool) {
	if val, ok := data[key]; ok {
		switch v := val.(type) {
		case int:
			return v, true
		case int32:
			return int(v), true
		case int64:
			return int(v), true
		case float64:
			return int(v), true
		case string:
			// Try to parse string to int
			var intVal int
			if _, err := fmt.Sscanf(v, "%d", &intVal); err == nil {
				return intVal, true
			}
		}
	}
	return 0, false
}

// Safe type conversion with logging as per spec
func getFloatValue(data map[string]interface{}, key string) (float64, bool) {
	if val, exists := data[key]; exists {
		switch v := val.(type) {
		case float64:
			return v, true
		case float32:
			return float64(v), true
		case int:
			return float64(v), true
		case int32:
			return float64(v), true
		case int64:
			return float64(v), true
		case string:
			if f, err := strconv.ParseFloat(v, 64); err == nil {
				return f, true
			}
			log.Warn("Failed to parse float from string: %s = %s", key, v)
		default:
			log.Warn("Unexpected type for %s: %T", key, v)
		}
	}
	return 0, false
}

// Overloaded version with default value
func getFloatValueWithDefault(data map[string]interface{}, key string, defaultValue float64) float64 {
	if val, ok := getFloatValue(data, key); ok {
		// Filter invalid float values
		if math.IsNaN(val) || math.IsInf(val, 0) {
			log.Warn("Invalid float value for %s: %f, using default", key, val)
			return defaultValue
		}
		return val
	}
	return defaultValue
}

func getIntValueWithDefault(data map[string]interface{}, key string, defaultValue int) int {
	if val, ok := getIntValue(data, key); ok {
		return val
	}
	return defaultValue
}

// validateMetricValue validates metric values - standalone helper
func validateMetricValue(value float64, metricName string) bool {
	// Check for NaN/Inf
	if math.IsNaN(value) || math.IsInf(value, 0) {
		log.Warn("Invalid float value for metric %s: %f", metricName, value)
		return false
	}
	
	// Check for negative values (most metrics should be non-negative)
	if value < 0 {
		log.Debug("Negative value for metric %s: %f", metricName, value)
		return false
	}
	
	// Metric-specific validations
	switch metricName {
	case "kafka.cluster.ActiveControllerCount":
		if value != 0 && value != 1 {
			log.Warn("Abnormal ActiveControllerCount: %f (expected 0 or 1)", value)
		}
	case "kafka.cluster.OfflinePartitionsCount":
		if value > 0 {
			log.Error("CRITICAL: %f offline partitions detected", value)
		}
	case "kafka.broker.BytesInPerSec", "kafka.broker.BytesOutPerSec":
		// Check for unreasonable throughput (> 10GB/sec)
		if value > 10*1024*1024*1024 {
			log.Warn("Unusually high throughput: %f bytes/sec", value)
		}
	case "kafka.broker.MessagesInPerSec":
		// Check for unreasonable message rate (> 10M msgs/sec)
		if value > 10000000 {
			log.Warn("Unusually high message rate: %f msgs/sec", value)
		}
	case "kafka.consumer.MaxLag", "kafka.consumer.TotalLag":
		// Very high lag (> 1M) should log warning
		if value > 1000000 {
			log.Warn("Very high consumer lag detected: %f", value)
		}
	}
	
	return true
}

// extractBrokerId extracts broker ID from various sources
func extractBrokerId(sample map[string]interface{}) string {
	// Try direct broker ID fields
	if id := getStringValueWithDefault(sample, "brokerId", ""); id != "" {
		return id
	}
	if id := getStringValueWithDefault(sample, "broker.id", ""); id != "" {
		return id
	}
	if id := getIntValueWithDefault(sample, "brokerId", -1); id >= 0 {
		return fmt.Sprintf("%d", id)
	}
	
	// Try provider.brokerId for AwsMsk samples
	if id, ok := getFloatValue(sample, "provider.brokerId"); ok && id >= 0 {
		return fmt.Sprintf("%.0f", id)
	}
	
	// Try entity name extraction
	if entityName := getStringValueWithDefault(sample, "entityName", ""); entityName != "" {
		// Look for patterns like "broker-1" or "kafka-broker-1"
		parts := strings.Split(entityName, "-")
		if len(parts) >= 2 && strings.Contains(entityName, "broker") {
			return parts[len(parts)-1]
		}
	}
	
	return "unknown"
}

// getMapValue extracts a map from a map (for nested objects)
func getMapValue(data map[string]interface{}, key string) map[string]interface{} {
	if val, ok := data[key]; ok {
		if m, ok := val.(map[string]interface{}); ok {
			return m
		}
	}
	return nil
}

// extractFloatFromMap extracts float from nested map structure
func extractFloatFromMap(data map[string]interface{}, key string, defaultValue float64) float64 {
	if data == nil {
		return defaultValue
	}
	return getFloatValueWithDefault(data, key, defaultValue)
}

// extractProviderMetric extracts metrics from provider.metricName.aggregation structure
func extractProviderMetric(sample map[string]interface{}, metricName string, aggregation string) float64 {
	// Try direct access first
	directKey := fmt.Sprintf("provider.%s.%s", metricName, aggregation)
	if value, ok := getFloatValue(sample, directKey); ok {
		return value
	}
	
	// Try nested access
	provider := getMapValue(sample, "provider")
	if provider != nil {
		metricMap := getMapValue(provider, metricName)
		if metricMap != nil {
			return extractFloatFromMap(metricMap, aggregation, -1)
		}
		// Try with aggregation suffix
		metricKey := fmt.Sprintf("%s.%s", metricName, aggregation)
		if value, ok := getFloatValue(provider, metricKey); ok {
			return value
		}
	}
	
	return -1
}


// groupByConsumerGroup groups samples by consumer group ID
func groupByConsumerGroup(samples []map[string]interface{}) map[string][]map[string]interface{} {
	grouped := make(map[string][]map[string]interface{})
	
	for _, sample := range samples {
		groupId := getStringValueWithDefault(sample, "consumerGroup", "")
		if groupId == "" {
			groupId = getStringValueWithDefault(sample, "consumer.group.id", "")
		}
		
		if groupId != "" {
			grouped[groupId] = append(grouped[groupId], sample)
		}
	}
	
	return grouped
}

// ConsumerGroupKey represents a unique consumer group identifier
type ConsumerGroupKey struct {
	ClusterName string
	GroupID     string
	Topic       string
}