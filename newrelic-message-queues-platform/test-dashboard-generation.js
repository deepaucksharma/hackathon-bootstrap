#!/usr/bin/env node

/**
 * Test Dashboard Generation
 * 
 * Tests the end-to-end dashboard generation with updated MESSAGE_QUEUE templates
 */

const chalk = require('chalk');
const MessageQueuesContentProvider = require('./dashboards/content/message-queues/message-queues-content-provider');

function testDashboardGeneration() {
  console.log(chalk.bold.blue('\n🎨 Testing Dashboard Generation\n'));
  
  try {
    // Initialize content provider
    const contentProvider = new MessageQueuesContentProvider({
      accountId: '123456789'
    });
    
    // Get cluster overview template
    const template = contentProvider.templates.get('cluster-overview');
    if (!template) {
      throw new Error('cluster-overview template not found');
    }
    
    console.log(chalk.cyan('📊 Generating Cluster Overview Dashboard:'));
    console.log(chalk.gray(`   Title: ${template.title}`));
    console.log(chalk.gray(`   Entity Type: ${template.entityType}`));
    console.log('');
    
    // Generate dashboard JSON (simplified)
    const dashboardJson = {
      name: template.title,
      description: template.description,
      permissions: 'PUBLIC_READ_WRITE',
      pages: [
        {
          name: template.title,
          description: template.description,
          widgets: []
        }
      ],
      variables: template.variables.map(variable => ({
        name: variable.name,
        title: variable.title,
        type: variable.type,
        defaultValues: variable.possibleValues ? [variable.possibleValues[0]] : [],
        nrqlQuery: variable.type === 'ENUM' ? null : {
          accountIds: [123456789],
          query: `FROM ${template.entityType} SELECT uniques(${variable.name}) LIMIT 100`
        },
        options: variable.type === 'ENUM' ? {
          ignoreTimeRange: false
        } : null
      }))
    };
    
    // Process each section
    template.sections.forEach((section, sectionIndex) => {
      console.log(chalk.yellow(`   Section ${sectionIndex + 1}: ${section.title}`));
      
      section.widgets.forEach((widget, widgetIndex) => {
        // Convert template widget to New Relic widget format
        const nrWidget = {
          title: widget.title,
          layout: {
            column: widget.position.column,
            row: widget.position.row + (sectionIndex * 10), // Offset by section
            width: widget.position.width,
            height: widget.position.height
          },
          visualization: {
            id: widget.type === 'line' ? 'viz.line' : 
                widget.type === 'area' ? 'viz.area' :
                widget.type === 'table' ? 'viz.table' :
                widget.type === 'billboard' ? 'viz.billboard' : 'viz.line'
          },
          rawConfiguration: {
            facet: {
              showOtherSeries: false
            },
            legend: {
              enabled: true
            },
            nrqlQueries: [
              {
                accountId: 123456789,
                query: `${widget.query.select ? 'SELECT ' + widget.query.select : 'SELECT *'} FROM ${widget.query.from}${widget.query.where ? ' WHERE ' + widget.query.where.join(' AND ') : ''}${widget.query.facet ? ' FACET ' + widget.query.facet : ''}${widget.query.timeseries ? ' TIMESERIES' : ''} ${widget.query.since || 'SINCE 1 hour ago'}${widget.query.limit ? ' LIMIT ' + widget.query.limit : ''}`
              }
            ]
          }
        };
        
        dashboardJson.pages[0].widgets.push(nrWidget);
        
        console.log(chalk.gray(`     Widget ${widgetIndex + 1}: ${widget.title}`));
        console.log(chalk.gray(`       Type: ${widget.type}`));
        console.log(chalk.gray(`       Query: FROM ${widget.query.from}`));
        console.log(chalk.gray(`       Metrics: ${widget.query.select ? widget.query.select.split(',').length : 1} selected`));
      });
      
      console.log('');
    });
    
    // Display generated dashboard stats
    console.log(chalk.green('✅ Dashboard generation successful!'));
    console.log(chalk.cyan('\n📈 Generated Dashboard Stats:'));
    console.log(chalk.gray(`   Total widgets: ${dashboardJson.pages[0].widgets.length}`));
    console.log(chalk.gray(`   Variables: ${dashboardJson.variables.length}`));
    console.log(chalk.gray(`   Sections: ${template.sections.length}`));
    
    // Show sample NRQL queries
    console.log(chalk.cyan('\n🔍 Sample NRQL Queries:'));
    dashboardJson.pages[0].widgets.slice(0, 3).forEach((widget, idx) => {
      console.log(chalk.yellow(`   Query ${idx + 1}:`));
      console.log(chalk.gray(`     ${widget.rawConfiguration.nrqlQueries[0].query}`));
    });
    
    // Validate NRQL syntax
    console.log(chalk.cyan('\n✅ NRQL Query Validation:'));
    let validQueries = 0;
    dashboardJson.pages[0].widgets.forEach((widget, idx) => {
      const query = widget.rawConfiguration.nrqlQueries[0].query;
      
      // Basic NRQL validation
      const hasSelect = query.includes('SELECT');
      const hasFrom = query.includes('FROM MESSAGE_QUEUE_');
      const hasValidTimeframe = query.includes('SINCE') || query.includes('UNTIL');
      
      if (hasSelect && hasFrom && hasValidTimeframe) {
        validQueries++;
        console.log(chalk.green(`     ✅ Widget ${idx + 1}: Valid NRQL syntax`));
      } else {
        console.log(chalk.red(`     ❌ Widget ${idx + 1}: Invalid NRQL syntax`));
      }
    });
    
    console.log(chalk.gray(`   Valid queries: ${validQueries}/${dashboardJson.pages[0].widgets.length}`));
    
    if (validQueries === dashboardJson.pages[0].widgets.length) {
      console.log(chalk.green('\n🎉 All dashboard queries are valid!'));
    }
    
    // Save dashboard JSON for inspection
    const fs = require('fs');
    const outputFile = '/tmp/sample-dashboard.json';
    fs.writeFileSync(outputFile, JSON.stringify(dashboardJson, null, 2));
    console.log(chalk.gray(`\n📁 Dashboard JSON saved to: ${outputFile}`));
    
    return true;
    
  } catch (error) {
    console.error(chalk.red('\n❌ Dashboard generation failed:'), error.message);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    return false;
  }
}

// CLI interface
if (require.main === module) {
  const success = testDashboardGeneration();
  process.exit(success ? 0 : 1);
}

module.exports = testDashboardGeneration;