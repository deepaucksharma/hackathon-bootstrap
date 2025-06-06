# AWS MSK Message Queues Deployment Guide

## Table of Contents
1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Option 1: nri-kafka MSK Shim Deployment](#option-1-nri-kafka-msk-shim-deployment)
3. [Option 2: CloudWatch Metric Streams Deployment](#option-2-cloudwatch-metric-streams-deployment)
4. [Option 3: Direct API Integration](#option-3-direct-api-integration)
5. [Rollout Strategy](#rollout-strategy)
6. [Monitoring & Validation](#monitoring--validation)
7. [Rollback Procedures](#rollback-procedures)

## Pre-Deployment Checklist

### Requirements Verification
- [ ] New Relic account with Infrastructure Pro license
- [ ] API keys: Insert Key (IKEY), User Key (UKEY), Query Key (QKEY)
- [ ] Access to Kafka/MSK clusters
- [ ] Network connectivity from deployment location to New Relic endpoints
- [ ] Proper IAM roles for AWS MSK access (if using CloudWatch)

### Environment Setup
```bash
# Test New Relic API connectivity
curl -X POST https://insights-collector.newrelic.com/v1/accounts/YOUR_ACCOUNT_ID/events \
  -H "X-Insert-Key: YOUR_INSERT_KEY" \
  -H "Content-Type: application/json" \
  -d '[{"eventType":"MessageQueueSample","test":true}]'

# Verify response is 200 OK
```

### Capacity Planning
- Event volume: ~1 event per broker per minute
- Data size: ~2KB per event
- Monthly volume estimate: Brokers × 43,200 events × 2KB

## Option 1: nri-kafka MSK Shim Deployment

### Step 1: Build Custom nri-kafka Binary

```bash
# Clone nri-kafka repository
git clone https://github.com/newrelic/nri-kafka.git
cd nri-kafka

# Add MessageQueue transformer
cp /path/to/msk-shim-messagequeue-integration.go src/msk/

# Update imports in src/kafka.go
# Add: messagequeue "github.com/newrelic/nri-kafka/src/msk"

# Build binary
make compile

# Output: ./bin/nri-kafka
```

### Step 2: Create Configuration

```yaml
# /etc/newrelic-infra/integrations.d/kafka-config.yml
integrations:
  - name: nri-kafka
    env:
      CLUSTER_NAME: production-msk-cluster
      ZOOKEEPER_HOSTS: '[]'  # Not needed for MSK
      BOOTSTRAP_BROKER_KAFKA_VERSION: 2.8.0
      CONSUMER_OFFSET: false
      
      # MSK Shim Configuration
      MSK_SHIM_ENABLED: true
      MSK_MESSAGE_QUEUE_MODE: true
      AWS_ACCOUNT_ID: "123456789012"
      AWS_REGION: us-east-1
      
      # JMX Configuration
      DEFAULT_JMX_USER: ""
      DEFAULT_JMX_PASSWORD: ""
      COLLECT_BROKER_TOPIC_DATA: true
      TOPIC_MODE: all
      COLLECT_TOPIC_SIZE: false
      
    interval: 60s
    inventory_source: config/kafka
    
    # Broker instances
    instances:
      - name: broker-1
        command: all_data
        arguments:
          host: broker-1.kafka.local
          port: 9999
          kafka_broker_jmx_port: 9999
          
      - name: broker-2
        command: all_data
        arguments:
          host: broker-2.kafka.local
          port: 9999
          kafka_broker_jmx_port: 9999
```

### Step 3: Deploy with Infrastructure Agent

#### Using Infrastructure Bundle
```bash
# Replace nri-kafka in the bundle
docker run -d \
  --name newrelic-infra \
  --network=host \
  --cap-add=SYS_PTRACE \
  --privileged \
  --pid=host \
  -v "/:/host:ro" \
  -v "/var/run/docker.sock:/var/run/docker.sock" \
  -e NRIA_LICENSE_KEY=YOUR_LICENSE_KEY \
  -e NRIA_CUSTOM_ATTRIBUTES='{"cluster":"production","environment":"prod"}' \
  newrelic/infrastructure-bundle:latest

# Copy custom nri-kafka
docker cp ./bin/nri-kafka newrelic-infra:/var/db/newrelic-infra/custom-integrations/bin/
docker cp kafka-config.yml newrelic-infra:/etc/newrelic-infra/integrations.d/
docker restart newrelic-infra
```

#### Using Kubernetes
```yaml
# kafka-integration-deployment.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: nri-kafka-config
  namespace: newrelic
data:
  kafka-config.yml: |
    integrations:
      - name: nri-kafka
        env:
          CLUSTER_NAME: ${CLUSTER_NAME}
          MSK_SHIM_ENABLED: "true"
          MSK_MESSAGE_QUEUE_MODE: "true"
          AWS_ACCOUNT_ID: ${AWS_ACCOUNT_ID}
          AWS_REGION: ${AWS_REGION}
        interval: 60s
        instances:
          ${BROKER_INSTANCES}
---
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: newrelic-infra
  namespace: newrelic
spec:
  selector:
    matchLabels:
      name: newrelic-infra
  template:
    metadata:
      labels:
        name: newrelic-infra
    spec:
      serviceAccountName: newrelic
      hostNetwork: true
      dnsPolicy: ClusterFirstWithHostNet
      containers:
      - name: newrelic-infra
        image: newrelic/infrastructure-bundle:latest
        env:
        - name: NRIA_LICENSE_KEY
          valueFrom:
            secretKeyRef:
              name: newrelic-license
              key: license-key
        - name: CLUSTER_NAME
          value: "production-msk-cluster"
        volumeMounts:
        - name: nri-kafka-config
          mountPath: /etc/newrelic-infra/integrations.d
        - name: custom-nri-kafka
          mountPath: /var/db/newrelic-infra/custom-integrations/bin
      volumes:
      - name: nri-kafka-config
        configMap:
          name: nri-kafka-config
      - name: custom-nri-kafka
        configMap:
          name: custom-nri-kafka-binary
          defaultMode: 0755
```

### Step 4: Verify Deployment

```bash
# Check integration is running
docker exec newrelic-infra cat /var/db/newrelic-infra/integrations.log | grep kafka

# Verify events are being sent
docker exec newrelic-infra cat /var/log/newrelic-infra/newrelic-infra.log | grep MessageQueueSample
```

## Option 2: CloudWatch Metric Streams Deployment

### Step 1: Create Lambda Function

```python
# lambda_function.py
import json
import base64
import gzip
import boto3
from datetime import datetime

def lambda_handler(event, context):
    """Transform CloudWatch MSK metrics to MessageQueueSample"""
    
    output_records = []
    newrelic_client = boto3.client('firehose')
    
    for record in event['records']:
        try:
            # Decode CloudWatch metric
            compressed = base64.b64decode(record['data'])
            decompressed = gzip.decompress(compressed)
            metric_data = json.loads(decompressed)
            
            # Only process Kafka metrics
            if metric_data.get('namespace') != 'AWS/Kafka':
                output_records.append({
                    'recordId': record['recordId'],
                    'result': 'Dropped'
                })
                continue
            
            # Transform to MessageQueueSample
            mq_event = transform_to_messagequeue(metric_data)
            
            # Encode result
            output_data = base64.b64encode(
                json.dumps(mq_event).encode('utf-8')
            ).decode('utf-8')
            
            output_records.append({
                'recordId': record['recordId'],
                'result': 'Ok',
                'data': output_data
            })
            
        except Exception as e:
            print(f"Error processing record: {e}")
            output_records.append({
                'recordId': record['recordId'],
                'result': 'ProcessingFailed'
            })
    
    return {'records': output_records}

def transform_to_messagequeue(metric):
    """Transform CloudWatch metric to MessageQueueSample format"""
    # Implementation from earlier examples
    pass
```

### Step 2: Deploy Infrastructure

```terraform
# terraform/msk-metrics-pipeline.tf

# S3 bucket for failed records
resource "aws_s3_bucket" "failed_records" {
  bucket = "msk-metrics-failed-records-${data.aws_caller_identity.current.account_id}"
  
  lifecycle_rule {
    enabled = true
    expiration {
      days = 7
    }
  }
}

# Lambda function
resource "aws_lambda_function" "transformer" {
  filename         = "lambda_deployment.zip"
  function_name    = "msk-messagequeue-transformer"
  role            = aws_iam_role.lambda_role.arn
  handler         = "lambda_function.lambda_handler"
  runtime         = "python3.9"
  timeout         = 60
  memory_size     = 512
  
  environment {
    variables = {
      NEW_RELIC_ACCOUNT_ID = var.newrelic_account_id
      NEW_RELIC_INSERT_KEY = var.newrelic_insert_key
    }
  }
}

# Kinesis Data Firehose
resource "aws_kinesis_firehose_delivery_stream" "newrelic" {
  name        = "msk-metrics-to-newrelic"
  destination = "http_endpoint"
  
  http_endpoint_configuration {
    url                = "https://aws-api.newrelic.com/cloudwatch-metrics/v1"
    name               = "New Relic"
    access_key         = var.newrelic_insert_key
    buffering_size     = 1
    buffering_interval = 60
    
    processing_configuration {
      enabled = true
      
      processors {
        type = "Lambda"
        
        parameters {
          parameter_name  = "LambdaArn"
          parameter_value = aws_lambda_function.transformer.arn
        }
      }
    }
    
    request_configuration {
      content_encoding = "GZIP"
      
      common_attributes {
        name  = "collector.name"
        value = "cloudwatch-metric-streams"
      }
    }
  }
  
  s3_configuration {
    role_arn           = aws_iam_role.firehose_role.arn
    bucket_arn         = aws_s3_bucket.failed_records.arn
    prefix             = "failed/"
    error_output_prefix = "error/"
    compression_format = "GZIP"
  }
}

# CloudWatch Metric Stream
resource "aws_cloudwatch_metric_stream" "msk" {
  name          = "msk-metrics-stream"
  role_arn      = aws_iam_role.metric_stream_role.arn
  firehose_arn  = aws_kinesis_firehose_delivery_stream.newrelic.arn
  output_format = "json"
  
  include_filter {
    namespace = "AWS/Kafka"
  }
}
```

### Step 3: Deploy with AWS CLI

```bash
# Package Lambda function
zip lambda_deployment.zip lambda_function.py

# Deploy CloudFormation stack
aws cloudformation deploy \
  --template-file cloudformation/msk-metrics-pipeline.yaml \
  --stack-name msk-messagequeue-pipeline \
  --parameter-overrides \
    NewRelicAccountId=YOUR_ACCOUNT_ID \
    NewRelicInsertKey=YOUR_INSERT_KEY \
  --capabilities CAPABILITY_IAM

# Verify metric stream is active
aws cloudwatch describe-metric-streams \
  --names msk-metrics-stream
```

## Option 3: Direct API Integration

### Step 1: Create Integration Service

```javascript
// messagequeue-service.js
const https = require('https');
const AWS = require('aws-sdk');

class MessageQueueService {
  constructor(config) {
    this.accountId = config.newRelicAccountId;
    this.insertKey = config.newRelicInsertKey;
    this.clusterName = config.clusterName;
    this.region = config.awsRegion;
    this.cloudwatch = new AWS.CloudWatch({ region: this.region });
    this.kafka = new AWS.Kafka({ region: this.region });
  }

  async collectAndSendMetrics() {
    try {
      // Get cluster details
      const cluster = await this.getClusterDetails();
      
      // Collect metrics from CloudWatch
      const metrics = await this.collectCloudWatchMetrics();
      
      // Transform to MessageQueueSample
      const events = this.transformMetrics(cluster, metrics);
      
      // Send to New Relic
      await this.sendToNewRelic(events);
      
      console.log(`Sent ${events.length} events to New Relic`);
    } catch (error) {
      console.error('Error collecting metrics:', error);
      throw error;
    }
  }

  async getClusterDetails() {
    const { ClusterInfoList } = await this.kafka.listClusters({
      ClusterNameFilter: this.clusterName
    }).promise();
    
    return ClusterInfoList[0];
  }

  async collectCloudWatchMetrics() {
    const endTime = new Date();
    const startTime = new Date(endTime - 5 * 60 * 1000); // 5 minutes ago
    
    const params = {
      Namespace: 'AWS/Kafka',
      StartTime: startTime,
      EndTime: endTime,
      MetricDataQueries: [
        {
          Id: 'm1',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/Kafka',
              MetricName: 'ActiveControllerCount',
              Dimensions: [
                { Name: 'Cluster Name', Value: this.clusterName }
              ]
            },
            Period: 300,
            Stat: 'Average'
          }
        }
        // Add more metrics as needed
      ]
    };
    
    const { MetricDataResults } = await this.cloudwatch
      .getMetricData(params)
      .promise();
    
    return MetricDataResults;
  }

  transformMetrics(cluster, metrics) {
    // Implementation of transformation logic
    const events = [];
    
    // Create cluster event
    events.push({
      eventType: 'MessageQueueSample',
      timestamp: Date.now(),
      provider: 'AwsMsk',
      'collector.name': 'direct-api',
      'queue.name': this.clusterName,
      'queue.type': 'kafka_cluster',
      'entity.name': this.clusterName,
      'entity.type': 'AWSMSKCLUSTER',
      // ... add metrics
    });
    
    return events;
  }

  async sendToNewRelic(events) {
    const data = JSON.stringify(events);
    
    const options = {
      hostname: 'insights-collector.newrelic.com',
      path: `/v1/accounts/${this.accountId}/events`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Insert-Key': this.insertKey,
        'Content-Length': data.length
      }
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ status: res.statusCode, body });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          }
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }
}

module.exports = MessageQueueService;
```

### Step 2: Deploy as Container

```dockerfile
# Dockerfile
FROM node:16-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

ENV NODE_ENV=production

CMD ["node", "index.js"]
```

```javascript
// index.js
const MessageQueueService = require('./messagequeue-service');

const config = {
  newRelicAccountId: process.env.NEW_RELIC_ACCOUNT_ID,
  newRelicInsertKey: process.env.NEW_RELIC_INSERT_KEY,
  clusterName: process.env.CLUSTER_NAME,
  awsRegion: process.env.AWS_REGION || 'us-east-1'
};

const service = new MessageQueueService(config);

// Run every minute
setInterval(async () => {
  try {
    await service.collectAndSendMetrics();
  } catch (error) {
    console.error('Failed to collect metrics:', error);
  }
}, 60000);

// Initial run
service.collectAndSendMetrics();
```

### Step 3: Deploy to Kubernetes

```yaml
# k8s-deployment.yaml
apiVersion: v1
kind: Secret
metadata:
  name: msk-messagequeue-secret
  namespace: monitoring
type: Opaque
stringData:
  new-relic-insert-key: "YOUR_INSERT_KEY"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: msk-messagequeue-collector
  namespace: monitoring
spec:
  replicas: 1
  selector:
    matchLabels:
      app: msk-messagequeue-collector
  template:
    metadata:
      labels:
        app: msk-messagequeue-collector
    spec:
      serviceAccountName: msk-collector
      containers:
      - name: collector
        image: your-registry/msk-messagequeue-collector:latest
        env:
        - name: NEW_RELIC_ACCOUNT_ID
          value: "YOUR_ACCOUNT_ID"
        - name: NEW_RELIC_INSERT_KEY
          valueFrom:
            secretKeyRef:
              name: msk-messagequeue-secret
              key: new-relic-insert-key
        - name: CLUSTER_NAME
          value: "production-msk-cluster"
        - name: AWS_REGION
          value: "us-east-1"
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "200m"
```

## Rollout Strategy

### Phase 1: Development Environment (Week 1)
1. Deploy to development cluster
2. Validate events in New Relic
3. Test dashboards and alerts
4. Document any issues

### Phase 2: Staging Environment (Week 2)
1. Deploy to staging with production-like load
2. Monitor for 48 hours
3. Validate metrics accuracy
4. Performance testing

### Phase 3: Production Pilot (Week 3)
1. Deploy to 1 production cluster
2. Monitor closely for 1 week
3. Compare with existing metrics
4. Gather feedback

### Phase 4: Full Production (Week 4)
1. Deploy to remaining clusters
2. Decommission old monitoring (if applicable)
3. Update documentation
4. Training for operations team

## Monitoring & Validation

### Initial Validation (First 24 hours)
```sql
-- Check events are arriving
FROM MessageQueueSample 
SELECT count(*) 
WHERE provider = 'AwsMsk' 
SINCE 1 hour ago 
TIMESERIES

-- Verify all entity types
FROM MessageQueueSample 
SELECT uniqueCount(entity.name) 
WHERE provider = 'AwsMsk' 
FACET entity.type 
SINCE 1 hour ago

-- Check for gaps
FROM MessageQueueSample 
SELECT count(*) 
WHERE provider = 'AwsMsk' 
TIMESERIES 1 minute 
SINCE 1 hour ago
```

### Ongoing Monitoring
- Set up alerts for data gaps > 5 minutes
- Monitor event volume trends
- Track API rate limit usage
- Monitor Lambda/container performance

## Rollback Procedures

### Option 1 Rollback (nri-kafka)
```bash
# Stop the integration
docker exec newrelic-infra rm /etc/newrelic-infra/integrations.d/kafka-config.yml
docker restart newrelic-infra

# Or restore original nri-kafka
docker cp /backup/nri-kafka newrelic-infra:/var/db/newrelic-infra/custom-integrations/bin/
docker restart newrelic-infra
```

### Option 2 Rollback (CloudWatch)
```bash
# Disable metric stream
aws cloudwatch stop-metric-stream --name msk-metrics-stream

# Delete CloudFormation stack
aws cloudformation delete-stack --stack-name msk-messagequeue-pipeline
```

### Option 3 Rollback (Direct API)
```bash
# Scale down deployment
kubectl scale deployment msk-messagequeue-collector --replicas=0 -n monitoring

# Delete deployment
kubectl delete deployment msk-messagequeue-collector -n monitoring
```

## Success Criteria

- [ ] All MSK entities visible in Message Queues UI
- [ ] Metrics updating every minute
- [ ] No data gaps > 5 minutes
- [ ] CPU/Memory usage within limits
- [ ] Zero errors in logs after 24 hours
- [ ] Dashboards showing accurate data
- [ ] Alerts firing correctly

## Support & Troubleshooting

See [TROUBLESHOOTING_GUIDE.md](./TROUBLESHOOTING_GUIDE.md) for common issues and solutions.