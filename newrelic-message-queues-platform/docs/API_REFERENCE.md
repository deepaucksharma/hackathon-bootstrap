# API Reference

Complete API documentation for the New Relic Message Queues Platform.

## Base URL

```
http://localhost:3000
```

## Authentication

Currently, the API does not require authentication for local deployments. In production, implement authentication using:
- API Keys
- OAuth 2.0
- mTLS

## Endpoints

### Health Check Endpoints

#### GET /health

Basic health check endpoint.

**Response**
```json
{
  "healthy": true,
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "1.0.0",
  "checks": {
    "config": {
      "healthy": true,
      "message": "Configuration valid",
      "duration": 2
    },
    "secrets": {
      "healthy": true,
      "message": "Secrets available",
      "duration": 5
    },
    "platform": {
      "healthy": true,
      "message": "Platform ready",
      "duration": 1
    }
  }
}
```

**Status Codes**
- `200 OK` - Platform is healthy
- `503 Service Unavailable` - Platform is unhealthy

---

#### GET /health/live

Kubernetes liveness probe endpoint. Checks if the application is alive.

**Response**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "checks": [
    {
      "name": "config",
      "healthy": true,
      "message": "Configuration valid",
      "duration": 2,
      "timestamp": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

**Status Codes**
- `200 OK` - Application is alive
- `503 Service Unavailable` - Application is not alive

---

#### GET /health/ready

Kubernetes readiness probe endpoint. Checks if the application is ready to serve traffic.

**Response**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "checks": [
    {
      "name": "config",
      "healthy": true,
      "message": "Configuration valid",
      "duration": 2,
      "timestamp": "2024-01-15T10:30:00.000Z"
    },
    {
      "name": "streaming",
      "healthy": true,
      "message": "Streaming service operational",
      "duration": 10,
      "timestamp": "2024-01-15T10:30:00.000Z"
    }
  ],
  "summary": {
    "total": 5,
    "healthy": 5,
    "unhealthy": 0,
    "critical": {
      "total": 3,
      "healthy": 3
    }
  }
}
```

**Status Codes**
- `200 OK` - Application is ready (healthy or degraded)
- `503 Service Unavailable` - Application is not ready (critical checks failing)

---

#### GET /health/startup

Kubernetes startup probe endpoint. Used during application initialization.

**Response**
```json
{
  "status": "healthy",
  "type": "startup",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "checks": [
    {
      "name": "config",
      "healthy": true,
      "message": "Configuration valid",
      "duration": 2,
      "timestamp": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

**Status Codes**
- `200 OK` - Application startup is healthy
- `503 Service Unavailable` - Application startup is unhealthy

---

### Monitoring Endpoints

#### GET /metrics

Prometheus metrics endpoint in text format.

**Response**
```text
# HELP platform_running Platform running status (1=running, 0=stopped)
# TYPE platform_running gauge
platform_running{mode="simulation",provider="kafka"} 1 1705316400000

# HELP platform_uptime_seconds Platform uptime in seconds
# TYPE platform_uptime_seconds counter
platform_uptime_seconds{mode="simulation"} 3600 1705316400000

# HELP entities_total Total number of entities by type
# TYPE entities_total gauge
entities_total{entity_type="MESSAGE_QUEUE_CLUSTER",provider="kafka"} 2 1705316400000
entities_total{entity_type="MESSAGE_QUEUE_BROKER",provider="kafka"} 6 1705316400000

# HELP streaming_events_sent_total Total events sent to New Relic
# TYPE streaming_events_sent_total counter
streaming_events_sent_total{type="events"} 1024 1705316400000

# HELP health_check_status Health check status (1=healthy, 0=unhealthy)
# TYPE health_check_status gauge
health_check_status{check_name="config",critical="true"} 1 1705316400000
```

**Status Codes**
- `200 OK` - Metrics exported successfully
- `500 Internal Server Error` - Error exporting metrics

---

#### GET /grafana/dashboard

Returns a Grafana dashboard configuration for the platform.

**Response**
```json
{
  "dashboard": {
    "id": null,
    "title": "New Relic Message Queues Platform",
    "tags": ["newrelic", "message-queues", "platform"],
    "panels": [
      {
        "id": 1,
        "title": "Platform Status",
        "type": "stat",
        "targets": [
          {
            "expr": "platform_running",
            "refId": "A"
          }
        ]
      }
    ]
  }
}
```

**Status Codes**
- `200 OK` - Dashboard configuration returned
- `500 Internal Server Error` - Failed to load dashboard

---

### Platform Information Endpoints

#### GET /info

Returns platform information.

**Response**
```json
{
  "name": "New Relic Message Queues Platform",
  "version": "1.0.0",
  "mode": "simulation",
  "uptime": 3600,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Status Codes**
- `200 OK` - Information returned successfully

---

#### GET /status

Returns detailed platform status.

**Response**
```json
{
  "platform": {
    "initialized": true,
    "running": true,
    "mode": "simulation"
  },
  "components": {
    "dataSimulator": {
      "running": true,
      "entityCount": 35
    },
    "streaming": {
      "totalSent": 1024,
      "totalFailed": 0,
      "circuitBreaker": "CLOSED"
    }
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Status Codes**
- `200 OK` - Status returned successfully
- `500 Internal Server Error` - Error retrieving status

---

### Platform Control Endpoints

#### POST /control/start

Starts the platform data collection.

**Request Body**
None required.

**Response**
```json
{
  "message": "Platform started",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Status Codes**
- `200 OK` - Platform started successfully
- `400 Bad Request` - Platform not available
- `500 Internal Server Error` - Error starting platform

---

#### POST /control/stop

Stops the platform data collection.

**Request Body**
None required.

**Response**
```json
{
  "message": "Platform stopped",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Status Codes**
- `200 OK` - Platform stopped successfully
- `400 Bad Request` - Platform not running
- `500 Internal Server Error` - Error stopping platform

---

## Error Responses

All endpoints may return error responses in the following format:

```json
{
  "error": "Error message",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Common Error Codes

| Status Code | Description |
|------------|-------------|
| 400 | Bad Request - Invalid request parameters |
| 404 | Not Found - Endpoint not found |
| 500 | Internal Server Error - Server error occurred |
| 503 | Service Unavailable - Service is not available |

## Rate Limiting

Currently, no rate limiting is implemented. In production, consider implementing:
- 100 requests per minute for health checks
- 10 requests per minute for control endpoints
- 1000 requests per minute for metrics

## Versioning

The API currently uses URL versioning. Future versions will be available at:
- `/v1/` - Current version
- `/v2/` - Future version

## Examples

### cURL Examples

#### Check Health
```bash
curl -X GET http://localhost:3000/health
```

#### Get Metrics
```bash
curl -X GET http://localhost:3000/metrics
```

#### Stop Platform
```bash
curl -X POST http://localhost:3000/control/stop
```

#### Start Platform
```bash
curl -X POST http://localhost:3000/control/start
```

### JavaScript/Node.js Examples

```javascript
const axios = require('axios');

// Check platform health
async function checkHealth() {
  try {
    const response = await axios.get('http://localhost:3000/health');
    console.log('Platform health:', response.data);
  } catch (error) {
    console.error('Health check failed:', error);
  }
}

// Get platform metrics
async function getMetrics() {
  try {
    const response = await axios.get('http://localhost:3000/metrics');
    console.log('Metrics:', response.data);
  } catch (error) {
    console.error('Failed to get metrics:', error);
  }
}

// Control platform
async function controlPlatform(action) {
  try {
    const response = await axios.post(`http://localhost:3000/control/${action}`);
    console.log(`Platform ${action}:`, response.data);
  } catch (error) {
    console.error(`Failed to ${action} platform:`, error);
  }
}
```

### Python Examples

```python
import requests

# Check platform health
def check_health():
    response = requests.get('http://localhost:3000/health')
    if response.status_code == 200:
        print(f"Platform is healthy: {response.json()}")
    else:
        print(f"Platform is unhealthy: {response.status_code}")

# Get platform metrics
def get_metrics():
    response = requests.get('http://localhost:3000/metrics')
    print(f"Metrics: {response.text}")

# Control platform
def control_platform(action):
    response = requests.post(f'http://localhost:3000/control/{action}')
    print(f"Platform {action}: {response.json()}")
```

## WebSocket Support (Future)

Future versions will support WebSocket connections for real-time updates:

```javascript
const ws = new WebSocket('ws://localhost:3000/ws');

ws.on('open', () => {
  console.log('Connected to platform');
  ws.send(JSON.stringify({ type: 'subscribe', topics: ['entities', 'metrics'] }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data);
  console.log('Received:', message);
});
```

## SDK Support

SDKs are planned for the following languages:
- JavaScript/TypeScript
- Python
- Go
- Java

## API Changelog

### Version 1.0.0 (Current)
- Initial API release
- Health check endpoints
- Metrics endpoint
- Platform control endpoints
- Basic information endpoints

### Version 1.1.0 (Planned)
- WebSocket support
- Authentication
- Rate limiting
- Additional metrics formats
- Entity query endpoints

## Support

For API support and questions:
- [GitHub Issues](https://github.com/your-org/newrelic-message-queues-platform/issues)
- [API Documentation](https://docs.example.com/api)
- [Developer Forum](https://forum.example.com)