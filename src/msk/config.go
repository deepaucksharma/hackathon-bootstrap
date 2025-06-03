package msk

import (
	"os"
	"strconv"
	"time"
)

// Config holds the configuration for the MSK shim
type Config struct {
	Enabled           bool
	ClusterName       string
	ClusterARN        string
	AWSAccountID      string
	AWSRegion         string
	Environment       string
	DiskMountRegex    string
	LogMountRegex     string
	ConsumerLagEnrich bool
	BatchSize         int
	FlushInterval     time.Duration
	AggregationMethod string
}

// NewConfig creates a new MSK configuration from environment variables
func NewConfig() *Config {
	config := &Config{
		Enabled:           os.Getenv("MSK_SHIM_ENABLED") == "true",
		ClusterName:       os.Getenv("KAFKA_CLUSTER_NAME"),
		ClusterARN:        os.Getenv("MSK_CLUSTER_ARN"),
		AWSAccountID:      os.Getenv("AWS_ACCOUNT_ID"),
		AWSRegion:         os.Getenv("AWS_REGION"),
		Environment:       os.Getenv("ENVIRONMENT"),
		DiskMountRegex:    getEnvOrDefault("DISK_MOUNT_REGEX", "data|kafka|log"),
		LogMountRegex:     getEnvOrDefault("LOG_MOUNT_REGEX", "logs|kafka-logs"),
		ConsumerLagEnrich: os.Getenv("CONSUMER_LAG_ENRICHMENT") == "true",
		AggregationMethod: getEnvOrDefault("MSK_AGGREGATION_METHOD", "max"),
	}

	// Parse batch size
	batchSize, err := strconv.Atoi(getEnvOrDefault("MSK_BATCH_SIZE", "1000"))
	if err != nil {
		batchSize = 1000
	}
	config.BatchSize = batchSize

	// Parse flush interval
	flushInterval, err := time.ParseDuration(getEnvOrDefault("MSK_FLUSH_INTERVAL", "5s"))
	if err != nil {
		flushInterval = 5 * time.Second
	}
	config.FlushInterval = flushInterval

	return config
}

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}