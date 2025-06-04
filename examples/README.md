# Configuration Examples

This directory contains example configuration files for various deployment scenarios.

## Directory Structure

### configs/
General configuration examples:
- `kafka-config.yml.sample` - Basic Kafka integration configuration
- `kafka-config.yml.k8s_sample` - Kubernetes-specific configuration
- `kafka-win-config.yml.sample` - Windows-specific configuration

### msk/
MSK-specific configurations:
- `kafka-msk-config.yml.sample` - MSK shim configuration example
- `kafka-msk-demo.yml` - Complete MSK demo configuration
- `jmx-config-msk.yml` - JMX configuration for MSK compatibility

## Usage

Copy the appropriate sample file and modify it for your environment:

```bash
# For standard Kafka deployment
cp examples/configs/kafka-config.yml.sample /etc/newrelic-infra/integrations.d/kafka-config.yml

# For MSK compatibility mode
cp examples/msk/kafka-msk-config.yml.sample /etc/newrelic-infra/integrations.d/kafka-config.yml
```

## Configuration Reference

### Standard Configuration
- Set broker connection details
- Configure JMX ports
- Enable/disable specific metrics
- Set collection intervals

### MSK Configuration
Additional settings for MSK compatibility:
- `MSK_SHIM_ENABLED: true`
- AWS account and region information
- Cluster name mapping

See [MSK Documentation](../docs/msk/README.md) for detailed configuration options.