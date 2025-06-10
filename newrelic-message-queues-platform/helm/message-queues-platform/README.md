# New Relic Message Queues Platform Helm Chart

This Helm chart deploys the New Relic Message Queues Platform on a Kubernetes cluster.

## Prerequisites

- Kubernetes 1.16+
- Helm 3.0+
- New Relic account with API access

## Installation

### Add the Helm repository (if published)

```bash
helm repo add newrelic https://helm-charts.newrelic.com
helm repo update
```

### Install from local directory

```bash
helm install message-queues-platform ./helm/message-queues-platform \
  --set secrets.newrelic.accountId="YOUR_ACCOUNT_ID" \
  --set secrets.newrelic.apiKey="YOUR_API_KEY" \
  --set secrets.newrelic.ingestKey="YOUR_INGEST_KEY"
```

### Install with custom values

```bash
helm install message-queues-platform ./helm/message-queues-platform -f custom-values.yaml
```

## Configuration

The following table lists the configurable parameters and their default values.

| Parameter | Description | Default |
|-----------|-------------|---------|
| `replicaCount` | Number of replicas | `1` |
| `image.repository` | Image repository | `newrelic/message-queues-platform` |
| `image.tag` | Image tag | `1.0.0` |
| `image.pullPolicy` | Image pull policy | `IfNotPresent` |
| `platform.mode` | Platform mode (simulation/infrastructure/hybrid) | `simulation` |
| `platform.provider` | Message queue provider | `kafka` |
| `platform.interval` | Collection interval in seconds | `60` |
| `secrets.newrelic.accountId` | New Relic Account ID | `""` |
| `secrets.newrelic.apiKey` | New Relic User API Key | `""` |
| `secrets.newrelic.ingestKey` | New Relic Ingest Key | `""` |
| `secrets.newrelic.region` | New Relic region (us/eu) | `us` |
| `api.enabled` | Enable API server | `true` |
| `api.port` | API server port | `3000` |
| `monitoring.enabled` | Enable Prometheus monitoring | `true` |
| `autoscaling.enabled` | Enable horizontal pod autoscaling | `true` |
| `autoscaling.minReplicas` | Minimum number of replicas | `1` |
| `autoscaling.maxReplicas` | Maximum number of replicas | `3` |

## Examples

### Simulation Mode (Default)

```yaml
platform:
  mode: simulation
  provider: kafka
  simulation:
    clusters: 2
    brokers: 6
    topics: 10
    consumerGroups: 5
```

### Infrastructure Mode

```yaml
platform:
  mode: infrastructure
  provider: kafka
  enhancedCollector:
    enabled: true
    enableConsumerLagCollection: true
    enableDetailedTopicMetrics: true
```

### Hybrid Mode

```yaml
platform:
  mode: hybrid
  provider: kafka
  simulation:
    clusters: 1
    brokers: 3
    topics: 5
```

### With Ingress

```yaml
ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  hosts:
    - host: message-queues-platform.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: message-queues-platform-tls
      hosts:
        - message-queues-platform.example.com
```

### With Persistent Secrets

```yaml
secrets:
  encryption:
    enabled: true
    key: "your-32-char-encryption-key-here"

persistence:
  enabled: true
  size: 1Gi
  storageClass: fast-ssd
```

## Monitoring

The chart includes optional Prometheus monitoring:

```yaml
monitoring:
  enabled: true
  serviceMonitor:
    enabled: true
    interval: 30s
    path: /metrics
```

## Health Checks

The platform includes comprehensive health checks:

- **Liveness Probe**: `/health/live` - Checks if the application is alive
- **Readiness Probe**: `/health/ready` - Checks if the application is ready to serve traffic
- **Startup Probe**: `/health/startup` - Checks during application startup

## Scaling

### Horizontal Pod Autoscaler

```yaml
autoscaling:
  enabled: true
  minReplicas: 1
  maxReplicas: 5
  targetCPUUtilizationPercentage: 80
  targetMemoryUtilizationPercentage: 80
```

### Pod Disruption Budget

```yaml
podDisruptionBudget:
  enabled: true
  minAvailable: 1
```

## Security

### Pod Security Context

```yaml
podSecurityContext:
  fsGroup: 2000

securityContext:
  allowPrivilegeEscalation: false
  runAsNonRoot: true
  runAsUser: 1000
  capabilities:
    drop:
    - ALL
  readOnlyRootFilesystem: true
```

### Network Policies

```yaml
networkPolicy:
  enabled: true
  ingress:
    - from:
      - namespaceSelector:
          matchLabels:
            name: monitoring
  egress:
    - to: []
      ports:
      - protocol: TCP
        port: 443
```

## Troubleshooting

### Check pod status

```bash
kubectl get pods -l app.kubernetes.io/name=message-queues-platform
```

### View logs

```bash
kubectl logs -l app.kubernetes.io/name=message-queues-platform -f
```

### Check health

```bash
kubectl port-forward svc/message-queues-platform 3000:3000
curl http://localhost:3000/health
```

### Debug configuration

```bash
kubectl describe configmap message-queues-platform-config
kubectl describe secret message-queues-platform-secrets
```

## Uninstallation

```bash
helm uninstall message-queues-platform
```

## Support

For issues and questions:

- [GitHub Issues](https://github.com/your-org/newrelic-message-queues-platform/issues)
- [New Relic Community](https://discuss.newrelic.com/)