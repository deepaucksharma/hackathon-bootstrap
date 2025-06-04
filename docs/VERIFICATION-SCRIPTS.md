# Kafka Monitoring Verification Scripts

This document describes the consolidated verification scripts for Kafka monitoring with New Relic.

## Master Verification Script

### Overview
The `master-verification.sh` script is a comprehensive tool that consolidates all verification checks from multiple scripts into one unified solution.

### Usage
```bash
# Basic verification (quick checks only)
./scripts/verify/master-verification.sh

# Full verification (includes functional tests)
TEST_MODE=full ./scripts/verify/master-verification.sh

# Troubleshooting mode (includes advanced diagnostics)
TEST_MODE=troubleshoot ./scripts/verify/master-verification.sh

# Verbose output
VERBOSE=true ./scripts/verify/master-verification.sh

# Specific deployment type
DEPLOYMENT_TYPE=strimzi ./scripts/verify/master-verification.sh

# Custom namespaces
KAFKA_NAMESPACE=my-kafka NEWRELIC_NAMESPACE=monitoring ./scripts/verify/master-verification.sh
```

### Features
- **Auto-detection**: Automatically detects Kafka deployment type (standard/Strimzi/both)
- **Comprehensive checks**: Prerequisites, namespaces, pods, services, JMX, networking
- **Functional testing**: Creates topics, produces/consumes messages
- **Integration testing**: Tests nri-kafka execution with actual Kafka brokers
- **Advanced troubleshooting**: Log analysis, network policies, resource usage
- **Detailed reporting**: Color-coded results, failure summaries, recommendations

### Test Categories
1. **Basic Mode** (default):
   - Prerequisites and permissions
   - Pod and service status
   - JMX connectivity
   - Configuration verification

2. **Full Mode**:
   - All basic checks
   - Kafka functional tests
   - nri-kafka execution tests
   - Message production/consumption

3. **Troubleshoot Mode**:
   - All full mode checks
   - Log analysis
   - Network policy review
   - Resource usage analysis
   - Extended diagnostics

## Quick Verification Script

### Overview
The `quick-verify.sh` script provides rapid status checks for common scenarios.

### Usage
```bash
# Auto-detect and check
./scripts/verify/quick-verify.sh

# Check specific deployment
./scripts/verify/quick-verify.sh kafka
./scripts/verify/quick-verify.sh strimzi
./scripts/verify/quick-verify.sh both
```

### Features
- Fast execution (< 10 seconds)
- Essential health checks only
- Color-coded status output
- Perfect for CI/CD pipelines

## Specialized Scripts (Retained)

### k8s-deploy directory:
- `verify-deployment.sh` - Original comprehensive verification
- `test-kafka-metrics.sh` - Generate test data and verify metrics
- `test-nri-kafka-params.sh` - Test various nri-kafka parameters
- `troubleshoot-nri-kafka.sh` - Step-by-step troubleshooting

### strimzi-kafka-setup directory:
- `verify-strimzi-deployment.sh` - Strimzi-specific verification
- `realtime-monitor.sh` - Real-time monitoring dashboard

## Archived Scripts

The following scripts have been archived as their functionality is now incorporated into the master script:

### k8s-deploy/archives/scripts:
- `verify-jmx-fix.sh` - JMX-specific verification
- `verify-kafka-jmx.sh` - Deep JMX configuration checks
- `test-jmx-connection.sh` - Simple JMX connectivity test
- `test-kafka-images.sh` - Multi-image compatibility testing
- `comprehensive-jmx-troubleshoot.sh` - Advanced JMX troubleshooting

### strimzi-kafka-setup/archives/scripts:
- `automated-troubleshooter.sh` - Automated diagnosis and fixes
- `comprehensive-health-check.sh` - Detailed health analysis
- `end-to-end-test.sh` - Full functional testing

## Migration Guide

If you were using the archived scripts, here's how to achieve the same functionality:

| Old Script | New Command |
|------------|-------------|
| `verify-jmx-fix.sh` | `./scripts/verify/master-verification.sh` |
| `test-jmx-connection.sh` | `./scripts/verify/quick-verify.sh` |
| `comprehensive-jmx-troubleshoot.sh` | `TEST_MODE=troubleshoot ./scripts/verify/master-verification.sh` |
| `automated-troubleshooter.sh` | `TEST_MODE=troubleshoot VERBOSE=true ./scripts/verify/master-verification.sh` |
| `comprehensive-health-check.sh` | `TEST_MODE=full ./scripts/verify/master-verification.sh` |
| `end-to-end-test.sh` | `TEST_MODE=full ./scripts/verify/master-verification.sh` |

## Best Practices

1. **Regular Health Checks**: Run `scripts/verify/quick-verify.sh` regularly (e.g., every 5 minutes in monitoring)
2. **Post-Deployment**: Run `TEST_MODE=full ./scripts/verify/master-verification.sh` after any deployment
3. **Troubleshooting**: Start with `./scripts/verify/master-verification.sh`, then use `TEST_MODE=troubleshoot` if issues found
4. **CI/CD Integration**: Use `scripts/verify/quick-verify.sh` in pipelines for fast feedback

## Exit Codes

Both scripts use consistent exit codes:
- `0`: All checks passed
- `1`: One or more checks failed

This makes them suitable for automation and monitoring systems.