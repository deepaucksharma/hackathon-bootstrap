/**
 * New Relic Message Queues Platform - Interactive Showcase
 * 
 * This script demonstrates the complete platform capabilities
 */

require('dotenv').config();
const chalk = require('chalk');
const inquirer = require('inquirer');
const { EntityFactory } = require('./core/entities');
const DataSimulator = require('./simulation/engines/data-simulator');
const NewRelicStreamer = require('./simulation/streaming/new-relic-streamer');
const DashboardGenerator = require('./dashboards/lib/dashboard-generator');
const VerificationOrchestrator = require('./verification/lib/verification-orchestrator');

async function showcase() {
  console.clear();
  console.log(chalk.bold.blue(`
╔══════════════════════════════════════════════════════════════╗
║     New Relic Message Queues Platform - Showcase v1.0        ║
╚══════════════════════════════════════════════════════════════╝
`));

  console.log(chalk.white('Welcome to the New Relic Message Queues Platform!'));
  console.log(chalk.gray('This interactive showcase demonstrates the platform\'s capabilities.\n'));

  const mainMenu = async () => {
    const { choice } = await inquirer.prompt([
      {
        type: 'list',
        name: 'choice',
        message: 'What would you like to explore?',
        choices: [
          { name: '🏗️  Mode 1: Entity Proposal & Simulation', value: 'mode1' },
          { name: '🔧  Mode 2: Existing Entity Enhancement', value: 'mode2' },
          { name: '🎯  Mode 3: Hybrid Mode (Both)', value: 'mode3' },
          { name: '📊  Quick Entity Creation Demo', value: 'quick' },
          { name: '📈  Dashboard Generation Demo', value: 'dashboard' },
          { name: '🔍  Verification Framework Demo', value: 'verify' },
          { name: '🏭  Production Simulation', value: 'production' },
          { name: '📚  View Documentation', value: 'docs' },
          { name: '❌  Exit', value: 'exit' }
        ]
      }
    ]);

    switch (choice) {
      case 'mode1':
        await mode1Demo();
        break;
      case 'mode2':
        await mode2Demo();
        break;
      case 'mode3':
        await mode3Demo();
        break;
      case 'quick':
        await quickDemo();
        break;
      case 'dashboard':
        await dashboardDemo();
        break;
      case 'verify':
        await verificationDemo();
        break;
      case 'production':
        await productionDemo();
        break;
      case 'docs':
        await showDocs();
        break;
      case 'exit':
        console.log(chalk.green('\n👋 Thank you for exploring the platform!'));
        process.exit(0);
    }

    // Return to main menu
    await mainMenu();
  };

  // Quick Entity Creation Demo
  async function quickDemo() {
    console.clear();
    console.log(chalk.bold.yellow('\n📊 Quick Entity Creation Demo\n'));

    const { provider } = await inquirer.prompt([
      {
        type: 'list',
        name: 'provider',
        message: 'Select a message queue provider:',
        choices: ['kafka', 'rabbitmq', 'sqs', 'azure-servicebus']
      }
    ]);

    console.log(chalk.cyan('\nCreating entities...'));
    
    const factory = new EntityFactory();
    const cluster = factory.createCluster({
      name: `demo-${provider}-cluster`,
      provider,
      environment: 'development',
      accountId: process.env.NEW_RELIC_ACCOUNT_ID || '123456'
    });

    const broker = factory.createBroker({
      name: `demo-broker-1`,
      provider,
      clusterGuid: cluster.guid,
      hostname: 'broker1.example.com',
      accountId: process.env.NEW_RELIC_ACCOUNT_ID || '123456'
    });

    const topic = factory.createTopic({
      name: 'demo-topic',
      provider,
      clusterGuid: cluster.guid,
      partitions: 10,
      accountId: process.env.NEW_RELIC_ACCOUNT_ID || '123456'
    });

    console.log(chalk.green('\n✅ Entities created successfully!'));
    console.log(chalk.white('\nCluster:'), cluster.guid);
    console.log(chalk.white('Broker:'), broker.guid);
    console.log(chalk.white('Topic:'), topic.guid);

    const { stream } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'stream',
        message: 'Would you like to stream these entities to New Relic?',
        default: false
      }
    ]);

    if (stream) {
      console.log(chalk.cyan('\nStreaming to New Relic...'));
      const streamer = new NewRelicStreamer({
        apiKey: process.env.NEW_RELIC_API_KEY,
        accountId: process.env.NEW_RELIC_ACCOUNT_ID,
        dryRun: true,
        verbose: true
      });

      await streamer.streamEvents([cluster, broker, topic]);
      await streamer.flushAll();
      console.log(chalk.green('✅ Streaming complete!'));
    }

    await inquirer.prompt([{ type: 'input', name: 'continue', message: '\nPress Enter to continue...' }]);
  }

  // Dashboard Generation Demo
  async function dashboardDemo() {
    console.clear();
    console.log(chalk.bold.yellow('\n📈 Dashboard Generation Demo\n'));

    const generator = new DashboardGenerator({
      dryRun: true
    });

    const { template } = await inquirer.prompt([
      {
        type: 'list',
        name: 'template',
        message: 'Select a dashboard template:',
        choices: [
          { name: 'Cluster Overview', value: 'overview' },
          { name: 'Topic Analysis', value: 'topic' },
          { name: 'Broker Health', value: 'broker' },
          { name: 'Queue Monitoring', value: 'queue' },
          { name: 'Provider Comparison', value: 'comparison' }
        ]
      }
    ]);

    console.log(chalk.cyan('\nGenerating dashboard...'));

    try {
      let dashboard;
      switch (template) {
        case 'overview':
          dashboard = await generator.generateOverviewDashboard({ deploy: false });
          break;
        case 'topic':
          dashboard = await generator.generateTopicDashboard({ deploy: false });
          break;
        case 'broker':
          dashboard = await generator.generateBrokerDashboard({ deploy: false });
          break;
        case 'queue':
          dashboard = await generator.generateQueueDashboard({ deploy: false });
          break;
        case 'comparison':
          dashboard = await generator.generateComparisonDashboard(['kafka', 'rabbitmq'], { deploy: false });
          break;
      }

      console.log(chalk.green('\n✅ Dashboard generated successfully!'));
      console.log(chalk.white('\nDashboard Structure:'));
      console.log(chalk.gray(JSON.stringify({
        name: dashboard.name,
        pages: dashboard.pages.length,
        widgets: dashboard.pages.reduce((sum, p) => sum + p.widgets.length, 0)
      }, null, 2)));

    } catch (error) {
      console.error(chalk.red(`\n❌ Error: ${error.message}`));
    }

    await inquirer.prompt([{ type: 'input', name: 'continue', message: '\nPress Enter to continue...' }]);
  }

  // Verification Demo
  async function verificationDemo() {
    console.clear();
    console.log(chalk.bold.yellow('\n🔍 Verification Framework Demo\n'));

    console.log(chalk.white('The verification framework validates:'));
    console.log(chalk.gray('• Entity synthesis in New Relic'));
    console.log(chalk.gray('• NRQL query execution'));
    console.log(chalk.gray('• Dashboard rendering in browser'));

    const { verify } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'verify',
        message: '\nWould you like to run a verification test?',
        default: false
      }
    ]);

    if (verify) {
      console.log(chalk.cyan('\nRunning verification...'));
      
      const orchestrator = new VerificationOrchestrator({
        apiKey: process.env.NEW_RELIC_USER_API_KEY,
        accountId: process.env.NEW_RELIC_ACCOUNT_ID,
        dryRun: true
      });

      try {
        const results = await orchestrator.runFullVerification({
          entityTypes: ['MESSAGE_QUEUE_CLUSTER'],
          nrqlQueries: ['SELECT count(*) FROM MESSAGE_QUEUE_CLUSTER_SAMPLE'],
          skipBrowser: true
        });

        console.log(chalk.green('\n✅ Verification complete!'));
        console.log(chalk.white('\nResults:'));
        console.log(chalk.gray(JSON.stringify(results.summary, null, 2)));
      } catch (error) {
        console.error(chalk.red(`\n❌ Verification failed: ${error.message}`));
      }
    }

    await inquirer.prompt([{ type: 'input', name: 'continue', message: '\nPress Enter to continue...' }]);
  }

  // Production Demo
  async function productionDemo() {
    console.clear();
    console.log(chalk.bold.yellow('\n🏭 Production Simulation Demo\n'));

    console.log(chalk.white('This demo simulates a production message queue environment.'));
    
    const { config } = await inquirer.prompt([
      {
        type: 'list',
        name: 'config',
        message: 'Select topology size:',
        choices: [
          { name: 'Small (1 cluster, 3 brokers, 10 topics)', value: 'small' },
          { name: 'Medium (3 clusters, 10 brokers, 50 topics)', value: 'medium' },
          { name: 'Large (5 clusters, 20 brokers, 100 topics)', value: 'large' }
        ]
      }
    ]);

    const topologyConfig = {
      small: { clusterCount: 1, brokersPerCluster: 3, topicsPerCluster: 10 },
      medium: { clusterCount: 3, brokersPerCluster: 10, topicsPerCluster: 50 },
      large: { clusterCount: 5, brokersPerCluster: 20, topicsPerCluster: 100 }
    };

    console.log(chalk.cyan('\nCreating topology...'));
    
    const simulator = new DataSimulator();
    const topology = simulator.createTopology({
      provider: 'kafka',
      environment: 'production',
      ...topologyConfig[config]
    });

    const totalEntities = topology.clusters.length + topology.brokers.length + topology.topics.length;
    console.log(chalk.green(`\n✅ Created ${totalEntities} entities!`));

    const { simulate } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'simulate',
        message: 'Would you like to simulate metrics for these entities?',
        default: true
      }
    ]);

    if (simulate) {
      console.log(chalk.cyan('\nSimulating metrics...'));
      
      // Update metrics for all entities
      topology.clusters.forEach(cluster => simulator.updateClusterMetrics(cluster));
      topology.brokers.forEach(broker => simulator.updateBrokerMetrics(broker));
      topology.topics.forEach(topic => simulator.updateTopicMetrics(topic));

      console.log(chalk.green('✅ Metrics generated!'));
      
      // Show sample metrics
      const sampleCluster = topology.clusters[0];
      console.log(chalk.white('\nSample cluster metrics:'));
      sampleCluster.goldenMetrics.forEach(metric => {
        console.log(chalk.gray(`• ${metric.name}: ${metric.value} ${metric.unit || ''}`));
      });
    }

    await inquirer.prompt([{ type: 'input', name: 'continue', message: '\nPress Enter to continue...' }]);
  }

  // Mode demos
  async function mode1Demo() {
    console.clear();
    console.log(chalk.bold.yellow('\n🏗️  Mode 1: Entity Proposal & Simulation\n'));
    console.log(chalk.white('This mode is for prototyping new entity types before official adoption.'));
    console.log(chalk.gray('\nFeatures:'));
    console.log(chalk.gray('• Create custom MESSAGE_QUEUE_* entity types'));
    console.log(chalk.gray('• Simulate realistic data patterns'));
    console.log(chalk.gray('• Test entity synthesis'));
    console.log(chalk.gray('• Build and verify dashboards'));
    
    console.log(chalk.cyan('\n📝 See examples/mode1-entity-proposal.js for implementation'));
    
    await inquirer.prompt([{ type: 'input', name: 'continue', message: '\nPress Enter to continue...' }]);
  }

  async function mode2Demo() {
    console.clear();
    console.log(chalk.bold.yellow('\n🔧  Mode 2: Existing Entity Enhancement\n'));
    console.log(chalk.white('This mode enhances existing entity definitions from github.com/newrelic/entity-definitions.'));
    console.log(chalk.gray('\nFeatures:'));
    console.log(chalk.gray('• Import official entity definitions'));
    console.log(chalk.gray('• Add custom golden metrics'));
    console.log(chalk.gray('• Extend with additional metadata'));
    console.log(chalk.gray('• Generate enhanced dashboards'));
    
    console.log(chalk.cyan('\n📝 See examples/mode2-existing-entities.js for implementation'));
    
    await inquirer.prompt([{ type: 'input', name: 'continue', message: '\nPress Enter to continue...' }]);
  }

  async function mode3Demo() {
    console.clear();
    console.log(chalk.bold.yellow('\n🎯  Mode 3: Hybrid Mode\n'));
    console.log(chalk.white('This mode combines new entity proposals with existing definitions.'));
    console.log(chalk.gray('\nFeatures:'));
    console.log(chalk.gray('• Mix official and custom entities'));
    console.log(chalk.gray('• Create unified dashboards'));
    console.log(chalk.gray('• Maintain compatibility'));
    console.log(chalk.gray('• Gradual migration path'));
    
    console.log(chalk.cyan('\n📝 See examples/mode3-hybrid.js for implementation'));
    
    await inquirer.prompt([{ type: 'input', name: 'continue', message: '\nPress Enter to continue...' }]);
  }

  async function showDocs() {
    console.clear();
    console.log(chalk.bold.yellow('\n📚 Documentation\n'));
    
    const { doc } = await inquirer.prompt([
      {
        type: 'list',
        name: 'doc',
        message: 'Select documentation:',
        choices: [
          { name: 'Quick Start Guide', value: 'quickstart' },
          { name: 'Architecture Overview', value: 'architecture' },
          { name: 'API Reference', value: 'api' },
          { name: 'Developer Guide', value: 'developer' },
          { name: 'Entity Specifications', value: 'entities' }
        ]
      }
    ]);

    const docPaths = {
      quickstart: 'docs/QUICKSTART.md',
      architecture: 'docs/ARCHITECTURE.md',
      api: 'docs/API_REFERENCE.md',
      developer: 'docs/DEVELOPER_GUIDE.md',
      entities: 'docs/README.md'
    };

    console.log(chalk.cyan(`\n📄 ${docPaths[doc]}`));
    console.log(chalk.gray('View this file for detailed information.'));
    
    await inquirer.prompt([{ type: 'input', name: 'continue', message: '\nPress Enter to continue...' }]);
  }

  // Start the showcase
  await mainMenu();
}

// Check environment
const hasApiKeys = process.env.NEW_RELIC_API_KEY && process.env.NEW_RELIC_USER_API_KEY;

if (!hasApiKeys) {
  console.log(chalk.yellow('⚠️  Warning: New Relic API keys not found in environment.'));
  console.log(chalk.gray('Some features will run in dry-run mode.\n'));
}

// Run showcase
showcase().catch(error => {
  console.error(chalk.red(`\n❌ Error: ${error.message}`));
  process.exit(1);
});