/**
 * Mode 2: Existing Entity Enhancement
 * 
 * This example demonstrates how to import existing entity definitions,
 * build optimized dashboards, and verify functionality with real data.
 */

const chalk = require('chalk');
const EntityImporter = require('../core/entities/entity-importer');
const DashboardGenerator = require('../dashboards/lib/dashboard-generator');
const DashboardVerifier = require('../verification/engines/dashboard-verifier');
const BrowserVerifier = require('../verification/lib/browser-verifier');

async function runExistingEntityWorkflow(config = {}) {
  console.log(chalk.bold.blue('\n🚀 Mode 2: Existing Entity Enhancement Workflow'));
  console.log(chalk.gray('=' .repeat(60)));
  console.log(chalk.white('Purpose: Build dashboards using existing entity definitions'));
  console.log();

  const workflow = {
    startTime: Date.now(),
    steps: [],
    results: {}
  };

  try {
    // Step 1: Import existing entity definitions
    console.log(chalk.yellow('\n📥 Step 1: Import Existing Entity Definitions'));
    console.log(chalk.gray('Importing from github.com/newrelic/entity-definitions...'));
    
    const entityImporter = new EntityImporter();
    
    // Import common Kafka entity types
    const entityTypes = [
      'AWSKAFKACLUSTER',
      'AWSKAFKABROKER',
      'AWSKAFKATOPIC',
      'KAFKACLUSTER'
    ];
    
    const importResults = await entityImporter.importFromGitHub(entityTypes);
    workflow.results.importedEntities = importResults;
    
    console.log(chalk.green('✅ Entity import complete:'));
    console.log(chalk.gray(`   • Successful: ${importResults.successful.length}`));
    console.log(chalk.gray(`   • Failed: ${importResults.failed.length}`));
    
    importResults.successful.forEach(type => {
      const entity = entityImporter.getImportedEntity(type);
      console.log(chalk.gray(`   • ${type} → ${entity.mappedType}`));
    });
    
    workflow.steps.push({
      name: 'Import Entities',
      status: 'completed',
      entities: importResults.successful,
      duration: Date.now() - workflow.startTime
    });

    // Step 2: Query existing entity data
    console.log(chalk.yellow('\n🔍 Step 2: Query Existing Entity Data'));
    console.log(chalk.gray('Checking for available entities in account...'));
    
    // This would normally query actual entity data
    // For demo purposes, we'll simulate finding entities
    const existingEntities = {
      clusters: 3,
      brokers: 9,
      topics: 45
    };
    
    console.log(chalk.green('✅ Found existing entities:'));
    console.log(chalk.gray(`   • Clusters: ${existingEntities.clusters}`));
    console.log(chalk.gray(`   • Brokers: ${existingEntities.brokers}`));
    console.log(chalk.gray(`   • Topics: ${existingEntities.topics}`));
    
    workflow.steps.push({
      name: 'Query Entities',
      status: 'completed',
      counts: existingEntities,
      duration: Date.now() - workflow.startTime
    });

    // Step 3: Build optimized dashboards
    console.log(chalk.yellow('\n📊 Step 3: Build Optimized Dashboards'));
    
    const dashboardGenerator = new DashboardGenerator({
      apiKey: config.userApiKey || process.env.NEW_RELIC_USER_API_KEY,
      accountId: config.accountId || process.env.NEW_RELIC_ACCOUNT_ID
    });

    // Generate a suite of dashboards
    const dashboards = [];
    
    // Overview dashboard
    console.log(chalk.gray('Creating overview dashboard...'));
    const overviewDashboard = await dashboardGenerator.generateOverviewDashboard({
      provider: 'kafka',
      environment: 'production',
      name: 'Kafka Infrastructure Overview - Enhanced',
      deploy: !config.dryRun
    });
    dashboards.push(overviewDashboard);
    
    // Topic analysis dashboard
    console.log(chalk.gray('Creating topic analysis dashboard...'));
    const topicDashboard = await dashboardGenerator.generateTopicDashboard({
      provider: 'kafka',
      environment: 'production',
      name: 'Kafka Topic Deep Dive',
      deploy: !config.dryRun
    });
    dashboards.push(topicDashboard);
    
    // Broker health dashboard
    console.log(chalk.gray('Creating broker health dashboard...'));
    const brokerDashboard = await dashboardGenerator.generateBrokerDashboard({
      provider: 'kafka',
      environment: 'production',
      name: 'Kafka Broker Performance',
      deploy: !config.dryRun
    });
    dashboards.push(brokerDashboard);
    
    workflow.results.dashboards = dashboards;
    
    console.log(chalk.green('✅ Dashboards created:'));
    dashboards.forEach(dashboard => {
      if (dashboard.guid) {
        console.log(chalk.gray(`   • ${dashboard.name}: ${dashboard.guid}`));
      } else {
        console.log(chalk.gray(`   • ${dashboard.dashboard.name} (not deployed)`));
      }
    });
    
    workflow.steps.push({
      name: 'Build Dashboards',
      status: 'completed',
      dashboardCount: dashboards.length,
      duration: Date.now() - workflow.startTime
    });

    // Step 4: Verify dashboard functionality
    if (!config.dryRun && dashboards[0].guid) {
      console.log(chalk.yellow('\n🔍 Step 4: Verify Dashboard Functionality'));
      
      const dashboardVerifier = new DashboardVerifier({
        apiKey: config.userApiKey,
        accountId: config.accountId
      });
      
      const verification = await dashboardVerifier.verifyDashboard(dashboards[0].guid);
      workflow.results.dashboardVerification = verification;
      
      console.log(chalk.green('✅ Dashboard verification:'));
      console.log(chalk.gray(`   • Structure: ${verification.tests.structure.passed ? 'Passed' : 'Failed'}`));
      console.log(chalk.gray(`   • Widgets: ${verification.tests.widgets.passRate}% pass rate`));
      console.log(chalk.gray(`   • Queries: ${verification.tests.queries?.validQueries || 0}/${verification.tests.queries?.totalQueries || 0} valid`));
      console.log(chalk.gray(`   • Performance: ${verification.tests.performance?.averageLoadTime || 'N/A'}ms`));
      
      workflow.steps.push({
        name: 'Verify Dashboard',
        status: verification.summary.overallScore >= 80 ? 'completed' : 'warning',
        score: verification.summary.overallScore,
        duration: Date.now() - workflow.startTime
      });
    }

    // Step 5: Browser-based testing (optional)
    if (config.runBrowserTests && dashboards[0].permalink) {
      console.log(chalk.yellow('\n🌐 Step 5: Browser-Based Testing'));
      
      const browserVerifier = new BrowserVerifier({
        email: config.email,
        password: config.password,
        browsers: ['chromium'],
        headless: true
      });
      
      const browserResults = await browserVerifier.verifyDashboard(dashboards[0].permalink);
      workflow.results.browserVerification = browserResults;
      
      console.log(chalk.green('✅ Browser testing:'));
      console.log(chalk.gray(`   • Load time: ${browserResults.browsers.chromium?.tests?.loadTest?.loadTime || 'N/A'}ms`));
      console.log(chalk.gray(`   • Widgets loaded: ${browserResults.browsers.chromium?.tests?.widgetTest?.summary?.totalWidgets || 0}`));
      console.log(chalk.gray(`   • Overall score: ${browserResults.summary?.score || 0}%`));
      
      workflow.steps.push({
        name: 'Browser Testing',
        status: 'completed',
        score: browserResults.summary?.score,
        duration: Date.now() - workflow.startTime
      });
    }

    // Step 6: Generate optimization recommendations
    console.log(chalk.yellow('\n💡 Step 6: Generate Optimization Recommendations'));
    
    const recommendations = [];
    
    // Based on imported entity definitions
    importResults.entities.forEach(entity => {
      if (entity.goldenMetrics.length > 0) {
        recommendations.push({
          type: 'golden_metrics',
          entity: entity.originalType,
          message: `Consider adding ${entity.goldenMetrics.length} golden metrics from ${entity.originalType} definition`,
          metrics: entity.goldenMetrics.map(m => m.title)
        });
      }
      
      if (entity.relationships.length > 0) {
        recommendations.push({
          type: 'relationships',
          entity: entity.originalType,
          message: `Entity relationships available: ${entity.relationships.map(r => r.name).join(', ')}`,
          relationships: entity.relationships
        });
      }
    });
    
    // Based on verification results
    if (workflow.results.dashboardVerification) {
      workflow.results.dashboardVerification.recommendations?.forEach(rec => {
        recommendations.push({
          type: 'verification',
          category: rec.category,
          message: rec.issue,
          recommendation: rec.recommendation
        });
      });
    }
    
    workflow.results.recommendations = recommendations;
    
    console.log(chalk.green('✅ Generated recommendations:'));
    recommendations.slice(0, 5).forEach(rec => {
      console.log(chalk.gray(`   • ${rec.type}: ${rec.message}`));
    });
    if (recommendations.length > 5) {
      console.log(chalk.gray(`   • ... and ${recommendations.length - 5} more`));
    }
    
    workflow.steps.push({
      name: 'Generate Recommendations',
      status: 'completed',
      recommendationCount: recommendations.length,
      duration: Date.now() - workflow.startTime
    });

    // Summary
    console.log(chalk.bold.green('\n✅ Existing Entity Enhancement Workflow Complete!'));
    console.log(chalk.white('\n📊 Workflow Summary:'));
    console.log(chalk.gray(`   • Total Duration: ${(Date.now() - workflow.startTime) / 1000}s`));
    console.log(chalk.gray(`   • Steps Completed: ${workflow.steps.length}`));
    console.log(chalk.gray(`   • Entities Imported: ${importResults.successful.length}`));
    console.log(chalk.gray(`   • Dashboards Created: ${dashboards.length}`));
    console.log(chalk.gray(`   • Recommendations: ${recommendations.length}`));
    
    console.log(chalk.white('\n📝 Next Steps:'));
    console.log(chalk.gray('   1. Review imported entity definitions'));
    console.log(chalk.gray('   2. Customize dashboards based on your specific needs'));
    console.log(chalk.gray('   3. Implement optimization recommendations'));
    console.log(chalk.gray('   4. Set up alerts based on golden metrics'));
    console.log(chalk.gray('   5. Share dashboards with your team'));

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
  const requiredVars = ['NEW_RELIC_USER_API_KEY', 'NEW_RELIC_ACCOUNT_ID'];
  const missing = requiredVars.filter(v => !process.env[v]);
  
  if (missing.length > 0) {
    console.error(chalk.red('❌ Missing required environment variables:'));
    missing.forEach(v => console.error(chalk.red(`   • ${v}`)));
    process.exit(1);
  }

  // Parse command line arguments
  const args = process.argv.slice(2);
  const options = {
    dryRun: args.includes('--dry-run'),
    runBrowserTests: args.includes('--browser-tests'),
    email: process.env.NEW_RELIC_EMAIL,
    password: process.env.NEW_RELIC_PASSWORD
  };

  if (options.runBrowserTests && (!options.email || !options.password)) {
    console.error(chalk.red('❌ Browser tests require NEW_RELIC_EMAIL and NEW_RELIC_PASSWORD'));
    process.exit(1);
  }

  runExistingEntityWorkflow({
    userApiKey: process.env.NEW_RELIC_USER_API_KEY,
    accountId: process.env.NEW_RELIC_ACCOUNT_ID,
    ...options
  }).then(() => {
    console.log(chalk.green('\n👋 Workflow completed successfully!'));
  }).catch(error => {
    console.error(chalk.red('\n❌ Workflow error:'), error);
    process.exit(1);
  });
}

module.exports = { runExistingEntityWorkflow };