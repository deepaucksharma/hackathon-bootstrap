package msk

import (
	"fmt"

	"github.com/newrelic/infra-integrations-sdk/v3/data/metric"
	"github.com/newrelic/infra-integrations-sdk/v3/log"
)

// ConsumerLagEnricher enriches topic entities with consumer lag information
type ConsumerLagEnricher struct {
	shim              *Shim
	consumerLagCache  map[string]*ConsumerGroupLag
}

// ConsumerGroupLag holds lag information for a consumer group
type ConsumerGroupLag struct {
	GroupID         string
	TopicName       string
	TotalLag        int64
	MaxLag          int64
	ActiveConsumers int
	PartitionLags   map[int32]int64
}

// NewConsumerLagEnricher creates a new consumer lag enricher
func NewConsumerLagEnricher(shim *Shim) *ConsumerLagEnricher {
	return &ConsumerLagEnricher{
		shim:             shim,
		consumerLagCache: make(map[string]*ConsumerGroupLag),
	}
}

// EnrichTopicWithConsumerLag adds consumer lag metrics to topic entities
func (e *ConsumerLagEnricher) EnrichTopicWithConsumerLag(topicName string, consumerOffsetData map[string]interface{}) error {
	if !e.shim.config.ConsumerLagEnrich {
		return nil
	}

	// Extract consumer group information
	groupID, ok := getStringValue(consumerOffsetData, "consumerGroup")
	if !ok {
		return fmt.Errorf("consumerGroup not found in offset data")
	}

	// Extract lag metrics
	totalLag := getInt64Value(consumerOffsetData, "consumer.lag", 0)
	maxLag := getInt64Value(consumerOffsetData, "consumerGroup.maxLag", 0)
	activeConsumers := getIntValue(consumerOffsetData, "consumerGroup.activeConsumers", 0)

	// Cache the lag data
	cacheKey := fmt.Sprintf("%s:%s", topicName, groupID)
	e.consumerLagCache[cacheKey] = &ConsumerGroupLag{
		GroupID:         groupID,
		TopicName:       topicName,
		TotalLag:        totalLag,
		MaxLag:          maxLag,
		ActiveConsumers: activeConsumers,
	}

	// Create an additional AwsMskTopicSample entity with consumer group information
	entityName := fmt.Sprintf("%s/%s", e.shim.config.ClusterName, topicName)
	entity, err := e.shim.GetOrCreateEntity("topic-consumer", "AwsMskTopicSample")
	if err != nil {
		return fmt.Errorf("failed to create topic-consumer entity: %w", err)
	}

	// Generate the same GUID as the main topic entity
	guid := GenerateEntityGUID(EntityTypeTopic, e.shim.config.AWSAccountID,
		e.shim.config.ClusterName, topicName)

	// Set all the same identification attributes
	entity.SetMetric("entity.guid", guid, metric.ATTRIBUTE)
	entity.SetMetric("entity.type", string(EntityTypeTopic), metric.ATTRIBUTE)
	entity.SetMetric("entityName", entityName, metric.ATTRIBUTE)
	entity.SetMetric("entityGuid", guid, metric.ATTRIBUTE)
	entity.SetMetric("guid", guid, metric.ATTRIBUTE)
	entity.SetMetric("Name", entityName, metric.ATTRIBUTE)
	entity.SetMetric("Topic", topicName, metric.ATTRIBUTE)

	// Provider namespace
	entity.SetMetric("provider.topic", topicName, metric.ATTRIBUTE)
	entity.SetMetric("provider.clusterName", e.shim.config.ClusterName, metric.ATTRIBUTE)
	entity.SetMetric("provider.accountId", e.shim.config.AWSAccountID, metric.ATTRIBUTE)
	entity.SetMetric("provider.awsRegion", e.shim.config.AWSRegion, metric.ATTRIBUTE)

	// Consumer group specific attributes
	entity.SetMetric("provider.consumerGroup", groupID, metric.ATTRIBUTE)
	entity.SetMetric("provider.consumerLag", totalLag, metric.GAUGE)
	entity.SetMetric("provider.maxLag", maxLag, metric.GAUGE)
	entity.SetMetric("provider.activeConsumers", activeConsumers, metric.GAUGE)

	// Calculate lag in seconds if we have messages per second rate
	messagesPerSec := e.getTopicMessagesPerSecond(topicName)
	if messagesPerSec > 0 {
		lagSeconds := float64(totalLag) / messagesPerSec
		entity.SetMetric("provider.consumerLagSeconds", lagSeconds, metric.GAUGE)
	}

	// AWS compatibility attributes
	entity.SetMetric("aws.kafka.Topic", topicName, metric.ATTRIBUTE)
	entity.SetMetric("aws.kafka.ClusterName", e.shim.config.ClusterName, metric.ATTRIBUTE)
	entity.SetMetric("aws.kafka.ConsumerGroup", groupID, metric.ATTRIBUTE)
	entity.SetMetric("aws.msk.topic", topicName, metric.ATTRIBUTE)
	entity.SetMetric("aws.msk.clusterName", e.shim.config.ClusterName, metric.ATTRIBUTE)
	entity.SetMetric("aws.msk.consumerGroup", groupID, metric.ATTRIBUTE)

	// Tags
	entity.SetMetric("tags.accountId", e.shim.config.AWSAccountID, metric.ATTRIBUTE)
	entity.SetMetric("tags.provider", "AWS", metric.ATTRIBUTE)
	entity.SetMetric("tags.messageQueueType", "Kafka", metric.ATTRIBUTE)
	entity.SetMetric("tags.consumerGroup", groupID, metric.ATTRIBUTE)

	if e.shim.config.Environment != "" {
		entity.SetMetric("tags.environment", e.shim.config.Environment, metric.ATTRIBUTE)
	}

	log.Debug("Enriched topic %s with consumer group %s lag: %d", topicName, groupID, totalLag)

	return nil
}

// ProcessConsumerOffsetSample processes a KafkaOffsetSample and enriches topic entities
func (e *ConsumerLagEnricher) ProcessConsumerOffsetSample(offsetData map[string]interface{}) error {
	topicName, ok := getStringValue(offsetData, "topic")
	if !ok {
		return fmt.Errorf("topic not found in offset data")
	}

	return e.EnrichTopicWithConsumerLag(topicName, offsetData)
}

// GetConsumerGroupsForTopic returns all consumer groups consuming from a topic
func (e *ConsumerLagEnricher) GetConsumerGroupsForTopic(topicName string) []*ConsumerGroupLag {
	var groups []*ConsumerGroupLag
	
	for key, lag := range e.consumerLagCache {
		if lag.TopicName == topicName {
			groups = append(groups, lag)
		}
	}
	
	return groups
}

// getTopicMessagesPerSecond retrieves the messages per second rate for a topic
func (e *ConsumerLagEnricher) getTopicMessagesPerSecond(topicName string) float64 {
	topicMetrics := e.shim.aggregator.GetTopicMetrics(topicName)
	if topicMetrics != nil {
		return topicMetrics.MessagesInPerSec
	}
	return 0
}

// getInt64Value safely retrieves an int64 value from a map
func getInt64Value(data map[string]interface{}, key string, defaultValue int64) int64 {
	if val, exists := data[key]; exists {
		switch v := val.(type) {
		case int64:
			return v
		case int:
			return int64(v)
		case float64:
			return int64(v)
		case string:
			var i int64
			fmt.Sscanf(v, "%d", &i)
			return i
		}
	}
	return defaultValue
}