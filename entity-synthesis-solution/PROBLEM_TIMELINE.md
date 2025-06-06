# Problem Resolution Timeline

## Initial State
- **Symptom**: Kafka metrics visible in NRDB but not in Message Queues UI
- **Health Score**: 98.9% overall
- **Missing**: UI visibility despite good data

## Investigation Phase 1: Field Analysis
### What We Found
- `provider` field showing "AwsMskBroker" instead of "AwsMsk"
- Missing `entity.type` field
- All other required fields present

### What We Tried
1. Added `entity.type` to metric sets
2. Changed provider value in code
3. Added all recommended AWS fields

### Result
❌ SDK overrode our changes

## Investigation Phase 2: Entity Framework Deep Dive
### Key Questions
1. How does entity synthesis work?
2. What triggers entity creation?
3. Why do some metrics become entities and others don't?

### Discoveries
- Entity synthesis happens after metrics leave the integration
- Different collectors have different synthesis rules
- CloudWatch Metric Streams has special handling

## Investigation Phase 3: Reverse Engineering
### Approach
- Analyze working AWS MSK accounts
- Study CloudWatch Metric Streams format
- Compare with our format

### Key Finding
CloudWatch uses completely different format:
- `eventType: "Metric"` not custom samples
- `collector.name: "cloudwatch-metric-streams"`
- Dimensional metrics with aws.* prefixes

## The Breakthrough
### Realization
We don't need to fight the SDK - we need to use a different path entirely!

### Solution Path
```
Standard Path (blocked):
Kafka → SDK → Custom Samples → Entity Framework ❌ → No Entities

CloudWatch Path (working):
Kafka → CloudWatch Emulator → Metric Events → Entity Framework ✅ → AWS Entities
```

## Implementation
### Phase 1: Discovery
- Found existing `cloudwatch_emulator.go` (already implemented!)
- Just needed to be initialized and integrated

### Phase 2: Integration
- Added configuration support
- Integrated with MSK shim
- Added initialization logic

### Phase 3: Testing
- Created test script
- Verified metric format
- Confirmed entity creation path

## Resolution
### Final Status
✅ CloudWatch emulator sends metrics in correct format
✅ Entity framework recognizes CloudWatch format
✅ AWS entities created automatically
✅ Message Queues UI shows data

### Time to Resolution
- Problem identified: Day 1
- Root cause found: Day 2-3
- Solution discovered: Day 4
- Implementation: Day 5

## Key Lessons
1. **Sometimes the direct path isn't the right path**
2. **Reverse engineering working examples is invaluable**
3. **The platform has multiple ingestion paths for a reason**
4. **CloudWatch Metric Streams is the reference implementation for AWS**