# MSK Shim Implementation Guide

## Production Files

The MSK shim uses **enhanced original files** with all V2 features integrated:

```
src/msk/
├── shim.go                      # Main orchestrator (ENHANCED)
├── transformer.go               # Metric transformation (COMPREHENSIVE)
├── system_correlator.go         # System metrics (ENHANCED)
├── config.go                    # Configuration management
├── guid.go                      # Entity GUID generation
├── aggregator.go                # Metric aggregation
├── consumer_lag_enrichment.go   # Consumer lag calculation
├── metric_mapper.go             # JMX to MSK mapping
├── integration.go               # Integration hooks
└── metric_interceptor.go        # Metric utilities
```

## Key Enhancements in Production Files

### shim.go (Enhanced)
```go
type Shim struct {
    systemSampler    *SystemSampleCorrelator  // Enhanced with disk regex
    transformer      *MetricTransformer        // Comprehensive coverage
    lagEnricher      *ConsumerLagEnricher      // Added for consumer visibility
}
```

### transformer.go (Comprehensive)
- ✅ Fixed aggregation: MAX for under-replicated partitions (line 536-543)
- ✅ All 8 RequestMetrics per request type (line 169-210)
- ✅ Handler percentage conversion (line 321-323)
- ✅ Throttling metrics with version compatibility (line 337-358)

### system_correlator.go (Enhanced)
- ✅ Disk mount regex filtering (line 186-192)
- ✅ NetworkSample correlation (line 155-161)
- ✅ Separate data/log disk tracking (line 229-230)

## Integration Flow

```
1. kafka.go → msk.NewIntegrationHook()
2. broker_collection.go → mskHook.TransformBrokerData()
3. topic_collection.go → mskHook.TransformTopicData()
4. kafka.go → mskHook.Finalize() // Creates cluster entity
```

## Reference Files (Not Production)

```
src/msk/
├── shim_v2.go                   # Reference for future features
├── transformer_v2.go            # Reference for enhancements
├── system_correlator_v2.go      # Reference for disk filtering
└── integration_v2.go            # Reference for JMX validation
```

**Note:** V2 files are reference implementations. All features have been integrated into the main files.