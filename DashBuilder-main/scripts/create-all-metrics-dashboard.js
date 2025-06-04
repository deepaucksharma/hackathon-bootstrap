#!/usr/bin/env node

/**
 * Create All Metrics Dashboard
 * 
 * This script discovers ALL metrics in a New Relic account and creates
 * a comprehensive dashboard with widgets for each metric showing data
 * from the last 1 day.
 */

const { createDashboardBuilder, discoverMetrics } = require('../src');
const fs = require('fs').promises;
const ora = require('ora');
const chalk = require('chalk');

async function createAllMetricsDashboard() {
  // Configuration
  const config = {
    accountId: process.env.NEW_RELIC_ACCOUNT_ID,
    apiKey: process.env.NEW_RELIC_API_KEY || process.env.NEW_RELIC_USER_KEY,
    region: process.env.NEW_RELIC_REGION || 'US'
  };

  if (!config.accountId || !config.apiKey) {
    console.error(chalk.red('❌ Missing required environment variables:'));
    console.error('   NEW_RELIC_ACCOUNT_ID');
    console.error('   NEW_RELIC_API_KEY');
    process.exit(1);
  }

  const spinner = ora('Discovering all metrics...').start();

  try {
    // Step 1: Comprehensive metric discovery
    const discovery = await discoverMetrics({
      ...config,
      strategy: 'comprehensive',
      useCache: false
    });

    spinner.succeed(`Discovered ${chalk.green(discovery.totalMetrics)} metrics across ${chalk.green(discovery.eventTypes.length)} event types`);

    // Step 2: Create dashboard structure
    const dashboardName = `All Metrics Dashboard - ${new Date().toLocaleDateString()}`;
    const pages = [];
    let totalWidgets = 0;

    // Step 3: Process each event type
    for (const [eventType, metrics] of Object.entries(discovery.metrics)) {
      if (metrics.length === 0) continue;

      console.log(`\n📊 Processing ${chalk.cyan(eventType)} with ${metrics.length} metrics`);

      // Create widgets for this event type
      const widgets = [];

      for (const metric of metrics) {
        // Skip certain system metrics that might cause issues
        if (metric.name.startsWith('nr.') || metric.name.includes('timestamp')) {
          continue;
        }

        // Determine aggregation function based on metric type
        const aggregation = selectAggregation(metric);

        // Create timeseries widget
        widgets.push({
          title: `${metric.name} - Trend`,
          visualization: { id: 'viz.line' },
          configuration: {
            nrqlQueries: [{
              accountId: config.accountId,
              query: `SELECT ${aggregation}(\`${metric.name}\`) FROM ${eventType} TIMESERIES AUTO SINCE 1 day ago`
            }]
          },
          rawConfiguration: {
            facet: { showOtherSeries: false },
            legend: { enabled: true },
            nrqlQueries: [{
              accountId: config.accountId,
              query: `SELECT ${aggregation}(\`${metric.name}\`) FROM ${eventType} TIMESERIES AUTO SINCE 1 day ago`
            }],
            platformOptions: {
              ignoreTimeRange: false
            },
            yAxisLeft: { zero: true }
          },
          layout: { column: 1, row: 1, width: 4, height: 3 }
        });

        // Create billboard widget for current value
        widgets.push({
          title: `${metric.name} - Current`,
          visualization: { id: 'viz.billboard' },
          configuration: {
            nrqlQueries: [{
              accountId: config.accountId,
              query: `SELECT ${aggregation}(\`${metric.name}\`) as 'Current', max(\`${metric.name}\`) as 'Max', min(\`${metric.name}\`) as 'Min' FROM ${eventType} SINCE 1 day ago`
            }]
          },
          rawConfiguration: {
            facet: { showOtherSeries: false },
            nrqlQueries: [{
              accountId: config.accountId,
              query: `SELECT ${aggregation}(\`${metric.name}\`) as 'Current', max(\`${metric.name}\`) as 'Max', min(\`${metric.name}\`) as 'Min' FROM ${eventType} SINCE 1 day ago`
            }],
            platformOptions: {
              ignoreTimeRange: false
            }
          },
          layout: { column: 5, row: 1, width: 4, height: 3 }
        });
      }

      // Organize widgets in grid layout
      const WIDGETS_PER_PAGE = 24; // 8 rows x 3 widget pairs
      const widgetChunks = [];
      
      for (let i = 0; i < widgets.length; i += WIDGETS_PER_PAGE) {
        widgetChunks.push(widgets.slice(i, i + WIDGETS_PER_PAGE));
      }

      // Create pages for this event type
      widgetChunks.forEach((chunk, index) => {
        // Layout widgets in grid
        let row = 1;
        let col = 1;
        
        chunk.forEach((widget, widgetIndex) => {
          widget.layout = {
            column: col,
            row: row,
            width: 4,
            height: 3
          };
          
          col += 4;
          if (col > 9) {
            col = 1;
            row += 3;
          }
        });

        const pageName = widgetChunks.length > 1 
          ? `${eventType} (Page ${index + 1}/${widgetChunks.length})`
          : eventType;

        pages.push({
          name: pageName,
          description: `Metrics from ${eventType} event type`,
          widgets: chunk
        });

        totalWidgets += chunk.length;
      });
    }

    // Step 4: Create overview page
    const overviewWidgets = createOverviewWidgets(discovery, config);
    pages.unshift({
      name: 'Overview',
      description: 'Summary of all metrics discovered',
      widgets: overviewWidgets
    });

    // Step 5: Assemble final dashboard
    const dashboard = {
      name: dashboardName,
      description: `Comprehensive dashboard displaying ${totalWidgets} widgets for all metrics in the account`,
      permissions: 'PUBLIC_READ_WRITE',
      pages: pages,
      variables: []
    };

    // Step 6: Save dashboard
    const filename = `all-metrics-dashboard-${Date.now()}.json`;
    await fs.writeFile(filename, JSON.stringify(dashboard, null, 2));

    console.log('\n' + chalk.green('✅ Dashboard created successfully!'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`📁 File: ${chalk.yellow(filename)}`);
    console.log(`📊 Total Pages: ${chalk.cyan(pages.length)}`);
    console.log(`📈 Total Widgets: ${chalk.cyan(totalWidgets)}`);
    console.log(`🕐 Time Range: ${chalk.cyan('Last 1 day')}`);
    console.log('\n💡 Next steps:');
    console.log(`   1. Review the dashboard: ${chalk.gray(`cat ${filename} | jq .`)}`);
    console.log(`   2. Deploy to New Relic: ${chalk.gray(`dashbuilder deploy ${filename}`)}`);

  } catch (error) {
    spinner.fail('Failed to create dashboard');
    console.error(chalk.red('\nError details:'), error.message);
    process.exit(1);
  }
}

// Helper function to select appropriate aggregation
function selectAggregation(metric) {
  const name = metric.name.toLowerCase();
  
  // Count-based metrics
  if (name.includes('count') || name.includes('total') || name.includes('number')) {
    return 'sum';
  }
  
  // Rate metrics
  if (name.includes('rate') || name.includes('persec') || name.includes('perminute')) {
    return 'rate(sum)';
  }
  
  // Percentage metrics
  if (name.includes('percent') || name.includes('ratio') || name.includes('utilization')) {
    return 'average';
  }
  
  // Size/bytes metrics
  if (name.includes('bytes') || name.includes('size') || name.includes('memory')) {
    return 'average';
  }
  
  // Time/duration metrics
  if (name.includes('time') || name.includes('duration') || name.includes('latency')) {
    return 'average';
  }
  
  // Default to average
  return 'average';
}

// Create overview widgets
function createOverviewWidgets(discovery, config) {
  const widgets = [];
  
  // Summary billboard
  widgets.push({
    title: 'Metrics Discovery Summary',
    visualization: { id: 'viz.billboard' },
    configuration: {
      nrqlQueries: [{
        accountId: config.accountId,
        query: `SELECT ${discovery.totalMetrics} as 'Total Metrics', ${discovery.eventTypes.length} as 'Event Types', ${Object.values(discovery.metrics).filter(m => m.length > 0).length} as 'Active Event Types' FROM Log LIMIT 1`
      }]
    },
    layout: { column: 1, row: 1, width: 12, height: 3 }
  });
  
  // Top event types by metric count
  const topEventTypes = Object.entries(discovery.metrics)
    .map(([eventType, metrics]) => ({ eventType, count: metrics.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  
  widgets.push({
    title: 'Top Event Types by Metric Count',
    visualization: { id: 'viz.bar' },
    configuration: {
      nrqlQueries: [{
        accountId: config.accountId,
        query: `SELECT ${topEventTypes.map(et => `${et.count} as '${et.eventType}'`).join(', ')} FROM Log LIMIT 1`
      }]
    },
    layout: { column: 1, row: 4, width: 6, height: 3 }
  });
  
  // Metric type distribution
  widgets.push({
    title: 'Metric Categories',
    visualization: { id: 'viz.pie' },
    configuration: {
      nrqlQueries: [{
        accountId: config.accountId,
        query: `SELECT count(*) FROM Log FACET category LIMIT 10`
      }]
    },
    layout: { column: 7, row: 4, width: 6, height: 3 }
  });
  
  return widgets;
}

// Run the script
if (require.main === module) {
  createAllMetricsDashboard();
}

module.exports = { createAllMetricsDashboard };