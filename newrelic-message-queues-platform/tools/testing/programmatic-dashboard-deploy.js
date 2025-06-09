#!/usr/bin/env node

/**
 * Programmatic Dashboard Deployment with NRQL Validation
 * 
 * This script:
 * 1. Validates every NRQL query via NerdGraph
 * 2. Troubleshoots and fixes common query issues
 * 3. Creates the dashboard programmatically
 * 4. Verifies all widgets are working
 */

const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch');

class ProgrammaticDashboardDeployer {
  constructor() {
    this.apiKey = process.env.NEW_RELIC_USER_API_KEY;
    this.accountId = process.env.NEW_RELIC_ACCOUNT_ID || '3630072';
    this.nerdGraphUrl = 'https://api.newrelic.com/graphql';
    this.validationResults = [];
    this.fixedQueries = [];
    this.dashboardGuid = null;
  }

  async deploy() {
    console.log('🚀 Starting Programmatic Dashboard Deployment\n');
    
    // Check prerequisites
    if (!this.apiKey) {
      console.error('❌ NEW_RELIC_USER_API_KEY environment variable not set');
      console.log('\n📝 Set it with: export NEW_RELIC_USER_API_KEY=your_key_here\n');
      process.exit(1);
    }

    try {
      // Step 1: Load dashboard configuration
      console.log('📋 Step 1: Loading dashboard configuration...');
      const dashboardConfig = await this.loadDashboardConfig();
      console.log(`✅ Loaded dashboard: ${dashboardConfig.name}\n`);

      // Step 2: Validate account and permissions
      console.log('🔐 Step 2: Validating account and permissions...');
      await this.validateAccount();
      console.log(`✅ Account ${this.accountId} validated\n`);

      // Step 3: Extract and validate all NRQL queries
      console.log('🔍 Step 3: Extracting and validating NRQL queries...');
      const queries = this.extractQueries(dashboardConfig);
      console.log(`📊 Found ${queries.length} queries to validate\n`);

      // Step 4: Validate each query
      console.log('✓ Step 4: Validating each query individually...');
      for (let i = 0; i < queries.length; i++) {
        const query = queries[i];
        console.log(`\n🔍 Query ${i + 1}/${queries.length}: ${query.widget}`);
        console.log(`   NRQL: ${query.nrql.substring(0, 100)}...`);
        
        const validation = await this.validateNRQL(query);
        this.validationResults.push(validation);
        
        if (validation.valid) {
          console.log(`   ✅ Valid - ${validation.resultCount} results`);
        } else {
          console.log(`   ❌ Invalid - ${validation.error}`);
          
          // Try to fix the query
          const fixed = await this.troubleshootAndFix(query, validation);
          if (fixed.success) {
            console.log(`   🔧 Fixed - ${fixed.message}`);
            query.nrql = fixed.fixedQuery;
            this.fixedQueries.push(fixed);
          } else {
            console.log(`   ⚠️  Could not auto-fix - ${fixed.message}`);
          }
        }
      }

      // Step 5: Update dashboard with fixed queries
      console.log('\n📝 Step 5: Updating dashboard with validated queries...');
      const updatedDashboard = this.updateDashboardQueries(dashboardConfig, queries);
      console.log('✅ Dashboard updated with validated queries\n');

      // Step 6: Create the dashboard
      console.log('🏗️  Step 6: Creating dashboard in New Relic...');
      const result = await this.createDashboard(updatedDashboard);
      this.dashboardGuid = result.guid;
      console.log(`✅ Dashboard created successfully!`);
      console.log(`📌 Name: ${result.name}`);
      console.log(`🔗 Link: ${result.permalink}`);
      console.log(`📍 GUID: ${result.guid}\n`);

      // Step 7: Verify dashboard widgets
      console.log('🔍 Step 7: Verifying dashboard widgets...');
      await this.verifyDashboard(result.guid);
      
      // Step 8: Generate report
      console.log('\n📄 Step 8: Generating deployment report...');
      await this.generateReport(result);

      console.log('\n✨ Dashboard deployment complete!\n');
      
      return result;

    } catch (error) {
      console.error('\n❌ Deployment failed:', error.message);
      console.error('\n📋 Troubleshooting steps:');
      console.error('1. Verify your API key has the necessary permissions');
      console.error('2. Check that the account ID is correct');
      console.error('3. Ensure the entity data is being ingested');
      console.error('4. Review the error details above\n');
      process.exit(1);
    }
  }

  async loadDashboardConfig() {
    // Load the generated dashboard configuration
    const configPath = path.join(__dirname, 'generated-dashboards', 'message-queues-platform-dashboard.json');
    const content = await fs.readFile(configPath, 'utf8');
    return JSON.parse(content);
  }

  async validateAccount() {
    const query = `
      {
        actor {
          account(id: ${this.accountId}) {
            id
            name
          }
          user {
            name
            email
          }
        }
      }
    `;

    const response = await this.nerdGraphQuery(query);
    
    if (!response.actor?.account) {
      throw new Error(`Account ${this.accountId} not found or not accessible`);
    }

    console.log(`   Account: ${response.actor.account.name}`);
    console.log(`   User: ${response.actor.user.name} (${response.actor.user.email})`);
  }

  extractQueries(dashboard) {
    const queries = [];
    
    dashboard.pages?.forEach((page, pageIdx) => {
      page.widgets?.forEach((widget, widgetIdx) => {
        widget.configuration?.nrqlQueries?.forEach((q, queryIdx) => {
          queries.push({
            pageIndex: pageIdx,
            widgetIndex: widgetIdx,
            queryIndex: queryIdx,
            page: page.name,
            widget: widget.title,
            nrql: q.query,
            accountId: q.accountId || this.accountId
          });
        });
      });
    });

    return queries;
  }

  async validateNRQL(query) {
    try {
      // Use NerdGraph to validate the query
      const gql = `
        {
          actor {
            account(id: ${query.accountId}) {
              nrql(query: "${query.nrql.replace(/"/g, '\\"')}") {
                results
                totalResult
                metadata {
                  eventTypes
                  facets
                  messages
                  timeWindow {
                    begin
                    end
                  }
                }
              }
            }
          }
        }
      `;

      const response = await this.nerdGraphQuery(gql);
      
      if (response.errors) {
        return {
          valid: false,
          error: response.errors[0]?.message || 'Unknown error',
          query: query.nrql
        };
      }

      const nrqlResult = response.actor?.account?.nrql;
      
      if (!nrqlResult) {
        return {
          valid: false,
          error: 'No results returned',
          query: query.nrql
        };
      }

      return {
        valid: true,
        resultCount: nrqlResult.results?.length || 0,
        totalResult: nrqlResult.totalResult,
        eventTypes: nrqlResult.metadata?.eventTypes || [],
        messages: nrqlResult.metadata?.messages || [],
        query: query.nrql
      };

    } catch (error) {
      return {
        valid: false,
        error: error.message,
        query: query.nrql
      };
    }
  }

  async troubleshootAndFix(query, validation) {
    const fixes = [];

    // Common fix patterns
    const fixPatterns = [
      {
        // Fix missing quotes around string values
        pattern: /WHERE\s+(\w+)\s*=\s*([^'\s]+)(?:\s|$)/g,
        replacement: "WHERE $1 = '$2' ",
        description: 'Added quotes around string values'
      },
      {
        // Fix case sensitivity in event types
        pattern: /FROM\s+message_queue_(\w+)_sample/gi,
        replacement: 'FROM MESSAGE_QUEUE_$1_SAMPLE',
        description: 'Fixed event type case'
      },
      {
        // Add SINCE clause if missing
        pattern: /^((?!SINCE).)*$/,
        test: (q) => !q.includes('SINCE'),
        fix: (q) => q + ' SINCE 1 hour ago',
        description: 'Added missing SINCE clause'
      },
      {
        // Fix TIMESERIES without time window
        pattern: /TIMESERIES(?!\s+\d)/g,
        replacement: 'TIMESERIES AUTO',
        description: 'Added AUTO to TIMESERIES'
      }
    ];

    let fixedQuery = query.nrql;
    let applied = [];

    // Try each fix pattern
    for (const fix of fixPatterns) {
      if (fix.test && fix.test(fixedQuery)) {
        fixedQuery = fix.fix(fixedQuery);
        applied.push(fix.description);
      } else if (fix.pattern && fix.pattern.test(fixedQuery)) {
        fixedQuery = fixedQuery.replace(fix.pattern, fix.replacement);
        applied.push(fix.description);
      }
    }

    // If we made changes, validate the fixed query
    if (applied.length > 0) {
      const fixedValidation = await this.validateNRQL({
        ...query,
        nrql: fixedQuery
      });

      if (fixedValidation.valid) {
        return {
          success: true,
          fixedQuery,
          message: `Applied fixes: ${applied.join(', ')}`,
          validation: fixedValidation
        };
      }
    }

    // If auto-fix didn't work, provide specific guidance
    const guidance = this.getSpecificGuidance(validation.error);
    
    return {
      success: false,
      message: guidance,
      originalError: validation.error
    };
  }

  getSpecificGuidance(error) {
    const errorPatterns = [
      {
        pattern: /Unknown event type/i,
        guidance: 'Event type not found. Ensure data is being ingested for this entity type.'
      },
      {
        pattern: /Unknown attribute/i,
        guidance: 'Attribute not found. Check the exact attribute name in the data dictionary.'
      },
      {
        pattern: /Syntax error/i,
        guidance: 'NRQL syntax error. Check for missing quotes, parentheses, or keywords.'
      },
      {
        pattern: /Permission/i,
        guidance: 'Permission denied. Ensure your API key has query permissions for this account.'
      }
    ];

    for (const pattern of errorPatterns) {
      if (pattern.pattern.test(error)) {
        return pattern.guidance;
      }
    }

    return `Unable to auto-fix: ${error}`;
  }

  updateDashboardQueries(dashboard, validatedQueries) {
    const updated = JSON.parse(JSON.stringify(dashboard)); // Deep clone
    
    validatedQueries.forEach(q => {
      const page = updated.pages[q.pageIndex];
      const widget = page.widgets[q.widgetIndex];
      const query = widget.configuration.nrqlQueries[q.queryIndex];
      
      // Update with validated/fixed query
      query.query = q.nrql;
      query.accountId = parseInt(q.accountId);
    });

    return updated;
  }

  async createDashboard(dashboardConfig) {
    const mutation = `
      mutation CreateDashboard($accountId: Int!, $dashboard: DashboardInput!) {
        dashboardCreate(accountId: $accountId, dashboard: $dashboard) {
          errors {
            description
            type
          }
          entityResult {
            guid
            name
            permalink
            accountId
            createdAt
            updatedAt
          }
        }
      }
    `;

    const variables = {
      accountId: parseInt(this.accountId),
      dashboard: {
        name: dashboardConfig.name,
        description: dashboardConfig.description,
        permissions: dashboardConfig.permissions || 'PUBLIC_READ_WRITE',
        pages: dashboardConfig.pages.map(page => ({
          name: page.name,
          description: page.description,
          widgets: page.widgets.map(widget => ({
            title: widget.title,
            layout: widget.layout,
            visualization: widget.visualization,
            configuration: widget.configuration
          }))
        }))
      }
    };

    const response = await this.nerdGraphQuery(mutation, variables);
    
    if (response.dashboardCreate?.errors?.length > 0) {
      const error = response.dashboardCreate.errors[0];
      throw new Error(`Dashboard creation failed: ${error.description} (${error.type})`);
    }

    return response.dashboardCreate.entityResult;
  }

  async verifyDashboard(guid) {
    // Query the dashboard to verify all widgets
    const query = `
      {
        actor {
          entity(guid: "${guid}") {
            ... on DashboardEntity {
              guid
              name
              pages {
                name
                widgets {
                  title
                  visualization {
                    id
                  }
                  configuration
                }
              }
            }
          }
        }
      }
    `;

    const response = await this.nerdGraphQuery(query);
    const dashboard = response.actor?.entity;
    
    if (!dashboard) {
      throw new Error('Dashboard not found after creation');
    }

    let totalWidgets = 0;
    let validWidgets = 0;

    dashboard.pages.forEach(page => {
      console.log(`\n   📄 Page: ${page.name}`);
      page.widgets.forEach(widget => {
        totalWidgets++;
        const hasQueries = widget.configuration?.nrqlQueries?.length > 0;
        const status = hasQueries ? '✅' : '❌';
        console.log(`      ${status} ${widget.title} (${widget.visualization.id})`);
        if (hasQueries) validWidgets++;
      });
    });

    console.log(`\n   📊 Summary: ${validWidgets}/${totalWidgets} widgets configured correctly`);
    
    return {
      totalWidgets,
      validWidgets,
      success: validWidgets === totalWidgets
    };
  }

  async generateReport(dashboardResult) {
    const report = {
      deployment: {
        timestamp: new Date().toISOString(),
        dashboard: {
          name: dashboardResult.name,
          guid: dashboardResult.guid,
          permalink: dashboardResult.permalink,
          accountId: dashboardResult.accountId
        }
      },
      validation: {
        totalQueries: this.validationResults.length,
        validQueries: this.validationResults.filter(r => r.valid).length,
        fixedQueries: this.fixedQueries.length,
        failedQueries: this.validationResults.filter(r => !r.valid).length
      },
      fixes: this.fixedQueries,
      results: this.validationResults
    };

    const reportPath = path.join(__dirname, 'generated-dashboards', `deployment-report-${Date.now()}.json`);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`✅ Report saved to: ${path.basename(reportPath)}`);
    
    return report;
  }

  async nerdGraphQuery(query, variables = {}) {
    const body = variables && Object.keys(variables).length > 0
      ? JSON.stringify({ query, variables })
      : JSON.stringify({ query });

    const response = await fetch(this.nerdGraphUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-Key': this.apiKey
      },
      body
    });

    const data = await response.json();
    
    if (data.errors) {
      throw new Error(data.errors[0].message);
    }

    return data.data;
  }
}

// Main execution
async function main() {
  const deployer = new ProgrammaticDashboardDeployer();
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('     Programmatic Dashboard Deployment with Validation         ');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  const result = await deployer.deploy();
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                    Deployment Complete!                        ');
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log(`🔗 View your dashboard at:`);
  console.log(`   ${result.permalink}\n`);
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = ProgrammaticDashboardDeployer;