/**
 * Control Panel Vue.js Application
 * 
 * Real-time control interface for the simulation engine
 */

new Vue({
  el: '#app',
  
  data: {
    // Connection state
    ws: null,
    connected: false,
    
    // Simulation state
    running: false,
    paused: false,
    speed: 1,
    uptime: 0,
    
    // Topology
    topology: null,
    
    // Metrics
    metrics: {},
    latestMetrics: {},
    
    // Anomalies
    anomalies: [],
    anomalyType: 'spike',
    anomalySeverity: 'moderate',
    
    // Patterns
    patterns: {
      timezone: 'UTC',
      businessHours: { start: 9, end: 17 },
      weekendReduction: 0.3,
      anomalyProbability: 0.01
    },
    
    // UI state
    loading: false,
    error: null,
    lastUpdate: null
  },
  
  computed: {
    simulationStatus() {
      if (!this.running) return 'stopped';
      if (this.paused) return 'paused';
      return 'running';
    },
    
    statusClass() {
      return `status-${this.simulationStatus}`;
    },
    
    activeAnomalies() {
      return this.anomalies.filter(a => a.active);
    }
  },
  
  methods: {
    // WebSocket connection
    connectWebSocket() {
      const wsUrl = `ws://localhost:3002`;
      console.log('Connecting to WebSocket:', wsUrl);
      
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.connected = true;
        this.error = null;
      };
      
      this.ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        this.handleWebSocketMessage(message);
      };
      
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.error = 'WebSocket connection error';
      };
      
      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.connected = false;
        // Reconnect after 5 seconds
        setTimeout(() => this.connectWebSocket(), 5000);
      };
    },
    
    handleWebSocketMessage(message) {
      switch (message.type) {
        case 'state':
          this.updateState(message.data);
          break;
          
        case 'metrics.update':
          this.updateMetrics(message.updates);
          this.lastUpdate = message.timestamp;
          break;
          
        case 'simulation.started':
          this.running = true;
          this.paused = false;
          this.showNotification('Simulation started', 'success');
          break;
          
        case 'simulation.stopped':
          this.running = false;
          this.paused = false;
          this.showNotification('Simulation stopped', 'info');
          break;
          
        case 'simulation.paused':
          this.paused = true;
          this.showNotification('Simulation paused', 'warning');
          break;
          
        case 'simulation.resumed':
          this.paused = false;
          this.showNotification('Simulation resumed', 'success');
          break;
          
        case 'speed.changed':
          this.speed = message.speed;
          break;
          
        case 'anomaly.injected':
          this.anomalies.push(message.anomaly);
          this.showNotification(`${message.anomaly.type} anomaly injected`, 'warning');
          break;
          
        case 'anomaly.ended':
          const anomaly = this.anomalies.find(a => a.id === message.anomaly.id);
          if (anomaly) anomaly.active = false;
          break;
          
        case 'topology.created':
          this.topology = message.topology;
          break;
          
        case 'patterns.updated':
          this.patterns = message.patterns;
          this.showNotification('Patterns updated', 'success');
          break;
      }
    },
    
    updateState(state) {
      this.running = state.running;
      this.paused = state.paused;
      this.speed = state.speed;
      this.topology = state.topology;
      this.anomalies = state.anomalies;
      this.patterns = state.patterns;
      this.metrics = state.metrics;
    },
    
    updateMetrics(updates) {
      // Update metrics and keep only latest 8 for display
      updates.forEach(update => {
        this.metrics[update.entity.guid] = update;
      });
      
      // Get latest metrics for display
      const sorted = Object.values(this.metrics)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 8);
      
      this.latestMetrics = {};
      sorted.forEach(m => {
        this.latestMetrics[m.entity.guid] = m;
      });
    },
    
    // API calls
    async startSimulation() {
      this.loading = true;
      try {
        await axios.post('http://localhost:3001/api/simulation/start');
      } catch (error) {
        this.showError('Failed to start simulation');
      }
      this.loading = false;
    },
    
    async stopSimulation() {
      this.loading = true;
      try {
        await axios.post('http://localhost:3001/api/simulation/stop');
      } catch (error) {
        this.showError('Failed to stop simulation');
      }
      this.loading = false;
    },
    
    async pauseSimulation() {
      try {
        await axios.post('http://localhost:3001/api/simulation/pause');
      } catch (error) {
        this.showError('Failed to pause simulation');
      }
    },
    
    async resumeSimulation() {
      try {
        await axios.post('http://localhost:3001/api/simulation/resume');
      } catch (error) {
        this.showError('Failed to resume simulation');
      }
    },
    
    async resetSimulation() {
      if (!confirm('Are you sure you want to reset the simulation?')) return;
      
      this.loading = true;
      try {
        await axios.post('http://localhost:3001/api/simulation/reset');
        this.showNotification('Simulation reset', 'info');
      } catch (error) {
        this.showError('Failed to reset simulation');
      }
      this.loading = false;
    },
    
    async updateSpeed() {
      try {
        await axios.post('http://localhost:3001/api/simulation/speed', {
          speed: parseFloat(this.speed)
        });
      } catch (error) {
        this.showError('Failed to update speed');
      }
    },
    
    async setSpeed(speed) {
      this.speed = speed;
      await this.updateSpeed();
    },
    
    async injectAnomaly() {
      try {
        await axios.post('http://localhost:3001/api/simulation/anomaly', {
          type: this.anomalyType,
          severity: this.anomalySeverity,
          duration: 60000 // 1 minute
        });
      } catch (error) {
        this.showError('Failed to inject anomaly');
      }
    },
    
    async updatePatterns() {
      try {
        await axios.put('http://localhost:3001/api/simulation/patterns', this.patterns);
      } catch (error) {
        this.showError('Failed to update patterns');
      }
    },
    
    async resetPatterns() {
      try {
        await axios.post('http://localhost:3001/api/simulation/patterns/reset');
        this.showNotification('Patterns reset to defaults', 'info');
      } catch (error) {
        this.showError('Failed to reset patterns');
      }
    },
    
    async loadState() {
      try {
        const response = await axios.get('http://localhost:3001/api/simulation/state');
        this.updateState(response.data);
      } catch (error) {
        console.error('Failed to load state:', error);
      }
    },
    
    async checkHealth() {
      try {
        const response = await axios.get('http://localhost:3001/health');
        this.uptime = response.data.uptime;
      } catch (error) {
        console.error('Health check failed:', error);
      }
    },
    
    // Formatting helpers
    formatMetricName(name) {
      return name.split('.').slice(-2).join(' ')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
    },
    
    formatMetricValue(value, unit) {
      if (unit === 'percentage') {
        return `${value.toFixed(1)}%`;
      }
      if (unit === 'milliseconds') {
        return `${value.toFixed(0)}ms`;
      }
      if (unit === 'messages/sec') {
        return `${value.toFixed(0)}/s`;
      }
      if (unit === 'megabytes') {
        return `${(value / 1024).toFixed(1)}GB`;
      }
      return value.toFixed(1);
    },
    
    getMetricColorClass(name, value) {
      if (name.includes('health') || name.includes('availability')) {
        return value > 90 ? 'text-green-600' : value > 70 ? 'text-yellow-600' : 'text-red-600';
      }
      if (name.includes('error') || name.includes('lag')) {
        return value < 1 ? 'text-green-600' : value < 5 ? 'text-yellow-600' : 'text-red-600';
      }
      if (name.includes('cpu') || name.includes('memory')) {
        return value < 50 ? 'text-green-600' : value < 80 ? 'text-yellow-600' : 'text-red-600';
      }
      return 'text-gray-800';
    },
    
    formatTimestamp(timestamp) {
      const date = new Date(timestamp);
      return date.toLocaleTimeString();
    },
    
    formatUptime(seconds) {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      return `${hours}h ${minutes}m ${secs}s`;
    },
    
    // UI helpers
    showNotification(message, type = 'info') {
      // In a real app, use a proper notification library
      console.log(`[${type.toUpperCase()}] ${message}`);
    },
    
    showError(message) {
      this.error = message;
      this.showNotification(message, 'error');
      setTimeout(() => {
        this.error = null;
      }, 5000);
    }
  },
  
  mounted() {
    // Connect to WebSocket
    this.connectWebSocket();
    
    // Load initial state
    this.loadState();
    
    // Start health check interval
    this.checkHealth();
    setInterval(() => this.checkHealth(), 5000);
  },
  
  beforeDestroy() {
    if (this.ws) {
      this.ws.close();
    }
  }
});