# Implementation Checklist

## Prerequisites
- [ ] `.env` file with New Relic credentials
- [ ] Kubernetes cluster (Minikube/Kind) running
- [ ] Kafka cluster deployed with JMX enabled
- [ ] Go 1.19+ installed
- [ ] Docker installed

## Implementation Steps

### 1. Verify Current State
- [ ] Run original verification: `node verify-kafka-metrics.js`
- [ ] Check current health score (should be ~98.9%)
- [ ] Confirm no entities in Message Queues UI

### 2. Enable CloudWatch Format
- [ ] Set environment variables:
  ```bash
  export MSK_USE_CLOUDWATCH_FORMAT=true
  export MSK_USE_DIMENSIONAL=true
  export NEW_RELIC_API_KEY=$IKEY
  ```

### 3. Build and Deploy
- [ ] Build nri-kafka binary:
  ```bash
  GOOS=linux GOARCH=amd64 go build -o nri-kafka-amd64 ./src
  cp nri-kafka-amd64 nri-kafka
  ```
- [ ] Build Docker image:
  ```bash
  docker build -f Dockerfile.bundle-fixed -t custom-nri-kafka:latest .
  ```
- [ ] Update ConfigMap with CloudWatch settings
- [ ] Apply Kubernetes manifests:
  ```bash
  kubectl apply -f minikube-consolidated/monitoring/
  ```

### 4. Verify CloudWatch Emulator
- [ ] Check pod logs for "CloudWatch emulator initialized"
- [ ] Look for "Emulating CloudWatch metrics" messages
- [ ] Verify API key is loaded correctly

### 5. Check Metric Creation
- [ ] Query for CloudWatch format metrics:
  ```sql
  FROM Metric 
  WHERE collector.name = 'cloudwatch-metric-streams' 
  AND aws.Namespace = 'AWS/Kafka'
  SINCE 10 minutes ago
  ```
- [ ] Verify metrics have correct attributes

### 6. Monitor Entity Creation
- [ ] Wait 2-5 minutes for entity synthesis
- [ ] Check Entity Explorer for AWS_KAFKA_* entities
- [ ] Look for entities with instrumentation.provider = 'cloudwatch'

### 7. Verify UI Visibility
- [ ] Open Message Queues UI
- [ ] Look for your Kafka cluster
- [ ] Verify metrics are displayed

## Troubleshooting Checklist

### If No CloudWatch Metrics
- [ ] Check API key is set: `echo $NEW_RELIC_API_KEY`
- [ ] Verify CloudWatch emulator initialized in logs
- [ ] Check for errors in metric sending
- [ ] Ensure MSK_USE_CLOUDWATCH_FORMAT=true

### If No Entities Created
- [ ] Verify collector.name = 'cloudwatch-metric-streams'
- [ ] Check aws.Namespace = 'AWS/Kafka'
- [ ] Ensure aws.AccountId is 12 digits
- [ ] Wait full 5 minutes for synthesis

### If No UI Visibility
- [ ] Confirm entities exist in Entity Explorer
- [ ] Check entity type is AWS_KAFKA_BROKER/CLUSTER/TOPIC
- [ ] Verify provider field in entities
- [ ] Clear browser cache and refresh

## Success Criteria
- [ ] CloudWatch format metrics appearing in NRDB
- [ ] AWS_KAFKA_* entities in Entity Explorer
- [ ] Kafka cluster visible in Message Queues UI
- [ ] Metrics displayed with correct values

## Rollback Plan
If issues arise:
1. Set MSK_USE_CLOUDWATCH_FORMAT=false
2. Restart pods
3. Revert to standard MSK sample format
4. Original metrics continue to work

## Next Steps After Success
- [ ] Document any custom metric mappings needed
- [ ] Set up alerts based on new entities
- [ ] Configure dashboards using AWS MSK templates
- [ ] Share success with team!