/**
 * Health Check API Router
 * 
 * Express router providing health check endpoints for monitoring
 * and orchestration systems (Kubernetes, load balancers, etc.)
 */

const express = require('express');
const { getHealthCheckService } = require('../core/health/health-check');

const router = express.Router();

/**
 * GET /health
 * Basic health check endpoint
 */
router.get('/health', async (req, res) => {
  try {
    const healthService = getHealthCheckService();
    const health = await healthService.health();
    
    res.status(health.healthy ? 200 : 503).json(health);
  } catch (error) {
    res.status(503).json({
      healthy: false,
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /health/live
 * Kubernetes liveness probe endpoint
 * Returns 200 if application is alive, 503 if not
 */
router.get('/health/live', async (req, res) => {
  try {
    const healthService = getHealthCheckService();
    const liveness = await healthService.liveness();
    
    res.status(liveness.status === 'healthy' ? 200 : 503).json(liveness);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /health/ready
 * Kubernetes readiness probe endpoint
 * Returns 200 if ready to serve, 503 if not
 */
router.get('/health/ready', async (req, res) => {
  try {
    const healthService = getHealthCheckService();
    const readiness = await healthService.readiness();
    
    // Return 200 for healthy or degraded (partial availability)
    // Return 503 only for unhealthy (critical checks failing)
    const statusCode = readiness.status === 'unhealthy' ? 503 : 200;
    
    res.status(statusCode).json(readiness);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /health/startup
 * Kubernetes startup probe endpoint
 * Used during application initialization
 */
router.get('/health/startup', async (req, res) => {
  try {
    const healthService = getHealthCheckService();
    
    // For startup, we only check critical components
    const liveness = await healthService.liveness();
    
    res.status(liveness.status === 'healthy' ? 200 : 503).json({
      ...liveness,
      type: 'startup'
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      type: 'startup',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /metrics
 * Prometheus metrics endpoint
 */
router.get('/metrics', async (req, res) => {
  try {
    const { getPrometheusExporter } = require('../core/metrics/prometheus-exporter');
    const prometheusExporter = getPrometheusExporter();
    
    // Update metrics from health checks
    const healthService = getHealthCheckService();
    const healthResults = await healthService.readiness();
    prometheusExporter.updateHealthMetrics(healthResults);
    
    // Export metrics in Prometheus format
    const metricsText = prometheusExporter.export();
    
    res.type('text/plain');
    res.send(metricsText);
  } catch (error) {
    console.error('Error exporting Prometheus metrics:', error);
    res.status(500).type('text/plain').send('# Error exporting metrics\n');
  }
});

module.exports = router;