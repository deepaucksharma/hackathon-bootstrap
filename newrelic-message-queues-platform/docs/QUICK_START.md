# Quick Start Guide

Get the New Relic Message Queues Platform up and running in minutes!

## Prerequisites

- Docker and Docker Compose installed
- New Relic account with API access
- Node.js 18+ (for local development)
- Kubernetes cluster (optional, for production deployment)

## 🚀 5-Minute Local Setup

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/newrelic-message-queues-platform.git
cd newrelic-message-queues-platform
```

### 2. Set Up Environment Variables

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env with your New Relic credentials
cat > .env << EOF
NEW_RELIC_ACCOUNT_ID=your_account_id
NEW_RELIC_API_KEY=your_user_api_key
NEW_RELIC_INGEST_KEY=your_ingest_key
NEW_RELIC_REGION=us
EOF
```

### 3. Run with Docker Compose

```bash
# Start the platform in simulation mode
docker-compose up -d

# Check logs
docker-compose logs -f

# Access the API
curl http://localhost:3000/health
```

### 4. View Your Data

- Log into [New Relic One](https://one.newrelic.com)
- Navigate to Entity Explorer
- Filter by entity type: `MESSAGE_QUEUE_*`
- View your simulated message queue infrastructure!

## 🎯 Quick Deployment Options

### Option 1: Docker Run (Simplest)

```bash
docker run -d \
  --name message-queues-platform \
  -p 3000:3000 \
  -e NEW_RELIC_ACCOUNT_ID="your_account_id" \
  -e NEW_RELIC_API_KEY="your_api_key" \
  -e NEW_RELIC_INGEST_KEY="your_ingest_key" \
  -e MODE="simulation" \
  newrelic/message-queues-platform:latest
```

### Option 2: Kubernetes with kubectl

```bash
# Create namespace
kubectl create namespace message-queues

# Create secret
kubectl create secret generic message-queues-secrets \
  --from-literal=account-id="your_account_id" \
  --from-literal=api-key="your_api_key" \
  --from-literal=ingest-key="your_ingest_key" \
  --from-literal=region="us" \
  -n message-queues

# Apply manifests
kubectl apply -f k8s/ -n message-queues

# Check deployment
kubectl get pods -n message-queues
```

### Option 3: Helm Chart (Recommended for Production)

```bash
# Install with Helm
helm install message-queues-platform ./helm/message-queues-platform \
  --namespace message-queues \
  --create-namespace \
  --set secrets.newrelic.accountId="your_account_id" \
  --set secrets.newrelic.apiKey="your_api_key" \
  --set secrets.newrelic.ingestKey="your_ingest_key"

# Check status
helm status message-queues-platform -n message-queues
```

## 🔧 Platform Modes

### Simulation Mode (Default)
Perfect for testing and demos:

```bash
docker run -d \
  -e MODE="simulation" \
  -e CLUSTERS="2" \
  -e BROKERS="6" \
  -e TOPICS="20" \
  newrelic/message-queues-platform:latest
```

### Infrastructure Mode
Monitor real Kafka clusters:

```bash
docker run -d \
  -e MODE="infrastructure" \
  -e KAFKA_BOOTSTRAP_SERVERS="kafka1:9092,kafka2:9092" \
  newrelic/message-queues-platform:latest
```

### Hybrid Mode
Combine real and simulated data:

```bash
docker run -d \
  -e MODE="hybrid" \
  -e KAFKA_BOOTSTRAP_SERVERS="kafka1:9092" \
  -e SIMULATED_CLUSTERS="1" \
  newrelic/message-queues-platform:latest
```

## 📊 Monitoring Your Platform

### Health Checks

```bash
# Basic health
curl http://localhost:3000/health

# Kubernetes probes
curl http://localhost:3000/health/live   # Liveness
curl http://localhost:3000/health/ready  # Readiness

# Platform status
curl http://localhost:3000/status
```

### Metrics

```bash
# Prometheus metrics
curl http://localhost:3000/metrics

# Grafana dashboard
curl http://localhost:3000/grafana/dashboard > dashboard.json
# Import dashboard.json into Grafana
```

## 🎛️ Platform Control

### Start/Stop Platform

```bash
# Stop data collection
curl -X POST http://localhost:3000/control/stop

# Start data collection
curl -X POST http://localhost:3000/control/start
```

### View Platform Info

```bash
curl http://localhost:3000/info | jq
```

## 🔐 Secure Setup

### Using Encrypted Secrets

```bash
# Generate secrets
node scripts/generate-secrets.js

# Run with encrypted secrets
docker run -d \
  -v $(pwd)/.secrets:/app/.secrets:ro \
  -e SECRETS_ENCRYPTION_KEY="your_encryption_key" \
  newrelic/message-queues-platform:latest
```

## 🐛 Troubleshooting

### Check Logs

```bash
# Docker
docker logs message-queues-platform

# Kubernetes
kubectl logs -l app.kubernetes.io/name=message-queues-platform -n message-queues

# With debug mode
docker run -e DEBUG="*" newrelic/message-queues-platform:latest
```

### Common Issues

1. **No data in New Relic**
   - Verify API credentials
   - Check network connectivity
   - Look for errors in logs

2. **Platform won't start**
   - Check port 3000 availability
   - Verify environment variables
   - Check resource limits

3. **Kafka connection issues**
   - Verify KAFKA_BOOTSTRAP_SERVERS
   - Check network connectivity
   - Ensure Kafka is accessible

## 📚 Next Steps

1. **Explore the API**: See [API Documentation](./API_REFERENCE.md)
2. **Create Dashboards**: Use the [Dashboard Generator](./DASHBOARD_IMPLEMENTATION_GUIDE.md)
3. **Deploy to Production**: Follow the [Production Deployment Guide](./PRODUCTION_DEPLOYMENT.md)
4. **Customize**: Check the [Configuration Reference](./CONFIGURATION.md)

## 🆘 Getting Help

- [GitHub Issues](https://github.com/your-org/newrelic-message-queues-platform/issues)
- [Documentation](./README.md)
- [New Relic Community](https://discuss.newrelic.com/)

---

🎉 **Congratulations!** You now have the New Relic Message Queues Platform running!