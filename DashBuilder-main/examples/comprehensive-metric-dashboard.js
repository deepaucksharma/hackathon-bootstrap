/**
 * Comprehensive Metric Dashboard Example
 * 
 * This example demonstrates how to:
 * 1. Discover ALL metrics from an account
 * 2. Create a dashboard with widgets for ALL discovered metrics
 * 3. Handle the last 1 day time range requirement
 */

const { createDashboardBuilder, discoverMetrics } = require('../src');

async function createComprehensiveDashboard(config) {
  console.log('🔍 Starting comprehensive metric discovery...');
  
  // Step 1: Discover ALL metrics using comprehensive strategy
  const discovery = await discoverMetrics({
    ...config,
    strategy: 'comprehensive',  // This gets ALL event types and ALL metrics
    useCache: false  // Ensure fresh data
  });
  
  console.log(`✅ Discovered ${discovery.totalMetrics} metrics across ${discovery.eventTypes.length} event types`);
  
  // Step 2: Create dashboard builder
  const builder = createDashboardBuilder({
    ...config,
    name: `Comprehensive Metrics Dashboard - ${new Date().toISOString()}`,
    intelligent: false  // Use standard mode for explicit control
  });
  
  // Step 3: Generate queries for ALL metrics with 1 day time range
  const queries = [];
  
  for (const [eventType, metrics] of Object.entries(discovery.metrics)) {
    console.log(`📊 Processing ${metrics.length} metrics from ${eventType}`);
    
    for (const metric of metrics) {
      // Create a simple timeseries query for each metric
      queries.push({
        title: `${metric.name} (${eventType})`,
        nrql: `SELECT average(${metric.name}) FROM ${eventType} TIMESERIES AUTO SINCE 1 day ago`,
        visualization: 'viz.line',
        category: eventType
      });
      
      // Also create a billboard for current value
      queries.push({
        title: `Current ${metric.name}`,
        nrql: `SELECT latest(${metric.name}) FROM ${eventType} SINCE 1 day ago`,
        visualization: 'viz.billboard',
        category: eventType
      });
    }
  }
  
  console.log(`📈 Generated ${queries.length} queries for dashboard`);
  
  // Step 4: Create widgets from queries
  const widgets = queries.map((query, index) => ({
    title: query.title,
    visualization: { id: query.visualization },
    configuration: {
      nrqlQueries: [{
        accountId: config.accountId,
        query: query.nrql
      }]
    },
    rawConfiguration: null
  }));
  
  // Step 5: Optimize layout
  const layoutOptimizer = builder.layoutOptimizer;
  const optimizedLayout = await layoutOptimizer.optimize(widgets, {
    strategy: 'grid',
    columns: 12
  });
  
  // Step 6: Assemble dashboard
  const dashboard = {
    name: builder.config.name,
    description: `Comprehensive dashboard showing ALL ${discovery.totalMetrics} metrics from the last 1 day`,
    permissions: 'PUBLIC_READ_WRITE',
    pages: [{
      name: 'All Metrics',
      description: `Displaying ${widgets.length} widgets for ${discovery.totalMetrics} unique metrics`,
      widgets: optimizedLayout
    }],
    variables: []
  };
  
  // Add pages per event type if too many widgets
  if (widgets.length > 50) {
    dashboard.pages = [];
    
    for (const [eventType, metrics] of Object.entries(discovery.metrics)) {
      const eventTypeWidgets = optimizedLayout.filter(w => 
        w.configuration.nrqlQueries[0].query.includes(`FROM ${eventType}`)
      );
      
      if (eventTypeWidgets.length > 0) {
        dashboard.pages.push({
          name: eventType,
          description: `${metrics.length} metrics from ${eventType}`,
          widgets: eventTypeWidgets
        });
      }
    }
  }
  
  return dashboard;
}

// Usage example
async function main() {
  const config = {
    accountId: process.env.NEW_RELIC_ACCOUNT_ID,
    apiKey: process.env.NEW_RELIC_API_KEY,
    region: process.env.NEW_RELIC_REGION || 'US'
  };
  
  try {
    const dashboard = await createComprehensiveDashboard(config);
    
    // Save to file
    const fs = require('fs').promises;
    const filename = `comprehensive-dashboard-${Date.now()}.json`;
    await fs.writeFile(filename, JSON.stringify(dashboard, null, 2));
    
    console.log(`✅ Dashboard saved to ${filename}`);
    console.log(`📊 Total pages: ${dashboard.pages.length}`);
    console.log(`📈 Total widgets: ${dashboard.pages.reduce((sum, p) => sum + p.widgets.length, 0)}`);
    
  } catch (error) {
    console.error('❌ Error creating comprehensive dashboard:', error);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { createComprehensiveDashboard };