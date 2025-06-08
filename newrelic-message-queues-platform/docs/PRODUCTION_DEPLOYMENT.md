# Production Deployment Guide

This guide covers deploying the New Relic Message Queues Platform in production environments.

## 📋 Prerequisites

### Required Components
- Node.js 14+ with npm
- New Relic account with appropriate permissions
- API Keys:
  - Ingest API Key (for data streaming)
  - User API Key (for dashboard creation)
  - Query Key (optional, for verification)

### Recommended Infrastructure
- **Compute**: 2+ CPU cores, 4GB+ RAM
- **Storage**: 10GB for logs and temporary data
- **Network**: Stable internet connection with HTTPS access
- **OS**: Linux (Ubuntu 20.04+ recommended) or macOS

## 🔐 Security Configuration

### 1. Environment Variables

Create a secure `.env` file:

```bash
# New Relic Credentials
NEW_RELIC_API_KEY=<your-ingest-api-key>
NEW_RELIC_USER_API_KEY=<your-user-api-key>
NEW_RELIC_ACCOUNT_ID=<your-account-id>
NEW_RELIC_QUERY_KEY=<your-query-key>
NEW_RELIC_REGION=US

# Platform Configuration
NEW_RELIC_CLUSTER_NAME=production-mq-platform
DEFAULT_PROVIDER=kafka
DEFAULT_ENVIRONMENT=production
DEFAULT_REGION=us-east-1

# Security Settings
NODE_ENV=production
LOG_LEVEL=info
ENABLE_DEBUG=false

# Performance Tuning
SIMULATION_BATCH_SIZE=100
STREAMING_FLUSH_INTERVAL=10000
MAX_CONCURRENT_REQUESTS=10
RATE_LIMIT_BUFFER=0.8
```

### 2. API Key Security

```bash
# Use environment-specific key storage
export NEW_RELIC_API_KEY=$(vault kv get -field=api_key secret/newrelic)

# Or use AWS Secrets Manager
export NEW_RELIC_API_KEY=$(aws secretsmanager get-secret-value \
  --secret-id newrelic/api-key \
  --query SecretString --output text)
```

## 🚀 Deployment Options

### Option 1: Docker Deployment

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy application
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
USER nodejs

# Expose metrics port
EXPOSE 3000

# Start application
CMD ["node", "production-server.js"]
```

Deploy with Docker:

```bash
# Build image
docker build -t nr-mq-platform:latest .

# Run container
docker run -d \
  --name nr-mq-platform \
  --env-file .env.production \
  -p 3000:3000 \
  --restart unless-stopped \
  nr-mq-platform:latest
```

### Option 2: Kubernetes Deployment

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nr-mq-platform
  labels:
    app: nr-mq-platform
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nr-mq-platform
  template:
    metadata:
      labels:
        app: nr-mq-platform
    spec:
      containers:
      - name: platform
        image: nr-mq-platform:latest
        ports:
        - containerPort: 3000
        env:
        - name: NEW_RELIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: newrelic-secrets
              key: api-key
        - name: NEW_RELIC_ACCOUNT_ID
          valueFrom:
            configMapKeyRef:
              name: platform-config
              key: account-id
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
```

### Option 3: Systemd Service

```ini
# /etc/systemd/system/nr-mq-platform.service
[Unit]
Description=New Relic Message Queues Platform
After=network.target

[Service]
Type=simple
User=nrplatform
Group=nrplatform
WorkingDirectory=/opt/nr-mq-platform
ExecStart=/usr/bin/node /opt/nr-mq-platform/production-server.js
Restart=always
RestartSec=10

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/nr-mq-platform/logs

# Environment
EnvironmentFile=/opt/nr-mq-platform/.env.production

[Install]
WantedBy=multi-user.target
```

## 📊 Production Configuration

### 1. Create Production Server

```javascript
// production-server.js
require('dotenv').config();
const express = require('express');
const DataSimulator = require('./simulation/engines/data-simulator');
const NewRelicStreamer = require('./simulation/streaming/new-relic-streamer');
const DashboardGenerator = require('./dashboards/lib/dashboard-generator');

const app = express();
const PORT = process.env.PORT || 3000;

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.json({
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage()
  });
});

// Initialize platform components
const simulator = new DataSimulator({
  businessHoursStart: 9,
  businessHoursEnd: 17,
  anomalyRate: 0.02
});

const streamer = new NewRelicStreamer({
  apiKey: process.env.NEW_RELIC_API_KEY,
  accountId: process.env.NEW_RELIC_ACCOUNT_ID,
  batchSize: parseInt(process.env.SIMULATION_BATCH_SIZE) || 100,
  flushInterval: parseInt(process.env.STREAMING_FLUSH_INTERVAL) || 10000
});

// Production streaming loop
async function streamProductionData() {
  try {
    // Create topology based on environment
    const topology = simulator.createTopology({
      provider: process.env.DEFAULT_PROVIDER,
      environment: process.env.DEFAULT_ENVIRONMENT,
      clusterCount: 5,
      brokersPerCluster: 20,
      topicsPerCluster: 100
    });

    // Stream entities
    const allEntities = [
      ...topology.clusters,
      ...topology.brokers,
      ...topology.topics
    ];
    
    await streamer.streamEvents(allEntities);

    // Continuous metric streaming
    setInterval(async () => {
      for (const cluster of topology.clusters) {
        simulator.updateClusterMetrics(cluster);
        streamer.streamMetrics(cluster);
      }
      
      for (const broker of topology.brokers) {
        simulator.updateBrokerMetrics(broker);
        streamer.streamMetrics(broker);
      }
      
      for (const topic of topology.topics) {
        simulator.updateTopicMetrics(topic);
        streamer.streamMetrics(topic);
      }
      
      await streamer.flushAll();
    }, 30000); // Every 30 seconds

  } catch (error) {
    console.error('Streaming error:', error);
    process.exit(1);
  }
}

// Start server
app.listen(PORT, () => {
  console.log(`Platform running on port ${PORT}`);
  streamProductionData();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await streamer.shutdown();
  process.exit(0);
});
```

### 2. Monitoring Configuration

```yaml
# monitoring.yaml
monitors:
  - name: Platform Health
    query: |
      SELECT latest(platform.uptime) as 'Uptime',
             latest(platform.memory.heapUsed) as 'Memory',
             latest(platform.streaming.rate) as 'Stream Rate'
      FROM PlatformMetrics
      WHERE appName = 'nr-mq-platform'
    
  - name: Streaming Performance
    query: |
      SELECT rate(sum(platform.events.sent), 1 minute) as 'Events/min',
             rate(sum(platform.metrics.sent), 1 minute) as 'Metrics/min',
             percentage(count(*), WHERE error IS NULL) as 'Success Rate'
      FROM PlatformStreaming
      TIMESERIES

alerts:
  - name: High Error Rate
    condition: percentage < 95
    duration: 5 minutes
    
  - name: Low Streaming Rate
    condition: eventsPerMinute < 1000
    duration: 10 minutes
```

## 🔄 Continuous Operations

### 1. Automated Dashboard Deployment

```javascript
// dashboard-deployer.js
const schedule = require('node-schedule');
const DashboardGenerator = require('./dashboards/lib/dashboard-generator');

// Deploy dashboards daily at 2 AM
schedule.scheduleJob('0 2 * * *', async () => {
  const generator = new DashboardGenerator();
  
  try {
    // Deploy overview dashboard
    await generator.generateOverviewDashboard({
      name: `MQ Overview - ${new Date().toISOString().split('T')[0]}`,
      deploy: true
    });
    
    // Deploy provider-specific dashboards
    for (const provider of ['kafka', 'rabbitmq', 'sqs']) {
      await generator.generateProviderSuite(provider, 'production');
    }
    
    console.log('Dashboards deployed successfully');
  } catch (error) {
    console.error('Dashboard deployment failed:', error);
  }
});
```

### 2. Data Retention Policy

```javascript
// retention-policy.js
const schedule = require('node-schedule');

// Clean up old simulation data weekly
schedule.scheduleJob('0 0 * * 0', async () => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 30);
  
  // Clean local logs
  const logsDir = './logs';
  const files = await fs.readdir(logsDir);
  
  for (const file of files) {
    const stats = await fs.stat(path.join(logsDir, file));
    if (stats.mtime < cutoffDate) {
      await fs.unlink(path.join(logsDir, file));
    }
  }
});
```

## 📈 Performance Tuning

### 1. Optimization Settings

```javascript
// config/production.js
module.exports = {
  streaming: {
    batchSize: 500,
    flushInterval: 5000,
    maxConcurrent: 20,
    retryAttempts: 5,
    retryDelay: 1000
  },
  
  simulation: {
    updateInterval: 30000,
    metricsPerEntity: 4,
    enableAnomalies: true,
    anomalyRate: 0.02
  },
  
  performance: {
    enableCaching: true,
    cacheTimeout: 300000,
    compressionLevel: 6,
    connectionPool: 10
  }
};
```

### 2. Resource Limits

```javascript
// Set memory limits
const v8 = require('v8');
v8.setFlagsFromString('--max-old-space-size=2048');

// Monitor memory usage
setInterval(() => {
  const usage = process.memoryUsage();
  if (usage.heapUsed / usage.heapTotal > 0.9) {
    console.warn('High memory usage detected');
    // Trigger garbage collection if needed
    if (global.gc) {
      global.gc();
    }
  }
}, 60000);
```

## 🚨 Troubleshooting

### Common Issues

1. **High Memory Usage**
   ```bash
   # Check memory consumption
   node --expose-gc production-server.js
   
   # Enable heap snapshots
   node --inspect production-server.js
   ```

2. **API Rate Limiting**
   ```javascript
   // Adjust rate limits
   const streamer = new NewRelicStreamer({
     rateLimitBuffer: 0.7, // Use only 70% of rate limit
     backoffMultiplier: 2,
     maxBackoffDelay: 30000
   });
   ```

3. **Connection Issues**
   ```javascript
   // Add connection retry logic
   const axiosRetry = require('axios-retry');
   axiosRetry(axios, {
     retries: 3,
     retryDelay: axiosRetry.exponentialDelay,
     retryCondition: (error) => {
       return error.code === 'ECONNRESET' || 
              error.code === 'ETIMEDOUT';
     }
   });
   ```

### Logging Configuration

```javascript
// winston-config.js
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'nr-mq-platform' },
  transports: [
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 10485760,
      maxFiles: 10
    })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}
```

## 📊 Monitoring Dashboards

Create monitoring dashboards for the platform itself:

```javascript
// platform-monitoring-dashboard.js
const dashboard = {
  name: 'Message Queue Platform Monitoring',
  pages: [{
    name: 'Platform Health',
    widgets: [
      {
        title: 'Platform Uptime',
        nrql: `SELECT latest(timestamp) FROM HealthCheck WHERE appName = 'nr-mq-platform'`,
        visualization: 'billboard'
      },
      {
        title: 'Streaming Rate',
        nrql: `SELECT rate(sum(events.sent), 1 minute) FROM PlatformMetrics TIMESERIES`,
        visualization: 'line'
      },
      {
        title: 'Error Rate',
        nrql: `SELECT percentage(count(*), WHERE error IS NOT NULL) FROM PlatformMetrics TIMESERIES`,
        visualization: 'area'
      },
      {
        title: 'Resource Usage',
        nrql: `SELECT latest(memory.heapUsed) / 1048576 as 'Heap (MB)', latest(cpu.user) as 'CPU %' FROM PlatformMetrics TIMESERIES`,
        visualization: 'line'
      }
    ]
  }]
};
```

## ✅ Production Checklist

- [ ] Environment variables configured securely
- [ ] API keys stored in secret management system
- [ ] Monitoring and alerting configured
- [ ] Log rotation implemented
- [ ] Backup procedures documented
- [ ] Disaster recovery plan created
- [ ] Performance baselines established
- [ ] Security audit completed
- [ ] Documentation updated
- [ ] Team trained on operations

---

For additional support, refer to the [Architecture Guide](ARCHITECTURE.md) and [API Reference](API_REFERENCE.md).