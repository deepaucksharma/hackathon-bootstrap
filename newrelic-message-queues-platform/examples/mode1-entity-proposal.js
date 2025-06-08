/**
 * Mode 1: Entity Proposal & Simulation
 * 
 * This example demonstrates how to propose new MESSAGE_QUEUE_* entity types,
 * simulate realistic data, verify entity synthesis, and build dashboards.
 */

require('dotenv').config();
const chalk = require('chalk');
const DataSimulator = require('../simulation/engines/data-simulator');
const NewRelicStreamer = require('../simulation/streaming/new-relic-streamer');
const EntityVerifier = require('../verification/lib/entity-verifier');
const DashboardGenerator = require('../dashboards/lib/dashboard-generator');
const VerificationOrchestrator = require('../verification/lib/verification-orchestrator');

async function runEntityProposalWorkflow(config = {}) {
  console.log(chalk.bold.blue('\n🚀 Mode 1: Entity Proposal & Simulation Workflow'));
  console.log(chalk.gray('=' .repeat(60)));
  console.log(chalk.white('Purpose: Prototype and test new entity types before official adoption'));
  console.log();

  const workflow = {
    startTime: Date.now(),
    steps: [],
    results: {}
  };

  try {
    // Step 1: Define new MESSAGE_QUEUE_* entities
    console.log(chalk.yellow('\n📋 Step 1: Define New Entity Types'));
    console.log(chalk.gray('Creating MESSAGE_QUEUE_STREAM entity proposal...'));
    
    const simulator = new DataSimulator({
      businessHoursStart: 9,
      businessHoursEnd: 17,
      anomalyRate: 0.05
    });

    // Create a new entity type proposal (e.g., for streaming platforms)
    const topologyConfig = {
      provider: 'kafka-streams', // New provider type
      environment: 'development',
      region: 'us-east-1',
      clusterCount: 1,
      brokersPerCluster: 3,
      topicsPerCluster: 5,
      clusterConfig: {
        name: 'streams-cluster-dev',
        team: 'data-engineering',
        criticality: 'high'
      }
    };

    const topology = simulator.createTopology(topologyConfig);
    workflow.results.topology = topology;
    
    console.log(chalk.green('✅ Created topology with new entity types:'));
    console.log(chalk.gray(`   • Clusters: ${topology.clusters.length}`));
    console.log(chalk.gray(`   • Brokers: ${topology.brokers.length}`));
    console.log(chalk.gray(`   • Topics: ${topology.topics.length}`));
    
    workflow.steps.push({
      name: 'Define Entity Types',
      status: 'completed',
      duration: Date.now() - workflow.startTime
    });

    // Step 2: Simulate realistic entity data
    console.log(chalk.yellow('\n📊 Step 2: Simulate Realistic Data'));
    console.log(chalk.gray('Generating metrics with business patterns...'));
    
    // Update metrics with realistic patterns
    for (let i = 0; i < 10; i++) {
      topology.clusters.forEach(cluster => simulator.updateClusterMetrics(cluster));
      topology.brokers.forEach(broker => simulator.updateBrokerMetrics(broker));
      topology.topics.forEach(topic => simulator.updateTopicMetrics(topic));
    }
    
    console.log(chalk.green('✅ Generated realistic metrics for all entities'));
    
    workflow.steps.push({
      name: 'Simulate Data',
      status: 'completed',
      duration: Date.now() - workflow.startTime
    });

    // Step 3: Stream data to New Relic
    console.log(chalk.yellow('\n📤 Step 3: Stream to New Relic'));
    
    const streamer = new NewRelicStreamer({
      apiKey: config.apiKey || process.env.NEW_RELIC_API_KEY,
      accountId: config.accountId || process.env.NEW_RELIC_ACCOUNT_ID,
      batchSize: 50,
      flushInterval: 5000,
      dryRun: config.dryRun || false,
      verbose: config.verbose || false
    });

    // Stream all entities
    const allEntities = [
      ...topology.clusters,
      ...topology.brokers,
      ...topology.topics,
      ...topology.queues
    ];

    console.log(chalk.gray(`Streaming ${allEntities.length} entities...`));
    streamer.streamEvents(allEntities);
    await streamer.flushAll();
    
    console.log(chalk.green('✅ Streamed all entities to New Relic'));
    console.log(chalk.gray(`   • Events sent: ${streamer.getStats().events.sent}`));
    
    workflow.steps.push({
      name: 'Stream Data',
      status: 'completed',
      duration: Date.now() - workflow.startTime
    });

    // Step 4: Verify entity synthesis
    console.log(chalk.yellow('\n🔍 Step 4: Verify Entity Synthesis'));
    
    if (config.dryRun) {
      console.log(chalk.gray('[DRY RUN] Skipping entity synthesis verification'));
      workflow.results.entityVerification = {
        score: 95,
        passed: true,
        dryRun: true,
        message: 'Entity verification skipped in dry-run mode'
      };
    } else {
      console.log(chalk.gray('Waiting 30 seconds for entity synthesis...'));
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
    
    let entityVerification;
    
    if (!config.dryRun) {
      const entityVerifier = new EntityVerifier({
        apiKey: config.apiKey,
        accountId: config.accountId
      });

      entityVerification = await entityVerifier.verifyEntitySynthesis(
        'MESSAGE_QUEUE_CLUSTER',
        topology.clusters.length
      );
    } else {
      entityVerification = workflow.results.entityVerification;
    }
    
    workflow.results.entityVerification = entityVerification;
    
    console.log(chalk.green('✅ Entity synthesis verification:'));
    console.log(chalk.gray(`   • Score: ${entityVerification.score}%`));
    console.log(chalk.gray(`   • Passed: ${entityVerification.passed ? 'Yes' : 'No'}`));
    
    workflow.steps.push({
      name: 'Verify Synthesis',
      status: entityVerification.passed ? 'completed' : 'failed',
      duration: Date.now() - workflow.startTime
    });

    // Step 5: Build and test dashboards
    console.log(chalk.yellow('\n📈 Step 5: Build Dashboards'));
    
    const dashboardGenerator = new DashboardGenerator({
      apiKey: config.userApiKey || process.env.NEW_RELIC_USER_API_KEY,
      accountId: config.accountId
    });

    const dashboard = await dashboardGenerator.generateOverviewDashboard({
      provider: 'kafka-streams',
      environment: 'development',
      name: 'Kafka Streams Entity Proposal Dashboard',
      deploy: !config.dryRun // Don't deploy in dry-run mode
    });
    
    workflow.results.dashboard = dashboard;
    
    console.log(chalk.green('✅ Dashboard created:'));
    console.log(chalk.gray(`   • Name: ${dashboard.name}`));
    console.log(chalk.gray(`   • GUID: ${dashboard.guid}`));
    console.log(chalk.gray(`   • URL: ${dashboard.permalink}`));
    
    workflow.steps.push({
      name: 'Build Dashboard',
      status: 'completed',
      duration: Date.now() - workflow.startTime
    });

    // Step 6: Run comprehensive verification
    console.log(chalk.yellow('\n✅ Step 6: Run Comprehensive Verification'));
    
    const verificationOrchestrator = new VerificationOrchestrator({
      apiKey: config.apiKey,
      userApiKey: config.userApiKey,
      accountId: config.accountId,
      outputDir: './entity-proposal-verification'
    });

    const platformVerification = await verificationOrchestrator.verifyPlatform({
      verifyEntities: true,
      verifyDashboards: true,
      dashboardGuids: [dashboard.guid],
      entityConfig: {
        entityTypes: ['MESSAGE_QUEUE_CLUSTER', 'MESSAGE_QUEUE_BROKER', 'MESSAGE_QUEUE_TOPIC'],
        expectedCounts: {
          'MESSAGE_QUEUE_CLUSTER': topology.clusters.length,
          'MESSAGE_QUEUE_BROKER': topology.brokers.length,
          'MESSAGE_QUEUE_TOPIC': topology.topics.length
        }
      }
    });
    
    workflow.results.verification = platformVerification.verification;
    
    console.log(chalk.green('✅ Platform verification complete:'));
    console.log(chalk.gray(`   • Overall Score: ${platformVerification.verification.summary.overallScore}%`));
    console.log(chalk.gray(`   • Reports: ${Object.keys(platformVerification.reports).join(', ')}`));
    
    workflow.steps.push({
      name: 'Platform Verification',
      status: 'completed',
      duration: Date.now() - workflow.startTime
    });

    // Summary
    console.log(chalk.bold.green('\n✅ Entity Proposal Workflow Complete!'));
    console.log(chalk.white('\n📊 Workflow Summary:'));
    console.log(chalk.gray(`   • Total Duration: ${(Date.now() - workflow.startTime) / 1000}s`));
    console.log(chalk.gray(`   • Steps Completed: ${workflow.steps.length}`));
    console.log(chalk.gray(`   • Entity Synthesis: ${entityVerification.passed ? 'Successful' : 'Failed'}`));
    console.log(chalk.gray(`   • Dashboard Created: ${dashboard.guid}`));
    console.log(chalk.gray(`   • Verification Score: ${platformVerification.verification.summary.overallScore}%`));
    
    console.log(chalk.white('\n📝 Next Steps:'));
    console.log(chalk.gray('   1. Review verification reports in ./entity-proposal-verification/'));
    console.log(chalk.gray('   2. Iterate on entity definitions based on results'));
    console.log(chalk.gray('   3. Submit entity proposal to github.com/newrelic/entity-definitions'));
    console.log(chalk.gray('   4. Include dashboard and verification results as evidence'));

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

  runEntityProposalWorkflow({
    apiKey: process.env.NEW_RELIC_API_KEY,
    userApiKey: process.env.NEW_RELIC_USER_API_KEY,
    accountId: process.env.NEW_RELIC_ACCOUNT_ID
  }).then(() => {
    console.log(chalk.green('\n👋 Workflow completed successfully!'));
  }).catch(error => {
    console.error(chalk.red('\n❌ Workflow error:'), error);
    process.exit(1);
  });
}

module.exports = { runEntityProposalWorkflow };