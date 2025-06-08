#!/usr/bin/env node

/**
 * Simulation Control Demo
 * 
 * Demonstrates the REST API and WebSocket functionality
 * for controlling the v2.0 simulation engine
 */

const axios = require('axios');
const WebSocket = require('ws');
const chalk = require('chalk');

class SimulationControlDemo {
  constructor() {
    this.apiUrl = 'http://localhost:3001';
    this.wsUrl = 'ws://localhost:3002';
    this.ws = null;
  }

  async run() {
    console.log(chalk.bold.magenta('\n🎮 Simulation Control Demo\n'));
    console.log('This demo shows the REST API and WebSocket control features\n');

    // Connect to WebSocket
    await this.connectWebSocket();

    // Demo sequence
    await this.checkHealth();
    await this.sleep(1000);
    
    await this.startSimulation();
    await this.sleep(5000);
    
    await this.adjustSpeed();
    await this.sleep(5000);
    
    await this.injectAnomaly();
    await this.sleep(10000);
    
    await this.pauseAndResume();
    await this.sleep(5000);
    
    await this.updatePatterns();
    await this.sleep(5000);
    
    await this.stopSimulation();
    
    // Cleanup
    this.disconnect();
    
    console.log(chalk.green('\n✅ Demo complete!\n'));
  }

  connectWebSocket() {
    return new Promise((resolve) => {
      console.log(chalk.cyan('🔌 Connecting to WebSocket...'));
      
      this.ws = new WebSocket(this.wsUrl);
      
      this.ws.on('open', () => {
        console.log(chalk.green('✅ WebSocket connected\n'));
        resolve();
      });
      
      this.ws.on('message', (data) => {
        const message = JSON.parse(data);
        this.handleWebSocketMessage(message);
      });
      
      this.ws.on('error', (error) => {
        console.error(chalk.red('❌ WebSocket error:'), error.message);
      });
    });
  }

  handleWebSocketMessage(message) {
    switch (message.type) {
      case 'metrics.update':
        // Sample first metric
        if (message.updates && message.updates.length > 0) {
          const metric = message.updates[0];
          const throughput = metric.goldenMetrics?.find(m => m.name.includes('throughput'));
          if (throughput) {
            console.log(chalk.gray(
              `[📡 Live] ${metric.entity.name}: ${throughput.value.toFixed(0)} ${throughput.unit}`
            ));
          }
        }
        break;
        
      case 'anomaly.injected':
        console.log(chalk.yellow(
          `⚠️  Anomaly injected: ${message.anomaly.type} (${message.anomaly.severity})`
        ));
        break;
        
      case 'anomaly.ended':
        console.log(chalk.green('✓ Anomaly resolved'));
        break;
        
      case 'simulation.started':
        console.log(chalk.green('▶️  Simulation started'));
        break;
        
      case 'simulation.stopped':
        console.log(chalk.red('⏹️  Simulation stopped'));
        break;
        
      case 'simulation.paused':
        console.log(chalk.yellow('⏸️  Simulation paused'));
        break;
        
      case 'simulation.resumed':
        console.log(chalk.green('▶️  Simulation resumed'));
        break;
        
      case 'speed.changed':
        console.log(chalk.blue(`🚜 Speed changed to ${message.speed}x`));
        break;
    }
  }

  async checkHealth() {
    console.log(chalk.cyan('🏥 Checking API health...'));
    
    try {
      const response = await axios.get(`${this.apiUrl}/health`);
      console.log(chalk.green('✅ API is healthy'));
      console.log(`   Status: ${response.data.status}`);
      console.log(`   Uptime: ${Math.floor(response.data.uptime)}s\n`);
    } catch (error) {
      console.error(chalk.red('❌ API health check failed'));
      throw error;
    }
  }

  async startSimulation() {
    console.log(chalk.cyan('\n🚀 Starting simulation...'));
    
    try {
      const response = await axios.post(`${this.apiUrl}/api/simulation/start`, {
        providers: ['kafka', 'rabbitmq'],
        scale: 'small'
      });
      
      console.log(chalk.green('✅ Simulation started'));
      console.log(`   Clusters: ${response.data.topology.clusters}`);
      console.log(`   Brokers: ${response.data.topology.brokers}`);
      console.log(`   Topics: ${response.data.topology.topics}\n`);
    } catch (error) {
      console.error(chalk.red('❌ Failed to start simulation'));
      throw error;
    }
  }

  async adjustSpeed() {
    console.log(chalk.cyan('\n⏩ Adjusting simulation speed...'));
    
    // Speed up
    await axios.post(`${this.apiUrl}/api/simulation/speed`, { speed: 2 });
    console.log('   Speed set to 2x');
    await this.sleep(3000);
    
    // Slow down
    await axios.post(`${this.apiUrl}/api/simulation/speed`, { speed: 0.5 });
    console.log('   Speed set to 0.5x');
    await this.sleep(3000);
    
    // Normal
    await axios.post(`${this.apiUrl}/api/simulation/speed`, { speed: 1 });
    console.log('   Speed set to 1x\n');
  }

  async injectAnomaly() {
    console.log(chalk.cyan('\n💥 Injecting anomalies...'));
    
    const anomalies = [
      { type: 'spike', severity: 'moderate' },
      { type: 'drop', severity: 'severe' },
      { type: 'drift', severity: 'mild' }
    ];
    
    for (const anomaly of anomalies) {
      await axios.post(`${this.apiUrl}/api/simulation/anomaly`, {
        ...anomaly,
        duration: 5000 // 5 seconds
      });
      console.log(`   Injected ${anomaly.type} (${anomaly.severity})`);
      await this.sleep(2000);
    }
    
    console.log('');
  }

  async pauseAndResume() {
    console.log(chalk.cyan('\n⏸️  Testing pause/resume...'));
    
    await axios.post(`${this.apiUrl}/api/simulation/pause`);
    console.log('   Simulation paused');
    
    await this.sleep(3000);
    
    await axios.post(`${this.apiUrl}/api/simulation/resume`);
    console.log('   Simulation resumed\n');
  }

  async updatePatterns() {
    console.log(chalk.cyan('\n🎨 Updating patterns...'));
    
    const newPatterns = {
      businessHours: { start: 8, end: 20 },
      anomalyProbability: 0.05,
      weekendReduction: 0.5
    };
    
    await axios.put(`${this.apiUrl}/api/simulation/patterns`, newPatterns);
    console.log('   Business hours: 8:00 - 20:00');
    console.log('   Anomaly probability: 5%');
    console.log('   Weekend reduction: 50%\n');
  }

  async stopSimulation() {
    console.log(chalk.cyan('\n🛑 Stopping simulation...'));
    
    await axios.post(`${this.apiUrl}/api/simulation/stop`);
    console.log(chalk.green('✅ Simulation stopped\n'));
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      console.log(chalk.gray('🔌 WebSocket disconnected'));
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run demo
if (require.main === module) {
  console.log(chalk.yellow('\n🚨 Make sure the API server is running:'));
  console.log(chalk.gray('   npm run api\n'));
  console.log('Starting demo in 3 seconds...\n');
  
  setTimeout(async () => {
    try {
      const demo = new SimulationControlDemo();
      await demo.run();
      process.exit(0);
    } catch (error) {
      console.error(chalk.red('\n❌ Demo failed:'), error.message);
      console.log(chalk.yellow('\nMake sure the API server is running:'));
      console.log(chalk.gray('   npm run api\n'));
      process.exit(1);
    }
  }, 3000);
}

module.exports = SimulationControlDemo;