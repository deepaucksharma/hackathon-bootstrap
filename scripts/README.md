# Scripts Directory

This directory contains utility scripts organized by their purpose.

## Directory Structure

### debug/
Debugging and analysis tools:
- `debug-kafka.sh` - General Kafka debugging script
- `test-jmx-mbeans.sh` - Test and explore JMX MBeans
- `analyze-mbeans.py` - Python script for MBean analysis

### verify/
Verification and validation scripts:
- `master-verification.sh` - Comprehensive verification script for all deployments
- `quick-verify.sh` - Quick health check script

See [VERIFICATION-SCRIPTS.md](../docs/VERIFICATION-SCRIPTS.md) for detailed usage.

### msk/
MSK-specific scripts:
- `run-msk-dry-test.sh` - Run MSK integration in dry-run mode
- `test-msk-integration.sh` - Test MSK shim functionality

## Usage Examples

### Quick Verification
```bash
./scripts/verify/quick-verify.sh
```

### Full Verification with Troubleshooting
```bash
TEST_MODE=troubleshoot ./scripts/verify/master-verification.sh
```

### Debug JMX Connection
```bash
./scripts/debug/test-jmx-mbeans.sh localhost 9999
```

### Test MSK Integration
```bash
MSK_SHIM_ENABLED=true ./scripts/msk/test-msk-integration.sh
```