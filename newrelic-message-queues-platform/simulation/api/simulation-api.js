/**
 * Simulation Control REST API
 * 
 * Provides HTTP endpoints for controlling the simulation engine:
 * - Start/stop/pause/resume simulation
 * - Adjust speed and patterns
 * - Inject anomalies
 * - Configure patterns
 */

const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const EntityFactory = require('../core/entities/entity-factory');
const EnhancedDataSimulator = require('../simulation/engines/enhanced-data-simulator');
const NewRelicStreamer = require('../simulation/streaming/new-relic-streamer');

class SimulationAPI {
  constructor(options = {}) {
    this.port = options.port || 3001;
    this.wsPort = options.wsPort || 3002;
    this.app = express();
    this.wss = null;
    
    // Initialize simulation components
    this.factory = new EntityFactory({
      accountId: options.accountId || process.env.NEW_RELIC_ACCOUNT_ID || 'YOUR_ACCOUNT_ID'
    });
    
    this.simulator = new EnhancedDataSimulator({
      enableAnomalies: true,
      enableBusinessPatterns: true,
      enableSeasonality: true,
      realTimeControl: true,
      advancedPatterns: true
    });
    
    this.streamer = options.ingestKey ? new NewRelicStreamer({
      accountId: options.accountId,
      ingestKey: options.ingestKey
    }) : null;
    
    // Simulation state
    this.state = {
      running: false,
      paused: false,
      speed: 1,
      topology: null,
      metrics: {},
      anomalies: [],
      patterns: {
        timezone: 'UTC',
        businessHours: { start: 9, end: 17 },
        weekendReduction: 0.3,
        anomalyProbability: 0.01
      }
    };
    
    // Setup middleware and routes
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static('public'));
    
    // Request logging
    this.app.use((req, res, next) => {
      console.log(`[API] ${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        simulation: this.state.running ? 'running' : 'stopped',
        uptime: process.uptime()
      });
    });

    // Simulation control endpoints
    this.app.post('/api/simulation/start', this.handleStart.bind(this));
    this.app.post('/api/simulation/stop', this.handleStop.bind(this));
    this.app.post('/api/simulation/pause', this.handlePause.bind(this));
    this.app.post('/api/simulation/resume', this.handleResume.bind(this));
    this.app.post('/api/simulation/reset', this.handleReset.bind(this));

    // Speed control
    this.app.post('/api/simulation/speed', this.handleSpeed.bind(this));
    this.app.get('/api/simulation/speed', (req, res) => {
      res.json({ speed: this.state.speed });
    });

    // Anomaly injection
    this.app.post('/api/simulation/anomaly', this.handleAnomaly.bind(this));
    this.app.get('/api/simulation/anomalies', (req, res) => {
      res.json({ anomalies: this.state.anomalies });
    });

    // Pattern configuration
    this.app.get('/api/simulation/patterns', (req, res) => {
      res.json(this.state.patterns);
    });
    this.app.put('/api/simulation/patterns', this.handlePatternUpdate.bind(this));
    this.app.post('/api/simulation/patterns/reset', this.handlePatternReset.bind(this));

    // Topology management
    this.app.get('/api/simulation/topology', (req, res) => {
      res.json(this.state.topology || { error: 'No topology created' });
    });
    this.app.post('/api/simulation/topology', this.handleTopologyCreate.bind(this));

    // Metrics endpoints
    this.app.get('/api/simulation/metrics', (req, res) => {
      res.json(this.state.metrics);
    });
    this.app.get('/api/simulation/metrics/:entityGuid', (req, res) => {
      const metrics = this.state.metrics[req.params.entityGuid];
      if (metrics) {
        res.json(metrics);
      } else {
        res.status(404).json({ error: 'Entity not found' });
      }
    });

    // State endpoint
    this.app.get('/api/simulation/state', (req, res) => {
      res.json(this.state);
    });
  }

  setupWebSocket() {
    this.wss = new WebSocket.Server({ port: this.wsPort });
    
    this.wss.on('connection', (ws) => {
      console.log('[WS] Client connected');
      
      // Send initial state
      ws.send(JSON.stringify({
        type: 'state',
        data: this.state
      }));
      
      ws.on('message', (message) => {
        try {
          const msg = JSON.parse(message);
          this.handleWebSocketMessage(ws, msg);
        } catch (error) {
          ws.send(JSON.stringify({
            type: 'error',
            error: 'Invalid message format'
          }));
        }
      });
      
      ws.on('close', () => {
        console.log('[WS] Client disconnected');
      });
    });
  }

  // API Handlers
  async handleStart(req, res) {
    if (this.state.running) {
      return res.status(400).json({ error: 'Simulation already running' });
    }

    try {
      // Create topology if not exists
      if (!this.state.topology) {
        await this.createDefaultTopology();
      }

      // Start simulation
      this.state.running = true;
      this.state.paused = false;
      this.startSimulation();

      res.json({
        status: 'started',
        topology: {
          clusters: this.state.topology.clusters.length,
          brokers: this.state.topology.brokers.length,
          topics: this.state.topology.topics.length
        }
      });

      this.broadcast({ type: 'simulation.started' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  handleStop(req, res) {
    if (!this.state.running) {
      return res.status(400).json({ error: 'Simulation not running' });
    }

    this.stopSimulation();
    this.state.running = false;
    this.state.paused = false;

    res.json({ status: 'stopped' });
    this.broadcast({ type: 'simulation.stopped' });
  }

  handlePause(req, res) {
    if (!this.state.running || this.state.paused) {
      return res.status(400).json({ error: 'Cannot pause' });
    }

    this.state.paused = true;
    if (this.simulationControl) {
      this.simulationControl.pause();
    }

    res.json({ status: 'paused' });
    this.broadcast({ type: 'simulation.paused' });
  }

  handleResume(req, res) {
    if (!this.state.running || !this.state.paused) {
      return res.status(400).json({ error: 'Cannot resume' });
    }

    this.state.paused = false;
    if (this.simulationControl) {
      this.simulationControl.resume();
    }

    res.json({ status: 'resumed' });
    this.broadcast({ type: 'simulation.resumed' });
  }

  handleReset(req, res) {
    this.stopSimulation();
    this.state = {
      running: false,
      paused: false,
      speed: 1,
      topology: null,
      metrics: {},
      anomalies: [],
      patterns: {
        timezone: 'UTC',
        businessHours: { start: 9, end: 17 },
        weekendReduction: 0.3,
        anomalyProbability: 0.01
      }
    };

    res.json({ status: 'reset' });
    this.broadcast({ type: 'simulation.reset' });
  }

  handleSpeed(req, res) {
    const { speed } = req.body;
    
    if (typeof speed !== 'number' || speed < 0.1 || speed > 10) {
      return res.status(400).json({ error: 'Speed must be between 0.1 and 10' });
    }

    this.state.speed = speed;
    if (this.simulationControl) {
      this.simulationControl.setSpeed(speed);
    }

    res.json({ speed });
    this.broadcast({ type: 'speed.changed', speed });
  }

  async handleAnomaly(req, res) {
    const { type = 'spike', severity = 'moderate', duration = 60000 } = req.body;
    
    if (!this.state.running) {
      return res.status(400).json({ error: 'Simulation not running' });
    }

    const anomaly = {
      id: Date.now(),
      type,
      severity,
      duration,
      startTime: Date.now(),
      endTime: Date.now() + duration,
      active: true
    };

    this.state.anomalies.push(anomaly);
    
    if (this.simulationControl) {
      this.simulationControl.injectAnomaly(type, severity);
    }

    // Auto-remove after duration
    setTimeout(() => {
      anomaly.active = false;
      this.broadcast({ type: 'anomaly.ended', anomaly });
    }, duration);

    res.json({ anomaly });
    this.broadcast({ type: 'anomaly.injected', anomaly });
  }

  handlePatternUpdate(req, res) {
    const updates = req.body;
    
    try {
      // Validate pattern updates
      if (updates.metricPatterns) {
        Object.entries(updates.metricPatterns).forEach(([metric, patterns]) => {
          if (!Array.isArray(patterns)) {
            throw new Error(`Invalid patterns for ${metric}`);
          }
        });
      }

      // Apply updates
      Object.assign(this.state.patterns, updates);

      res.json({ status: 'updated', patterns: this.state.patterns });
      this.broadcast({ type: 'patterns.updated', patterns: this.state.patterns });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  handlePatternReset(req, res) {
    // Reset to defaults
    this.state.patterns = {
      timezone: 'UTC',
      businessHours: { start: 9, end: 17 },
      weekendReduction: 0.3,
      anomalyProbability: 0.01,
      metricPatterns: {
        'cluster.throughput.total': ['business', 'weekly', 'seasonal'],
        'cluster.health.score': ['business', 'anomaly'],
        'topic.throughput.in': ['business', 'weekly'],
        'topic.throughput.out': ['business', 'weekly'],
        'topic.consumer.lag': ['business', 'anomaly'],
        'broker.cpu.usage': ['business'],
        'broker.memory.usage': ['business'],
        'queue.depth': ['business', 'weekly', 'anomaly'],
        'queue.processing.time': ['business']
      }
    };
    res.json({ status: 'reset', patterns: this.state.patterns });
    this.broadcast({ type: 'patterns.reset', patterns: this.state.patterns });
  }

  async handleTopologyCreate(req, res) {
    const { providers = ['kafka'], scale = 'small' } = req.body;
    
    try {
      const topology = await this.createTopology(providers, scale);
      this.state.topology = topology;
      
      res.json({
        status: 'created',
        topology: {
          clusters: topology.clusters.length,
          brokers: topology.brokers.length,
          topics: topology.topics.length
        }
      });
      
      this.broadcast({ type: 'topology.created', topology });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // WebSocket message handler
  handleWebSocketMessage(ws, msg) {
    switch (msg.type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
      
      case 'subscribe':
        // Client wants to subscribe to specific updates
        ws.subscriptions = msg.channels || ['all'];
        break;
      
      case 'control':
        // Direct control commands via WebSocket
        this.handleControlCommand(msg.command, msg.params);
        break;
      
      default:
        ws.send(JSON.stringify({
          type: 'error',
          error: 'Unknown message type'
        }));
    }
  }

  // Simulation control
  startSimulation() {
    // Set topology on simulator
    this.simulator.currentTopology = this.state.topology;
    
    // Enable control if method exists
    if (this.simulator.enableRealTimeControl) {
      this.simulationControl = this.simulator.enableRealTimeControl();
    }
    
    // Start metric updates
    this.simulationInterval = setInterval(() => {
      this.updateMetrics();
    }, 5000 / this.state.speed); // Adjust interval by speed
    
    console.log('[SIM] Simulation started');
  }

  stopSimulation() {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
    
    if (this.simulator.stopContinuousSimulation) {
      this.simulator.stopContinuousSimulation();
    }
    
    console.log('[SIM] Simulation stopped');
  }

  updateMetrics() {
    if (!this.state.topology || this.state.paused) return;
    
    const updates = [];
    
    // Update all entities
    [...this.state.topology.clusters,
     ...this.state.topology.brokers,
     ...this.state.topology.topics].forEach(entity => {
      // Update metrics
      if (entity.entityType === 'MESSAGE_QUEUE_CLUSTER') {
        this.simulator.updateClusterMetrics(entity);
      } else if (entity.entityType === 'MESSAGE_QUEUE_BROKER') {
        this.simulator.updateBrokerMetrics(entity);
      } else if (entity.entityType === 'MESSAGE_QUEUE_TOPIC') {
        this.simulator.updateTopicMetrics(entity);
      }
      
      // Store metrics
      this.state.metrics[entity.guid] = {
        entity: {
          guid: entity.guid,
          name: entity.name,
          type: entity.entityType
        },
        metrics: entity.metrics || {},
        goldenMetrics: entity.goldenMetrics || [],
        timestamp: Date.now()
      };
      
      updates.push(this.state.metrics[entity.guid]);
    });
    
    // Broadcast updates
    this.broadcast({
      type: 'metrics.update',
      updates,
      timestamp: Date.now()
    });
    
    // Stream to New Relic if configured
    if (this.streamer && !this.state.paused) {
      this.streamToNewRelic();
    }
  }

  async streamToNewRelic() {
    try {
      const events = [];
      [...this.state.topology.clusters,
       ...this.state.topology.brokers,
       ...this.state.topology.topics].forEach(entity => {
        events.push(this.streamer.createEvent(entity));
      });
      
      await this.streamer.sendEvents(events);
    } catch (error) {
      console.error('[STREAM] Error:', error.message);
    }
  }

  // Helper methods
  async createDefaultTopology() {
    return this.createTopology(['kafka'], 'small');
  }

  async createTopology(providers, scale) {
    const topology = {
      clusters: [],
      brokers: [],
      topics: []
    };
    
    const scales = {
      small: { brokers: 3, topics: 5 },
      medium: { brokers: 5, topics: 10 },
      large: { brokers: 10, topics: 20 }
    };
    
    const config = scales[scale] || scales.small;
    
    for (const provider of providers) {
      // Create cluster
      const cluster = this.factory.createCluster({
        name: `${provider}-cluster`,
        provider,
        accountId: this.factory.accountId
      });
      
      // Initialize metrics
      cluster.goldenMetrics = [
        { name: 'cluster.throughput.total', value: 1000, unit: 'messages/sec' },
        { name: 'cluster.health.score', value: 95, unit: 'percentage' },
        { name: 'cluster.availability', value: 99.9, unit: 'percentage' },
        { name: 'cluster.error.rate', value: 0.1, unit: 'percentage' }
      ];
      
      topology.clusters.push(cluster);
      
      // Create brokers
      for (let i = 0; i < config.brokers; i++) {
        const broker = this.factory.createBroker({
          clusterId: cluster.guid,
          name: `${provider}-broker-${i + 1}`,
          hostname: `${provider}-broker-${i + 1}.internal`,
          accountId: this.factory.accountId
        });
        
        broker.goldenMetrics = [
          { name: 'broker.cpu.usage', value: 30, unit: 'percentage' },
          { name: 'broker.memory.usage', value: 45, unit: 'percentage' },
          { name: 'broker.request.latency', value: 50, unit: 'milliseconds' },
          { name: 'broker.connection.count', value: 100, unit: 'connections' }
        ];
        
        topology.brokers.push(broker);
      }
      
      // Create topics
      const topicTypes = ['orders', 'events', 'logs', 'metrics', 'alerts'];
      for (let i = 0; i < config.topics; i++) {
        const topicType = topicTypes[i % topicTypes.length];
        const topic = this.factory.createTopic({
          clusterId: cluster.guid,
          name: `${provider}.${topicType}.v${Math.floor(i / topicTypes.length) + 1}`,
          accountId: this.factory.accountId
        });
        
        topic.goldenMetrics = [
          { name: 'topic.throughput.in', value: 100, unit: 'messages/sec' },
          { name: 'topic.throughput.out', value: 95, unit: 'messages/sec' },
          { name: 'topic.consumer.lag', value: 50, unit: 'messages' },
          { name: 'topic.retention.size', value: 1024, unit: 'megabytes' }
        ];
        
        topology.topics.push(topic);
      }
    }
    
    return topology;
  }

  broadcast(message) {
    if (!this.wss) return;
    
    const data = JSON.stringify(message);
    this.wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  start() {
    // Start REST API
    this.server = this.app.listen(this.port, () => {
      console.log(`[API] REST API listening on port ${this.port}`);
      console.log(`[API] WebSocket listening on port ${this.wsPort}`);
      console.log(`[API] Control panel: http://localhost:${this.port}`);
    });
    
    return this.server;
  }

  stop() {
    this.stopSimulation();
    
    if (this.server) {
      this.server.close();
    }
    
    if (this.wss) {
      this.wss.close();
    }
  }
}

module.exports = SimulationAPI;

// Start server if run directly
if (require.main === module) {
  const api = new SimulationAPI({
    port: process.env.API_PORT || 3001,
    wsPort: process.env.WS_PORT || 3002,
    accountId: process.env.NEW_RELIC_ACCOUNT_ID,
    ingestKey: process.env.NEW_RELIC_INGEST_KEY
  });
  
  api.start();
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[API] Shutting down...');
    api.stop();
    process.exit(0);
  });
}