# Kafka Metrics Implementation Roadmap

## Goal
Ensure complete metrics reporting via custom nri-kafka implementation as per METRICS_VERIFICATION_GUIDE.md, leveraging verify-kafka-metrics.js for validation.

## Current State Assessment

### What We Have
1. **Core nri-kafka implementation** with MSK shim capability
2. **Verification tools**: 
   - `verify-kafka-metrics.js` - Comprehensive metric verification script
   - `METRICS_VERIFICATION_GUIDE.md` - Complete guide for verification
3. **Kafka simulation scripts** for generating telemetry
4. **Minikube setup** for local testing

### What We Need to Achieve
1. **Complete metric coverage** for all entity types:
   - Standard Kafka metrics (KafkaBrokerSample, KafkaTopicSample, etc.)
   - MSK shim metrics (AwsMskClusterSample, AwsMskBrokerSample, etc.)
2. **Verified data flow** from Kafka → nri-kafka → New Relic
3. **Health scores** of 90%+ across all categories

## Baby Steps Implementation Plan

### Step 1: Deploy and Verify Basic Infrastructure
**Objective**: Ensure Kafka clusters are running and accessible
- [ ] Run `./minikube-setup.sh setup` to prepare environment
- [ ] Deploy dual Kafka clusters using `./deploy-dual-kafka.sh`
- [ ] Verify clusters with `./verify-dual-kafka.sh`
- [ ] **Reflection Point**: Are both clusters healthy and accessible?

### Step 2: Deploy NRI-Kafka Integration
**Objective**: Get nri-kafka collecting basic metrics
- [ ] Deploy standard nri-kafka for simple Kafka cluster
- [ ] Deploy MSK shim version for Strimzi cluster
- [ ] Check pod logs for any errors
- [ ] Run basic connectivity tests
- [ ] **Reflection Point**: Are pods running without errors?

### Step 3: Generate Test Traffic
**Objective**: Create realistic workload for metric generation
- [ ] Run traffic simulation script
- [ ] Verify producers/consumers are active
- [ ] Check for topic creation and data flow
- [ ] Monitor JMX metrics availability
- [ ] **Reflection Point**: Is traffic generating expected metrics?

### Step 4: Initial Metric Verification
**Objective**: Confirm metrics are reaching NRDB
- [ ] Set environment variables (NRAK_API_KEY, ACC)
- [ ] Run `node verify-kafka-metrics.js` with basic checks
- [ ] Review console output for any data
- [ ] Check critical queries status
- [ ] **Reflection Point**: Are we seeing ANY metrics in NRDB?

### Step 5: Analyze Gaps and Fix Issues
**Objective**: Identify and resolve metric collection issues
- [ ] Review failed queries from verification report
- [ ] Check nri-kafka logs for specific errors
- [ ] Verify JMX configuration on brokers
- [ ] Adjust collection intervals if needed
- [ ] **Reflection Point**: What specific metrics are missing and why?

## Next 5 Steps After Each Reflection

### After Step 1 Reflection:
1. If clusters unhealthy → Debug pod issues
2. If JMX not accessible → Fix JMX configuration
3. If namespace issues → Verify namespace creation
4. If resource constraints → Adjust Minikube resources
5. If all good → Proceed to Step 2

### After Step 2 Reflection:
1. If pods crashing → Check resource limits
2. If config errors → Review ConfigMaps
3. If network issues → Check service discovery
4. If auth problems → Verify credentials
5. If all good → Proceed to Step 3

### After Step 3 Reflection:
1. If no traffic → Debug producer/consumer pods
2. If topics missing → Check topic creation
3. If JMX not exposed → Fix JMX_OPTS
4. If lag simulators failing → Adjust timing
5. If all good → Proceed to Step 4

### After Step 4 Reflection:
1. If no metrics at all → Check license key
2. If partial metrics → Identify missing types
3. If stale data → Check collection frequency
4. If auth errors → Verify API permissions
5. If some metrics present → Proceed to Step 5

### After Step 5 Reflection:
1. If MSK shim not working → Debug transformer
2. If standard metrics missing → Check broker discovery
3. If consumer lag missing → Verify offset collection
4. If throughput zero → Check calculation logic
5. If gaps identified → Create targeted fixes

## Success Criteria

### Minimum Viable Metrics
- [ ] KafkaBrokerSample with throughput > 0
- [ ] KafkaTopicSample with topic count > 0
- [ ] KafkaOffsetSample with consumer lag data
- [ ] AwsMskClusterSample with cluster health
- [ ] AwsMskBrokerSample with broker metrics

### Target Health Scores
- Data Availability: 100%
- Metric Completeness: 90%+
- Data Freshness: 95%+
- Entity Relationships: 80%+
- Overall Score: 90%+

## Continuous Improvement Loop

1. **Run verification** → `node verify-kafka-metrics.js`
2. **Analyze report** → Focus on failed queries
3. **Make targeted fix** → One issue at a time
4. **Test locally** → Verify fix works
5. **Re-run verification** → Measure improvement

## Key Commands Reference

```bash
# Environment setup
export NRAK_API_KEY="your-api-key"
export ACC="your-account-id"

# Deployment
./minikube-setup.sh setup
./deploy-dual-kafka.sh deploy

# Traffic generation
./k8s-consolidated/scripts/simulate-traffic.sh

# Verification
node verify-kafka-metrics.js

# Debugging
kubectl logs -l app=nri-kafka -n newrelic --tail=100
kubectl exec -n kafka kafka-0 -- nc -zv localhost 9999
```

## Common Issues and Solutions

### Issue: No metrics in NRDB
- Check license key validity
- Verify network connectivity
- Review pod logs for errors

### Issue: MSK metrics missing
- Confirm MSK_SHIM_ENABLED=true
- Check AWS_ACCOUNT_ID is set
- Verify transformer initialization

### Issue: Zero throughput
- Ensure traffic generation is active
- Check JMX metric collection
- Verify calculation in aggregator

### Issue: Stale data
- Check collection intervals
- Verify pod health
- Review resource constraints

## Progress Tracking

- [ ] Infrastructure deployed
- [ ] Basic metrics flowing
- [ ] MSK shim operational
- [ ] All entity types present
- [ ] Health score > 90%
- [ ] Documentation updated

---

**Remember**: Take one step at a time, reflect on progress, and adjust the approach based on what you learn. The goal is steady, measurable progress toward complete metric coverage.