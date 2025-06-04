package msk

import (
	"fmt"
	
	"github.com/newrelic/infra-integrations-sdk/v3/data/attribute"
	"github.com/newrelic/infra-integrations-sdk/v3/data/metric"
	"github.com/newrelic/infra-integrations-sdk/v3/log"
)

// SimpleConsumerLagEnricher enriches topic entities with consumer lag metrics
type SimpleConsumerLagEnricher struct {
	shim *Shim
}

// NewSimpleConsumerLagEnricher creates a new consumer lag enricher
func NewSimpleConsumerLagEnricher(shim *Shim) *SimpleConsumerLagEnricher {
	return &SimpleConsumerLagEnricher{shim: shim}
}

// ProcessConsumerOffsetSampleSimple processes consumer offset data
func (e *SimpleConsumerLagEnricher) ProcessConsumerOffsetSampleSimple(offsetData map[string]interface{}) error {
	// Extract consumer group and topic
	consumerGroup, ok := getStringValue(offsetData, "consumerGroup")
	if !ok {
		return fmt.Errorf("consumerGroup not found in offset data")
	}

	topicName, ok := getStringValue(offsetData, "topic")
	if !ok {
		return fmt.Errorf("topic not found in offset data")
	}

	// Extract lag value
	lag, ok := getIntValue(offsetData, "consumerLag")
	if !ok {
		log.Debug("consumerLag not found in offset data for topic %s", topicName)
		return nil
	}

	// Aggregate lag by topic
	e.shim.aggregator.AddConsumerLag(topicName, consumerGroup, float64(lag))

	// Create or get existing topic entity
	entityName := fmt.Sprintf("%s-topic-%s", e.shim.config.ClusterName, topicName)
	entity, err := e.shim.GetOrCreateEntity("AwsMskTopicSample", entityName)
	if err != nil {
		return fmt.Errorf("failed to create topic-consumer entity: %w", err)
	}

	// Generate the same GUID as the main topic entity
	guid := GenerateEntityGUID(EntityTypeTopic, e.shim.config.AWSAccountID,
		e.shim.config.ClusterName, topicName)

	// Create metric set with consumer lag information
	ms := entity.NewMetricSet("AwsMskTopicSample",
		attribute.Attribute{Key: "entity.guid", Value: guid},
		attribute.Attribute{Key: "entity.type", Value: string(EntityTypeTopic)},
		attribute.Attribute{Key: "entityName", Value: entityName},
		attribute.Attribute{Key: "Topic", Value: topicName},
		attribute.Attribute{Key: "ConsumerGroup", Value: consumerGroup},
		attribute.Attribute{Key: "provider.topic", Value: topicName},
		attribute.Attribute{Key: "provider.clusterName", Value: e.shim.config.ClusterName},
		attribute.Attribute{Key: "provider.accountId", Value: e.shim.config.AWSAccountID},
	)

	// Add consumer lag metric
	ms.SetMetric("aws.msk.topic.MaxOffsetLag", float64(lag), metric.GAUGE)

	return nil
}