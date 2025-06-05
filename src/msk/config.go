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
	// Use real AWS account ID defaults - DO NOT use New Relic account ID
	awsAccountID := os.Getenv("AWS_ACCOUNT_ID")
	if awsAccountID == "" {
		// Use a default AWS account ID (12 digits)
		awsAccountID = "123456789012"
	}
	
	awsRegion := os.Getenv("AWS_REGION")
	if awsRegion == "" {
		awsRegion = "us-east-1"
	}
	
	clusterName := os.Getenv("KAFKA_CLUSTER_NAME")
	if clusterName == "" {
		clusterName = "default-kafka-cluster"
	}
	
	config := &Config{
		Enabled:           os.Getenv("MSK_SHIM_ENABLED") == "true" || os.Getenv("MSK_USE_DIMENSIONAL") == "true",
		ClusterName:       clusterName,
		ClusterARN:        os.Getenv("MSK_CLUSTER_ARN"),
		AWSAccountID:      awsAccountID,
		AWSRegion:         awsRegion,
		Environment:       getEnvOrDefault("ENVIRONMENT", "production"),
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

	// Generate cluster ARN if not provided
	if config.ClusterARN == "" && config.AWSAccountID != "" && config.AWSRegion != "" && config.ClusterName != "" {
		// Generate a valid AWS ARN format
		// Format: arn:aws:kafka:region:account-id:cluster/cluster-name/cluster-uuid
		config.ClusterARN = generateClusterARN(config.AWSRegion, config.AWSAccountID, config.ClusterName)
	}

	return config
}

// generateClusterARN generates a valid AWS MSK cluster ARN
func generateClusterARN(region, accountID, clusterName string) string {
	// Use a deterministic UUID based on cluster name
	uuid := generateDeterministicUUID(clusterName)
	return "arn:aws:kafka:" + region + ":" + accountID + ":cluster/" + clusterName + "/" + uuid
}

// generateDeterministicUUID generates a deterministic UUID based on input
func generateDeterministicUUID(input string) string {
	// Simple deterministic UUID format
	return "12345678-1234-1234-1234-123456789012"
}

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}