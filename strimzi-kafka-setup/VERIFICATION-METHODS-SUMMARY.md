# MSK Data Verification Methods Summary

## Overview

We have created multiple ways to verify that the MSK shim is working and data is being transformed correctly. Choose the method that best fits your needs.

## Local Verification (No NRDB Access Required)

### 1. Test MSK Output Locally
```bash
node test-verification-locally.js
```
- ✅ No API key required
- ✅ Checks pod logs directly
- ✅ Verifies JSON output format
- ✅ Validates entity GUIDs
- ✅ Counts MSK entities

**Use when**: You want to quickly verify the integration is producing MSK entities without NRDB access.

## NRDB Verification (Requires API Key)

### Prerequisites
```bash
export UKEY=NRAK-XXXXXXXXXXXXXXXXXXXXXXXXX  # Your New Relic User API Key
export ACC=3630072                          # Optional: Account ID
```

### 2. Quick Shell Script Check
```bash
./quick-msk-check.sh
```
- ✅ Fast command-line check
- ✅ Basic entity counts
- ✅ Recent data verification
- ⚠️  Limited detail

**Use when**: You need a quick yes/no answer about data presence.

### 3. Complete MSK Verification
```bash
node verify-msk-entities-complete.js
```
- ✅ Comprehensive checks
- ✅ All entity types verified
- ✅ Metric validation
- ✅ Saves results to JSON
- ✅ Detailed reporting

**Use when**: You need thorough verification with detailed results.

### 4. Test Suite Format (DashBuilder)
```bash
cd ../DashBuilder-main
node verify-strimzi-msk-data.js
```
- ✅ Organized test suites
- ✅ Pass/fail for each test
- ✅ Expected vs actual validation
- ✅ Summary with success rate

**Use when**: You want structured test results with clear pass/fail status.

### 5. Kafka vs MSK Comparison
```bash
node compare-kafka-msk-data.js
```
- ✅ Side-by-side comparison
- ✅ Shows both entity types
- ✅ Metric value comparison
- ✅ Data freshness check

**Use when**: You want to see both standard and MSK entities together.

## Manual NRQL Verification

### In New Relic Query Builder

1. **Quick Entity Check**:
```sql
FROM AwsMskClusterSample, AwsMskBrokerSample 
SELECT count(*) 
WHERE provider.clusterName = 'strimzi-production-kafka' 
SINCE 1 hour ago
```

2. **Detailed Broker Metrics**:
```sql
FROM AwsMskBrokerSample 
SELECT * 
WHERE provider.clusterName = 'strimzi-production-kafka' 
LIMIT 1
```

3. **Entity GUIDs**:
```sql
FROM AwsMskBrokerSample 
SELECT uniques(entity.guid) 
WHERE provider.clusterName = 'strimzi-production-kafka'
```

## Decision Tree

```
Need to verify MSK data?
│
├─ Have NRDB API Key?
│  │
│  ├─ Need quick check? → quick-msk-check.sh
│  ├─ Need detailed analysis? → verify-msk-entities-complete.js
│  ├─ Want test suite format? → verify-strimzi-msk-data.js
│  └─ Compare with standard Kafka? → compare-kafka-msk-data.js
│
└─ No API Key?
   └─ Check locally → test-verification-locally.js
```

## Expected Results

### ✅ Success Indicators
- MSK entities present (AwsMskClusterSample, AwsMskBrokerSample)
- Entity GUIDs match format: `{accountId}|INFRA|AWSMSK{TYPE}|{base64}`
- Metrics prefixed with `aws.msk.` or `provider.`
- Recent data (< 5 minutes old)

### ❌ Failure Indicators
- No MSK entities found
- Only KafkaBrokerSample entities
- Invalid GUID format
- No recent data

## Troubleshooting Commands

```bash
# Check pod status
kubectl get pods -l app=nri-kafka-msk-custom -n newrelic

# View latest logs
kubectl logs -l app=nri-kafka-msk-custom -n newrelic --tail=100

# Check for MSK initialization
kubectl logs -l app=nri-kafka-msk-custom -n newrelic | grep -i "msk shim"

# See raw JSON output
kubectl logs -l app=nri-kafka-msk-custom -n newrelic | grep "com.newrelic.kafka" | tail -1 | jq .
```

## File Locations

All verification scripts are in:
- `/Users/deepaksharma/syc/hackathon-bootstrap/strimzi-kafka-setup/`
- `/Users/deepaksharma/syc/hackathon-bootstrap/DashBuilder-main/`

Results are saved with timestamps in the same directories.