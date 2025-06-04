# MSK Shim Analysis - Strimzi Kafka Setup

## Current Status

### ✅ What's Working:
1. **Strimzi Kafka Cluster** - Running with 3 brokers in KRaft mode
2. **JMX Access** - Successfully disabled authentication, accessible on port 9999
3. **New Relic Integration** - nri-kafka connects and collects metrics
4. **Docker Build** - Successfully built custom nri-kafka image with MSK shim code

### ❌ Issue Discovered:
**The MSK shim code exists but is NOT integrated into the main execution path**

## Analysis

### 1. MSK Shim Code Structure
The repository contains full MSK shim implementation in `/src/msk/`:
- `shim.go` - Main shim implementation
- `transformer.go` - Metric transformation logic
- `config.go` - Configuration handling
- `metric_mapper.go` - Maps Kafka metrics to AWS MSK format

### 2. Integration Gap
The main `kafka.go` file does NOT:
- Import the MSK package
- Check for MSK_SHIM_ENABLED environment variable
- Initialize or use the MSK shim

### 3. Current Output
The integration outputs standard entities:
```json
{
  "event_type": "KafkaBrokerSample",
  "entity": {
    "type": "ka-broker"
  }
}
```

### 4. Expected MSK Output
With MSK shim enabled, it should output:
```json
{
  "event_type": "AwsMskBrokerSample",
  "entity": {
    "type": "AWSMSKBROKER"
  }
}
```

## Root Cause

The MSK shim functionality is **not wired into the main application**. The code exists as a separate module but the main execution path doesn't use it.

## Solutions

### Option 1: Modify Source Code (Requires Development)
Add MSK shim integration to `kafka.go`:
```go
import "github.com/newrelic/nri-kafka/src/msk"

// In main() function:
if os.Getenv("MSK_SHIM_ENABLED") == "true" {
    mskConfig := msk.LoadConfig()
    shim, err := msk.NewShim(kafkaIntegration, mskConfig)
    // Transform metrics through shim
}
```

### Option 2: Use Alternative Monitoring Approaches

#### A. Prometheus + Remote Write
1. Use existing Kafka Exporter (already running)
2. Configure Prometheus to scrape metrics
3. Use New Relic Prometheus Remote Write

#### B. OpenTelemetry Collector
1. Configure OTEL collector to scrape JMX
2. Transform metrics to New Relic format
3. Send via OTLP endpoint

#### C. Custom JMX Exporter
1. Deploy Prometheus JMX Exporter as sidecar
2. Use nri-prometheus to scrape metrics
3. Apply metric transformations

### Option 3: Use Standard Kafka Monitoring
Accept that data appears as `KafkaBrokerSample` instead of AWS MSK format. The metrics are still collected and available in New Relic.

## Verification Commands

```bash
# Check current metrics
kubectl logs -l app=nri-kafka-msk-custom -n newrelic | grep event_type

# Verify JMX connectivity
kubectl exec -it nri-kafka-msk-custom-<pod> -n newrelic -- \
  nc -zv production-kafka-dual-role-0.production-kafka-kafka-brokers.strimzi-kafka.svc 9999
```

## Recommendation

Since the MSK shim requires code changes to integrate properly, I recommend:

1. **Short term**: Use the standard nri-kafka integration. Data will be in NRDB as `KafkaBrokerSample`
2. **Medium term**: Implement Prometheus-based monitoring with the existing Kafka Exporter
3. **Long term**: If MSK format is required, fork and modify the integration to properly wire the MSK shim

## Next Steps

1. Clean up MSK deployment attempts
2. Continue with standard nri-kafka monitoring
3. Create dashboards for `KafkaBrokerSample` data
4. Consider alternative monitoring solutions if MSK format is mandatory