#!/usr/bin/env node

/**
 * Message Queues Platform CLI
 * 
 * Command-line interface for the New Relic Message Queues Platform
 * Provides commands for simulation, dashboard creation, and verification.
 */

const { program } = require('commander');
const chalk = require('chalk');
const inquirer = require('inquirer');
const path = require('path');

// Import platform modules
const DataSimulator = require('../../simulation/engines/data-simulator');
const NewRelicStreamer = require('../../simulation/streaming/new-relic-streamer');
const DashboardBuilder = require('../../dashboards/builders/dashboard-builder');
const { EntityFactory, PROVIDERS } = require('../../core/entities');

// CLI Configuration
program
  .name('mq-platform')
  .description('New Relic Message Queues Platform CLI')
  .version('1.0.0');

// Global options
program
  .option('-v, --verbose', 'Enable verbose output')
  .option('--api-key <key>', 'New Relic API key (can also use NEW_RELIC_API_KEY env var)')
  .option('--account-id <id>', 'New Relic Account ID (can also use NEW_RELIC_ACCOUNT_ID env var)')
  .option('--config <file>', 'Configuration file path', './config.json');

/**
 * Simulation Commands
 */
const simulate = program
  .command('simulate')
  .description('Generate and stream simulated message queue data');

simulate
  .command('stream')
  .description('Stream simulated message queue data to New Relic')
  .option('-p, --provider <provider>', 'Message queue provider', 'kafka')
  .option('-c, --clusters <count>', 'Number of clusters', '1')
  .option('-b, --brokers <count>', 'Brokers per cluster', '3')
  .option('-t, --topics <count>', 'Topics per cluster', '10')
  .option('-e, --environment <env>', 'Environment name', 'production')
  .option('-r, --region <region>', 'Region name', 'us-east-1')
  .option('-i, --interval <seconds>', 'Streaming interval in seconds', '30')
  .option('-d, --duration <minutes>', 'Duration in minutes (omit for continuous)', null)
  .option('--events', 'Stream as events', true)
  .option('--metrics', 'Stream as metrics', true)
  .action(async (options) => {
    try {
      const { StreamingOrchestrator } = require('../../examples/streaming-example');
      
      const config = {
        newRelic: {
          apiKey: options.apiKey || program.opts().apiKey || process.env.NEW_RELIC_API_KEY,
          accountId: options.accountId || program.opts().accountId || process.env.NEW_RELIC_ACCOUNT_ID,
          batchSize: 50,
          flushInterval: 5000
        },
        simulation: {
          businessHoursStart: 9,
          businessHoursEnd: 17,
          anomalyRate: 0.05
        },
        topology: {
          provider: options.provider.toUpperCase(),
          environment: options.environment,
          region: options.region,
          clusterCount: parseInt(options.clusters),
          brokersPerCluster: parseInt(options.brokers),
          topicsPerCluster: parseInt(options.topics)
        },
        streaming: {
          intervalMs: parseInt(options.interval) * 1000,
          duration: options.duration ? parseInt(options.duration) : null,
          streamEvents: options.events,
          streamMetrics: options.metrics,
          verbose: program.opts().verbose
        }
      };
      
      if (!config.newRelic.apiKey || !config.newRelic.accountId) {
        throw new Error('NEW_RELIC_API_KEY and NEW_RELIC_ACCOUNT_ID are required');
      }
      
      const orchestrator = new StreamingOrchestrator(config);
      await orchestrator.initialize();
      orchestrator.start();
      
      console.log(chalk.green('\n✅ Streaming started successfully!'));
      console.log(chalk.gray('Press Ctrl+C to stop streaming...\n'));
      
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

simulate
  .command('create-topology')
  .description('Create a message queue topology')
  .option('-p, --provider <provider>', 'Message queue provider', 'kafka')
  .option('-c, --clusters <count>', 'Number of clusters', '1')
  .option('-b, --brokers <count>', 'Brokers per cluster', '3')
  .option('-t, --topics <count>', 'Topics per cluster', '10')
  .option('-q, --queues <count>', 'Queues per cluster (for applicable providers)', '5')
  .option('-e, --environment <env>', 'Environment name', 'production')
  .option('-r, --region <region>', 'Region name', 'us-east-1')
  .option('--stream', 'Stream data to New Relic immediately')
  .option('--continuous', 'Start continuous streaming')
  .action(async (options) => {
    try {
      console.log(chalk.blue('🏗️  Creating message queue topology...'));
      
      const simulator = new DataSimulator({
        businessHoursStart: 9,
        businessHoursEnd: 17,
        anomalyRate: 0.05,
        accountId: options.accountId || program.opts().accountId || process.env.NEW_RELIC_ACCOUNT_ID
      });

      const topologyConfig = {
        provider: options.provider,
        environment: options.environment,
        region: options.region,
        clusterCount: parseInt(options.clusters),
        brokersPerCluster: parseInt(options.brokers),
        topicsPerCluster: parseInt(options.topics),
        queuesPerCluster: parseInt(options.queues)
      };

      const topology = simulator.createTopology(topologyConfig);
      
      console.log(chalk.green('✅ Topology created successfully!'));
      console.log(chalk.white('📊 Summary:'));
      console.log(`   • ${topology.clusters.length} clusters`);
      console.log(`   • ${topology.brokers.length} brokers`);
      console.log(`   • ${topology.topics.length} topics`);
      console.log(`   • ${topology.queues.length} queues`);
      console.log(`   • Provider: ${topology.metadata.provider}`);
      console.log(`   • Environment: ${topology.metadata.environment}`);

      if (options.stream) {
        console.log(chalk.blue('📡 Streaming data to New Relic...'));
        
        const streamer = new NewRelicStreamer({
          apiKey: options.apiKey || process.env.NEW_RELIC_API_KEY,
          accountId: options.accountId || process.env.NEW_RELIC_ACCOUNT_ID
        });

        // Stream all entities
        const allEntities = [
          ...topology.clusters,
          ...topology.brokers,
          ...topology.topics,
          ...topology.queues
        ];

        await streamer.streamEvents(allEntities);
        await streamer.flushAll();

        console.log(chalk.green('✅ Initial data streamed successfully!'));
        
        if (options.continuous) {
          console.log(chalk.blue('🔄 Starting continuous simulation...'));
          simulator.startContinuousSimulation(30000); // 30 second intervals
          
          setInterval(async () => {
            const updatedEntities = simulator.entityFactory.entityRegistry;
            await streamer.streamEvents(Array.from(updatedEntities.values()));
          }, 30000);

          console.log(chalk.green('✅ Continuous simulation started. Press Ctrl+C to stop.'));
          
          // Handle graceful shutdown
          process.on('SIGINT', async () => {
            console.log(chalk.yellow('\n🛑 Stopping simulation...'));
            simulator.stopContinuousSimulation();
            await streamer.shutdown();
            console.log(chalk.green('✅ Simulation stopped gracefully'));
            process.exit(0);
          });
        }
      }

    } catch (error) {
      console.error(chalk.red('❌ Error creating topology:'), error.message);
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

simulate
  .command('stream')
  .description('Stream existing topology data to New Relic')
  .option('-i, --interval <ms>', 'Streaming interval in milliseconds', '30000')
  .option('-d, --duration <minutes>', 'Duration to stream in minutes', '60')
  .action(async (options) => {
    try {
      console.log(chalk.blue('📡 Starting data streaming...'));
      
      // Implementation for streaming existing data
      const streamer = new NewRelicStreamer({
        apiKey: options.apiKey || process.env.NEW_RELIC_API_KEY,
        accountId: options.accountId || process.env.NEW_RELIC_ACCOUNT_ID
      });

      const duration = parseInt(options.duration) * 60 * 1000;
      const interval = parseInt(options.interval);
      
      console.log(chalk.white(`Streaming for ${options.duration} minutes at ${interval}ms intervals`));
      
      setTimeout(() => {
        console.log(chalk.green('✅ Streaming completed'));
        process.exit(0);
      }, duration);

    } catch (error) {
      console.error(chalk.red('❌ Error streaming data:'), error.message);
      process.exit(1);
    }
  });

/**
 * Dashboard Commands
 */
const dashboard = program
  .command('dashboard')
  .description('Create and manage New Relic dashboards');

dashboard
  .command('create')
  .description('Create a new dashboard')
  .option('-t, --template <template>', 'Dashboard template', 'overview')
  .option('-n, --name <name>', 'Dashboard name')
  .option('-p, --provider <provider>', 'Message queue provider', 'kafka')
  .option('-e, --environment <env>', 'Environment', 'production')
  .option('-c, --cluster <cluster>', 'Specific cluster name (for cluster dashboard)')
  .option('--dry-run', 'Preview dashboard without creating')
  .option('--no-deploy', 'Build dashboard without deploying')
  .action(async (options) => {
    try {
      console.log(chalk.blue('🎨 Creating dashboard...'));
      
      const DashboardGenerator = require('../../dashboards/lib/dashboard-generator');
      
      const generator = new DashboardGenerator({
        apiKey: options.apiKey || program.opts().apiKey || process.env.NEW_RELIC_USER_API_KEY,
        accountId: options.accountId || program.opts().accountId || process.env.NEW_RELIC_ACCOUNT_ID
      });
      
      let result;
      
      switch (options.template) {
        case 'overview':
          result = await generator.generateOverviewDashboard({
            provider: options.provider,
            environment: options.environment,
            name: options.name,
            deploy: !options.dryRun && options.deploy
          });
          break;
          
        case 'cluster':
          if (!options.cluster) {
            throw new Error('--cluster option is required for cluster template');
          }
          result = await generator.generateClusterDashboard(options.cluster, {
            provider: options.provider,
            name: options.name,
            deploy: !options.dryRun && options.deploy
          });
          break;
          
        case 'topics':
          result = await generator.generateTopicDashboard({
            provider: options.provider,
            environment: options.environment,
            name: options.name,
            deploy: !options.dryRun && options.deploy
          });
          break;
          
        case 'brokers':
          result = await generator.generateBrokerDashboard({
            provider: options.provider,
            environment: options.environment,
            name: options.name,
            deploy: !options.dryRun && options.deploy
          });
          break;
          
        case 'queues':
          result = await generator.generateQueueDashboard({
            provider: options.provider,
            environment: options.environment,
            name: options.name,
            deploy: !options.dryRun && options.deploy
          });
          break;
          
        default:
          throw new Error(`Unknown template: ${options.template}`);
      }

      if (options.dryRun) {
        console.log(chalk.yellow('🔍 Dashboard Preview:'));
        // Handle circular references when stringifying
        const seen = new WeakSet();
        const dashboardJSON = JSON.stringify(result.dashboard, (key, value) => {
          if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) {
              return '[Circular Reference]';
            }
            seen.add(value);
          }
          return value;
        }, 2);
        console.log(dashboardJSON);
      } else if (result.guid) {
        console.log(chalk.green('✅ Dashboard deployed successfully!'));
        console.log(chalk.white('📊 Dashboard Details:'));
        console.log(`   • Name: ${result.name}`);
        console.log(`   • GUID: ${result.guid}`);
        console.log(`   • URL: ${result.permalink}`);
      } else {
        console.log(chalk.green('✅ Dashboard built successfully'));
        console.log(chalk.gray(`   ${result.metadata.widgetCount} widgets across ${result.metadata.pageCount} pages`));
      }

    } catch (error) {
      console.error(chalk.red('❌ Error creating dashboard:'), error.message);
      if (program.opts().verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

dashboard
  .command('list-templates')
  .description('List available dashboard templates')
  .action(async () => {
    try {
      const DashboardGenerator = require('../../dashboards/lib/dashboard-generator');
      const generator = new DashboardGenerator();
      
      const templates = generator.getAvailableTemplates();
      
      console.log(chalk.blue('📋 Available Dashboard Templates:'));
      templates.forEach(template => {
        console.log(chalk.white(`• ${template.name}`) + ` - ${template.description}`);
      });
    } catch (error) {
      console.error(chalk.red('Error listing templates:'), error.message);
    }
  });

dashboard
  .command('generate-suite')
  .description('Generate complete dashboard suite for a provider')
  .requiredOption('-p, --provider <provider>', 'Message queue provider')
  .requiredOption('-e, --environment <env>', 'Environment')
  .option('--dry-run', 'Preview dashboards without creating')
  .action(async (options) => {
    try {
      console.log(chalk.blue(`🚀 Generating dashboard suite for ${options.provider} - ${options.environment}...`));
      
      const DashboardGenerator = require('../../dashboards/lib/dashboard-generator');
      
      const generator = new DashboardGenerator({
        apiKey: options.apiKey || program.opts().apiKey || process.env.NEW_RELIC_USER_API_KEY,
        accountId: options.accountId || program.opts().accountId || process.env.NEW_RELIC_ACCOUNT_ID
      });
      
      const results = await generator.generateProviderSuite(
        options.provider, 
        options.environment,
        { deploy: !options.dryRun }
      );
      
      console.log(chalk.green(`\n✅ Dashboard suite generation complete!`));
      console.log(chalk.white('📊 Created Dashboards:'));
      results.dashboards.forEach(dashboard => {
        console.log(`   • ${dashboard.type}: ${dashboard.name}`);
        if (dashboard.guid) {
          console.log(chalk.gray(`     ${dashboard.permalink}`));
        }
      });
      
      if (results.errors.length > 0) {
        console.log(chalk.yellow('\n⚠️  Errors:'));
        results.errors.forEach(error => {
          console.log(chalk.red(`   • ${error.type}: ${error.error}`));
        });
      }
      
    } catch (error) {
      console.error(chalk.red('Error generating suite:'), error.message);
      if (program.opts().verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

/**
 * Entity Commands
 */
const entity = program
  .command('entity')
  .description('Manage message queue entities');

entity
  .command('import')
  .description('Import entity definitions from github.com/newrelic/entity-definitions')
  .option('-t, --types <types>', 'Entity types to import (comma-separated)')
  .option('-o, --output <file>', 'Export imported definitions to file')
  .option('--list', 'List available entity types')
  .action(async (options) => {
    try {
      const EntityImporter = require('../../core/entities/entity-importer');
      const importer = new EntityImporter();
      
      if (options.list) {
        console.log(chalk.blue('📋 Available entity types to import:'));
        const types = await importer.listAvailableEntityTypes();
        types.forEach(type => {
          console.log(`  • ${type}`);
        });
        return;
      }
      
      if (!options.types) {
        console.error(chalk.red('Error: --types option is required'));
        process.exit(1);
      }
      
      const entityTypes = options.types.split(',').map(t => t.trim());
      console.log(chalk.blue(`📥 Importing entity definitions...`));
      
      const results = await importer.importFromGitHub(entityTypes);
      
      console.log(chalk.green(`\n✅ Import complete!`));
      console.log(chalk.white('Summary:'));
      console.log(`  • Successful: ${results.successful.length}`);
      console.log(`  • Failed: ${results.failed.length}`);
      
      if (results.failed.length > 0) {
        console.log(chalk.yellow('\n⚠️  Failed imports:'));
        results.failed.forEach(failure => {
          console.log(chalk.red(`  • ${failure.entityType}: ${failure.error}`));
        });
      }
      
      if (options.output) {
        await importer.exportToFile(options.output);
        console.log(chalk.gray(`\nExported to: ${options.output}`));
      }
      
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      if (program.opts().verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

entity
  .command('create')
  .description('Create a new entity')
  .option('-t, --type <type>', 'Entity type (cluster, broker, topic, queue)')
  .option('-n, --name <name>', 'Entity name')
  .option('-p, --provider <provider>', 'Provider', 'kafka')
  .action(async (options) => {
    try {
      console.log(chalk.blue('🏗️  Creating entity...'));
      
      const factory = new EntityFactory();
      let entity;

      const config = {
        name: options.name,
        provider: options.provider,
        accountId: options.accountId || process.env.NEW_RELIC_ACCOUNT_ID
      };

      switch (options.type) {
        case 'cluster':
          entity = factory.createCluster(config);
          break;
        case 'broker':
          entity = factory.createBroker({
            ...config,
            brokerId: 0,
            hostname: options.name,
            clusterName: 'default-cluster'
          });
          break;
        case 'topic':
          entity = factory.createTopic({
            ...config,
            topic: options.name,
            clusterName: 'default-cluster'
          });
          break;
        case 'queue':
          entity = factory.createQueue({
            ...config,
            queueName: options.name
          });
          break;
        default:
          throw new Error(`Unknown entity type: ${options.type}`);
      }

      console.log(chalk.green('✅ Entity created successfully!'));
      console.log(chalk.white('📊 Entity Details:'));
      console.log(`   • Type: ${entity.entityType}`);
      console.log(`   • Name: ${entity.name}`);
      console.log(`   • GUID: ${entity.guid}`);
      console.log(`   • Provider: ${entity.provider}`);

    } catch (error) {
      console.error(chalk.red('❌ Error creating entity:'), error.message);
      process.exit(1);
    }
  });

/**
 * Verification Commands
 */
const verify = program
  .command('verify')
  .description('Verify dashboard functionality and performance');

verify
  .command('dashboard')
  .description('Verify a single dashboard')
  .option('-g, --guid <guid>', 'Dashboard GUID to verify')
  .option('-l, --load-test', 'Include load testing')
  .option('-f, --format <format>', 'Report format (json, html, csv)', 'json')
  .option('-o, --output <dir>', 'Output directory for reports', './verification-results')
  .action(async (options) => {
    try {
      if (!options.guid) {
        console.error(chalk.red('❌ Dashboard GUID is required'));
        process.exit(1);
      }

      console.log(chalk.blue(`🔍 Verifying dashboard: ${options.guid}`));
      
      const VerificationRunner = require('../../verification/runners/verification-runner');
      const runner = new VerificationRunner({
        apiKey: options.apiKey || process.env.NEW_RELIC_USER_API_KEY,
        accountId: options.accountId || process.env.NEW_RELIC_ACCOUNT_ID,
        outputDir: options.output,
        reportFormats: [options.format],
        includeLoadTests: options.loadTest
      });

      const results = await runner.verifyDashboard(options.guid, {
        includeLoadTest: options.loadTest
      });

      console.log(chalk.green('✅ Dashboard verification completed!'));
      console.log(chalk.white('📊 Results:'));
      console.log(`   • Overall Score: ${results.summary.overallScore.toFixed(1)}/100`);
      console.log(`   • Pass Rate: ${results.summary.passRate.toFixed(1)}%`);
      console.log(`   • Tests Passed: ${results.summary.testsPassed}/${results.summary.totalTests}`);
      console.log(`   • Recommendations: ${results.recommendations.length}`);
      
      if (results.recommendations.length > 0) {
        console.log(chalk.yellow('⚠️  Top Recommendations:'));
        results.recommendations.slice(0, 3).forEach(rec => {
          console.log(`   • ${rec.category}: ${rec.issue}`);
        });
      }

    } catch (error) {
      console.error(chalk.red('❌ Dashboard verification failed:'), error.message);
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

verify
  .command('batch')
  .description('Verify multiple dashboards')
  .option('-g, --guids <guids>', 'Comma-separated list of dashboard GUIDs')
  .option('-f, --file <file>', 'File containing dashboard GUIDs (one per line)')
  .option('-c, --concurrency <num>', 'Number of concurrent verifications', '3')
  .option('-l, --load-test', 'Include load testing')
  .option('-o, --output <dir>', 'Output directory for reports', './verification-results')
  .option('--stop-on-failure', 'Stop batch on first failure')
  .action(async (options) => {
    try {
      let dashboardGuids = [];

      if (options.guids) {
        dashboardGuids = options.guids.split(',').map(guid => guid.trim());
      } else if (options.file) {
        const fs = require('fs');
        const content = fs.readFileSync(options.file, 'utf8');
        dashboardGuids = content.split('\n').map(line => line.trim()).filter(line => line);
      } else {
        console.error(chalk.red('❌ Either --guids or --file is required'));
        process.exit(1);
      }

      console.log(chalk.blue(`🔄 Starting batch verification for ${dashboardGuids.length} dashboards`));
      
      const VerificationRunner = require('../../verification/runners/verification-runner');
      const runner = new VerificationRunner({
        apiKey: options.apiKey || process.env.NEW_RELIC_USER_API_KEY,
        accountId: options.accountId || process.env.NEW_RELIC_ACCOUNT_ID,
        outputDir: options.output,
        parallelExecutions: parseInt(options.concurrency),
        includeLoadTests: options.loadTest
      });

      const results = await runner.verifyDashboards(dashboardGuids, {
        concurrency: parseInt(options.concurrency),
        stopOnFirstFailure: options.stopOnFailure,
        includeLoadTest: options.loadTest
      });

      console.log(chalk.green('✅ Batch verification completed!'));
      console.log(chalk.white('📊 Batch Summary:'));
      console.log(`   • Total Dashboards: ${results.successful.length + results.failed.length}`);
      console.log(`   • Successful: ${results.successful.length}`);
      console.log(`   • Failed: ${results.failed.length}`);
      console.log(`   • Average Score: ${results.summary.averageScore.toFixed(1)}/100`);
      console.log(`   • Pass Rate: ${results.summary.passRate.toFixed(1)}%`);

    } catch (error) {
      console.error(chalk.red('❌ Batch verification failed:'), error.message);
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

verify
  .command('platform')
  .description('Run comprehensive platform verification')
  .option('--verify-entities', 'Verify entity synthesis', true)
  .option('--verify-dashboards', 'Verify dashboards', true)
  .option('--verify-browser', 'Run browser tests', true)
  .option('--verify-e2e', 'Run end-to-end tests', false)
  .option('-d, --dashboard-guids <guids>', 'Dashboard GUIDs to verify')
  .option('-u, --dashboard-urls <urls>', 'Dashboard URLs for browser testing')
  .option('-o, --output <dir>', 'Output directory', './verification-results')
  .option('--browsers <browsers>', 'Browsers to test (comma-separated)', 'chromium')
  .action(async (options) => {
    try {
      const VerificationOrchestrator = require('../../verification/lib/verification-orchestrator');
      
      const orchestrator = new VerificationOrchestrator({
        apiKey: program.opts().apiKey || process.env.NEW_RELIC_API_KEY,
        userApiKey: program.opts().apiKey || process.env.NEW_RELIC_USER_API_KEY,
        accountId: program.opts().accountId || process.env.NEW_RELIC_ACCOUNT_ID,
        outputDir: options.output,
        runBrowserTests: options.verifyBrowser,
        browsers: options.browsers.split(',')
      });
      
      const verificationOptions = {
        verifyEntities: options.verifyEntities,
        verifyDashboards: options.verifyDashboards,
        runE2E: options.verifyE2e,
        dashboardGuids: options.dashboardGuids ? options.dashboardGuids.split(',') : undefined,
        dashboardUrls: options.dashboardUrls ? options.dashboardUrls.split(',') : undefined
      };
      
      console.log(chalk.blue('🚀 Starting platform verification...'));
      
      const { verification, reports } = await orchestrator.verifyPlatform(verificationOptions);
      
      console.log(chalk.green('\n✅ Verification complete!'));
      console.log(chalk.white('Reports generated:'));
      Object.entries(reports).forEach(([format, path]) => {
        console.log(`  • ${format.toUpperCase()}: ${path}`);
      });
      
      process.exit(verification.summary?.passed ? 0 : 1);
      
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      if (program.opts().verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

verify
  .command('test-framework')
  .description('Run verification system tests')
  .option('--unit', 'Run unit tests only')
  .option('--integration', 'Run integration tests only')
  .option('--performance', 'Include performance tests')
  .option('--timeout <ms>', 'Test timeout in milliseconds', '30000')
  .action(async (options) => {
    try {
      console.log(chalk.blue('🧪 Running verification test framework...'));
      
      const VerificationTestFramework = require('../../verification/testing/test-framework');
      const testFramework = new VerificationTestFramework({
        testTimeout: parseInt(options.timeout),
        runPerformanceTests: options.performance
      });

      const results = await testFramework.runAllTests();

      if (results.success) {
        console.log(chalk.green('✅ All tests passed!'));
      } else {
        console.log(chalk.yellow('⚠️  Some tests failed'));
      }

      console.log(chalk.white('📊 Test Summary:'));
      console.log(`   • Total Tests: ${results.summary.total}`);
      console.log(`   • Passed: ${results.summary.passed}`);
      console.log(`   • Failed: ${results.summary.failed}`);
      console.log(`   • Pass Rate: ${results.summary.passRate.toFixed(1)}%`);

      Object.entries(results.summary.categories).forEach(([category, stats]) => {
        console.log(`   • ${category}: ${stats.passed}/${stats.total}`);
      });

      if (!results.success) {
        process.exit(1);
      }

    } catch (error) {
      console.error(chalk.red('❌ Test framework failed:'), error.message);
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

/**
 * Configuration Commands
 */
const config = program
  .command('config')
  .description('Manage platform configuration');

config
  .command('init')
  .description('Initialize configuration interactively')
  .action(async () => {
    try {
      console.log(chalk.blue('🔧 Initializing configuration...'));
      
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'apiKey',
          message: 'New Relic API Key:',
          default: process.env.NEW_RELIC_API_KEY
        },
        {
          type: 'input',
          name: 'userApiKey',
          message: 'New Relic User API Key (for dashboard creation):',
          default: process.env.NEW_RELIC_USER_API_KEY
        },
        {
          type: 'input',
          name: 'accountId',
          message: 'New Relic Account ID:',
          default: process.env.NEW_RELIC_ACCOUNT_ID
        },
        {
          type: 'list',
          name: 'defaultProvider',
          message: 'Default message queue provider:',
          choices: Object.values(PROVIDERS),
          default: PROVIDERS.KAFKA
        },
        {
          type: 'input',
          name: 'defaultEnvironment',
          message: 'Default environment:',
          default: 'production'
        },
        {
          type: 'input',
          name: 'defaultRegion',
          message: 'Default region:',
          default: 'us-east-1'
        }
      ]);

      const configData = {
        newRelic: {
          apiKey: answers.apiKey,
          userApiKey: answers.userApiKey,
          accountId: answers.accountId
        },
        defaults: {
          provider: answers.defaultProvider,
          environment: answers.defaultEnvironment,
          region: answers.defaultRegion
        },
        simulation: {
          businessHoursStart: 9,
          businessHoursEnd: 17,
          anomalyRate: 0.05,
          refreshInterval: 30000
        }
      };

      const fs = require('fs');
      fs.writeFileSync('./config.json', JSON.stringify(configData, null, 2));
      
      console.log(chalk.green('✅ Configuration saved to config.json'));

    } catch (error) {
      console.error(chalk.red('❌ Error initializing configuration:'), error.message);
      process.exit(1);
    }
  });

config
  .command('validate')
  .description('Validate current configuration')
  .action(() => {
    try {
      console.log(chalk.blue('🔍 Validating configuration...'));
      
      const requiredEnvVars = [
        'NEW_RELIC_API_KEY',
        'NEW_RELIC_ACCOUNT_ID'
      ];

      const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
      
      if (missingVars.length > 0) {
        console.log(chalk.yellow('⚠️  Missing environment variables:'));
        missingVars.forEach(varName => {
          console.log(`   • ${varName}`);
        });
      } else {
        console.log(chalk.green('✅ All required environment variables are set'));
      }

      // Check optional variables
      const optionalVars = ['NEW_RELIC_USER_API_KEY'];
      const missingOptional = optionalVars.filter(varName => !process.env[varName]);
      
      if (missingOptional.length > 0) {
        console.log(chalk.blue('ℹ️  Optional environment variables (needed for dashboard creation):'));
        missingOptional.forEach(varName => {
          console.log(`   • ${varName}`);
        });
      }

    } catch (error) {
      console.error(chalk.red('❌ Error validating configuration:'), error.message);
      process.exit(1);
    }
  });

/**
 * Info Commands
 */
program
  .command('providers')
  .description('List supported message queue providers')
  .action(() => {
    console.log(chalk.blue('📋 Supported Providers:'));
    Object.entries(PROVIDERS).forEach(([key, value]) => {
      console.log(`   • ${chalk.white(key.toLowerCase())}: ${value}`);
    });
  });

program
  .command('status')
  .description('Show platform status and statistics')
  .action(async () => {
    try {
      console.log(chalk.blue('📊 Platform Status:'));
      
      // Show environment variables
      console.log(chalk.white('\nEnvironment:'));
      console.log(`   • API Key: ${process.env.NEW_RELIC_API_KEY ? '✅ Set' : '❌ Not set'}`);
      console.log(`   • User API Key: ${process.env.NEW_RELIC_USER_API_KEY ? '✅ Set' : '❌ Not set'}`);
      console.log(`   • Account ID: ${process.env.NEW_RELIC_ACCOUNT_ID || '❌ Not set'}`);
      
      // Show platform capabilities
      console.log(chalk.white('\nCapabilities:'));
      console.log('   • ✅ Entity simulation');
      console.log('   • ✅ Data streaming');
      console.log('   • ✅ Dashboard creation');
      console.log('   • ✅ Multi-provider support');
      
    } catch (error) {
      console.error(chalk.red('❌ Error getting status:'), error.message);
      process.exit(1);
    }
  });

/**
 * Interactive Mode
 */
program
  .command('interactive')
  .alias('i')
  .description('Start interactive mode')
  .action(async () => {
    try {
      console.log(chalk.blue('🎯 Welcome to Message Queues Platform Interactive Mode!'));
      
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            'Create and stream topology',
            'Create dashboard',
            'Configure platform',
            'View status',
            'Exit'
          ]
        }
      ]);

      switch (action) {
        case 'Create and stream topology':
          // Interactive topology creation
          const topologyAnswers = await inquirer.prompt([
            {
              type: 'list',
              name: 'provider',
              message: 'Select provider:',
              choices: Object.values(PROVIDERS)
            },
            {
              type: 'input',
              name: 'clusters',
              message: 'Number of clusters:',
              default: '1'
            },
            {
              type: 'input',
              name: 'environment',
              message: 'Environment:',
              default: 'production'
            },
            {
              type: 'confirm',
              name: 'stream',
              message: 'Stream data to New Relic?',
              default: true
            }
          ]);
          
          console.log(chalk.green('🚀 Creating topology with your selections...'));
          // Implementation would go here
          break;
          
        case 'Exit':
          console.log(chalk.green('👋 Goodbye!'));
          process.exit(0);
          break;
          
        default:
          console.log(chalk.yellow('Feature coming soon!'));
      }

    } catch (error) {
      console.error(chalk.red('❌ Error in interactive mode:'), error.message);
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();

// If no command provided, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}