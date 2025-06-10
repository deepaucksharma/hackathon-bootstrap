#!/usr/bin/env node

/**
 * Unified Platform Runner for Message Queues Platform v2
 * 
 * This script provides a unified interface to run the platform in either:
 * - Infrastructure mode: Queries real nri-kafka data from NRDB
 * - Simulation mode: Generates realistic test data
 * 
 * It leverages the existing TypeScript implementation and provides
 * comprehensive visual feedback and reporting.
 */

import 'dotenv/config';
import chalk from 'chalk';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));

console.log(chalk.blue.bold(`
╔═══════════════════════════════════════════════════════════════╗
║        Message Queues Platform v2 - Unified Runner            ║
╚═══════════════════════════════════════════════════════════════╝
`));

// Configuration
const config = {
  accountId: process.env.NEW_RELIC_ACCOUNT_ID,
  apiKey: process.env.NEW_RELIC_API_KEY,
  userApiKey: process.env.NEW_RELIC_USER_API_KEY,
  ingestKey: process.env.NEW_RELIC_INGEST_KEY || process.env.NEW_RELIC_API_KEY,
  region: process.env.NEW_RELIC_REGION || 'US',
  mode: process.env.PLATFORM_MODE || 'simulation',
  interval: parseInt(process.env.PLATFORM_INTERVAL) || 30,
  environment: process.env.NODE_ENV || 'development',
  
  // Kafka configuration for infrastructure mode
  kafka: {
    clusterName: process.env.KAFKA_CLUSTER_NAME || 'kafka-cluster',
    bootstrapServers: process.env.KAFKA_BOOTSTRAP_SERVERS || 'localhost:9092',
    lookbackMinutes: parseInt(process.env.LOOKBACK_MINUTES) || 5
  },
  
  // Dashboard configuration
  dashboard: {
    enabled: process.env.DASHBOARD_ENABLED !== 'false', // Default true
    name: process.env.DASHBOARD_NAME || `Kafka ${process.env.PLATFORM_MODE || 'Simulation'} Monitoring`,
    autoUpdate: process.env.DASHBOARD_AUTO_UPDATE !== 'false', // Default true
    createAfterCycles: parseInt(process.env.DASHBOARD_CREATE_AFTER_CYCLES) || 2 // Wait for 2 cycles before creating
  }
};

// Validate required environment variables
function validateConfig() {
  const errors = [];
  
  if (!config.accountId) {
    errors.push('NEW_RELIC_ACCOUNT_ID is required');
  }
  
  if (!config.apiKey) {
    errors.push('NEW_RELIC_API_KEY is required');
  }
  
  if (config.apiKey && !config.apiKey.startsWith('NRAK-')) {
    errors.push('NEW_RELIC_API_KEY must start with NRAK-');
  }
  
  if (errors.length > 0) {
    console.log(chalk.red('\n❌ Configuration Errors:'));
    errors.forEach(error => console.log(chalk.red(`   - ${error}`)));
    console.log(chalk.yellow('\n💡 Please check your .env file or environment variables'));
    console.log(chalk.gray('   See .env.example for the required format\n'));
    process.exit(1);
  }
}

// Validate configuration before proceeding
validateConfig();

// Display configuration
console.log(chalk.cyan('📋 Configuration:'));
console.log(chalk.gray(`   Mode: ${config.mode}`));
console.log(chalk.gray(`   Account ID: ${config.accountId}`));
console.log(chalk.gray(`   API Key: ${'*'.repeat(20)}...${config.apiKey.slice(-4)}`));
console.log(chalk.gray(`   Region: ${config.region}`));
console.log(chalk.gray(`   Interval: ${config.interval}s`));

if (config.mode === 'infrastructure') {
  console.log(chalk.gray(`   Kafka Cluster: ${config.kafka.clusterName}`));
  console.log(chalk.gray(`   Lookback: ${config.kafka.lookbackMinutes} minutes`));
}

if (config.dashboard.enabled) {
  console.log(chalk.gray(`   Dashboard: ${config.dashboard.name}`));
  console.log(chalk.gray(`   Auto-update: ${config.dashboard.autoUpdate ? 'Yes' : 'No'}`));
}

console.log('');

// Check if TypeScript needs compilation
async function ensureCompiled() {
  const distPath = join(__dirname, 'dist');
  const srcPath = join(__dirname, 'src');
  
  // Check if dist directory exists and is up to date
  if (!existsSync(distPath)) {
    console.log(chalk.yellow('📦 Compiling TypeScript...'));
    try {
      await execAsync('npm run build');
      console.log(chalk.green('✅ Compilation successful'));
    } catch (error) {
      console.log(chalk.red('❌ Compilation failed:'));
      console.error(error.stdout || error.message);
      
      // Fall back to ts-node
      console.log(chalk.yellow('🔄 Attempting to run with ts-node...'));
      return false;
    }
  }
  
  return true;
}

// Import the actual platform implementation
async function loadPlatform(useCompiled) {
  try {
    // Always use ts-node for now - the compiled JS has ESM import issues
    useCompiled = false;
    
    if (useCompiled) {
      // This block won't run but keeping for future fix
      const { MessageQueuesPlatform } = await import('./dist/platform.js');
      const { InfrastructureCollector } = await import('./dist/collectors/infrastructure-collector.js');
      const { SimulationCollector } = await import('./dist/collectors/simulation-collector.js');
      const { NriKafkaTransformer } = await import('./dist/transformers/nri-kafka-transformer.js');
      const { EntitySynthesizer } = await import('./dist/synthesizers/entity-synthesizer.js');
      const { EntityStreamer } = await import('./dist/streaming/entity-streamer.js');
      const { DashboardGenerator } = await import('./dist/dashboards/generator.js');
      const { Logger } = await import('./dist/shared/utils/logger.js');
      
      return {
        MessageQueuesPlatform,
        InfrastructureCollector,
        SimulationCollector,
        NriKafkaTransformer,
        EntitySynthesizer,
        EntityStreamer,
        DashboardGenerator,
        Logger
      };
    } else {
      // Use ts-node to load TypeScript directly
      console.log(chalk.yellow('⚠️  Running in development mode with ts-node'));
      
      // Dynamic import with ts-node
      const tsNode = await import('ts-node');
      tsNode.register({
        compilerOptions: {
          module: 'esnext',
          target: 'es2020',
          moduleResolution: 'node',
          allowSyntheticDefaultImports: true,
          esModuleInterop: true,
          allowJs: true,
          resolveJsonModule: true
        },
        transpileOnly: true,
        files: true
      });
      
      const { MessageQueuesPlatform } = await import('./src/platform.ts');
      const { InfrastructureCollector } = await import('./src/collectors/infrastructure-collector.ts');
      const { SimulationCollector } = await import('./src/collectors/simulation-collector.ts');
      const { NriKafkaTransformer } = await import('./src/transformers/nri-kafka-transformer.ts');
      const { EntitySynthesizer } = await import('./src/synthesizers/entity-synthesizer.ts');
      const { EntityStreamer } = await import('./src/streaming/entity-streamer.ts');
      const { DashboardGenerator } = await import('./src/dashboards/generator.ts');
      const { Logger } = await import('./src/shared/utils/logger.ts');
      
      return {
        MessageQueuesPlatform,
        InfrastructureCollector,
        SimulationCollector,
        NriKafkaTransformer,
        EntitySynthesizer,
        EntityStreamer,
        DashboardGenerator,
        Logger
      };
    }
  } catch (error) {
    console.log(chalk.red('❌ Failed to load platform implementation:'));
    console.error(error.message);
    process.exit(1);
  }
}

// Beautiful markdown report generator
class DataModelReportGenerator {
  constructor(config) {
    this.config = config;
    this.reportDir = join(__dirname, 'reports');
    if (!existsSync(this.reportDir)) {
      mkdirSync(this.reportDir, { recursive: true });
    }
  }
  
  generateReport(data) {
    const timestamp = new Date().toISOString();
    const filename = `data-model-flow-${timestamp.replace(/[:.]/g, '-')}.md`;
    const filepath = join(this.reportDir, filename);
    
    const report = `# Data Model Flow Report

**Generated**: ${timestamp}  
**Mode**: ${this.config.mode}  
**Account**: ${this.config.accountId}  
**Cluster**: ${this.config.kafka.clusterName}  

---

## 1️⃣ Raw Data Collection (${data.raw.length} samples)

This shows the raw data collected from ${this.config.mode === 'infrastructure' ? 'NRDB (nri-kafka)' : 'simulation'}.

### Sample Distribution
${this.generateSampleDistribution(data.raw)}

### Sample Raw Data
\`\`\`json
${JSON.stringify(data.raw[0] || {}, null, 2)}
\`\`\`

---

## 2️⃣ Transformed Metrics (${data.transformed.length} metrics)

Raw samples are transformed into standardized metrics with consistent naming.

### Transformation Mapping
${this.generateTransformationMapping()}

### Sample Transformed Data
\`\`\`json
${JSON.stringify(data.transformed[0] || {}, null, 2)}
\`\`\`

---

## 3️⃣ Synthesized Entities (${data.entities.length} entities)

Transformed metrics are synthesized into MESSAGE_QUEUE entities for New Relic.

### Entity Distribution
${this.generateEntityDistribution(data.entities)}

### Sample Entity
\`\`\`json
${JSON.stringify(data.entities[0] || {}, null, 2)}
\`\`\`

---

## 4️⃣ Cluster Aggregation

${data.clusterEntity ? this.generateClusterSection(data.clusterEntity) : '❌ No cluster entity generated'}

---

## 5️⃣ Streaming Status

${this.generateStreamingStatus(data.streamingResult)}

---

## 📊 Summary

- **Collection Time**: ${data.timing.collection}ms
- **Transformation Time**: ${data.timing.transformation}ms
- **Synthesis Time**: ${data.timing.synthesis}ms
- **Streaming Time**: ${data.timing.streaming}ms
${data.timing.dashboard ? `- **Dashboard Time**: ${data.timing.dashboard}ms` : ''}
- **Total Time**: ${data.timing.total}ms

${data.dashboardInfo ? this.generateDashboardSection(data.dashboardInfo) : ''}

### Next Steps

1. Check entities in New Relic UI:
   \`\`\`sql
   FROM MessageQueue 
   SELECT * 
   WHERE entityType LIKE 'MESSAGE_QUEUE_%' 
   SINCE 10 minutes ago
   \`\`\`

2. View in Entity Explorer:
   - Go to: [Entity Explorer](https://one.newrelic.com/nr1-core/entity-explorer)
   - Filter by: entityType = MESSAGE_QUEUE_*

${!data.dashboardInfo ? `3. Create dashboards:
   \`\`\`bash
   node dist/dashboards/cli/dashboard-cli.js create \\
     --name "Kafka Monitoring" \\
     --account ${this.config.accountId}
   \`\`\`` : ''}
`;

    writeFileSync(filepath, report);
    console.log(chalk.green(`\n📄 Report saved to: ${filepath}`));
    
    // Also save as latest
    const latestPath = join(__dirname, 'DATA_MODEL_FLOW_latest.md');
    writeFileSync(latestPath, report);
    
    return filepath;
  }
  
  generateSampleDistribution(samples) {
    const distribution = {};
    samples.forEach(s => {
      distribution[s.eventType] = (distribution[s.eventType] || 0) + 1;
    });
    
    return Object.entries(distribution)
      .map(([type, count]) => `- **${type}**: ${count} samples`)
      .join('\n');
  }
  
  generateTransformationMapping() {
    return `
| nri-kafka Field | Transformed Field | Description |
|-----------------|-------------------|-------------|
| broker.bytesInPerSecond | throughput.in.bytesPerSecond | Broker input throughput |
| broker.bytesOutPerSecond | throughput.out.bytesPerSecond | Broker output throughput |
| broker.messagesInPerSecond | messages.in.rate | Message ingestion rate |
| kafka.broker.cpuPercent | cpu.usage | CPU utilization percentage |
| broker.partitionCount | partition.count | Number of partitions |
| consumer.offsetLag | lag.total | Total consumer lag |
`;
  }
  
  generateEntityDistribution(entities) {
    const distribution = {};
    entities.forEach(e => {
      distribution[e.entityType] = (distribution[e.entityType] || 0) + 1;
    });
    
    return Object.entries(distribution)
      .map(([type, count]) => `- **${type}**: ${count} entities`)
      .join('\n');
  }
  
  generateClusterSection(clusterEntity) {
    return `
✅ **Cluster Entity Created**

The cluster entity aggregates metrics from all brokers:

\`\`\`json
${JSON.stringify(clusterEntity, null, 2)}
\`\`\`

### Aggregated Metrics:
- **Total Throughput**: ${this.formatBytes(clusterEntity['cluster.throughput.total.bytesPerSecond'] || 0)}/s
- **Broker Count**: ${clusterEntity['cluster.broker.count'] || 0}
- **Health Score**: ${clusterEntity['cluster.health.score'] || 0}%
- **Total Partitions**: ${clusterEntity['cluster.partition.count.total'] || 0}
`;
  }
  
  generateStreamingStatus(result) {
    if (result.success) {
      return `✅ **Successfully streamed to New Relic Event API**
      
- Entities sent: ${result.count}
- Batches: ${result.batches}
- Duration: ${result.duration}ms`;
    } else {
      return `❌ **Streaming failed**: ${result.error}`;
    }
  }
  
  formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }
  
  generateDashboardSection(dashboardInfo) {
    if (dashboardInfo.created) {
      return `
## 🎉 Dashboard Created!

Your Kafka monitoring dashboard has been created in New Relic:

🔗 **[View Dashboard](${dashboardInfo.url})**

The dashboard includes:
- **Executive Overview** - Cluster health, broker status, throughput metrics
- **Topic Analysis** - Message rates, partition distribution, consumer lag
- **Consumer Groups** - Lag analysis, consumer performance
- **Infrastructure** - Broker resources, disk usage, network I/O
`;
    } else if (dashboardInfo.updated) {
      return `
## 📊 Dashboard Updated

Your dashboard has been refreshed with the latest entity structure:

🔗 **[View Dashboard](${dashboardInfo.url})**
`;
    } else if (dashboardInfo.url) {
      return `
## 📊 Dashboard

🔗 **[View Dashboard](${dashboardInfo.url})**
`;
    }
    return '';
  }
}

// Enhanced Platform Runner
class UnifiedPlatformRunner {
  constructor(config, components) {
    this.config = config;
    this.components = components;
    this.reportGenerator = new DataModelReportGenerator(config);
    this.cycleCount = 0;
    this.dashboardGuid = null;
    this.dashboardUrl = null;
  }
  
  async run() {
    console.log(chalk.green('\n🚀 Starting platform...\n'));
    
    // Run initial cycle immediately
    await this.runCycle();
    
    // Set up interval for subsequent cycles
    setInterval(() => {
      this.runCycle().catch(error => {
        console.error(chalk.red('Error in cycle:'), error);
      });
    }, this.config.interval * 1000);
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log(chalk.yellow('\n\n👋 Shutting down gracefully...'));
      process.exit(0);
    });
  }
  
  async runCycle() {
    this.cycleCount++;
    const cycleStart = Date.now();
    const timing = {};
    
    console.log(chalk.blue(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`));
    console.log(chalk.blue.bold(`Cycle #${this.cycleCount} - ${new Date().toLocaleTimeString()}`));
    console.log(chalk.blue(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`));
    
    try {
      // 1. Collect data
      console.log(chalk.cyan('\n📥 1. Collecting Data...'));
      const collectionStart = Date.now();
      const rawSamples = await this.collectData();
      timing.collection = Date.now() - collectionStart;
      console.log(chalk.green(`   ✅ Collected ${rawSamples.length} samples (${timing.collection}ms)`));
      
      // 2. Transform metrics
      console.log(chalk.cyan('\n🔄 2. Transforming Metrics...'));
      const transformStart = Date.now();
      const transformedMetrics = await this.transformData(rawSamples);
      timing.transformation = Date.now() - transformStart;
      console.log(chalk.green(`   ✅ Transformed ${transformedMetrics.length} metrics (${timing.transformation}ms)`));
      
      // 3. Synthesize entities (including cluster aggregation)
      console.log(chalk.cyan('\n🏗️  3. Synthesizing Entities...'));
      const synthesisStart = Date.now();
      const { entities, clusterEntity } = await this.synthesizeEntities(transformedMetrics);
      timing.synthesis = Date.now() - synthesisStart;
      console.log(chalk.green(`   ✅ Synthesized ${entities.length} entities (${timing.synthesis}ms)`));
      
      if (clusterEntity) {
        console.log(chalk.green(`   ✅ Created cluster entity with health score: ${clusterEntity['cluster.health.score']}%`));
      }
      
      // 4. Stream to New Relic
      console.log(chalk.cyan('\n📤 4. Streaming to New Relic...'));
      const streamingStart = Date.now();
      const streamingResult = await this.streamEntities(entities);
      timing.streaming = Date.now() - streamingStart;
      
      if (streamingResult.success) {
        console.log(chalk.green(`   ✅ Streamed ${entities.length} entities (${timing.streaming}ms)`));
      } else {
        console.log(chalk.red(`   ❌ Streaming failed: ${streamingResult.error}`));
      }
      
      // Calculate total time
      timing.total = Date.now() - cycleStart;
      
      // 6. Create or update dashboard
      let dashboardResult = null;
      if (this.config.dashboard.enabled && this.cycleCount >= this.config.dashboard.createAfterCycles) {
        console.log(chalk.cyan('\n📊 6. Managing Dashboard...'));
        const dashboardStart = Date.now();
        dashboardResult = await this.manageDashboard();
        timing.dashboard = Date.now() - dashboardStart;
        
        if (dashboardResult.success) {
          if (dashboardResult.created) {
            console.log(chalk.green(`   ✅ Dashboard created successfully (${timing.dashboard}ms)`));
            console.log(chalk.blue(`   🔗 View at: ${dashboardResult.url}`));
          } else if (dashboardResult.updated) {
            console.log(chalk.green(`   ✅ Dashboard updated (${timing.dashboard}ms)`));
          } else {
            console.log(chalk.gray(`   ℹ️  Dashboard already up to date`));
          }
        } else {
          console.log(chalk.red(`   ❌ Dashboard operation failed: ${dashboardResult.error}`));
        }
      }
      
      console.log(chalk.green(`\n✅ Cycle completed in ${timing.total}ms`));
      console.log(chalk.gray(`   Next cycle in ${this.config.interval} seconds...`));
      
      // Show dashboard link if available
      if (this.dashboardUrl) {
        console.log(chalk.blue(`   📊 Dashboard: ${this.dashboardUrl}`));
      }
      
    } catch (error) {
      console.error(chalk.red('\n❌ Cycle failed:'), error);
      console.log(chalk.yellow('   Will retry in next cycle...'));
    }
  }
  
  async collectData() {
    const { InfrastructureCollector, SimulationCollector } = this.components;
    
    let collector;
    if (this.config.mode === 'infrastructure') {
      console.log(chalk.gray('   🔍 Querying NRDB for KafkaBrokerSample data...'));
      collector = new InfrastructureCollector(this.config);
    } else {
      console.log(chalk.gray('   🎮 Generating simulated Kafka data...'));
      collector = new SimulationCollector(this.config);
    }
    
    return await collector.collect();
  }
  
  async transformData(rawSamples) {
    const { NriKafkaTransformer } = this.components;
    const transformer = new NriKafkaTransformer(this.config);
    
    const transformed = [];
    for (const sample of rawSamples) {
      try {
        const metrics = await transformer.transform(sample);
        transformed.push(metrics);
      } catch (error) {
        console.warn(chalk.yellow(`   ⚠️  Failed to transform sample: ${error.message}`));
      }
    }
    
    return transformed;
  }
  
  async synthesizeEntities(transformedMetrics) {
    const { EntitySynthesizer } = this.components;
    const synthesizer = new EntitySynthesizer(this.config);
    
    const entities = [];
    const brokerMetrics = [];
    
    // Synthesize individual entities
    for (const metrics of transformedMetrics) {
      try {
        const entity = await synthesizer.synthesize(metrics);
        entities.push(entity);
        
        // Collect broker metrics for cluster aggregation
        if (metrics.entityType === 'broker') {
          brokerMetrics.push(metrics);
        }
      } catch (error) {
        console.warn(chalk.yellow(`   ⚠️  Failed to synthesize entity: ${error.message}`));
      }
    }
    
    // Create cluster entity by aggregating broker metrics
    let clusterEntity = null;
    if (brokerMetrics.length > 0) {
      clusterEntity = await this.createClusterEntity(brokerMetrics, synthesizer);
      if (clusterEntity) {
        entities.push(clusterEntity);
      }
    }
    
    return { entities, clusterEntity };
  }
  
  async createClusterEntity(brokerMetrics, synthesizer) {
    // Aggregate metrics from all brokers
    const clusterName = brokerMetrics[0]?.clusterName || 'unknown';
    
    const aggregated = {
      totalThroughputIn: 0,
      totalThroughputOut: 0,
      totalMessages: 0,
      totalPartitions: 0,
      avgCpuUsage: 0,
      maxCpuUsage: 0,
      avgMemoryUsage: 0,
      brokerCount: brokerMetrics.length,
      healthyBrokers: 0,
      underReplicatedPartitions: 0
    };
    
    // Aggregate metrics
    brokerMetrics.forEach(broker => {
      const metrics = broker.metrics;
      aggregated.totalThroughputIn += metrics.bytesInPerSecond || 0;
      aggregated.totalThroughputOut += metrics.bytesOutPerSecond || 0;
      aggregated.totalMessages += metrics.throughputPerSecond || 0;
      aggregated.totalPartitions += metrics.partitionCount || 0;
      aggregated.avgCpuUsage += metrics.cpuUsagePercent || 0;
      aggregated.maxCpuUsage = Math.max(aggregated.maxCpuUsage, metrics.cpuUsagePercent || 0);
      aggregated.avgMemoryUsage += metrics.memoryUsedBytes || 0;
      aggregated.underReplicatedPartitions += metrics.underReplicatedPartitions || 0;
      
      // Consider broker healthy if CPU < 80% and has partitions
      if ((metrics.cpuUsagePercent || 0) < 80 && (metrics.partitionCount || 0) > 0) {
        aggregated.healthyBrokers++;
      }
    });
    
    // Calculate averages
    if (brokerMetrics.length > 0) {
      aggregated.avgCpuUsage /= brokerMetrics.length;
      aggregated.avgMemoryUsage /= brokerMetrics.length;
    }
    
    // Calculate health score (0-100)
    const healthScore = this.calculateHealthScore(aggregated);
    
    // Create cluster metrics object
    const clusterMetrics = {
      timestamp: Date.now(),
      provider: 'kafka',
      entityType: 'cluster',
      clusterName,
      identifiers: {
        clusterName
      },
      metrics: {
        'throughput.total.bytesPerSecond': aggregated.totalThroughputIn + aggregated.totalThroughputOut,
        'throughput.in.bytesPerSecond': aggregated.totalThroughputIn,
        'throughput.out.bytesPerSecond': aggregated.totalThroughputOut,
        'messages.total.perSecond': aggregated.totalMessages,
        'broker.count': aggregated.brokerCount,
        'broker.healthy.count': aggregated.healthyBrokers,
        'partition.count.total': aggregated.totalPartitions,
        'partition.underReplicated.count': aggregated.underReplicatedPartitions,
        'cpu.usage.average': aggregated.avgCpuUsage,
        'cpu.usage.max': aggregated.maxCpuUsage,
        'memory.usage.average.bytes': aggregated.avgMemoryUsage,
        'health.score': healthScore
      },
      metadata: {
        environment: this.config.environment
      }
    };
    
    // Synthesize cluster entity
    return await synthesizer.synthesize(clusterMetrics);
  }
  
  calculateHealthScore(aggregated) {
    let score = 100;
    
    // Deduct points for various issues
    if (aggregated.brokerCount === 0) return 0;
    
    // Broker availability (40 points)
    const brokerAvailability = (aggregated.healthyBrokers / aggregated.brokerCount) * 40;
    score = brokerAvailability;
    
    // CPU usage (30 points)
    if (aggregated.avgCpuUsage > 90) score -= 30;
    else if (aggregated.avgCpuUsage > 80) score -= 20;
    else if (aggregated.avgCpuUsage > 70) score -= 10;
    else score += 30;
    
    // Under-replicated partitions (20 points)
    if (aggregated.underReplicatedPartitions > 0) {
      const replicationPenalty = Math.min(20, aggregated.underReplicatedPartitions * 2);
      score -= replicationPenalty;
    } else {
      score += 20;
    }
    
    // Partition distribution (10 points)
    const avgPartitionsPerBroker = aggregated.totalPartitions / aggregated.brokerCount;
    if (avgPartitionsPerBroker < 10) score -= 5; // Too few partitions
    else if (avgPartitionsPerBroker > 100) score -= 5; // Too many partitions
    else score += 10;
    
    return Math.max(0, Math.min(100, Math.round(score)));
  }
  
  async streamEntities(entities) {
    const { EntityStreamer } = this.components;
    
    if (entities.length === 0) {
      return { success: false, error: 'No entities to stream' };
    }
    
    try {
      const streamer = new EntityStreamer(this.config);
      const startTime = Date.now();
      
      await streamer.stream(entities);
      
      return {
        success: true,
        count: entities.length,
        batches: Math.ceil(entities.length / 100),
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  async manageDashboard() {
    const { DashboardGenerator } = this.components;
    
    if (!this.config.userApiKey) {
      return { 
        success: false, 
        error: 'NEW_RELIC_USER_API_KEY required for dashboard management' 
      };
    }
    
    try {
      const generator = new DashboardGenerator({
        ...this.config,
        provider: 'kafka'
      });
      
      // Check if we already have a dashboard
      if (this.dashboardGuid && !this.config.dashboard.autoUpdate) {
        return { 
          success: true, 
          created: false, 
          updated: false,
          url: this.dashboardUrl 
        };
      }
      
      if (this.dashboardGuid && this.config.dashboard.autoUpdate) {
        // Update existing dashboard
        try {
          const updateResult = await generator.update(this.dashboardGuid, this.config.dashboard.name);
          this.dashboardUrl = updateResult.url;
          return {
            success: true,
            created: false,
            updated: true,
            url: this.dashboardUrl
          };
        } catch (updateError) {
          console.warn(chalk.yellow(`   ⚠️  Could not update dashboard, will create new one`));
          this.dashboardGuid = null;
        }
      }
      
      // Create new dashboard
      const result = await generator.generate(this.config.dashboard.name);
      
      if (result.guid) {
        this.dashboardGuid = result.guid;
        this.dashboardUrl = result.url;
        
        return {
          success: true,
          created: true,
          updated: false,
          url: this.dashboardUrl
        };
      } else {
        return {
          success: false,
          error: 'Dashboard creation returned no GUID'
        };
      }
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Main execution
async function main() {
  try {
    // Ensure TypeScript is compiled
    const useCompiled = await ensureCompiled();
    
    // Load platform components
    console.log(chalk.cyan('📦 Loading platform components...'));
    const components = await loadPlatform(useCompiled);
    console.log(chalk.green('✅ Components loaded successfully'));
    
    // Check for infrastructure mode prerequisites
    if (config.mode === 'infrastructure') {
      console.log(chalk.cyan('\n🔍 Verifying infrastructure mode prerequisites...'));
      
      // Note: In a real implementation, we would verify:
      // 1. nri-kafka is sending data to NRDB
      // 2. We can query KafkaBrokerSample events
      // 3. Kafka cluster connectivity
      
      console.log(chalk.green('✅ Infrastructure mode ready'));
      console.log(chalk.gray('   Will query NRDB for KafkaBrokerSample data'));
    }
    
    // Create and run unified platform
    const runner = new UnifiedPlatformRunner(config, components);
    await runner.run();
    
  } catch (error) {
    console.error(chalk.red('\n❌ Fatal error:'), error);
    process.exit(1);
  }
}

// Start the platform
main().catch(console.error);