package metrics

import (
	"github.com/newrelic/infra-integrations-sdk/v3/data/metric"
)

// MSKAdditionalBrokerMetrics contains additional broker metrics needed for MSK compatibility
var MSKAdditionalBrokerMetrics = []*JMXMetricSet{
	// Network Processor Idle
	{
		MBean:        "kafka.network:type=SocketServer,name=NetworkProcessorAvgIdlePercent",
		MetricPrefix: "kafka.network:type=SocketServer,name=NetworkProcessorAvgIdlePercent,",
		MetricDefs: []*MetricDefinition{
			{
				Name:       "broker.networkProcessorAvgIdlePercent",
				SourceType: metric.GAUGE,
				JMXAttr:    "attr=Value",
			},
		},
	},
	// Controller Metrics
	{
		MBean:        "kafka.controller:type=KafkaController,name=*",
		MetricPrefix: "kafka.controller:type=KafkaController,",
		MetricDefs: []*MetricDefinition{
			{
				Name:       "controller.activeControllerCount",
				SourceType: metric.GAUGE,
				JMXAttr:    "name=ActiveControllerCount,attr=Value",
			},
			{
				Name:       "controller.offlinePartitionsCount",
				SourceType: metric.GAUGE,
				JMXAttr:    "name=OfflinePartitionsCount,attr=Value",
			},
		},
	},
	// Request timing metrics
	{
		MBean:        "kafka.network:type=RequestMetrics,name=TotalTimeMs,request=Produce",
		MetricPrefix: "kafka.network:type=RequestMetrics,name=TotalTimeMs,request=Produce,",
		MetricDefs: []*MetricDefinition{
			{
				Name:       "broker.produceTotalTimeMs",
				SourceType: metric.GAUGE,
				JMXAttr:    "attr=Mean",
			},
		},
	},
	{
		MBean:        "kafka.network:type=RequestMetrics,name=TotalTimeMs,request=FetchConsumer",
		MetricPrefix: "kafka.network:type=RequestMetrics,name=TotalTimeMs,request=FetchConsumer,",
		MetricDefs: []*MetricDefinition{
			{
				Name:       "broker.fetchConsumerTotalTimeMs",
				SourceType: metric.GAUGE,
				JMXAttr:    "attr=Mean",
			},
		},
	},
}

// init function to append these metrics to the main broker metrics
func init() {
	// Append MSK additional metrics to the main broker metrics
	brokerMetricDefs = append(brokerMetricDefs, MSKAdditionalBrokerMetrics...)
}