package msk

import (
	"testing"

	"github.com/newrelic/infra-integrations-sdk/v3/integration"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTransformer_BrokerMetrics(t *testing.T) {
	tests := []struct {
		name           string
		brokerData     map[string]interface{}
		expectedChecks func(t *testing.T, entity *integration.Entity)
	}{
		{
			name: "Complete broker metrics with all categories",
			brokerData: map[string]interface{}{
				"broker.id":                      "1",
				"broker.host":                    "broker1.example.com",
				"broker.bytesInPerSecond":        1000.0,
				"broker.bytesOutPerSecond":       500.0,
				"broker.messagesInPerSecond":     100.0,
				"broker.bytesRejectedPerSecond":  5.0,
				
				// V2 Controller metrics
				"broker.ActiveControllerCount":   1,
				"broker.GlobalPartitionCount":    100,
				
				// Latency metrics
				"broker.fetchConsumerLocalTimeMs":         10.5,
				"broker.fetchConsumerRequestQueueTimeMs":  2.3,
				"broker.fetchConsumerResponseSendTimeMs":  1.2,
				"broker.fetchConsumerTotalTimeMs":         14.0,
				"broker.produceLocalTimeMs":               8.5,
				"broker.produceRequestQueueTimeMs":        1.5,
				"broker.produceResponseSendTimeMs":        0.8,
				"broker.produceTotalTimeMs":               10.8,
				
				// Replication metrics
				"broker.underReplicatedPartitions":        2,
				"replication.isrShrinksPerSecond":         0.1,
				"replication.isrExpandsPerSecond":         0.2,
				"replication.leaderElectionPerSecond":     0.01,
				"replication.uncleanLeaderElectionPerSecond": 0.0,
				
				// Handler metrics
				"broker.requestHandlerAvgIdlePercent":     0.85, // As fraction
				"broker.networkProcessorAvgIdlePercent":   0.90, // As fraction
				
				// Throttling metrics
				"broker.produceThrottleTimeMs":            50.0,
				"broker.fetchThrottleTimeMs":              30.0,
				"broker.requestThrottleTimeMs":            10.0,
				
				// Resource metrics
				"broker.cpuUser":                  45.0,
				"broker.cpuSystem":                10.0,
				"broker.cpuIdle":                  45.0,
				"broker.memoryUsed":               75.0,
				"broker.memoryFree":               25.0,
				"broker.kafkaDataLogsDiskUsed":    65.0,
				"broker.kafkaAppLogsDiskUsed":     30.0,
				"broker.networkRxThroughput":      1000000.0,
				"broker.networkTxThroughput":      500000.0,
			},
			expectedChecks: func(t *testing.T, entity *integration.Entity) {
				metrics := entity.Metrics[0].Metrics
				
				// Check throughput metrics
				assert.Equal(t, 1000.0, metrics["provider.bytesInPerSec.Average"])
				assert.Equal(t, 500.0, metrics["provider.bytesOutPerSec.Average"])
				assert.Equal(t, 100.0, metrics["provider.messagesInPerSec.Average"])
				assert.Equal(t, 5.0, metrics["provider.bytesRejectedPerSec.Average"])
				
				// Check latency metrics
				assert.Equal(t, 10.5, metrics["provider.fetchConsumerLocalTimeMsMean.Average"])
				assert.Equal(t, 14.0, metrics["provider.fetchConsumerTotalTimeMsMean.Average"])
				assert.Equal(t, 10.8, metrics["provider.produceTotalTimeMsMean.Average"])
				
				// Check handler metrics (should be converted to percentage)
				assert.Equal(t, 85.0, metrics["provider.requestHandlerAvgIdlePercent.Average"])
				assert.Equal(t, 90.0, metrics["provider.networkProcessorAvgIdlePercent.Average"])
				
				// Check throttling metrics
				assert.Equal(t, 50.0, metrics["provider.produceThrottleTime.Average"])
				assert.Equal(t, 30.0, metrics["provider.fetchThrottleTime.Average"])
				
				// Check resource metrics
				assert.Equal(t, 45.0, metrics["provider.cpuUser.Average"])
				assert.Equal(t, 65.0, metrics["provider.kafkaDataLogsDiskUsed.Average"])
				assert.Equal(t, 30.0, metrics["provider.kafkaAppLogsDiskUsed.Average"])
				assert.Equal(t, 1000000.0, metrics["provider.networkRxThroughput.Average"])
			},
		},
		{
			name: "Broker with missing optional metrics",
			brokerData: map[string]interface{}{
				"broker.id":                   "2",
				"broker.host":                 "broker2.example.com",
				"broker.bytesInPerSecond":     2000.0,
				"broker.bytesOutPerSecond":    1000.0,
				"broker.messagesInPerSecond":  200.0,
				// bytesRejectedPerSecond missing - should default to 0
				// Latency metrics missing
				// Throttling metrics missing
			},
			expectedChecks: func(t *testing.T, entity *integration.Entity) {
				metrics := entity.Metrics[0].Metrics
				
				// Check that missing metrics have defaults
				assert.Equal(t, 0.0, metrics["provider.bytesRejectedPerSec.Average"])
				assert.Equal(t, 0.0, metrics["provider.fetchMessageConversionsPerSec.Average"])
				assert.Equal(t, 0.0, metrics["provider.produceMessageConversionsPerSec.Average"])
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create test integration
			i, err := integration.New("test", "1.0.0")
			require.NoError(t, err)

			// Create test config
			config := &Config{
				Enabled:      true,
				ClusterName:  "test-cluster",
				AWSAccountID: "123456789012",
				AWSRegion:    "us-east-1",
			}

			// Create shim
			shim, err := NewShim(i, config)
			require.NoError(t, err)

			// Transform metrics
			err = shim.TransformBrokerMetrics(tt.brokerData)
			assert.NoError(t, err)

			// Find broker entity
			require.Len(t, i.Entities, 1)
			entity := i.Entities[0]
			
			// Run custom checks
			tt.expectedChecks(t, entity)
		})
	}
}

func TestTransformer_ClusterAggregation(t *testing.T) {
	// Create test integration
	i, err := integration.New("test", "1.0.0")
	require.NoError(t, err)

	// Create test config
	config := &Config{
		Enabled:      true,
		ClusterName:  "test-cluster",
		AWSAccountID: "123456789012",
		AWSRegion:    "us-east-1",
	}

	// Create shim
	shim, err := NewShim(i, config)
	require.NoError(t, err)

	// Add multiple brokers with different under-replicated counts
	brokerData := []map[string]interface{}{
		{
			"broker.id":                       "1",
			"broker.underReplicatedPartitions": 5,
			"broker.partitionCount":           20,
			"broker.bytesInPerSecond":         1000.0,
			"broker.isController":             true,
			"cluster.offlinePartitionsCount":  2,
		},
		{
			"broker.id":                       "2",
			"broker.underReplicatedPartitions": 3, // Less than broker 1
			"broker.partitionCount":           30,
			"broker.bytesInPerSecond":         2000.0,
		},
		{
			"broker.id":                       "3",
			"broker.underReplicatedPartitions": 8, // Maximum
			"broker.partitionCount":           25,
			"broker.bytesInPerSecond":         1500.0,
		},
	}

	// Transform all broker metrics
	for _, data := range brokerData {
		err := shim.TransformBrokerMetrics(data)
		require.NoError(t, err)
	}

	// Create cluster entity
	err = shim.CreateClusterEntity()
	require.NoError(t, err)

	// Find cluster entity
	var clusterEntity *integration.Entity
	for _, entity := range i.Entities {
		if len(entity.Metrics) > 0 && entity.Metrics[0].Metrics["event_type"] == "AwsMskClusterSample" {
			clusterEntity = entity
			break
		}
	}

	require.NotNil(t, clusterEntity, "Cluster entity not found")

	metrics := clusterEntity.Metrics[0].Metrics

	// Verify aggregation methods
	assert.Equal(t, 1, metrics["provider.activeControllerCount.Sum"], "Should have 1 active controller")
	assert.Equal(t, 2, metrics["provider.offlinePartitionsCount.Sum"], "Should use controller's value")
	
	// CRITICAL: Verify max() aggregation for underReplicatedPartitions
	assert.Equal(t, 8, metrics["provider.underReplicatedPartitions.Sum"], 
		"Should use MAX (8) not sum for under-replicated partitions")
	
	// Verify sum aggregation for other metrics
	assert.Equal(t, 75, metrics["provider.globalPartitionCount"], "Should sum partitions: 20+30+25")
	assert.Equal(t, 4500.0, metrics["provider.bytesInPerSec.Sum"], "Should sum bytes: 1000+2000+1500")
}

func TestTransformer_TopicAggregation(t *testing.T) {
	// Create test integration
	i, err := integration.New("test", "1.0.0")
	require.NoError(t, err)

	// Create test config
	config := &Config{
		Enabled:      true,
		ClusterName:  "test-cluster",
		AWSAccountID: "123456789012",
		AWSRegion:    "us-east-1",
	}

	// Create shim
	shim, err := NewShim(i, config)
	require.NoError(t, err)

	// Simulate topic metrics from multiple brokers
	// First, add broker topic metrics to aggregator
	shim.GetAggregator().AddTopicMetric("test-topic", &TopicMetrics{
		Name:             "test-topic",
		BytesInPerSec:    1000.0,
		BytesOutPerSec:   500.0,
		MessagesInPerSec: 100.0,
	})
	
	// Add more metrics from another broker (simulating aggregation)
	shim.GetAggregator().AddTopicMetric("test-topic", &TopicMetrics{
		Name:             "test-topic",
		BytesInPerSec:    2000.0,
		BytesOutPerSec:   1000.0,
		MessagesInPerSec: 200.0,
	})

	// Transform topic metrics
	topicData := map[string]interface{}{
		"topic.name":               "test-topic",
		"topic.partitionCount":     10,
		"topic.replicationFactor":  3,
		"topic.minInSyncReplicas":  2,
	}
	
	err = shim.TransformTopicMetrics(topicData)
	require.NoError(t, err)

	// Find topic entity
	var topicEntity *integration.Entity
	for _, entity := range i.Entities {
		if len(entity.Metrics) > 0 && entity.Metrics[0].Metrics["event_type"] == "AwsMskTopicSample" {
			topicEntity = entity
			break
		}
	}

	require.NotNil(t, topicEntity, "Topic entity not found")

	metrics := topicEntity.Metrics[0].Metrics

	// Verify aggregated metrics (sum across brokers)
	assert.Equal(t, 3000.0, metrics["provider.bytesInPerSec.Average"], "Should sum: 1000+2000")
	assert.Equal(t, 1500.0, metrics["provider.bytesOutPerSec.Average"], "Should sum: 500+1000")
	assert.Equal(t, 300.0, metrics["provider.messagesInPerSec.Average"], "Should sum: 100+200")
	
	// Verify configuration metrics
	assert.Equal(t, 10, metrics["provider.partitionCount"])
	assert.Equal(t, 3, metrics["provider.replicationFactor"])
	assert.Equal(t, 2, metrics["provider.minInSyncReplicas"])
}

func TestSystemCorrelator_DiskFiltering(t *testing.T) {
	// Test disk mount regex filtering
	correlator := NewSystemSampleCorrelator(nil, "data|kafka", "logs|kafka-logs")

	metrics := &SystemMetrics{
		DiskUsedByMount: make(map[string]float64),
	}

	// Simulate disk metrics
	diskMetrics := []DiskMetrics{
		{MountPoint: "/", DiskUsedPercent: 50},
		{MountPoint: "/var/lib/kafka/data", DiskUsedPercent: 75},
		{MountPoint: "/var/log/kafka-logs", DiskUsedPercent: 30},
		{MountPoint: "/tmp", DiskUsedPercent: 10},
		{MountPoint: "/mnt/kafka-data", DiskUsedPercent: 80}, // Higher than first match
	}

	correlator.processDiskMetrics(metrics, diskMetrics)

	// Verify regex matching
	assert.Equal(t, 50.0, metrics.RootDiskUsed, "Root disk should be 50%")
	assert.Equal(t, 80.0, metrics.DataDiskUsed, "Should use highest matching data disk (80%)")
	assert.Equal(t, 30.0, metrics.LogDiskUsed, "Should match log disk (30%)")
}

func TestConsumerLagEnrichment(t *testing.T) {
	// Create test integration
	i, err := integration.New("test", "1.0.0")
	require.NoError(t, err)

	// Create test config with lag enrichment enabled
	config := &Config{
		Enabled:           true,
		ClusterName:       "test-cluster",
		AWSAccountID:      "123456789012",
		AWSRegion:         "us-east-1",
		ConsumerLagEnrich: true,
	}

	// Create shim
	shim, err := NewShim(i, config)
	require.NoError(t, err)

	// Add topic metrics for lag calculation
	shim.GetAggregator().AddTopicMetric("test-topic", &TopicMetrics{
		Name:             "test-topic",
		MessagesInPerSec: 1000.0, // 1000 messages/sec
	})

	// Process consumer offset data
	offsetData := map[string]interface{}{
		"topic":                       "test-topic",
		"consumerGroup":               "test-consumer-group",
		"consumer.lag":                int64(5000), // 5000 messages behind
		"consumerGroup.maxLag":        int64(5000),
		"consumerGroup.activeConsumers": 3,
	}

	err = shim.ProcessConsumerOffset(offsetData)
	require.NoError(t, err)

	// Find topic-consumer entity
	var consumerEntity *integration.Entity
	for _, entity := range i.Entities {
		if len(entity.Metrics) > 0 {
			metrics := entity.Metrics[0].Metrics
			if metrics["event_type"] == "AwsMskTopicSample" && 
			   metrics["provider.consumerGroup"] == "test-consumer-group" {
				consumerEntity = entity
				break
			}
		}
	}

	require.NotNil(t, consumerEntity, "Consumer lag entity not found")

	metrics := consumerEntity.Metrics[0].Metrics

	// Verify consumer lag metrics
	assert.Equal(t, int64(5000), metrics["provider.consumerLag"])
	assert.Equal(t, int64(5000), metrics["provider.maxLag"])
	assert.Equal(t, 3, metrics["provider.activeConsumers"])
	assert.Equal(t, 5.0, metrics["provider.consumerLagSeconds"], "5000 messages / 1000 msg/sec = 5 seconds")
	assert.Equal(t, "test-consumer-group", metrics["provider.consumerGroup"])
}