# Production Deployment Guide

This guide covers deploying the New Relic Message Queues Platform to production environments.

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Infrastructure Requirements](#infrastructure-requirements)
3. [Security Configuration](#security-configuration)
4. [Deployment Strategies](#deployment-strategies)
5. [Monitoring and Alerting](#monitoring-and-alerting)
6. [Scaling Considerations](#scaling-considerations)
7. [Disaster Recovery](#disaster-recovery)
8. [Maintenance Procedures](#maintenance-procedures)

## Pre-Deployment Checklist

### ✅ Required Information

- [ ] New Relic Account ID
- [ ] New Relic User API Key (with appropriate permissions)
- [ ] New Relic Ingest Key
- [ ] Target Kubernetes cluster access
- [ ] Container registry credentials
- [ ] TLS certificates (if using ingress)
- [ ] Monitoring endpoints configured

### ✅ Platform Configuration

- [ ] Determine platform mode (infrastructure/simulation/hybrid)
- [ ] Configure resource requirements based on scale
- [ ] Set up secrets management strategy
- [ ] Plan networking and security policies
- [ ] Define backup and recovery procedures

### ✅ Security Review

- [ ] API keys encrypted and stored securely
- [ ] Network policies defined
- [ ] RBAC policies configured
- [ ] Container security scanning completed
- [ ] Vulnerability assessment passed

## Infrastructure Requirements

### Minimum Requirements

#### Single Instance
```yaml
resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 1000m
    memory: 512Mi
```

#### High Availability (3 replicas)
```yaml
resources:
  requests:
    cpu: 200m
    memory: 256Mi
  limits:
    cpu: 2000m
    memory: 1Gi
```

### Recommended Infrastructure

#### Small Scale (< 100 clusters)
- 3 nodes (4 vCPU, 8GB RAM each)
- 100GB SSD storage
- 10Gbps network

#### Medium Scale (100-1000 clusters)
- 5 nodes (8 vCPU, 16GB RAM each)
- 500GB SSD storage
- 10Gbps network

#### Large Scale (> 1000 clusters)
- 10+ nodes (16 vCPU, 32GB RAM each)
- 1TB+ SSD storage
- 25Gbps+ network

## Security Configuration

### 1. Secrets Management

#### Using Kubernetes Secrets with Encryption

```bash
# Enable encryption at rest
kubectl apply -f - <<EOF
apiVersion: apiserver.config.k8s.io/v1
kind: EncryptionConfiguration
resources:
  - resources:
    - secrets
    providers:
    - aescbc:
        keys:
        - name: key1
          secret: $(head -c 32 /dev/urandom | base64)
    - identity: {}
EOF
```

#### Using External Secrets Operator

```bash
# Install External Secrets Operator
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets -n external-secrets-system --create-namespace

# Create SecretStore
kubectl apply -f - <<EOF
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: vault-backend
  namespace: message-queues
spec:
  provider:
    vault:
      server: "https://vault.example.com:8200"
      path: "secret"
      version: "v2"
      auth:
        kubernetes:
          mountPath: "kubernetes"
          role: "message-queues"
EOF
```

### 2. Network Security

#### Network Policies

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: message-queues-network-policy
  namespace: message-queues
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: message-queues-platform
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: monitoring
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    ports:
    - protocol: TCP
      port: 3000
  egress:
  - to:
    - namespaceSelector: {}
    ports:
    - protocol: TCP
      port: 443  # HTTPS for New Relic API
  - to:
    - namespaceSelector:
        matchLabels:
          name: kafka
    ports:
    - protocol: TCP
      port: 9092  # Kafka
```

### 3. Pod Security

#### Pod Security Policy

```yaml
apiVersion: policy/v1beta1
kind: PodSecurityPolicy
metadata:
  name: message-queues-psp
spec:
  privileged: false
  allowPrivilegeEscalation: false
  requiredDropCapabilities:
    - ALL
  volumes:
    - 'configMap'
    - 'emptyDir'
    - 'secret'
  hostNetwork: false
  hostIPC: false
  hostPID: false
  runAsUser:
    rule: 'MustRunAsNonRoot'
  seLinux:
    rule: 'RunAsAny'
  supplementalGroups:
    rule: 'RunAsAny'
  fsGroup:
    rule: 'RunAsAny'
  readOnlyRootFilesystem: true
```

## Deployment Strategies

### 1. Blue-Green Deployment

```bash
# Deploy green version
helm install message-queues-platform-green ./helm/message-queues-platform \
  --namespace message-queues \
  --set version=green \
  --set image.tag=v2.0.0

# Test green deployment
kubectl port-forward svc/message-queues-platform-green 3001:3000 -n message-queues
curl http://localhost:3001/health

# Switch traffic to green
kubectl patch service message-queues-platform \
  -p '{"spec":{"selector":{"version":"green"}}}'

# Remove blue deployment
helm uninstall message-queues-platform-blue -n message-queues
```

### 2. Canary Deployment

```yaml
# Using Flagger for automated canary deployments
apiVersion: flagger.app/v1beta1
kind: Canary
metadata:
  name: message-queues-platform
  namespace: message-queues
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: message-queues-platform
  service:
    port: 3000
  analysis:
    interval: 1m
    threshold: 10
    maxWeight: 50
    stepWeight: 5
    metrics:
    - name: request-success-rate
      thresholdRange:
        min: 99
      interval: 1m
    - name: request-duration
      thresholdRange:
        max: 500
      interval: 1m
```

### 3. Rolling Update

```bash
# Update with zero downtime
helm upgrade message-queues-platform ./helm/message-queues-platform \
  --namespace message-queues \
  --set image.tag=v2.0.0 \
  --set updateStrategy.type=RollingUpdate \
  --set updateStrategy.rollingUpdate.maxSurge=1 \
  --set updateStrategy.rollingUpdate.maxUnavailable=0 \
  --wait
```

## Monitoring and Alerting

### 1. Platform Metrics

#### Prometheus Configuration

```yaml
# prometheus-values.yaml
serverFiles:
  prometheus.yml:
    scrape_configs:
      - job_name: message-queues-platform
        kubernetes_sd_configs:
          - role: endpoints
            namespaces:
              names:
                - message-queues
        relabel_configs:
          - source_labels: [__meta_kubernetes_service_name]
            action: keep
            regex: message-queues-platform
```

#### Key Metrics to Monitor

```yaml
# Alert rules
groups:
  - name: message-queues-platform
    rules:
      - alert: PlatformDown
        expr: up{job="message-queues-platform"} == 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Message Queues Platform is down"
          
      - alert: HighErrorRate
        expr: rate(streaming_events_failed_total[5m]) > 0.05
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High error rate in event streaming"
          
      - alert: CircuitBreakerOpen
        expr: streaming_circuit_breaker_state == 1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Circuit breaker is open"
```

### 2. New Relic Monitoring

#### Create Alert Policy

```bash
# Using New Relic CLI
newrelic alert policy create \
  --name "Message Queues Platform" \
  --incident-preference PER_CONDITION

# Add conditions
newrelic alert condition create \
  --policy-id $POLICY_ID \
  --name "Platform Health" \
  --type "NRQL" \
  --nrql "SELECT percentage(count(*), WHERE health.status = 'healthy') FROM MessageQueuePlatformHealth WHERE appName = 'message-queues-platform'"
```

### 3. Logging

#### Structured Logging

```yaml
# Configure structured logging
apiVersion: v1
kind: ConfigMap
metadata:
  name: message-queues-platform-logging
data:
  fluent-bit.conf: |
    [SERVICE]
        Flush         5
        Log_Level     info
        Daemon        off

    [INPUT]
        Name              tail
        Path              /var/log/containers/*message-queues-platform*.log
        Parser            docker
        Tag               kube.*
        Refresh_Interval  5

    [OUTPUT]
        Name              http
        Match             *
        Host              api.newrelic.com
        Port              443
        URI               /log/v1
        Header            Api-Key ${NEW_RELIC_LICENSE_KEY}
        Format            json
        tls               on
```

## Scaling Considerations

### 1. Horizontal Pod Autoscaling

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: message-queues-platform-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: message-queues-platform
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  - type: Pods
    pods:
      metric:
        name: streaming_queue_size
      target:
        type: AverageValue
        averageValue: "1000"
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 10
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Percent
        value: 50
        periodSeconds: 60
      - type: Pods
        value: 2
        periodSeconds: 60
```

### 2. Vertical Pod Autoscaling

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: message-queues-platform-vpa
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: message-queues-platform
  updatePolicy:
    updateMode: "Auto"
  resourcePolicy:
    containerPolicies:
    - containerName: message-queues-platform
      minAllowed:
        cpu: 100m
        memory: 128Mi
      maxAllowed:
        cpu: 4
        memory: 4Gi
```

### 3. Cluster Autoscaling

```yaml
# For cloud providers
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cluster-autoscaler
  namespace: kube-system
spec:
  template:
    spec:
      containers:
      - image: k8s.gcr.io/autoscaling/cluster-autoscaler:v1.21.0
        name: cluster-autoscaler
        command:
        - ./cluster-autoscaler
        - --v=4
        - --stderrthreshold=info
        - --cloud-provider=aws
        - --skip-nodes-with-local-storage=false
        - --expander=least-waste
        - --node-group-auto-discovery=asg:tag=k8s.io/cluster-autoscaler/enabled,k8s.io/cluster-autoscaler/message-queues
```

## Disaster Recovery

### 1. Backup Strategy

#### Configuration Backup

```bash
#!/bin/bash
# backup-config.sh

BACKUP_DIR="/backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p $BACKUP_DIR

# Backup Helm values
helm get values message-queues-platform -n message-queues > $BACKUP_DIR/helm-values.yaml

# Backup secrets (encrypted)
kubectl get secret message-queues-platform-secrets -n message-queues -o yaml | \
  gpg --encrypt --recipient backup@example.com > $BACKUP_DIR/secrets.yaml.gpg

# Backup ConfigMaps
kubectl get configmap -n message-queues -o yaml > $BACKUP_DIR/configmaps.yaml

# Backup persistent data
kubectl exec -n message-queues deployment/message-queues-platform -- \
  tar czf - /app/data | gpg --encrypt --recipient backup@example.com > $BACKUP_DIR/data.tar.gz.gpg
```

### 2. Recovery Procedures

#### Full Recovery

```bash
#!/bin/bash
# restore-platform.sh

RESTORE_DIR=$1

# Restore namespace
kubectl create namespace message-queues || true

# Restore secrets
gpg --decrypt $RESTORE_DIR/secrets.yaml.gpg | kubectl apply -f -

# Restore ConfigMaps
kubectl apply -f $RESTORE_DIR/configmaps.yaml

# Restore Helm deployment
helm install message-queues-platform ./helm/message-queues-platform \
  --namespace message-queues \
  -f $RESTORE_DIR/helm-values.yaml

# Wait for deployment
kubectl wait --for=condition=available --timeout=600s \
  deployment/message-queues-platform -n message-queues

# Restore data
gpg --decrypt $RESTORE_DIR/data.tar.gz.gpg | \
  kubectl exec -i -n message-queues deployment/message-queues-platform -- \
  tar xzf - -C /
```

### 3. Failover Strategy

```yaml
# Multi-region deployment
regions:
  - name: us-east-1
    primary: true
    endpoint: https://us-east-1.message-queues.example.com
  - name: us-west-2
    primary: false
    endpoint: https://us-west-2.message-queues.example.com
  - name: eu-west-1
    primary: false
    endpoint: https://eu-west-1.message-queues.example.com

# Traffic management with Istio
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: message-queues-platform
spec:
  hosts:
  - message-queues.example.com
  http:
  - match:
    - headers:
        x-region:
          exact: us-west-2
    route:
    - destination:
        host: message-queues-platform.us-west-2.svc.cluster.local
  - route:
    - destination:
        host: message-queues-platform.us-east-1.svc.cluster.local
      weight: 90
    - destination:
        host: message-queues-platform.us-west-2.svc.cluster.local
      weight: 10
```

## Maintenance Procedures

### 1. Rolling Restarts

```bash
# Graceful rolling restart
kubectl rollout restart deployment/message-queues-platform -n message-queues

# Monitor restart progress
kubectl rollout status deployment/message-queues-platform -n message-queues

# Verify health after restart
kubectl exec -n message-queues deployment/message-queues-platform -- \
  curl -s http://localhost:3000/health | jq
```

### 2. Configuration Updates

```bash
# Update configuration without downtime
kubectl create configmap message-queues-platform-config-new \
  --from-file=config.yaml -n message-queues

# Patch deployment to use new ConfigMap
kubectl patch deployment message-queues-platform -n message-queues \
  -p '{"spec":{"template":{"spec":{"volumes":[{"name":"config","configMap":{"name":"message-queues-platform-config-new"}}]}}}}'

# Clean up old ConfigMap after verification
kubectl delete configmap message-queues-platform-config-old -n message-queues
```

### 3. Performance Tuning

```bash
# Analyze resource usage
kubectl top pods -n message-queues --containers

# Update resource limits based on usage
helm upgrade message-queues-platform ./helm/message-queues-platform \
  --namespace message-queues \
  --reuse-values \
  --set resources.requests.cpu=500m \
  --set resources.requests.memory=512Mi \
  --set resources.limits.cpu=2000m \
  --set resources.limits.memory=2Gi
```

## Production Checklist

### Pre-Production
- [ ] Security scan completed
- [ ] Load testing performed
- [ ] Disaster recovery tested
- [ ] Monitoring configured
- [ ] Alerts configured
- [ ] Documentation updated

### Go-Live
- [ ] DNS configured
- [ ] TLS certificates installed
- [ ] Backup job scheduled
- [ ] On-call rotation set up
- [ ] Runbooks created
- [ ] Stakeholders notified

### Post-Production
- [ ] Performance baseline established
- [ ] Capacity planning reviewed
- [ ] Cost optimization implemented
- [ ] Lessons learned documented
- [ ] Team training completed

## Support and Maintenance

### Regular Maintenance Tasks

| Task | Frequency | Description |
|------|-----------|-------------|
| Health Checks | Continuous | Automated monitoring via probes |
| Log Rotation | Daily | Rotate and archive logs |
| Backup Verification | Weekly | Test backup restoration |
| Security Patches | Monthly | Apply security updates |
| Performance Review | Quarterly | Analyze and optimize |
| DR Drill | Semi-Annual | Full disaster recovery test |

### Troubleshooting Resources

- Platform logs: `kubectl logs -n message-queues -l app.kubernetes.io/name=message-queues-platform`
- Metrics dashboard: `https://monitoring.example.com/d/message-queues`
- Alert runbooks: `https://wiki.example.com/message-queues/runbooks`
- On-call guide: `https://wiki.example.com/message-queues/oncall`

## Conclusion

Following this guide ensures a secure, scalable, and maintainable production deployment of the New Relic Message Queues Platform. Regular reviews and updates of these procedures help maintain optimal performance and reliability.