# JMX Configuration Guide for Kafka Monitoring

This guide consolidates all JMX-related configuration knowledge for monitoring Kafka with New Relic Infrastructure.

## Table of Contents
- [Overview](#overview)
- [Working Solutions](#working-solutions)
- [Root Cause Analysis](#root-cause-analysis)
- [Configuration Details](#configuration-details)
- [Verification Steps](#verification-steps)
- [Alternative Approaches](#alternative-approaches)
- [Troubleshooting](#troubleshooting)

## Overview

The New Relic Kafka integration requires JMX access to collect metrics from Kafka brokers. This guide documents the successful configurations and solutions for enabling JMX monitoring in Kubernetes environments.

## Working Solutions

### 1. StatefulSet with JMX Sidecar Pattern (Recommended)

The most reliable solution uses a StatefulSet with a JMX metrics exporter running as a sidecar container.

**Key Components:**
- Kafka broker with JMX enabled on port 9999
- JMX metrics sidecar container exposing metrics
- New Relic Kafka integration configured to scrape JMX metrics

**Files:**
- `kafka-working-jmx.yaml` - Complete working StatefulSet configuration
- `kafka-with-jmx-sidecar.yaml` - Alternative sidecar implementation

### 2. Direct JMX Connection (Simple Deployments)

For simpler deployments, direct JMX connection without authentication works reliably.

**Configuration:**
```yaml
KAFKA_JMX_OPTS: "-Dcom.sun.management.jmxremote -Dcom.sun.management.jmxremote.authenticate=false -Dcom.sun.management.jmxremote.ssl=false -Dcom.sun.management.jmxremote.port=9999 -Dcom.sun.management.jmxremote.rmi.port=9999 -Djava.rmi.server.hostname=0.0.0.0"
```

## Root Cause Analysis

### Issues Identified

1. **Port Binding Conflicts**
   - Problem: JMX RMI port conflicts when multiple brokers on same host
   - Solution: Use StatefulSet with stable network identities

2. **Authentication Failures**
   - Problem: JMX authentication preventing connections
   - Solution: Disable authentication for internal cluster communication

3. **Network Connectivity**
   - Problem: RMI callback issues in Kubernetes networking
   - Solution: Set proper hostname and use same port for JMX and RMI

### Technical Details

The JMX connection in Kubernetes faces unique challenges:
- Dynamic IP addresses
- Network policies
- Service discovery
- Container networking isolation

## Configuration Details

### Environment Variables

Essential JMX environment variables for Kafka:

```bash
# Core JMX settings
KAFKA_JMX_OPTS="-Dcom.sun.management.jmxremote \
  -Dcom.sun.management.jmxremote.authenticate=false \
  -Dcom.sun.management.jmxremote.ssl=false \
  -Dcom.sun.management.jmxremote.port=9999 \
  -Dcom.sun.management.jmxremote.rmi.port=9999 \
  -Djava.rmi.server.hostname=0.0.0.0"

# Port configuration
JMX_PORT=9999
KAFKA_JMX_PORT=9999
```

### New Relic Integration Configuration

```yaml
nri-kafka-config.yml: |
  integrations:
    - name: nri-kafka
      env:
        CLUSTER_NAME: "kafka-cluster"
        KAFKA_VERSION: "3.9.0"
        AUTODISCOVER_STRATEGY: "bootstrap"
        BOOTSTRAP_BROKER_HOST: "kafka-0.kafka-headless"
        BOOTSTRAP_BROKER_KAFKA_PORT: 9092
        BOOTSTRAP_BROKER_JMX_PORT: 9999
        COLLECT_BROKER_TOPIC_DATA: "true"
        LOCAL_ONLY_COLLECTION: "false"
        TOPIC_MODE: "all"
        COLLECT_TOPIC_SIZE: "false"
        CONSUMER_OFFSET: "false"
      interval: 30s
```

## Verification Steps

### 1. Check JMX Port Availability
```bash
kubectl exec -it kafka-0 -- bash -c "apt-get update && apt-get install -y netcat && nc -zv localhost 9999"
```

### 2. Test JMX Connection
```bash
kubectl port-forward kafka-0 9999:9999
# In another terminal:
jconsole localhost:9999
```

### 3. Verify Metrics Collection
```bash
kubectl logs -l app.kubernetes.io/name=nri-kafka -f | grep -E "(metric|JMX|error)"
```

### 4. Check New Relic for Data
Use NRQL to verify metrics:
```sql
FROM KafkaBrokerSample SELECT * WHERE clusterName = 'kafka-cluster' SINCE 5 minutes ago
```

## Alternative Approaches

### 1. Prometheus JMX Exporter

If direct JMX connection fails, use Prometheus JMX Exporter:

```yaml
containers:
- name: jmx-exporter
  image: sscaling/jmx-prometheus-exporter:0.12.0
  ports:
  - containerPort: 5556
  env:
  - name: SERVICE_PORT
    value: "5556"
  command:
  - java
  - -jar
  - jmx_prometheus_httpserver.jar
  - "5556"
  - /etc/jmx-exporter/config.yml
```

### 2. Jolokia Agent

Alternative JMX-to-HTTP bridge:
```bash
-javaagent:/opt/jolokia/jolokia.jar=port=8778,host=0.0.0.0
```

## Troubleshooting

### Common Issues and Solutions

1. **"Connection refused" errors**
   - Check if JMX port is properly exposed
   - Verify no firewall/network policies blocking access
   - Ensure JMX is enabled in Kafka startup options

2. **"Authentication failed" errors**
   - Verify authentication is disabled
   - Check for conflicting JMX configurations
   - Review Java security policies

3. **Intermittent connection failures**
   - Use StatefulSet instead of Deployment
   - Implement connection retry logic
   - Check resource limits and JVM heap settings

### Debug Commands

```bash
# Check JMX process
kubectl exec kafka-0 -- ps aux | grep jmx

# View JMX properties
kubectl exec kafka-0 -- cat /proc/$(pgrep -f kafka)/cmdline | tr '\0' '\n' | grep jmx

# Test connectivity from nri-kafka pod
kubectl exec -it <nri-kafka-pod> -- nc -zv kafka-0.kafka-headless 9999
```

## Best Practices

1. **Use StatefulSet for production deployments**
   - Provides stable network identities
   - Prevents port conflicts
   - Ensures consistent broker identification

2. **Monitor JMX connection health**
   - Set up alerts for connection failures
   - Implement health checks
   - Log connection attempts for debugging

3. **Security considerations**
   - Enable authentication in production
   - Use SSL for external connections
   - Restrict JMX access to monitoring namespace

## References

- [Kafka JMX Documentation](https://kafka.apache.org/documentation/#monitoring)
- [New Relic Kafka Integration](https://docs.newrelic.com/docs/integrations/host-integrations/host-integrations-list/kafka-monitoring-integration/)
- Working configuration files in this repository