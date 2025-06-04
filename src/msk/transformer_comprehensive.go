package msk

import (
	"fmt"

	"github.com/newrelic/infra-integrations-sdk/v3/data/metric"
	"github.com/newrelic/infra-integrations-sdk/v3/log"
)

// ComprehensiveTransformer implements correct metric mappings for AWS MSK
type ComprehensiveTransformer struct {
	clusterName      string
	brokerMappings   map[string]string
	topicMappings    map[string]string
	clusterMappings  map[string]string
}

// NewComprehensiveTransformer creates a transformer with correct metric mappings
func NewComprehensiveTransformer(clusterName string) *ComprehensiveTransformer {
	return &ComprehensiveTransformer{
		clusterName:     clusterName,
		brokerMappings:  getBrokerMetricMappings(),
		topicMappings:   getTopicMetricMappings(),
		clusterMappings: getClusterMetricMappings(),
	}
}

// getBrokerMetricMappings returns the correct broker metric mappings
func getBrokerMetricMappings() map[string]string {
	return map[string]string{
		// Critical throughput metrics - Fixed from original
		"broker.messagesInPerSecond":          "aws.msk.MessagesInPerSec",
		"broker.IOInPerSecond":                "aws.msk.BytesInPerSec",
		"broker.IOOutPerSecond":               "aws.msk.BytesOutPerSec",
		"broker.bytesWrittenToDiscPerSecond":  "aws.msk.BytesWrittenPerSec",
		
		// Fetch/Produce metrics
		"broker.totalFetchRequestsPerSecond":   "aws.msk.FetchMessageConversionsPerSec",
		"broker.totalProduceRequestsPerSecond": "aws.msk.ProduceMessageConversionsPerSec",
		"request.clientFetchesFailedPerSecond": "aws.msk.FetchConsumerRequestsPerSec",
		"request.produceRequestsFailedPerSecond": "aws.msk.ProduceRequestsPerSec",
		
		// Replication metrics
		"replication.unreplicatedPartitions":       "aws.msk.UnderReplicatedPartitions",
		"replication.isrShrinksPerSecond":          "aws.msk.IsrShrinksPerSec",
		"replication.isrExpandsPerSecond":          "aws.msk.IsrExpandsPerSec",
		"replication.leaderElectionPerSecond":      "aws.msk.LeaderElectionRateAndTimeMs",
		"replication.uncleanLeaderElectionPerSecond": "aws.msk.UncleanLeaderElectionsPerSec",
		
		// Request latency metrics
		"request.avgTimeFetch":                "aws.msk.RequestTime.Fetch.Mean",
		"request.avgTimeProduceRequest":       "aws.msk.RequestTime.Produce.Mean",
		"request.avgTimeUpdateMetadata":       "aws.msk.RequestTime.UpdateMetadata.Mean",
		"request.fetchTime99Percentile":       "aws.msk.FetchConsumerTotalTimeMs99thPercentile",
		"request.produceTime99Percentile":     "aws.msk.ProduceTotalTimeMs99thPercentile",
		"request.avgTimeMetadata":             "aws.msk.RequestTime.Metadata.Mean",
		"request.avgTimeMetadata99Percentile": "aws.msk.RequestTime.Metadata.99thPercentile",
		
		// Network metrics
		"net.bytesRejectedPerSecond":          "aws.msk.NetworkRxDropped",
		"network.requestsPerSecond":           "aws.msk.NetworkRequestsPerSec",
		"broker.bytesInPerSecond":             "aws.msk.NetworkRxPackets",
		"broker.bytesOutPerSecond":            "aws.msk.NetworkTxPackets",
		
		// Partition and topic metrics
		"broker.partitionCount":               "aws.msk.PartitionCount",
		"broker.leaderCount":                  "aws.msk.LeaderCount",
		"controller.activeControllerCount":    "aws.msk.ActiveControllerCount",
		"controller.offlinePartitionsCount":   "aws.msk.OfflinePartitionsCount",
		
		// Consumer metrics
		"consumer.requestsExpiredPerSecond":   "aws.msk.ExpiredFetchResponsesPerSec",
		"consumer.avgFetchSizeBytes":          "aws.msk.FetchMessageConversionsPerSec",
		"follower.requestExpirationPerSecond": "aws.msk.FetchFollowerRequestsPerSec",
		
		// Disk and memory metrics
		"broker.logSize":                      "aws.msk.KafkaDataLogsDiskUsed",
		"broker.diskUsedPercent":              "aws.msk.RootDiskUsed",
		"jvm.heapUsedPercent":                 "aws.msk.MemoryUsed",
		"jvm.gcTimeMillis":                    "aws.msk.GarbageCollectionTime",
		
		// Connection metrics
		"broker.connectionCount":              "aws.msk.ConnectionCount",
		"broker.connectionCreationRate":       "aws.msk.ConnectionCreationRate",
		"broker.connectionCloseRate":          "aws.msk.ConnectionCloseRate",
		
		// ZooKeeper metrics
		"zookeeper.requestLatencyMsMean":      "aws.msk.ZooKeeperRequestLatencyMsMean",
		"zookeeper.sessionState":              "aws.msk.ZooKeeperSessionState",
	}
}

// getTopicMetricMappings returns the correct topic metric mappings
func getTopicMetricMappings() map[string]string {
	return map[string]string{
		"topic.bytesInPerSecond":          "aws.msk.BytesInPerSec",
		"topic.bytesOutPerSecond":         "aws.msk.BytesOutPerSec",
		"topic.messagesInPerSecond":       "aws.msk.MessagesInPerSec",
		"topic.partitionCount":            "aws.msk.PartitionCount",
		"topic.replicationFactor":         "aws.msk.ReplicationFactor",
		"topic.underReplicatedPartitions": "aws.msk.UnderReplicatedPartitions",
		"topic.sizeBytes":                 "aws.msk.TopicSize",
		"topic.logSize":                   "aws.msk.LogSize",
	}
}

// getClusterMetricMappings returns the correct cluster metric mappings
func getClusterMetricMappings() map[string]string {
	return map[string]string{
		"cluster.brokerCount":                     "aws.msk.BrokerCount",
		"cluster.topicCount":                      "aws.msk.TopicCount",
		"cluster.partitionCount":                  "aws.msk.GlobalPartitionCount",
		"cluster.activeControllerCount":           "aws.msk.ActiveControllerCount",
		"cluster.offlinePartitionsCount":          "aws.msk.OfflinePartitionsCount",
		"cluster.underReplicatedPartitions":       "aws.msk.UnderReplicatedPartitions",
		"cluster.preferredReplicaImbalanceCount":  "aws.msk.PreferredReplicaImbalanceCount",
	}
}

// TransformBrokerMetrics transforms broker metrics to AWS MSK format
func (t *ComprehensiveTransformer) TransformBrokerMetrics(input map[string]interface{}, output *metric.Set) error {
	log.Debug("[MSK_TRANSFORMER] Transforming broker metrics")
	
	// Transform using mappings
	transformedCount := 0
	for sourceMetric, targetMetric := range t.brokerMappings {
		if value, exists := input[sourceMetric]; exists && value != nil {
			if err := t.setMetricValue(output, targetMetric, value); err == nil {
				transformedCount++
				
				// Also set provider.* version for compatibility
				providerMetric := "provider." + getMetricBaseName(targetMetric) + ".Average"
				t.setMetricValue(output, providerMetric, value)
			}
		}
	}
	
	log.Debug("[MSK_TRANSFORMER] Transformed %d broker metrics", transformedCount)
	
	// Special handling for compound metrics
	t.handleSpecialBrokerMetrics(input, output)
	
	return nil
}

// TransformTopicMetrics transforms topic metrics to AWS MSK format
func (t *ComprehensiveTransformer) TransformTopicMetrics(input map[string]interface{}, output *metric.Set) error {
	log.Debug("[MSK_TRANSFORMER] Transforming topic metrics")
	
	transformedCount := 0
	for sourceMetric, targetMetric := range t.topicMappings {
		if value, exists := input[sourceMetric]; exists && value != nil {
			if err := t.setMetricValue(output, targetMetric, value); err == nil {
				transformedCount++
				
				// Also set provider.* version
				providerMetric := "provider." + getMetricBaseName(targetMetric) + ".Sum"
				t.setMetricValue(output, providerMetric, value)
			}
		}
	}
	
	log.Debug("[MSK_TRANSFORMER] Transformed %d topic metrics", transformedCount)
	
	return nil
}

// TransformClusterMetrics transforms cluster-level metrics
func (t *ComprehensiveTransformer) TransformClusterMetrics(input map[string]interface{}, output *metric.Set) error {
	log.Debug("[MSK_TRANSFORMER] Transforming cluster metrics")
	
	for sourceMetric, targetMetric := range t.clusterMappings {
		if value, exists := input[sourceMetric]; exists && value != nil {
			t.setMetricValue(output, targetMetric, value)
			
			// Set provider version with appropriate aggregation suffix
			suffix := ".Average"
			if isCountMetric(targetMetric) {
				suffix = ".Sum"
			}
			providerMetric := "provider." + getMetricBaseName(targetMetric) + suffix
			t.setMetricValue(output, providerMetric, value)
		}
	}
	
	return nil
}

// handleSpecialBrokerMetrics handles metrics that need special processing
func (t *ComprehensiveTransformer) handleSpecialBrokerMetrics(input map[string]interface{}, output *metric.Set) {
	// CPU metrics (combine system and user CPU)
	systemCPU, hasSystem := toFloat64Safe(input["broker.systemCPUPercent"])
	userCPU, hasUser := toFloat64Safe(input["broker.userCPUPercent"])
	if hasSystem || hasUser {
		totalCPU := systemCPU + userCPU
		output.SetMetric("aws.msk.CpuSystem", systemCPU, metric.GAUGE)
		output.SetMetric("aws.msk.CpuUser", userCPU, metric.GAUGE)
		output.SetMetric("aws.msk.CpuTotal", totalCPU, metric.GAUGE)
		output.SetMetric("provider.cpuPercent.Average", totalCPU, metric.GAUGE)
	}
	
	// Memory metrics
	if heapUsed, ok := toFloat64Safe(input["jvm.heapUsedPercent"]); ok {
		output.SetMetric("aws.msk.MemoryUsed", heapUsed, metric.GAUGE)
		output.SetMetric("provider.memoryUsed.Average", heapUsed, metric.GAUGE)
		
		// Calculate memory free (inverse of used percentage)
		memoryFree := 100.0 - heapUsed
		output.SetMetric("aws.msk.MemoryFree", memoryFree, metric.GAUGE)
		output.SetMetric("provider.memoryFree.Average", memoryFree, metric.GAUGE)
	}
	
	// Disk metrics
	if diskUsed, ok := toFloat64Safe(input["broker.diskUsedPercent"]); ok {
		output.SetMetric("aws.msk.RootDiskUsed", diskUsed, metric.GAUGE)
		output.SetMetric("provider.rootDiskUsed.Average", diskUsed, metric.GAUGE)
	}
	
	// Consumer lag (if available at broker level)
	if consumerLag, ok := toFloat64Safe(input["consumer.totalLag"]); ok {
		output.SetMetric("aws.msk.ConsumerLag", consumerLag, metric.GAUGE)
		output.SetMetric("provider.consumerLag.Max", consumerLag, metric.GAUGE)
	}
}

// setMetricValue sets a metric value with proper type conversion
func (t *ComprehensiveTransformer) setMetricValue(output *metric.Set, metricName string, value interface{}) error {
	floatValue, err := toFloat64(value)
	if err != nil {
		return fmt.Errorf("failed to convert value for %s: %v", metricName, err)
	}
	
	output.SetMetric(metricName, floatValue, metric.GAUGE)
	return nil
}

// Note: toFloat64 is defined in transformer_simple_fixed.go to avoid duplication

// toFloat64Safe converts to float64 and returns success flag
func toFloat64Safe(value interface{}) (float64, bool) {
	f, err := toFloat64(value)
	return f, err == nil
}

// getMetricBaseName extracts the base name from an AWS metric name
func getMetricBaseName(metricName string) string {
	// Remove aws.msk. prefix if present
	if len(metricName) > 8 && metricName[:8] == "aws.msk." {
		return metricName[8:]
	}
	return metricName
}

// isCountMetric returns true if the metric should use Sum aggregation
func isCountMetric(metricName string) bool {
	countMetrics := []string{
		"Count", "Partitions", "Topics", "Brokers", "Controller",
	}
	
	for _, suffix := range countMetrics {
		if contains(metricName, suffix) {
			return true
		}
	}
	
	return false
}

// contains checks if a string contains a substring
func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > len(substr) && 
		(s[len(s)-len(substr):] == substr || s[:len(substr)] == substr))
}