# Kafka Pipeline Comparison Dashboard - Deployment Summary

## Overview
Successfully created and deployed a Kafka monitoring dashboard that compares standard and custom nri-kafka pipelines side-by-side.

## Dashboard Details
- **Name**: Kafka Monitoring: Standard vs Custom Pipeline Comparison
- **GUID**: MzYzMDA3MnxWSVp8REFTSEJPQVJEfGRhOjEwMTIyMjE1
- **URL**: https://one.newrelic.com/dashboards/detail/MzYzMDA3MnxWSVp8REFTSEJPQVJEfGRhOjEwMTIyMjE1?account=3630072
- **Deployed At**: 2025-06-04T04:18:01.909Z

## Dashboard Components

### 1. Pipeline Metrics Collection Status (Billboard)
- Shows real-time counts for:
  - Standard Pipeline samples
  - Custom Pipeline samples
  - Topic samples from custom pipeline

### 2. Broker Metrics Over Time (Line Chart)
- Visualizes metric collection rates over time
- Differentiates between standard and custom pipelines

### 3. Messages In Per Second (Line Chart)
- Tracks message ingestion rates
- Compares performance between pipelines

### 4. Available Metrics by Pipeline (Table)
- Lists all unique metrics collected by each pipeline
- Shows sample counts for comparison

### 5. IO Throughput Comparison (Line Chart)
- Monitors bytes in/out per second
- Focuses on custom pipeline performance

### 6. Replication Health (Billboard)
- Displays:
  - Unreplicated partitions count
  - ISR (In-Sync Replicas) expands per second

### 7. Enhanced V2 Metrics Status (Billboard)
- Tracks availability of new V2 metrics:
  - BytesOutPerSec by topic
  - MessagesInPerSec by topic
  - Controller metrics

### 8. Topic Metrics Collection (Table)
- Shows per-topic metrics:
  - Sample counts
  - Non-preferred leader partitions
  - Under-replicated partitions

## Current Status

### ✅ Working
- Standard pipeline: Collecting data (20 samples in last 5 minutes)
- Custom pipeline: Collecting data (80 samples in last 5 minutes)
- Topic metrics: Being collected (70 samples)
- Dashboard successfully deployed and accessible

### ⚠️ Pending
- V2 enhanced metrics not yet detected
- May need to verify ENABLE_BROKER_TOPIC_METRICS_V2 configuration

## Files Created
1. `kafka-pipeline-comparison.json` - Original dashboard configuration
2. `deploy-kafka-pipeline-dashboard.js` - Deployment script
3. `verify-kafka-metrics.js` - Metrics verification script
4. `kafka-pipeline-deployment-info.json` - Deployment metadata

## Next Steps
1. Monitor the dashboard for V2 metrics availability
2. Verify custom nri-kafka configuration includes V2 metrics
3. Check if additional JMX metrics need to be enabled
4. Consider adding alerts for metric collection failures

## Usage

### Deploy Dashboard
```bash
cd /Users/deepaksharma/Desktop/src/kafka_setup/DashBuilder-main
node deploy-kafka-pipeline-dashboard.js
```

### Verify Metrics
```bash
node verify-kafka-metrics.js
```

### View Dashboard
Open: https://one.newrelic.com/dashboards/detail/MzYzMDA3MnxWSVp8REFTSEJPQVJEfGRhOjEwMTIyMjE1?account=3630072