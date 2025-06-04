package msk

import (
	"fmt"
	"sync"
	"time"

	"github.com/IBM/sarama"
	"github.com/newrelic/infra-integrations-sdk/v3/log"
)

// AdminAPIHelper provides fallback mechanisms for metrics not available via JMX
type AdminAPIHelper struct {
	client      sarama.Client
	admin       sarama.ClusterAdmin
	configCache map[string]*TopicConfig
	mu          sync.RWMutex
}

// TopicConfig holds cached topic configuration
type TopicConfig struct {
	MinInSyncReplicas int
	RetentionMs       int64
	LastUpdated       time.Time
}

// NewAdminAPIHelper creates a new Admin API helper
func NewAdminAPIHelper(brokers []string, config *sarama.Config) (*AdminAPIHelper, error) {
	client, err := sarama.NewClient(brokers, config)
	if err != nil {
		return nil, fmt.Errorf("failed to create Kafka client: %w", err)
	}

	admin, err := sarama.NewClusterAdminFromClient(client)
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("failed to create admin client: %w", err)
	}

	return &AdminAPIHelper{
		client:      client,
		admin:       admin,
		configCache: make(map[string]*TopicConfig),
	}, nil
}

// GetMinISRForTopic retrieves min.insync.replicas for a topic
func (a *AdminAPIHelper) GetMinISRForTopic(topicName string) (int, error) {
	// Check cache first
	a.mu.RLock()
	if config, exists := a.configCache[topicName]; exists {
		if time.Since(config.LastUpdated) < 5*time.Minute {
			a.mu.RUnlock()
			return config.MinInSyncReplicas, nil
		}
	}
	a.mu.RUnlock()

	// Fetch from Kafka
	resource := sarama.ConfigResource{
		Type: sarama.TopicResource,
		Name: topicName,
	}

	configs, err := a.admin.DescribeConfig(resource)
	if err != nil {
		return 0, fmt.Errorf("failed to describe topic config: %w", err)
	}

	minISR := 1 // default
	for _, entry := range configs {
		if entry.Name == "min.insync.replicas" {
			fmt.Sscanf(entry.Value, "%d", &minISR)
			break
		}
	}

	// Update cache
	a.mu.Lock()
	if a.configCache[topicName] == nil {
		a.configCache[topicName] = &TopicConfig{}
	}
	a.configCache[topicName].MinInSyncReplicas = minISR
	a.configCache[topicName].LastUpdated = time.Now()
	a.mu.Unlock()

	log.Debug("Retrieved min.insync.replicas=%d for topic %s via Admin API", minISR, topicName)
	return minISR, nil
}

// GetTopicConfigs retrieves all topic configurations
func (a *AdminAPIHelper) GetTopicConfigs() (map[string]*TopicConfig, error) {
	topics, err := a.client.Topics()
	if err != nil {
		return nil, fmt.Errorf("failed to list topics: %w", err)
	}

	configs := make(map[string]*TopicConfig)
	for _, topic := range topics {
		minISR, err := a.GetMinISRForTopic(topic)
		if err != nil {
			log.Warn("Failed to get config for topic %s: %v", topic, err)
			continue
		}
		configs[topic] = &TopicConfig{
			MinInSyncReplicas: minISR,
			LastUpdated:       time.Now(),
		}
	}

	return configs, nil
}

// CalculateUnderMinISRPartitions calculates partitions below min ISR
func (a *AdminAPIHelper) CalculateUnderMinISRPartitions(metadata *sarama.MetadataResponse) (int, error) {
	underMinISR := 0

	for _, topic := range metadata.Topics {
		minISR, err := a.GetMinISRForTopic(topic.Name)
		if err != nil {
			log.Debug("Using default minISR=1 for topic %s: %v", topic.Name, err)
			minISR = 1
		}

		for _, partition := range topic.Partitions {
			if len(partition.Isr) < minISR {
				underMinISR++
			}
		}
	}

	return underMinISR, nil
}

// Close cleans up resources
func (a *AdminAPIHelper) Close() error {
	if a.admin != nil {
		a.admin.Close()
	}
	if a.client != nil {
		return a.client.Close()
	}
	return nil
}

// GetMessageConversionRate attempts to get message conversion metrics
// This is a placeholder as conversion metrics aren't directly available
func (a *AdminAPIHelper) GetMessageConversionRate(topicName string) (float64, error) {
	// Message conversion happens at the broker level during produce/fetch
	// when message format versions don't match
	// This would require custom broker metrics or log parsing
	
	// For now, return 0 as these aren't typically exposed
	return 0.0, nil
}

// EnhancedTopicMetrics provides additional topic metrics via Admin API
type EnhancedTopicMetrics struct {
	TopicName            string
	PartitionCount       int
	ReplicationFactor    int
	MinInSyncReplicas    int
	UnderReplicatedCount int
	OfflineCount         int
	LeaderCount          int
}

// GetEnhancedTopicMetrics retrieves comprehensive topic metrics
func (a *AdminAPIHelper) GetEnhancedTopicMetrics(topicName string) (*EnhancedTopicMetrics, error) {
	// Get controller broker
	controller, err := a.client.Controller()
	if err != nil {
		return nil, fmt.Errorf("failed to get controller: %w", err)
	}
	
	// Get metadata for a specific topic
	req := &sarama.MetadataRequest{
		Topics: []string{topicName},
	}
	metadata, err := controller.GetMetadata(req)
	if err != nil {
		return nil, fmt.Errorf("failed to get metadata: %w", err)
	}

	// Find the topic in the metadata
	var topic *sarama.TopicMetadata
	for _, t := range metadata.Topics {
		if t.Name == topicName {
			topic = t
			break
		}
	}
	if topic == nil {
		return nil, fmt.Errorf("topic %s not found", topicName)
	}

	minISR, _ := a.GetMinISRForTopic(topicName)

	metrics := &EnhancedTopicMetrics{
		TopicName:         topicName,
		PartitionCount:    len(topic.Partitions),
		MinInSyncReplicas: minISR,
	}

	// Calculate additional metrics
	for _, partition := range topic.Partitions {
		if partition.Leader == metadata.ControllerID {
			metrics.LeaderCount++
		}

		if len(partition.Isr) < len(partition.Replicas) {
			metrics.UnderReplicatedCount++
		}

		if partition.Leader < 0 {
			metrics.OfflineCount++
		}

		// Set replication factor from first partition
		if metrics.ReplicationFactor == 0 {
			metrics.ReplicationFactor = len(partition.Replicas)
		}
	}

	return metrics, nil
}