#!/usr/bin/env node

/**
 * New Relic Message Queues Platform - Unified Launch Point
 * 
 * Single entry point for the entire project with comprehensive deployment,
 * monitoring, and dashboard generation capabilities.
 */

const chalk = require('chalk');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Project configuration
const PROJECT_CONFIG = {
  name: 'New Relic Message Queues Platform',
  version: '3.0.0',
  description: 'Unified platform for Kafka monitoring with v3.0 data model',
  minikube: {
    profile: 'kafka-monitoring',
    cpus: 4,
    memory: '8g',
    disk: '20g'
  },
  kafka: {
    namespace: 'kafka-system',
    replicas: 3,
    partitions: 12
  },
  monitoring: {
    interval: 30000,
    enableV3DataModel: true,
    enableDashboards: true
  }
};

class UnifiedLauncher {
  constructor() {
    this.state = {
      minikubeRunning: false,
      kafkaDeployed: false,
      monitoringActive: false,
      dashboardsGenerated: false
    };
    
    this.processes = [];
    this.setupSignalHandlers();
  }

  /**
   * Main entry point - show interactive menu
   */
  async main() {
    this.showWelcome();
    
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
      await this.showInteractiveMenu();
    } else {
      await this.handleCommand(args);
    }
  }

  /**
   * Show welcome message and project info
   */
  showWelcome() {
    console.log(chalk.bold.magenta(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║    🚀 ${PROJECT_CONFIG.name}                   ║
║                                                              ║
║    Version: ${PROJECT_CONFIG.version}                                        ║
║    ${PROJECT_CONFIG.description}            ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`));
  }

  /**
   * Show interactive menu for user selection
   */
  async showInteractiveMenu() {
    console.log(chalk.cyan('\n🎯 Available Actions:\n'));
    
    const options = [
      { key: '1', name: 'Quick Start (Deploy Everything)', cmd: 'quick-start' },
      { key: '2', name: 'Deploy Minikube + Kafka', cmd: 'deploy' },
      { key: '3', name: 'Start Monitoring Only', cmd: 'monitor' },
      { key: '4', name: 'Generate Dashboards Only', cmd: 'dashboards' },
      { key: '5', name: 'Full Demo (Deploy + Monitor + Dashboards)', cmd: 'demo' },
      { key: '6', name: 'Status Check', cmd: 'status' },
      { key: '7', name: 'Clean Up Everything', cmd: 'cleanup' },
      { key: '8', name: 'Show Help', cmd: 'help' },
      { key: 'q', name: 'Quit', cmd: 'quit' }
    ];

    options.forEach(option => {
      console.log(chalk.gray(`  ${option.key}. ${option.name}`));
    });

    console.log(chalk.cyan('\nEnter your choice (1-8 or q): '));
    
    // Simple input handling for demo purposes
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    
    return new Promise((resolve) => {
      process.stdin.once('data', async (key) => {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        
        const choice = key.toString().trim();
        const option = options.find(opt => opt.key === choice);
        
        if (option) {
          console.log(chalk.green(`\n✅ Selected: ${option.name}\n`));
          
          if (option.cmd === 'quit') {
            console.log(chalk.yellow('👋 Goodbye!'));
            process.exit(0);
          } else {
            await this.handleCommand([option.cmd]);
          }
        } else {
          console.log(chalk.red('\n❌ Invalid choice. Please try again.\n'));
          await this.showInteractiveMenu();
        }
        
        resolve();
      });
    });
  }

  /**
   * Handle command line arguments
   */
  async handleCommand(args) {
    const command = args[0];
    const options = args.slice(1);

    try {
      switch (command) {
        case 'quick-start':
          await this.quickStart();
          break;
        case 'deploy':
          await this.deployInfrastructure();
          break;
        case 'monitor':
          await this.startMonitoring(options);
          break;
        case 'dashboards':
          await this.generateDashboards(options);
          break;
        case 'demo':
          await this.runFullDemo();
          break;
        case 'status':
          await this.showStatus();
          break;
        case 'cleanup':
          await this.cleanup();
          break;
        case 'help':
          this.showHelp();
          break;
        default:
          console.log(chalk.red(`❌ Unknown command: ${command}`));
          this.showHelp();
      }
    } catch (error) {
      console.error(chalk.red(`❌ Command failed: ${error.message}`));
      process.exit(1);
    }
  }

  /**
   * Quick start - deploy everything and start monitoring
   */
  async quickStart() {
    console.log(chalk.bold.cyan('🚀 Quick Start: Deploying entire platform...\n'));
    
    await this.checkPrerequisites();
    await this.deployInfrastructure();
    await this.startMonitoring(['--background']);
    await this.generateDashboards(['--open']);
    
    console.log(chalk.bold.green('\n🎉 Quick start complete! Platform is running.\n'));
    this.showStatus();
  }

  /**
   * Deploy minikube and Kafka infrastructure
   */
  async deployInfrastructure() {
    console.log(chalk.bold.blue('🏗️  Deploying Infrastructure...\n'));
    
    // Check if minikube is installed
    await this.checkMinikube();
    
    // Start minikube
    await this.startMinikube();
    
    // Deploy Kafka
    await this.deployKafka();
    
    // Deploy monitoring components
    await this.deployMonitoring();
    
    console.log(chalk.green('\n✅ Infrastructure deployment complete!\n'));
  }

  /**
   * Check if minikube is installed
   */
  async checkMinikube() {
    console.log(chalk.gray('Checking minikube installation...'));
    
    try {
      await this.execCommand('minikube version');
      console.log(chalk.green('✅ Minikube is installed'));
    } catch (error) {
      console.log(chalk.red('❌ Minikube not found. Please install minikube first.'));
      console.log(chalk.gray('Install from: https://minikube.sigs.k8s.io/docs/start/'));
      throw new Error('Minikube not installed');
    }
  }

  /**
   * Start minikube cluster
   */
  async startMinikube() {
    console.log(chalk.gray('Starting minikube cluster...'));
    
    // Check if already running
    try {
      const status = await this.execCommand('minikube status --profile=' + PROJECT_CONFIG.minikube.profile);
      if (status.includes('Running')) {
        console.log(chalk.green('✅ Minikube cluster already running'));
        this.state.minikubeRunning = true;
        return;
      }
    } catch (error) {
      // Cluster not running, continue with start
    }
    
    const startCmd = `minikube start --profile=${PROJECT_CONFIG.minikube.profile} ` +
                    `--cpus=${PROJECT_CONFIG.minikube.cpus} ` +
                    `--memory=${PROJECT_CONFIG.minikube.memory} ` +
                    `--disk-size=${PROJECT_CONFIG.minikube.disk} ` +
                    `--addons=dashboard,metrics-server`;
    
    console.log(chalk.gray(`Running: ${startCmd}`));
    await this.execCommand(startCmd);
    
    console.log(chalk.green('✅ Minikube cluster started'));
    this.state.minikubeRunning = true;
  }

  /**
   * Deploy Kafka to minikube
   */
  async deployKafka() {
    console.log(chalk.gray('Deploying Kafka cluster...'));
    
    // Create namespace
    await this.execCommand(`kubectl create namespace ${PROJECT_CONFIG.kafka.namespace} --dry-run=client -o yaml | kubectl apply -f -`);
    
    // Create Kafka deployment YAML
    const kafkaYaml = this.generateKafkaYaml();
    fs.writeFileSync('/tmp/kafka-deployment.yaml', kafkaYaml);
    
    // Apply Kafka deployment
    await this.execCommand('kubectl apply -f /tmp/kafka-deployment.yaml');
    
    // Wait for Kafka to be ready
    console.log(chalk.gray('Waiting for Kafka pods to be ready...'));
    await this.execCommand(`kubectl wait --for=condition=ready pod -l app=kafka -n ${PROJECT_CONFIG.kafka.namespace} --timeout=300s`);
    
    console.log(chalk.green('✅ Kafka cluster deployed'));
    this.state.kafkaDeployed = true;
  }

  /**
   * Deploy monitoring components
   */
  async deployMonitoring() {
    console.log(chalk.gray('Deploying monitoring components...'));
    
    // Deploy nri-kafka as a DaemonSet
    const monitoringYaml = this.generateMonitoringYaml();
    fs.writeFileSync('/tmp/monitoring-deployment.yaml', monitoringYaml);
    
    await this.execCommand('kubectl apply -f /tmp/monitoring-deployment.yaml');
    
    console.log(chalk.green('✅ Monitoring components deployed'));
  }

  /**
   * Start monitoring platform
   */
  async startMonitoring(options = []) {
    console.log(chalk.bold.blue('📊 Starting Monitoring Platform...\n'));
    
    const isBackground = options.includes('--background');
    const dryRun = options.includes('--dry-run');
    
    // Import and start the platform
    const MessageQueuesPlatform = require('./platform');
    
    const config = {
      mode: 'infrastructure',
      accountId: process.env.NEW_RELIC_ACCOUNT_ID || '123456',
      apiKey: process.env.NEW_RELIC_USER_API_KEY || 'demo-key',
      ingestKey: process.env.NEW_RELIC_INGEST_KEY || 'demo-ingest-key',
      dryRun: dryRun || !process.env.NEW_RELIC_ACCOUNT_ID,
      interval: PROJECT_CONFIG.monitoring.interval,
      enableV3DataModel: PROJECT_CONFIG.monitoring.enableV3DataModel,
      infrastructure: {
        interval: PROJECT_CONFIG.monitoring.interval
      }
    };
    
    console.log(chalk.cyan(`Configuration:`));
    console.log(chalk.gray(`  Mode: ${config.mode}`));
    console.log(chalk.gray(`  Account ID: ${config.accountId}`));
    console.log(chalk.gray(`  Dry Run: ${config.dryRun ? 'Yes' : 'No'}`));
    console.log(chalk.gray(`  Interval: ${config.interval}ms`));
    console.log('');
    
    try {
      const platform = new MessageQueuesPlatform(config);
      
      // Set up event listeners
      platform.on('infrastructure.updated', (data) => {
        console.log(chalk.green(`📈 Infrastructure update: ${data.entities} entities, ${data.events} events`));
      });
      
      platform.on('error', (error) => {
        console.error(chalk.red('❌ Platform error:'), error.message);
      });
      
      // Start the platform
      await platform.start();
      
      console.log(chalk.green('✅ Monitoring platform started'));
      this.state.monitoringActive = true;
      
      if (isBackground) {
        console.log(chalk.gray('Running in background mode...'));
        return platform;
      } else {
        console.log(chalk.cyan('\n🔄 Monitoring active. Press Ctrl+C to stop.\n'));
        
        // Keep running until interrupted
        return new Promise((resolve) => {
          this.processes.push(platform);
          
          process.on('SIGINT', async () => {
            console.log(chalk.yellow('\n🛑 Stopping monitoring...'));
            await platform.stop();
            resolve();
          });
        });
      }
      
    } catch (error) {
      console.error(chalk.red(`❌ Failed to start monitoring: ${error.message}`));
      if (!config.dryRun) {
        console.log(chalk.yellow('💡 Try running with --dry-run flag for testing'));
      }
      throw error;
    }
  }

  /**
   * Generate dashboards
   */
  async generateDashboards(options = []) {
    console.log(chalk.bold.blue('📊 Generating Dashboards...\n'));
    
    const shouldOpen = options.includes('--open');
    const outputDir = options.find(opt => opt.startsWith('--output='))?.split('=')[1] || './generated-dashboards';
    
    try {
      // Import dashboard generator
      const DashboardGenerator = require('./dashboards/examples/generate-dashboards');
      
      console.log(chalk.gray('Initializing dashboard generator...'));
      const generator = new DashboardGenerator({
        accountId: process.env.NEW_RELIC_ACCOUNT_ID || '123456',
        userApiKey: process.env.NEW_RELIC_USER_API_KEY || 'demo-key',
        outputDir: outputDir,
        dryRun: !process.env.NEW_RELIC_ACCOUNT_ID
      });
      
      console.log(chalk.gray('Generating Kafka monitoring dashboards...'));
      
      // Generate comprehensive dashboard suite
      const dashboards = await generator.generateAll();
      
      console.log(chalk.green(`✅ Generated ${dashboards.length} dashboards:`));
      dashboards.forEach(dashboard => {
        console.log(chalk.gray(`   - ${dashboard.name}`));
      });
      
      if (shouldOpen && dashboards.length > 0) {
        console.log(chalk.cyan('🌐 Opening dashboards in browser...'));
        dashboards.forEach(dashboard => {
          if (dashboard.permalink) {
            this.execCommand(`open "${dashboard.permalink}"`).catch(() => {
              console.log(chalk.gray(`Dashboard URL: ${dashboard.permalink}`));
            });
          }
        });
      }
      
      this.state.dashboardsGenerated = true;
      console.log(chalk.green('\n✅ Dashboard generation complete!\n'));
      
    } catch (error) {
      console.error(chalk.red(`❌ Dashboard generation failed: ${error.message}`));
      throw error;
    }
  }

  /**
   * Run full demo (deploy + monitor + dashboards)
   */
  async runFullDemo() {
    console.log(chalk.bold.magenta('🎬 Running Full Demo...\n'));
    
    console.log(chalk.cyan('Demo will include:'));
    console.log(chalk.gray('  1. Deploy minikube + Kafka cluster'));
    console.log(chalk.gray('  2. Start data collection and monitoring'));
    console.log(chalk.gray('  3. Generate comprehensive dashboards'));
    console.log(chalk.gray('  4. Show real-time metrics'));
    console.log('');
    
    try {
      // Phase 1: Infrastructure
      console.log(chalk.bold.blue('📍 Phase 1: Infrastructure Setup'));
      await this.deployInfrastructure();
      
      // Phase 2: Start monitoring in background
      console.log(chalk.bold.blue('📍 Phase 2: Start Monitoring'));
      const platform = await this.startMonitoring(['--background']);
      
      // Phase 3: Generate dashboards
      console.log(chalk.bold.blue('📍 Phase 3: Dashboard Generation'));
      await this.generateDashboards(['--open']);
      
      // Phase 4: Show real-time data
      console.log(chalk.bold.blue('📍 Phase 4: Real-time Monitoring'));
      console.log(chalk.cyan('🔄 Demo running. Collecting real-time metrics...\n'));
      
      // Let it run for demo duration
      const demoMinutes = 5;
      console.log(chalk.gray(`Demo will run for ${demoMinutes} minutes. Press Ctrl+C to stop early.\n`));
      
      let updateCount = 0;
      platform.on('infrastructure.updated', (data) => {
        updateCount++;
        console.log(chalk.green(`📈 Update ${updateCount}: ${data.entities} entities, ${data.events} events sent to New Relic`));
      });
      
      // Demo timeout
      setTimeout(() => {
        console.log(chalk.bold.green(`\n🎉 Demo completed successfully!`));
        console.log(chalk.cyan(`📊 Collected ${updateCount} monitoring updates`));
        platform.stop();
      }, demoMinutes * 60 * 1000);
      
    } catch (error) {
      console.error(chalk.red(`❌ Demo failed: ${error.message}`));
      throw error;
    }
  }

  /**
   * Show current status
   */
  async showStatus() {
    console.log(chalk.bold.cyan('📋 Platform Status\n'));
    
    // Check minikube
    try {
      const minikubeStatus = await this.execCommand('minikube status --profile=' + PROJECT_CONFIG.minikube.profile);
      this.state.minikubeRunning = minikubeStatus.includes('Running');
    } catch (error) {
      this.state.minikubeRunning = false;
    }
    
    // Check Kafka
    try {
      const kafkaStatus = await this.execCommand(`kubectl get pods -n ${PROJECT_CONFIG.kafka.namespace} -l app=kafka`);
      this.state.kafkaDeployed = kafkaStatus.includes('Running');
    } catch (error) {
      this.state.kafkaDeployed = false;
    }
    
    console.log(`${this.state.minikubeRunning ? chalk.green('✅') : chalk.red('❌')} Minikube Cluster`);
    console.log(`${this.state.kafkaDeployed ? chalk.green('✅') : chalk.red('❌')} Kafka Deployment`);
    console.log(`${this.state.monitoringActive ? chalk.green('✅') : chalk.red('❌')} Monitoring Platform`);
    console.log(`${this.state.dashboardsGenerated ? chalk.green('✅') : chalk.red('❌')} Dashboards Generated`);
    
    console.log('');
    
    // Show URLs if running
    if (this.state.minikubeRunning) {
      try {
        const dashboardUrl = await this.execCommand('minikube dashboard --url --profile=' + PROJECT_CONFIG.minikube.profile);
        console.log(chalk.cyan(`🌐 Kubernetes Dashboard: ${dashboardUrl.trim()}`));
      } catch (error) {
        // Dashboard URL not available
      }
    }
    
    if (this.state.kafkaDeployed) {
      console.log(chalk.cyan(`🔗 Kafka Service: kafka.${PROJECT_CONFIG.kafka.namespace}.svc.cluster.local:9092`));
    }
    
    console.log('');
  }

  /**
   * Clean up everything
   */
  async cleanup() {
    console.log(chalk.bold.yellow('🧹 Cleaning up...\n'));
    
    // Stop monitoring processes
    this.processes.forEach(process => {
      if (process && process.stop) {
        process.stop();
      }
    });
    
    // Delete Kafka deployment
    try {
      await this.execCommand(`kubectl delete namespace ${PROJECT_CONFIG.kafka.namespace} --ignore-not-found=true`);
      console.log(chalk.green('✅ Kafka deployment cleaned up'));
    } catch (error) {
      console.log(chalk.yellow('⚠️ Could not clean up Kafka deployment'));
    }
    
    // Stop minikube
    try {
      await this.execCommand('minikube stop --profile=' + PROJECT_CONFIG.minikube.profile);
      await this.execCommand('minikube delete --profile=' + PROJECT_CONFIG.minikube.profile);
      console.log(chalk.green('✅ Minikube cluster cleaned up'));
    } catch (error) {
      console.log(chalk.yellow('⚠️ Could not clean up minikube'));
    }
    
    // Clean up generated files
    try {
      fs.unlinkSync('/tmp/kafka-deployment.yaml');
      fs.unlinkSync('/tmp/monitoring-deployment.yaml');
    } catch (error) {
      // Files may not exist
    }
    
    console.log(chalk.green('\n✅ Cleanup complete!\n'));
  }

  /**
   * Show help information
   */
  showHelp() {
    console.log(chalk.cyan(`
Usage: node launch.js [command] [options]

Commands:
  quick-start         Deploy everything and start monitoring
  deploy             Deploy minikube + Kafka infrastructure  
  monitor            Start monitoring platform only
  dashboards         Generate New Relic dashboards only
  demo               Run full demo (deploy + monitor + dashboards)
  status             Show current platform status
  cleanup            Clean up all deployments
  help               Show this help message

Options:
  --background       Run monitoring in background
  --dry-run          Run without sending data to New Relic
  --open             Open dashboards in browser
  --output=DIR       Output directory for dashboards

Examples:
  node launch.js quick-start                    # Quick deployment
  node launch.js monitor --dry-run              # Test monitoring
  node launch.js dashboards --open              # Generate and open dashboards
  node launch.js demo                           # Full demonstration

Environment Variables:
  NEW_RELIC_ACCOUNT_ID      Your New Relic account ID
  NEW_RELIC_USER_API_KEY    Your New Relic user API key
  NEW_RELIC_INGEST_KEY      Your New Relic ingest license key

For more information, visit: https://github.com/your-repo/newrelic-message-queues-platform
`));
  }

  /**
   * Check prerequisites
   */
  async checkPrerequisites() {
    console.log(chalk.gray('Checking prerequisites...'));
    
    const tools = ['kubectl', 'minikube'];
    for (const tool of tools) {
      try {
        await this.execCommand(`${tool} version`);
        console.log(chalk.green(`✅ ${tool} is installed`));
      } catch (error) {
        console.log(chalk.red(`❌ ${tool} not found`));
        throw new Error(`Required tool ${tool} is not installed`);
      }
    }
  }

  /**
   * Generate Kafka deployment YAML
   */
  generateKafkaYaml() {
    return `
apiVersion: v1
kind: Namespace
metadata:
  name: ${PROJECT_CONFIG.kafka.namespace}
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: kafka
  namespace: ${PROJECT_CONFIG.kafka.namespace}
spec:
  serviceName: kafka-headless
  replicas: ${PROJECT_CONFIG.kafka.replicas}
  selector:
    matchLabels:
      app: kafka
  template:
    metadata:
      labels:
        app: kafka
    spec:
      containers:
      - name: kafka
        image: confluentinc/cp-kafka:latest
        ports:
        - containerPort: 9092
        - containerPort: 9999
        env:
        - name: KAFKA_BROKER_ID
          valueFrom:
            fieldRef:
              fieldPath: metadata.name
        - name: KAFKA_ZOOKEEPER_CONNECT
          value: zookeeper:2181
        - name: KAFKA_LISTENERS
          value: PLAINTEXT://0.0.0.0:9092
        - name: KAFKA_ADVERTISED_LISTENERS
          value: PLAINTEXT://$(hostname -f):9092
        - name: KAFKA_AUTO_CREATE_TOPICS_ENABLE
          value: "true"
        - name: KAFKA_DEFAULT_REPLICATION_FACTOR
          value: "2"
        - name: KAFKA_JMX_PORT
          value: "9999"
        - name: KAFKA_JMX_HOSTNAME
          value: "localhost"
---
apiVersion: v1
kind: Service
metadata:
  name: kafka
  namespace: ${PROJECT_CONFIG.kafka.namespace}
spec:
  ports:
  - port: 9092
    name: kafka
  - port: 9999
    name: jmx
  clusterIP: None
  selector:
    app: kafka
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: zookeeper
  namespace: ${PROJECT_CONFIG.kafka.namespace}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: zookeeper
  template:
    metadata:
      labels:
        app: zookeeper
    spec:
      containers:
      - name: zookeeper
        image: confluentinc/cp-zookeeper:latest
        ports:
        - containerPort: 2181
        env:
        - name: ZOOKEEPER_CLIENT_PORT
          value: "2181"
        - name: ZOOKEEPER_TICK_TIME
          value: "2000"
---
apiVersion: v1
kind: Service
metadata:
  name: zookeeper
  namespace: ${PROJECT_CONFIG.kafka.namespace}
spec:
  ports:
  - port: 2181
  selector:
    app: zookeeper
`;
  }

  /**
   * Generate monitoring deployment YAML
   */
  generateMonitoringYaml() {
    return `
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: nri-kafka
  namespace: ${PROJECT_CONFIG.kafka.namespace}
spec:
  selector:
    matchLabels:
      app: nri-kafka
  template:
    metadata:
      labels:
        app: nri-kafka
    spec:
      containers:
      - name: nri-kafka
        image: newrelic/nri-kafka:latest
        env:
        - name: NRIA_LICENSE_KEY
          value: "${process.env.NEW_RELIC_INGEST_KEY || 'demo-key'}"
        - name: KAFKA_BROKERS
          value: "kafka:9092"
        volumeMounts:
        - name: config
          mountPath: /etc/newrelic-infra/integrations.d/
      volumes:
      - name: config
        configMap:
          name: nri-kafka-config
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: nri-kafka-config
  namespace: ${PROJECT_CONFIG.kafka.namespace}
data:
  kafka-config.yml: |
    integration_name: com.newrelic.kafka
    instances:
      - name: kafka-metrics
        command: all_data
        arguments:
          bootstrap_broker_host: kafka
          bootstrap_broker_kafka_port: 9092
          bootstrap_broker_jmx_port: 9999
          collect_broker_topic_data: true
          collect_topic_size: true
`;
  }

  /**
   * Execute shell command with promise
   */
  execCommand(command) {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Command failed: ${command}\n${error.message}`));
        } else {
          resolve(stdout.trim());
        }
      });
    });
  }

  /**
   * Setup signal handlers for graceful shutdown
   */
  setupSignalHandlers() {
    ['SIGINT', 'SIGTERM'].forEach(signal => {
      process.on(signal, async () => {
        console.log(chalk.yellow(`\n🛑 Received ${signal}. Shutting down gracefully...`));
        
        // Stop all running processes
        this.processes.forEach(process => {
          if (process && process.stop) {
            process.stop();
          }
        });
        
        process.exit(0);
      });
    });
  }
}

// Main execution
if (require.main === module) {
  const launcher = new UnifiedLauncher();
  launcher.main().catch(error => {
    console.error(chalk.red('\n❌ Launch failed:'), error.message);
    process.exit(1);
  });
}

module.exports = UnifiedLauncher;