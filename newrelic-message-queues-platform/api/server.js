/**
 * API Server for Message Queues Platform
 * 
 * Provides REST API endpoints for health checks, metrics,
 * and platform management.
 */

const express = require('express');
const { getHealthCheckService } = require('../core/health/health-check');
const healthRouter = require('./health-router');

class ApiServer {
  constructor(platform, config = {}) {
    this.platform = platform;
    this.config = {
      port: config.port || process.env.API_PORT || 3000,
      host: config.host || process.env.API_HOST || '0.0.0.0',
      ...config
    };
    
    this.app = express();
    this.server = null;
    this._setupMiddleware();
    this._setupRoutes();
    this._registerHealthChecks();
  }

  /**
   * Setup Express middleware
   */
  _setupMiddleware() {
    // JSON parsing
    this.app.use(express.json());
    
    // Request logging
    this.app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
      });
      next();
    });
    
    // CORS headers
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      next();
    });
  }

  /**
   * Setup API routes
   */
  _setupRoutes() {
    // Health check routes
    this.app.use('/', healthRouter);
    
    // Platform info endpoint
    this.app.get('/info', (req, res) => {
      res.json({
        name: 'New Relic Message Queues Platform',
        version: require('../package.json').version || '1.0.0',
        mode: this.platform?.mode || 'unknown',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      });
    });
    
    // Platform status endpoint
    this.app.get('/status', async (req, res) => {
      try {
        const status = await this._getPlatformStatus();
        res.json(status);
      } catch (error) {
        res.status(500).json({
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Grafana dashboard endpoint
    this.app.get('/grafana/dashboard', (req, res) => {
      try {
        const dashboard = require('./grafana-dashboard.json');
        res.json(dashboard);
      } catch (error) {
        res.status(500).json({ error: 'Failed to load Grafana dashboard' });
      }
    });
    
    // Platform control endpoints
    this.app.post('/control/stop', async (req, res) => {
      try {
        if (this.platform && this.platform.stop) {
          await this.platform.stop();
          res.json({ message: 'Platform stopped', timestamp: new Date().toISOString() });
        } else {
          res.status(400).json({ error: 'Platform not running' });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    this.app.post('/control/start', async (req, res) => {
      try {
        if (this.platform && this.platform.start) {
          await this.platform.start();
          res.json({ message: 'Platform started', timestamp: new Date().toISOString() });
        } else {
          res.status(400).json({ error: 'Platform not available' });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not Found',
        path: req.path,
        timestamp: new Date().toISOString()
      });
    });
    
    // Error handler
    this.app.use((err, req, res, next) => {
      console.error('API Error:', err);
      res.status(500).json({
        error: err.message || 'Internal Server Error',
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Register platform-specific health checks
   */
  _registerHealthChecks() {
    const healthService = getHealthCheckService();
    
    // Register platform check
    if (this.platform) {
      healthService.registerPlatformCheck(this.platform);
    }
    
    // Register streaming check if available
    if (this.platform?.streamer) {
      healthService.registerStreamingCheck(this.platform.streamer);
    }
    
    // Register API server check
    healthService.registerCheck('api', async () => {
      return {
        healthy: this.server && this.server.listening,
        message: this.server?.listening ? 'API server running' : 'API server not started',
        details: {
          port: this.config.port,
          host: this.config.host,
          uptime: process.uptime()
        }
      };
    });
  }

  /**
   * Get platform status
   */
  async _getPlatformStatus() {
    const status = {
      platform: {
        initialized: this.platform?.initialized || false,
        running: false,
        mode: this.platform?.mode || 'unknown'
      },
      components: {},
      timestamp: new Date().toISOString()
    };
    
    if (this.platform) {
      // Data simulator status
      if (this.platform.dataSimulator) {
        status.components.dataSimulator = {
          running: this.platform.dataSimulator.isRunning || false,
          entityCount: this.platform.dataSimulator.entities?.size || 0
        };
        status.platform.running = status.components.dataSimulator.running;
      }
      
      // Infrastructure transformer status
      if (this.platform.infrastructureTransformer) {
        status.components.infrastructureTransformer = {
          available: true,
          hasKafkaConfig: !!this.platform.config?.kafkaBootstrapServers
        };
      }
      
      // Streaming status
      if (this.platform.streamer) {
        const stats = this.platform.streamer.getStats ? this.platform.streamer.getStats() : {};
        status.components.streaming = {
          totalSent: stats.totalSent || 0,
          totalFailed: stats.totalFailed || 0,
          circuitBreaker: this.platform.streamer.circuitBreaker?.state || 'N/A'
        };
      }
    }
    
    return status;
  }

  /**
   * Start the API server
   */
  async start() {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.config.port, this.config.host, () => {
          console.log(`API server listening on http://${this.config.host}:${this.config.port}`);
          console.log('Available endpoints:');
          console.log('  GET  /health         - Basic health check');
          console.log('  GET  /health/live    - Kubernetes liveness probe');
          console.log('  GET  /health/ready   - Kubernetes readiness probe');
          console.log('  GET  /health/startup - Kubernetes startup probe');
          console.log('  GET  /metrics        - Prometheus metrics');
          console.log('  GET  /grafana/dashboard - Grafana dashboard config');
          console.log('  GET  /info           - Platform information');
          console.log('  GET  /status         - Platform status');
          console.log('  POST /control/start  - Start platform');
          console.log('  POST /control/stop   - Stop platform');
          resolve();
        });
        
        this.server.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the API server
   */
  async stop() {
    return new Promise((resolve, reject) => {
      if (this.server) {
        this.server.close((err) => {
          if (err) {
            reject(err);
          } else {
            console.log('API server stopped');
            this.server = null;
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = ApiServer;