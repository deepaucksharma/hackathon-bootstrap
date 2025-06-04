# Code Consolidation Review - MSK Shim Implementation

## Current State Analysis

### Multiple Implementations Found
The codebase currently has multiple versions of MSK shim implementations:

1. **Basic Shim** (`shim.go`)
2. **Enhanced Shim** (`shim_enhanced.go`)  
3. **Comprehensive Shim** (`shim_comprehensive.go`)
4. **Multiple Transformers**:
   - `transformer_simple.go`
   - `transformer_simple_fixed.go`
   - `transformer_enhanced.go`
   - `transformer_comprehensive.go`

### Current Integration Flow
From `src/kafka.go`:
- MSK shim is **always enabled** via `setDefaultMSKEnvironment()`
- Uses `msk.NewIntegrationHook()` which creates a `ComprehensiveMSKShim`
- Global hook is stored in `msk.GlobalMSKHook`

## Consolidation Plan

### 1. Single Shim Implementation
Merge all functionality into one clean implementation:

```go
// src/msk/shim.go - Consolidated version
type MSKShim struct {
    config       Config
    integration  *integration.Integration
    transformer  *Transformer
    aggregator   *MetricAggregator
    systemAPI    InfrastructureAPI
}
```

### 2. Single Transformer
Combine all transformer logic into one file with clear methods:

```go
// src/msk/transformer.go - Consolidated version
type Transformer struct {
    shim *MSKShim
}

func (t *Transformer) TransformBrokerMetrics(brokerID int32, brokerData map[string]interface{}) error
func (t *Transformer) TransformTopicMetrics(topicName string, topicData map[string]interface{}) error
func (t *Transformer) TransformConsumerOffset(offsetData map[string]interface{}) error
func (t *Transformer) CreateClusterEntity() error
```

### 3. Remove Duplicates
Files to remove after consolidation:
- `shim_enhanced.go`
- `shim_comprehensive.go`
- `transformer_simple.go`
- `transformer_simple_fixed.go`
- `transformer_enhanced.go`
- `transformer_comprehensive.go`
- `integration_enhanced.go`

### 4. Keep Essential Files
- `config.go` - Configuration management
- `guid.go` - Entity GUID generation
- `aggregator.go` - Metric aggregation
- `types.go` - Type definitions
- `metric_mapper.go` - Metric name mapping
- `shim_test.go` - Tests

## Key Functionality to Preserve

### 1. Core Transformations
- Broker metrics → AwsMskBrokerSample
- Topic metrics → AwsMskTopicSample
- Cluster aggregation → AwsMskClusterSample
- Consumer lag → Enhanced with MSK format

### 2. Entity Management
- GUID generation following AWS format
- Entity name conventions
- Proper entity relationships

### 3. Metric Mappings
All P0 and P1 metrics from the mapping table:
- Throughput: bytesInPerSec, bytesOutPerSec
- Messages: messagesInPerSec
- Replication: underReplicatedPartitions
- Resources: CPU, memory, disk usage

### 4. Configuration
Environment variables:
- MSK_SHIM_ENABLED=true (always)
- AWS_ACCOUNT_ID
- AWS_REGION
- KAFKA_CLUSTER_NAME

## Integration Points

### 1. Main Integration (`kafka.go`)
```go
// Simplified integration
mskHook := msk.NewMSKHook(kafkaIntegration)
if mskHook != nil {
    defer mskHook.Flush()
}
```

### 2. Broker Collection (`broker_collection.go`)
```go
// Transform broker metrics
if msk.GlobalMSKHook != nil {
    msk.GlobalMSKHook.TransformBrokerData(brokerID, brokerData)
}
```

### 3. Topic Collection
Similar pattern for topic metrics transformation

## Testing Verification

### 1. Unit Tests
- Test each transformation method
- Verify GUID generation
- Check metric aggregation

### 2. Integration Tests
- End-to-end flow with mock data
- Verify entity creation
- Check all metric mappings

## Implementation Steps

1. **Create consolidated shim.go**
   - Merge best features from all versions
   - Clean, simple interface
   - Proper error handling

2. **Create consolidated transformer.go**
   - All transformation logic in one place
   - Clear method names
   - Comprehensive metric coverage

3. **Update integration.go**
   - Simplify to use single shim type
   - Remove version selection logic

4. **Remove duplicate files**
   - Delete all enhanced/comprehensive versions
   - Keep only consolidated implementation

5. **Update tests**
   - Ensure all functionality is tested
   - Add missing test cases

## Benefits of Consolidation

1. **Clarity**: One clear implementation path
2. **Maintainability**: Easier to update and debug
3. **Performance**: Remove duplicate processing
4. **Consistency**: Single source of truth
5. **Testing**: Easier to test one implementation

## Next Steps

1. Implement consolidated version
2. Update all integration points
3. Test thoroughly
4. Remove duplicate files
5. Update documentation