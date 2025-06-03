# nri-kafka Documentation

## MSK Shim Documentation

The MSK shim enables self-managed Kafka clusters to be monitored through New Relic's AWS MSK Message Queues & Streams UI.

### 📚 Primary Documentation

1. **[README-MSK-SHIM.md](./README-MSK-SHIM.md)** - Complete implementation guide
   - Overview and quick start
   - Configuration options
   - Architecture and components
   - Troubleshooting guide

2. **[MSK-SHIM-UI-MAPPING.md](./MSK-SHIM-UI-MAPPING.md)** - Metric to UI mapping
   - Why each metric is collected
   - How metrics support specific UI features
   - Priority level justifications
   - NRQL query examples

3. **[msk-shim-unified-implementation.md](./msk-shim-unified-implementation.md)** - Technical implementation
   - Detailed code structure
   - Implementation patterns
   - Performance considerations

### 📋 Reference Documentation

4. **[msk-shim-integration.md](./msk-shim-integration.md)** - Original requirements
   - Complete metric mappings from PRD
   - AWS CloudWatch to MSK mapping tables
   - Historical context

5. **[msk-shim-final-summary.md](./msk-shim-final-summary.md)** - Quick reference
   - Executive summary
   - Implementation checklist
   - Quick test commands

### 📑 Index

- **[msk-shim-documentation-index.md](./msk-shim-documentation-index.md)** - Complete documentation guide

## Other Documentation

- **[Enhancements.md](./Enhancements.md)** - General nri-kafka enhancements
- **[metrics-comparison.md](./metrics-comparison.md)** - Kafka metrics comparison
- **[metrics-verification-report.md](./metrics-verification-report.md)** - Metrics verification

## Archived Documentation

Historical documentation from the MSK shim development has been moved to [`archive/msk-shim/`](./archive/msk-shim/) for reference.

---

*For questions or contributions, please refer to the main [nri-kafka README](../README.md)*