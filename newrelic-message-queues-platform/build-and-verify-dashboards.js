#!/usr/bin/env node

/**
 * Build and Verify Dashboards
 * Programmatically creates dashboards and runs comprehensive verification
 */

const DashboardFramework = require('./dashboards/framework/core/dashboard-framework');
const MessageQueuesContentProvider = require('./dashboards/content/message-queues/message-queues-content-provider');
const DashboardVerifier = require('./verification/engines/dashboard-verifier');
const EntityVerifier = require('./verification/lib/entity-verifier');
const BrowserVerifier = require('./verification/lib/browser-verifier');
const ReportGenerator = require('./verification/lib/report-generator');
const VerificationOrchestrator = require('./verification/lib/verification-orchestrator');
const fs = require('fs').promises;
const path = require('path');

async function buildAndVerifyDashboards() {
  console.log('🚀 Starting Dashboard Build and Verification Process\n');

  // Initialize framework and content provider
  const framework = new DashboardFramework({
    apiKey: process.env.NEW_RELIC_USER_API_KEY,
    accountId: process.env.NEW_RELIC_ACCOUNT_ID
  });

  const contentProvider = new MessageQueuesContentProvider();
  framework.setContentProvider(contentProvider);

  // Get available templates
  const templates = framework.getAvailableTemplates();
  console.log(`📋 Available templates: ${templates.map(t => t.name).join(', ')}\n`);

  // Build dashboards for each template
  const dashboards = [];
  const dashboardsDir = path.join(__dirname, 'generated-dashboards');
  await fs.mkdir(dashboardsDir, { recursive: true });

  for (const template of templates) {
    console.log(`\n🔨 Building dashboard: ${template.name}`);
    
    try {
      // Build dashboard with sample variables
      const variables = {
        provider: 'kafka',
        environment: 'production',
        clusterName: 'kafka-prod-cluster-1',
        region: 'us-east-1',
        timeRange: 'SINCE 1 hour ago'
      };

      const result = await framework.buildDashboard(template.name, variables, {
        name: `${template.title} - Generated`,
        description: `Auto-generated dashboard for ${template.description}`,
        layoutPreference: 'balanced'
      });

      // Save dashboard JSON
      const filename = `${template.name}-dashboard.json`;
      await fs.writeFile(
        path.join(dashboardsDir, filename),
        JSON.stringify(result, null, 2)
      );

      console.log(`✅ Dashboard built: ${result.metadata.widgetCount} widgets, ${result.metadata.pageCount} pages`);
      console.log(`📁 Saved to: ${filename}`);

      // Generate preview HTML
      const previewResult = await framework.previewDashboard(template.name, variables, {
        name: `${template.title} - Preview`
      });
      
      const previewFilename = `${template.name}-preview.html`;
      await fs.writeFile(
        path.join(dashboardsDir, previewFilename),
        previewResult.preview
      );
      console.log(`🖼️  Preview saved to: ${previewFilename}`);

      dashboards.push({
        template: template.name,
        dashboard: result.dashboard,
        metadata: result.metadata,
        filename,
        previewFilename
      });

    } catch (error) {
      console.error(`❌ Failed to build ${template.name}: ${error.message}`);
    }
  }

  console.log(`\n📊 Built ${dashboards.length} dashboards successfully\n`);

  // Run verification
  console.log('🔍 Starting Verification Process\n');

  // Initialize verification components
  const dashboardVerifier = new DashboardVerifier();
  const entityVerifier = new EntityVerifier();
  const browserVerifier = new BrowserVerifier();
  const reportGenerator = new ReportGenerator();
  const orchestrator = new VerificationOrchestrator({
    dashboardVerifier,
    entityVerifier,
    browserVerifier,
    reportGenerator
  });

  // Verify each dashboard
  const verificationResults = [];
  
  for (const dashboardData of dashboards) {
    console.log(`\n🔍 Verifying: ${dashboardData.template}`);
    
    try {
      // Dashboard structure verification
      const structureVerification = await dashboardVerifier.verifyDashboard(dashboardData.dashboard);
      console.log(`  ✓ Structure: ${structureVerification.valid ? 'PASS' : 'FAIL'}`);
      
      // Query verification
      const queryVerification = await dashboardVerifier.verifyQueries(dashboardData.dashboard);
      console.log(`  ✓ Queries: ${queryVerification.valid ? 'PASS' : 'FAIL'}`);
      
      // Layout verification
      const layoutVerification = await dashboardVerifier.verifyLayout(dashboardData.dashboard);
      console.log(`  ✓ Layout: ${layoutVerification.valid ? 'PASS' : 'FAIL'}`);
      
      // Entity verification (check if entities exist)
      const entityTypes = contentProvider.getMetadata().supportedEntityTypes;
      const entityVerificationResults = [];
      
      for (const entityType of entityTypes) {
        if (dashboardData.dashboard.description.includes(entityType)) {
          const entityResult = await entityVerifier.verifyEntityType(entityType);
          entityVerificationResults.push(entityResult);
          console.log(`  ✓ Entity ${entityType}: ${entityResult.valid ? 'PASS' : 'FAIL'}`);
        }
      }
      
      verificationResults.push({
        template: dashboardData.template,
        dashboard: dashboardData.filename,
        verification: {
          structure: structureVerification,
          queries: queryVerification,
          layout: layoutVerification,
          entities: entityVerificationResults
        }
      });
      
    } catch (error) {
      console.error(`  ❌ Verification failed: ${error.message}`);
      verificationResults.push({
        template: dashboardData.template,
        dashboard: dashboardData.filename,
        verification: {
          error: error.message
        }
      });
    }
  }

  // Generate comprehensive report
  console.log('\n📄 Generating Verification Report\n');
  
  const report = await reportGenerator.generateReport({
    dashboards: dashboards.map(d => ({
      ...d.dashboard,
      metadata: d.metadata
    })),
    verificationResults,
    timestamp: new Date().toISOString(),
    environment: {
      platform: process.platform,
      nodeVersion: process.version,
      contentProvider: contentProvider.getMetadata()
    }
  });

  // Save report
  const reportFilename = `verification-report-${Date.now()}.json`;
  await fs.writeFile(
    path.join(dashboardsDir, reportFilename),
    JSON.stringify(report, null, 2)
  );
  
  console.log(`✅ Verification report saved to: ${reportFilename}`);
  
  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                    DASHBOARD BUILD & VERIFICATION SUMMARY       ');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  console.log(`📊 Dashboards Built: ${dashboards.length}`);
  console.log(`✅ Verification Tests Run: ${verificationResults.length * 4}`);
  
  const allPassed = verificationResults.every(r => 
    !r.verification.error && 
    r.verification.structure?.valid && 
    r.verification.queries?.valid && 
    r.verification.layout?.valid
  );
  
  console.log(`🎯 Overall Status: ${allPassed ? 'ALL PASSED ✅' : 'SOME FAILED ❌'}`);
  
  console.log('\n📁 Generated Files:');
  console.log(`   - Dashboard JSONs: ${dashboards.length} files`);
  console.log(`   - Preview HTMLs: ${dashboards.length} files`);
  console.log(`   - Verification Report: ${reportFilename}`);
  console.log(`   - Location: ${dashboardsDir}`);
  
  // Display sample dashboard structure
  if (dashboards.length > 0) {
    console.log('\n📋 Sample Dashboard Structure:');
    const sampleDashboard = dashboards[0].dashboard;
    console.log(`   Name: ${sampleDashboard.name}`);
    console.log(`   Pages: ${sampleDashboard.pages.length}`);
    console.log(`   Total Widgets: ${sampleDashboard.pages.reduce((sum, p) => sum + p.widgets.length, 0)}`);
    console.log(`   Variables: ${sampleDashboard.variables.map(v => v.name).join(', ')}`);
  }
  
  console.log('\n✨ Dashboard build and verification complete!\n');
}

// Run the process
buildAndVerifyDashboards().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});