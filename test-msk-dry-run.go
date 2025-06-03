package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"

	"github.com/newrelic/infra-integrations-sdk/v3/data/metric"
	"github.com/newrelic/infra-integrations-sdk/v3/integration"
	"github.com/newrelic/nri-kafka/src/msk"
)

func main() {
	fmt.Println("=== MSK Shim Dry Run Test ===")
	fmt.Println()

	// Set up environment
	os.Setenv("MSK_SHIM_ENABLED", "true")
	os.Setenv("AWS_ACCOUNT_ID", "123456789012")
	os.Setenv("AWS_REGION", "us-east-1")
	os.Setenv("KAFKA_CLUSTER_NAME", "test-kafka-cluster")
	os.Setenv("ENVIRONMENT", "test")

	// Create integration
	i, err := integration.New("com.newrelic.kafka", "1.0.0")
	if err != nil {
		log.Fatal("Failed to create integration:", err)
	}

	// Create MSK shim
	shim, err := msk.NewShim(i)
	if err != nil {
		log.Fatal("Failed to create MSK shim:", err)
	}

	fmt.Println("✓ MSK Shim initialized successfully")
	fmt.Printf("  Account ID: %s\n", shim.GetConfig().AWSAccountID)
	fmt.Printf("  Region: %s\n", shim.GetConfig().AWSRegion)
	fmt.Printf("  Cluster: %s\n", shim.GetConfig().ClusterName)
	fmt.Println()

	// Test 1: Transform broker metrics
	fmt.Println("Test 1: Transforming broker metrics...")
	brokerData := map[string]interface{}{
		"broker.id":                      "1",
		"broker.bytesInPerSecond":        1024.5,
		"broker.bytesOutPerSecond":       2048.7,
		"broker.messagesInPerSecond":     100.0,
		"broker.underReplicatedPartitions": 2,
		"broker.partitionCount":          50,
		"broker.isController":            true,
		"broker.cpuUser":                 45.5,
		"broker.memoryUsed":              78.2,
		"broker.kafkaDataLogsDiskUsed":   65.0,
		"broker.networkRxThroughput":     1500.0,
		"broker.networkTxThroughput":     2500.0,
		// Latency metrics
		"broker.fetchConsumerTotalTimeMs": 15.5,
		"broker.produceTotalTimeMs":       8.3,
		// Handler metrics
		"broker.requestHandlerAvgIdlePercent": 0.85, // Should be converted to 85%
	}

	err = shim.TransformBrokerMetrics(brokerData)
	if err != nil {
		log.Fatal("Failed to transform broker metrics:", err)
	}
	fmt.Println("✓ Broker metrics transformed successfully")

	// Test 2: Transform topic metrics
	fmt.Println("\nTest 2: Transforming topic metrics...")
	topicData := map[string]interface{}{
		"topic.name":               "test-topic",
		"topic.bytesInPerSecond":   512.3,
		"topic.bytesOutPerSecond":  768.9,
		"topic.messagesInPerSecond": 50.0,
		"topic.partitionCount":     10,
		"topic.replicationFactor":  3,
		"topic.minInSyncReplicas":  2,
	}

	err = shim.TransformTopicMetrics(topicData)
	if err != nil {
		log.Fatal("Failed to transform topic metrics:", err)
	}
	fmt.Println("✓ Topic metrics transformed successfully")

	// Test 3: Create cluster entity
	fmt.Println("\nTest 3: Creating cluster entity...")
	err = shim.CreateClusterEntity()
	if err != nil {
		log.Fatal("Failed to create cluster entity:", err)
	}
	fmt.Println("✓ Cluster entity created successfully")

	// Display results
	fmt.Println("\n=== Generated Entities ===")
	for _, entity := range i.Entities {
		fmt.Printf("\nEntity: %s (Type: %s)\n", entity.Metadata.Name, entity.Metadata.EventType)
		
		// Show key metrics
		if entity.Metadata.EventType == "AwsMskBrokerSample" {
			showBrokerMetrics(entity)
		} else if entity.Metadata.EventType == "AwsMskTopicSample" {
			showTopicMetrics(entity)
		} else if entity.Metadata.EventType == "AwsMskClusterSample" {
			showClusterMetrics(entity)
		}
	}

	// Test GUID generation
	fmt.Println("\n=== GUID Generation Test ===")
	clusterGUID := msk.GenerateEntityGUID(msk.EntityTypeCluster, "123456789012", "test-kafka-cluster", nil)
	fmt.Printf("Cluster GUID: %s\n", clusterGUID)
	
	brokerGUID := msk.GenerateEntityGUID(msk.EntityTypeBroker, "123456789012", "test-kafka-cluster", 1)
	fmt.Printf("Broker GUID: %s\n", brokerGUID)
	
	topicGUID := msk.GenerateEntityGUID(msk.EntityTypeTopic, "123456789012", "test-kafka-cluster", "test-topic")
	fmt.Printf("Topic GUID: %s\n", topicGUID)

	// Test aggregation
	fmt.Println("\n=== Aggregation Test ===")
	agg := shim.GetAggregator()
	clusterMetrics := agg.GetClusterMetrics()
	fmt.Printf("Active Controllers: %d (should be 1)\n", clusterMetrics.ActiveControllerCount)
	fmt.Printf("Under-replicated Partitions: %d (MAX aggregation)\n", clusterMetrics.UnderReplicatedPartitions)
	fmt.Printf("Total Partitions: %d\n", clusterMetrics.GlobalPartitionCount)
	fmt.Printf("Total Topics: %d\n", clusterMetrics.GlobalTopicCount)

	fmt.Println("\n✅ MSK Shim dry run completed successfully!")
}

func showBrokerMetrics(entity *metric.Set) {
	metrics := []string{
		"provider.bytesInPerSec.Average",
		"provider.bytesOutPerSec.Average",
		"provider.underReplicatedPartitions.Maximum",
		"provider.requestHandlerAvgIdlePercent.Average",
		"provider.cpuUser.Average",
		"provider.kafkaDataLogsDiskUsed.Average",
	}
	
	for _, m := range metrics {
		if val, ok := entity.Metrics[m]; ok {
			fmt.Printf("  %s: %v\n", m, val)
		}
	}
}

func showTopicMetrics(entity *metric.Set) {
	metrics := []string{
		"provider.bytesInPerSec.Average",
		"provider.bytesOutPerSec.Average",
		"provider.partitionCount",
		"provider.replicationFactor",
	}
	
	for _, m := range metrics {
		if val, ok := entity.Metrics[m]; ok {
			fmt.Printf("  %s: %v\n", m, val)
		}
	}
}

func showClusterMetrics(entity *metric.Set) {
	metrics := []string{
		"provider.activeControllerCount.Sum",
		"provider.underReplicatedPartitions.Sum",
		"provider.globalPartitionCount",
		"provider.globalTopicCount",
		"provider.bytesInPerSec.Sum",
	}
	
	for _, m := range metrics {
		if val, ok := entity.Metrics[m]; ok {
			fmt.Printf("  %s: %v\n", m, val)
		}
	}
}