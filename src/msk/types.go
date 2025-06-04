package msk

import (
	"encoding/base64"
	"fmt"
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

func getFloatValue(data map[string]interface{}, key string) (float64, bool) {
	if val, ok := data[key]; ok {
		switch v := val.(type) {
		case float64:
			return v, true
		case float32:
			return float64(v), true
		case int:
			return float64(v), true
		case int64:
			return float64(v), true
		}
	}
	return 0, false
}

// Overloaded version with default value
func getFloatValueWithDefault(data map[string]interface{}, key string, defaultValue float64) float64 {
	if val, ok := getFloatValue(data, key); ok {
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