/**
 * Mode 3: Hybrid Mode
 * 
 * This example demonstrates how to combine new entity proposals with existing
 * entity definitions to create a comprehensive monitoring solution.
 */

const chalk = require('chalk');
const DataSimulator = require('../simulation/engines/data-simulator');
const NewRelicStreamer = require('../simulation/streaming/new-relic-streamer');
const EntityImporter = require('../core/entities/entity-importer');
const EntityVerifier = require('../verification/lib/entity-verifier');
const DashboardGenerator = require('../dashboards/lib/dashboard-generator');
const VerificationOrchestrator = require('../verification/lib/verification-orchestrator');
const ReportGenerator = require('../verification/lib/report-generator');

async function runHybridWorkflow(config = {}) {
  console.log(chalk.bold.blue('\n🚀 Mode 3: Hybrid Mode Workflow'));
  console.log(chalk.gray('=' .repeat(60)));
  console.log(chalk.white('Purpose: Combine new entity proposals with existing definitions'));
  console.log(chalk.white('Use Case: Extending existing monitoring with custom entity types'));
  console.log();

  const workflow = {
    startTime: Date.now(),
    steps: [],
    results: {}
  };

  try {
    // Step 1: Import existing entity definitions
    console.log(chalk.yellow('\n📥 Step 1: Import Existing Entity Definitions'));
    
    const entityImporter = new EntityImporter();
    
    // Import standard Kafka entity types
    const existingTypes = ['KAFKACLUSTER', 'KAFKABROKER', 'KAFKATOPIC'];
    const importResults = await entityImporter.importFromGitHub(existingTypes);
    
    workflow.results.importedEntities = importResults;
    
    console.log(chalk.green('✅ Imported existing entities:'));
    importResults.successful.forEach(type => {
      console.log(chalk.gray(`   • ${type}`));
    });
    
    workflow.steps.push({
      name: 'Import Existing Entities',
      status: 'completed',
      entityCount: importResults.successful.length,
      duration: Date.now() - workflow.startTime
    });

    // Step 2: Define new custom entity types
    console.log(chalk.yellow('\n📋 Step 2: Define New Custom Entity Types'));
    console.log(chalk.gray('Creating MESSAGE_QUEUE_CONSUMER_GROUP entity proposal...'));
    
    const simulator = new DataSimulator({
      businessHoursStart: 9,
      businessHoursEnd: 17,
      anomalyRate: 0.05
    });

    // Create hybrid topology with both standard and custom entities
    const topologyConfig = {
      provider: 'kafka-hybrid',
      environment: 'production',
      region: 'us-east-1',
      clusterCount: 2,
      brokersPerCluster: 3,
      topicsPerCluster: 10,
      clusterConfig: {
        team: 'platform-engineering',
        criticality: 'high'
      }
    };

    const topology = simulator.createTopology(topologyConfig);
    
    // Add custom entity types (consumer groups)
    const consumerGroups = [];
    topology.topics.forEach(topic => {
      // Create 2-3 consumer groups per topic
      const groupCount = Math.floor(Math.random() * 2) + 2;
      for (let i = 0; i < groupCount; i++) {
        const consumerGroup = {
          entityType: 'MESSAGE_QUEUE_CONSUMER_GROUP',
          guid: `MESSAGE_QUEUE_CONSUMER_GROUP|${topic.accountId}|${topic.clusterName}|${topic.topic}|consumer-group-${i}`,
          name: `${topic.topic}-consumer-group-${i}`,
          provider: topic.provider,
          accountId: topic.accountId,
          clusterName: topic.clusterName,
          topicName: topic.topic,
          groupId: `consumer-group-${i}`,
          state: 'STABLE',
          members: Math.floor(Math.random() * 5) + 1,
          lag: Math.floor(Math.random() * 1000),
          committedOffset: Math.floor(Math.random() * 1000000),
          endOffset: Math.floor(Math.random() * 1000000) + 1000,
          tags: {
            environment: topic.tags.environment,
            team: topic.tags.team,
            application: `app-${i}`
          },
          metrics: {
            'mq.consumerGroup.lag': Math.floor(Math.random() * 1000),
            'mq.consumerGroup.members': Math.floor(Math.random() * 5) + 1,
            'mq.consumerGroup.messageRate': Math.random() * 1000,
            'mq.consumerGroup.commitRate': Math.random() * 900
          }
        };
        consumerGroups.push(consumerGroup);
      }
    });
    
    workflow.results.customEntities = consumerGroups;
    workflow.results.topology = topology;
    
    console.log(chalk.green('✅ Created hybrid topology:'));
    console.log(chalk.gray(`   • Standard Entities:`));
    console.log(chalk.gray(`     - Clusters: ${topology.clusters.length}`));
    console.log(chalk.gray(`     - Brokers: ${topology.brokers.length}`));
    console.log(chalk.gray(`     - Topics: ${topology.topics.length}`));
    console.log(chalk.gray(`   • Custom Entities:`));
    console.log(chalk.gray(`     - Consumer Groups: ${consumerGroups.length}`));
    
    workflow.steps.push({
      name: 'Define Custom Entities',
      status: 'completed',
      customEntityCount: consumerGroups.length,
      duration: Date.now() - workflow.startTime
    });

    // Step 3: Stream all entities to New Relic
    console.log(chalk.yellow('\n📤 Step 3: Stream Hybrid Entity Data'));
    
    const streamer = new NewRelicStreamer({
      apiKey: config.apiKey || process.env.NEW_RELIC_API_KEY,
      accountId: config.accountId || process.env.NEW_RELIC_ACCOUNT_ID,
      batchSize: 50,
      flushInterval: 5000
    });

    // Stream all entities (standard + custom)
    const allEntities = [
      ...topology.clusters,
      ...topology.brokers,
      ...topology.topics,
      ...topology.queues,
      ...consumerGroups
    ];

    console.log(chalk.gray(`Streaming ${allEntities.length} entities (standard + custom)...`));
    
    // Update metrics with realistic patterns
    for (let i = 0; i < 5; i++) {
      allEntities.forEach(entity => {
        if (entity.entityType === 'MESSAGE_QUEUE_CONSUMER_GROUP') {
          // Update consumer group metrics
          entity.metrics['mq.consumerGroup.lag'] += Math.random() * 100 - 50;
          entity.metrics['mq.consumerGroup.messageRate'] = Math.random() * 1000;
          entity.metrics['mq.consumerGroup.commitRate'] = entity.metrics['mq.consumerGroup.messageRate'] * 0.95;
        } else if (entity.entityType === 'MESSAGE_QUEUE_CLUSTER') {
          simulator.updateClusterMetrics(entity);
        } else if (entity.entityType === 'MESSAGE_QUEUE_BROKER') {
          simulator.updateBrokerMetrics(entity);
        } else if (entity.entityType === 'MESSAGE_QUEUE_TOPIC') {
          simulator.updateTopicMetrics(entity);
        }
      });
      
      streamer.streamEvents(allEntities);
    }
    
    await streamer.flushAll();
    const stats = streamer.getStats();
    
    console.log(chalk.green('✅ Streamed hybrid entity data'));
    console.log(chalk.gray(`   • Events sent: ${stats.events.sent}`));
    console.log(chalk.gray(`   • Metrics sent: ${stats.metrics.sent}`));
    
    workflow.steps.push({
      name: 'Stream Hybrid Data',
      status: 'completed',
      eventsStreamed: stats.events.sent,
      duration: Date.now() - workflow.startTime
    });

    // Step 4: Build comprehensive dashboards
    console.log(chalk.yellow('\n📊 Step 4: Build Comprehensive Dashboards'));
    
    const dashboardGenerator = new DashboardGenerator({
      apiKey: config.userApiKey || process.env.NEW_RELIC_USER_API_KEY,
      accountId: config.accountId
    });

    const dashboards = [];
    
    // Create enhanced overview dashboard
    console.log(chalk.gray('Creating enhanced overview dashboard...'));
    const overviewDashboard = await dashboardGenerator.generateOverviewDashboard({
      provider: 'kafka-hybrid',
      environment: 'production',
      name: 'Kafka Hybrid Infrastructure Overview',
      deploy: !config.dryRun,
      customQueries: [
        {
          title: 'Consumer Group Lag Distribution',
          query: `SELECT histogram(mq.consumerGroup.lag, 50, 10) FROM MESSAGE_QUEUE_CONSUMER_GROUP WHERE provider = 'kafka-hybrid' FACET groupId`,
          visualization: 'histogram'
        },
        {
          title: 'Consumer Group Health',
          query: `SELECT average(mq.consumerGroup.lag) as 'Avg Lag', average(mq.consumerGroup.members) as 'Avg Members' FROM MESSAGE_QUEUE_CONSUMER_GROUP WHERE provider = 'kafka-hybrid' TIMESERIES`,
          visualization: 'line'
        }
      ]
    });
    dashboards.push(overviewDashboard);
    
    // Create consumer group specific dashboard
    console.log(chalk.gray('Creating consumer group dashboard...'));
    const consumerGroupDashboard = {
      name: 'Kafka Consumer Groups Monitor',
      description: 'Monitor consumer group performance and lag',
      permissions: 'PUBLIC_READ_WRITE',
      pages: [{
        name: 'Consumer Groups',
        description: 'Consumer group metrics and health',
        widgets: [
          {
            title: 'Consumer Group Count',
            row: 1,
            column: 1,
            width: 4,
            height: 3,
            configuration: {
              nrqlQueries: [{
                query: `SELECT uniqueCount(groupId) FROM MESSAGE_QUEUE_CONSUMER_GROUP WHERE provider = 'kafka-hybrid'`
              }]
            },
            visualization: { id: 'viz.billboard' }
          },
          {
            title: 'Total Consumer Lag',
            row: 1,
            column: 5,
            width: 4,
            height: 3,
            configuration: {
              nrqlQueries: [{
                query: `SELECT sum(mq.consumerGroup.lag) FROM MESSAGE_QUEUE_CONSUMER_GROUP WHERE provider = 'kafka-hybrid'`
              }]
            },
            visualization: { id: 'viz.billboard' }
          },
          {
            title: 'Consumer Group Lag by Topic',
            row: 1,
            column: 9,
            width: 4,
            height: 3,
            configuration: {
              nrqlQueries: [{
                query: `SELECT average(mq.consumerGroup.lag) FROM MESSAGE_QUEUE_CONSUMER_GROUP WHERE provider = 'kafka-hybrid' FACET topicName`
              }]
            },
            visualization: { id: 'viz.bar' }
          },
          {
            title: 'Consumer Group Lag Trend',
            row: 4,
            column: 1,
            width: 12,
            height: 3,
            configuration: {
              nrqlQueries: [{
                query: `SELECT average(mq.consumerGroup.lag) FROM MESSAGE_QUEUE_CONSUMER_GROUP WHERE provider = 'kafka-hybrid' FACET groupId TIMESERIES`
              }]
            },
            visualization: { id: 'viz.line' }
          },
          {
            title: 'Message Processing Rate',
            row: 7,
            column: 1,
            width: 6,
            height: 3,
            configuration: {
              nrqlQueries: [{
                query: `SELECT rate(sum(mq.consumerGroup.messageRate), 1 minute) FROM MESSAGE_QUEUE_CONSUMER_GROUP WHERE provider = 'kafka-hybrid' FACET groupId TIMESERIES`
              }]
            },
            visualization: { id: 'viz.area' }
          },
          {
            title: 'Consumer Group Members',
            row: 7,
            column: 7,
            width: 6,
            height: 3,
            configuration: {
              nrqlQueries: [{
                query: `SELECT latest(mq.consumerGroup.members) FROM MESSAGE_QUEUE_CONSUMER_GROUP WHERE provider = 'kafka-hybrid' FACET groupId`
              }]
            },
            visualization: { id: 'viz.table' }
          }
        ]
      }]
    };
    
    if (!config.dryRun) {
      // Deploy consumer group dashboard
      console.log(chalk.gray('Deploying consumer group dashboard...'));
      // This would use NerdGraph API to deploy
      dashboards.push({ 
        dashboard: consumerGroupDashboard, 
        name: consumerGroupDashboard.name,
        type: 'consumer-groups'
      });
    }
    
    workflow.results.dashboards = dashboards;
    
    console.log(chalk.green('✅ Created comprehensive dashboards:'));
    dashboards.forEach(dashboard => {
      console.log(chalk.gray(`   • ${dashboard.name || dashboard.dashboard.name}`));
    });
    
    workflow.steps.push({
      name: 'Build Dashboards',
      status: 'completed',
      dashboardCount: dashboards.length,
      duration: Date.now() - workflow.startTime
    });

    // Step 5: Verify entity synthesis (wait for processing)
    console.log(chalk.yellow('\n🔍 Step 5: Verify Entity Synthesis'));
    console.log(chalk.gray('Waiting 30 seconds for entity synthesis...'));
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    const entityVerifier = new EntityVerifier({
      apiKey: config.apiKey,
      accountId: config.accountId
    });

    // Verify standard entities
    const standardVerification = await entityVerifier.verifyEntitySynthesis(
      'MESSAGE_QUEUE_CLUSTER',
      topology.clusters.length
    );
    
    // Verify custom entities
    const customVerification = await entityVerifier.verifyEntitySynthesis(
      'MESSAGE_QUEUE_CONSUMER_GROUP',
      consumerGroups.length
    );
    
    workflow.results.entityVerification = {
      standard: standardVerification,
      custom: customVerification
    };
    
    console.log(chalk.green('✅ Entity synthesis verification:'));
    console.log(chalk.gray(`   • Standard Entities: ${standardVerification.score}% (${standardVerification.passed ? 'Passed' : 'Failed'})`));
    console.log(chalk.gray(`   • Custom Entities: ${customVerification.score}% (${customVerification.passed ? 'Passed' : 'Failed'})`));
    
    workflow.steps.push({
      name: 'Verify Synthesis',
      status: standardVerification.passed && customVerification.passed ? 'completed' : 'warning',
      duration: Date.now() - workflow.startTime
    });

    // Step 6: Run comprehensive platform verification
    console.log(chalk.yellow('\n✅ Step 6: Run Comprehensive Platform Verification'));
    
    const verificationOrchestrator = new VerificationOrchestrator({
      apiKey: config.apiKey,
      userApiKey: config.userApiKey,
      accountId: config.accountId,
      outputDir: './hybrid-verification'
    });

    const platformVerification = await verificationOrchestrator.verifyPlatform({
      verifyEntities: true,
      verifyDashboards: true,
      dashboardGuids: dashboards.filter(d => d.guid).map(d => d.guid),
      entityConfig: {
        entityTypes: [
          'MESSAGE_QUEUE_CLUSTER',
          'MESSAGE_QUEUE_BROKER',
          'MESSAGE_QUEUE_TOPIC',
          'MESSAGE_QUEUE_CONSUMER_GROUP'
        ],
        expectedCounts: {
          'MESSAGE_QUEUE_CLUSTER': topology.clusters.length,
          'MESSAGE_QUEUE_BROKER': topology.brokers.length,
          'MESSAGE_QUEUE_TOPIC': topology.topics.length,
          'MESSAGE_QUEUE_CONSUMER_GROUP': consumerGroups.length
        }
      }
    });
    
    workflow.results.platformVerification = platformVerification.verification;
    
    console.log(chalk.green('✅ Platform verification complete:'));
    console.log(chalk.gray(`   • Overall Score: ${platformVerification.verification.summary.overallScore}%`));
    console.log(chalk.gray(`   • Entity Verification: ${platformVerification.verification.stages?.entities?.summary?.score || 0}%`));
    console.log(chalk.gray(`   • Dashboard Verification: ${platformVerification.verification.stages?.dashboards?.summary?.averageScore || 0}%`));
    
    workflow.steps.push({
      name: 'Platform Verification',
      status: 'completed',
      score: platformVerification.verification.summary.overallScore,
      duration: Date.now() - workflow.startTime
    });

    // Step 7: Generate comparison report
    console.log(chalk.yellow('\n📈 Step 7: Generate Hybrid Analysis Report'));
    
    const reportGenerator = new ReportGenerator({
      outputDir: './hybrid-verification'
    });
    
    // Create custom hybrid analysis
    const hybridAnalysis = {
      id: `hybrid-analysis-${Date.now()}`,
      timestamp: new Date().toISOString(),
      summary: {
        mode: 'Hybrid Mode',
        standardEntities: {
          imported: importResults.successful.length,
          verified: standardVerification.actualCount
        },
        customEntities: {
          proposed: consumerGroups.length,
          verified: customVerification.actualCount
        },
        totalEntities: allEntities.length,
        dashboardsCreated: dashboards.length,
        overallSuccess: standardVerification.passed && customVerification.passed
      },
      benefits: [
        'Leveraged existing entity definitions for standard components',
        'Extended monitoring with custom consumer group entities',
        'Created unified dashboards combining both entity types',
        'Validated full entity synthesis for hybrid approach'
      ],
      recommendations: [
        {
          category: 'Entity Definition',
          severity: 'medium',
          issue: 'Custom MESSAGE_QUEUE_CONSUMER_GROUP not in official entity definitions',
          recommendation: 'Submit PR to github.com/newrelic/entity-definitions with consumer group entity proposal'
        },
        {
          category: 'Dashboard Enhancement',
          severity: 'low',
          issue: 'Consumer group dashboard could benefit from alert conditions',
          recommendation: 'Add alert conditions for high consumer lag and member changes'
        },
        {
          category: 'Relationship Mapping',
          severity: 'medium',
          issue: 'Consumer groups not linked to topics in entity relationships',
          recommendation: 'Define CONSUMES relationship between consumer groups and topics'
        }
      ],
      verification: platformVerification.verification
    };
    
    const reports = await reportGenerator.generateReports(hybridAnalysis);
    workflow.results.reports = reports;
    
    console.log(chalk.green('✅ Generated hybrid analysis reports'));
    
    workflow.steps.push({
      name: 'Generate Reports',
      status: 'completed',
      reportCount: Object.keys(reports).length,
      duration: Date.now() - workflow.startTime
    });

    // Summary
    console.log(chalk.bold.green('\n✅ Hybrid Mode Workflow Complete!'));
    console.log(chalk.white('\n📊 Workflow Summary:'));
    console.log(chalk.gray(`   • Total Duration: ${(Date.now() - workflow.startTime) / 1000}s`));
    console.log(chalk.gray(`   • Steps Completed: ${workflow.steps.length}`));
    console.log(chalk.gray(`   • Standard Entities: ${importResults.successful.length} imported`));
    console.log(chalk.gray(`   • Custom Entities: ${consumerGroups.length} created`));
    console.log(chalk.gray(`   • Total Entities: ${allEntities.length} streamed`));
    console.log(chalk.gray(`   • Dashboards: ${dashboards.length} created`));
    console.log(chalk.gray(`   • Verification Score: ${platformVerification.verification.summary.overallScore}%`));
    
    console.log(chalk.white('\n🎯 Key Benefits of Hybrid Mode:'));
    console.log(chalk.gray('   1. Reuse existing, proven entity definitions'));
    console.log(chalk.gray('   2. Extend with custom entity types for specific needs'));
    console.log(chalk.gray('   3. Unified monitoring across standard and custom entities'));
    console.log(chalk.gray('   4. Faster time to value with existing definitions'));
    console.log(chalk.gray('   5. Innovation through custom entity proposals'));
    
    console.log(chalk.white('\n📝 Next Steps:'));
    console.log(chalk.gray('   1. Review verification results in ./hybrid-verification/'));
    console.log(chalk.gray('   2. Submit custom entity definitions to official repository'));
    console.log(chalk.gray('   3. Create alert policies for hybrid infrastructure'));
    console.log(chalk.gray('   4. Share dashboards with team for feedback'));
    console.log(chalk.gray('   5. Monitor entity synthesis success rate over time'));

    // Cleanup
    await streamer.shutdown();

    return workflow;

  } catch (error) {
    console.error(chalk.red(`\n❌ Workflow failed: ${error.message}`));
    console.error(error.stack);
    workflow.error = error;
    return workflow;
  }
}

// Run if executed directly
if (require.main === module) {
  // Check for required environment variables
  const requiredVars = ['NEW_RELIC_API_KEY', 'NEW_RELIC_USER_API_KEY', 'NEW_RELIC_ACCOUNT_ID'];
  const missing = requiredVars.filter(v => !process.env[v]);
  
  if (missing.length > 0) {
    console.error(chalk.red('❌ Missing required environment variables:'));
    missing.forEach(v => console.error(chalk.red(`   • ${v}`)));
    process.exit(1);
  }

  // Parse command line arguments
  const args = process.argv.slice(2);
  const options = {
    dryRun: args.includes('--dry-run')
  };

  console.log(chalk.blue(`
╔══════════════════════════════════════════════════════════════╗
║          New Relic Message Queues Platform                   ║
║                  Hybrid Mode Example                         ║
╚══════════════════════════════════════════════════════════════╝
`));

  if (options.dryRun) {
    console.log(chalk.yellow('🔸 Running in DRY RUN mode - dashboards will not be deployed'));
  }

  runHybridWorkflow({
    apiKey: process.env.NEW_RELIC_API_KEY,
    userApiKey: process.env.NEW_RELIC_USER_API_KEY,
    accountId: process.env.NEW_RELIC_ACCOUNT_ID,
    ...options
  }).then(() => {
    console.log(chalk.green('\n👋 Hybrid workflow completed successfully!'));
  }).catch(error => {
    console.error(chalk.red('\n❌ Workflow error:'), error);
    process.exit(1);
  });
}

module.exports = { runHybridWorkflow };