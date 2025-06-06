#!/bin/bash
echo "🔍 Verifying Current Entity Creation in NRDB"
echo "==========================================="

# Check what's actually in NRDB
echo -e "\n📊 Checking AwsMskClusterSample events:"
echo "FROM AwsMskClusterSample SELECT count(*) SINCE 1 hour ago"

echo -e "\n📊 Checking AwsMskBrokerSample events:"
echo "FROM AwsMskBrokerSample SELECT count(*) SINCE 1 hour ago"

echo -e "\n📊 Checking dimensional metrics:"
echo "FROM Metric SELECT count(*) WHERE metricName LIKE 'kafka.%' SINCE 1 hour ago"

echo -e "\n📊 Checking standard Kafka samples:"
echo "FROM KafkaBrokerSample SELECT count(*) SINCE 1 hour ago"

echo -e "\n📊 Checking collector names in our data:"
echo "FROM AwsMskClusterSample SELECT uniques(collector.name) SINCE 1 hour ago"

echo -e "\n🎯 What Message Queues UI is looking for:"
echo "- CollectorName = 'cloudwatch-metric-streams'"
echo "- Entity synthesis from CloudWatch metrics"
echo "- Valid AWS account integration"

echo -e "\n❌ What we're providing:"
echo "- CollectorName = 'nri-kafka-msk' or 'infrastructure-agent'"
echo "- Event samples from infrastructure agent"
echo "- Simulated AWS entities"

echo -e "\n💡 This is why it doesn't appear in the UI!"