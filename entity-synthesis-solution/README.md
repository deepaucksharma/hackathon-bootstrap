# Entity Synthesis Solution for Kafka → AWS MSK UI

This folder contains the complete solution for making self-managed Kafka clusters appear in the New Relic Message Queues UI by mimicking AWS CloudWatch Metric Streams format.

## 📁 Contents

### Documentation
- **`COMPLETE_SYNTHESIS.md`** - Comprehensive overview of the entire solution
- **`PROBLEM_TIMELINE.md`** - Step-by-step journey of discovering the solution
- **`ENTITY_FRAMEWORK_SOLUTION.md`** - Technical details of the entity framework solution
- **`CLOUDWATCH_EMULATOR_SUMMARY.md`** - CloudWatch emulator implementation summary
- **`KEY_CODE_SNIPPETS.md`** - Important code examples and patterns

### Implementation
- **`cloudwatch_emulator.go`** - The CloudWatch emulator that transforms metrics
- **`test-cloudwatch-format.sh`** - Script to test the CloudWatch format implementation

### Analysis Tools
- **`entity-framework-analysis.js`** - Tool to analyze entity framework behavior
- **`reverse-engineer-msk.js`** - Tool to reverse engineer AWS MSK format

## 🚀 Quick Start

1. **Enable CloudWatch Format**:
   ```bash
   export MSK_USE_CLOUDWATCH_FORMAT=true
   export MSK_USE_DIMENSIONAL=true
   export NEW_RELIC_API_KEY=$IKEY
   ```

2. **Run Test Script**:
   ```bash
   ./test-cloudwatch-format.sh
   ```

3. **Verify Results**:
   - Check logs for "CloudWatch emulator initialized"
   - Query NRDB for CloudWatch metrics
   - Monitor Entity Explorer for AWS_KAFKA_* entities
   - Check Message Queues UI

## 🔑 Key Insight

The New Relic entity framework has special handling for CloudWatch Metric Streams. By mimicking this format exactly, we bypass SDK limitations and trigger proper AWS entity synthesis.

## 📊 Solution Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Kafka JMX     │────▶│    MSK Shim      │────▶│   CloudWatch    │
│   Metrics       │     │                  │     │   Emulator      │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                           │
                                                           ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Message Queues │◀────│ Entity Framework │◀────│   Metric API    │
│       UI        │     │ (AWS Synthesis)  │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

## 📝 Problem Summary

- **Issue**: Kafka metrics not appearing in Message Queues UI despite being in NRDB
- **Root Cause**: Entity synthesis rules don't work with custom event types
- **Solution**: Mimic CloudWatch Metric Streams format to trigger AWS entity synthesis

## ✅ Verification

When working correctly, you'll see:
1. Metrics with `collector.name: "cloudwatch-metric-streams"`
2. Entities with type `AWS_KAFKA_BROKER`, `AWS_KAFKA_CLUSTER`, etc.
3. Your Kafka cluster in the Message Queues UI

## 🛠️ Troubleshooting

If entities don't appear:
1. Ensure API key is set correctly
2. Check CloudWatch emulator logs
3. Verify metrics are being sent (query NRDB)
4. Wait 2-5 minutes for entity synthesis

## 📚 Learn More

Start with `COMPLETE_SYNTHESIS.md` for the full story, then explore the other documents based on your specific interests.