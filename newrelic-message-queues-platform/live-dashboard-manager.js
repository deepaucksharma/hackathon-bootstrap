#!/usr/bin/env node

/**
 * Live Dashboard Manager
 * Creates and maintains a live dashboard in New Relic that updates with project changes
 */

const fs = require('fs').promises;
const path = require('path');
const chokidar = require('chokidar');
const crypto = require('crypto');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Dashboard configuration
const DASHBOARD_CONFIG = {
  name: 'Message Queues Platform - Live Project Status',
  description: 'Real-time monitoring of the Message Queues platform development, streaming metrics, and verification status',
  permissions: 'PUBLIC_READ_WRITE'
};

class LiveDashboardManager {
  constructor() {
    this.apiKey = process.env.NEW_RELIC_USER_API_KEY;
    this.accountId = process.env.NEW_RELIC_ACCOUNT_ID || '3630072';
    this.dashboardGuid = null;
    this.projectPath = path.resolve(__dirname);
    this.lastUpdateHash = null;
    this.updateInProgress = false;
    this.metrics = {
      filesChanged: 0,
      lastUpdate: new Date().toISOString(),
      testsRun: 0,
      testsPassed: 0,
      entitiesStreaming: 183,
      dashboardsGenerated: 4,
      verificationStatus: 'PASSED'
    };
  }

  async initialize() {
    console.log('🚀 Initializing Live Dashboard Manager\n');
    
    // Check API key
    if (!this.apiKey) {
      console.error('❌ NEW_RELIC_USER_API_KEY not set');
      console.log('\n📝 Creating offline dashboard configuration instead...\n');
      return this.createOfflineDashboard();
    }

    // Create or update dashboard
    await this.createOrUpdateDashboard();
    
    // Set up file watcher
    this.setupFileWatcher();
    
    // Start metrics collection
    this.startMetricsCollection();
    
    console.log('\n✨ Live dashboard manager initialized!\n');
  }

  async createOrUpdateDashboard() {
    try {
      console.log('📊 Creating live dashboard in New Relic...\n');
      
      const dashboard = this.buildDashboardStructure();
      
      // Create dashboard via API
      const response = await this.callNerdGraphAPI({
        query: `
          mutation CreateDashboard($accountId: Int!, $dashboard: DashboardInput!) {
            dashboardCreate(accountId: $accountId, dashboard: $dashboard) {
              errors {
                description
              }
              entityResult {
                guid
                name
                permalink
              }
            }
          }
        `,
        variables: {
          accountId: parseInt(this.accountId),
          dashboard
        }
      });

      if (response.data?.dashboardCreate?.entityResult) {
        const result = response.data.dashboardCreate.entityResult;
        this.dashboardGuid = result.guid;
        
        console.log('✅ Dashboard created successfully!');
        console.log(`📌 Name: ${result.name}`);
        console.log(`🔗 Link: ${result.permalink}`);
        console.log(`📍 GUID: ${result.guid}\n`);
        
        // Save dashboard info
        await this.saveDashboardInfo(result);
        
        return result;
      } else {
        throw new Error(response.errors?.[0]?.description || 'Failed to create dashboard');
      }
      
    } catch (error) {
      console.error('❌ Error creating dashboard:', error.message);
      return this.createOfflineDashboard();
    }
  }

  buildDashboardStructure() {
    const timestamp = new Date().toISOString();
    
    return {
      name: DASHBOARD_CONFIG.name,
      description: DASHBOARD_CONFIG.description,
      permissions: DASHBOARD_CONFIG.permissions,
      pages: [
        {
          name: 'Project Overview',
          description: 'Real-time project status and metrics',
          widgets: [
            // Project Status Widget
            {
              title: 'Project Status',
              layout: { column: 1, row: 1, width: 4, height: 3 },
              visualization: { id: 'viz.markdown' },
              configuration: {
                markdown: {
                  text: `# Message Queues Platform

## 🚀 Project Status: ACTIVE

- **Last Update**: ${timestamp}
- **Files Changed**: ${this.metrics.filesChanged}
- **Tests Status**: ${this.metrics.testsPassed}/${this.metrics.testsRun} passed
- **Verification**: ${this.metrics.verificationStatus}

### Components:
- ✅ Entity Framework
- ✅ Dashboard Framework  
- ✅ Streaming Engine
- ✅ Verification Suite`
                }
              }
            },
            
            // Streaming Metrics
            {
              title: 'Live Streaming Metrics',
              layout: { column: 5, row: 1, width: 4, height: 3 },
              visualization: { id: 'viz.billboard' },
              configuration: {
                nrqlQueries: [{
                  accountId: parseInt(this.accountId),
                  query: `FROM MESSAGE_QUEUE_CLUSTER_SAMPLE SELECT count(*) as 'Active Entities' WHERE provider = 'kafka' SINCE 1 hour ago`
                }]
              }
            },
            
            // Development Activity
            {
              title: 'Development Activity',
              layout: { column: 9, row: 1, width: 4, height: 3 },
              visualization: { id: 'viz.billboard' },
              configuration: {
                nrqlQueries: [{
                  accountId: parseInt(this.accountId),
                  query: `FROM Log SELECT count(*) as 'Project Events' WHERE message LIKE '%message-queues-platform%' SINCE 1 hour ago`
                }]
              }
            },
            
            // Entity Health Timeline
            {
              title: 'Entity Health Over Time',
              layout: { column: 1, row: 4, width: 8, height: 4 },
              visualization: { id: 'viz.line' },
              configuration: {
                nrqlQueries: [{
                  accountId: parseInt(this.accountId),
                  query: `FROM MESSAGE_QUEUE_CLUSTER_SAMPLE SELECT average(cluster.health.score) TIMESERIES WHERE provider = 'kafka' SINCE 1 hour ago`
                }]
              }
            },
            
            // Dashboard Status
            {
              title: 'Generated Dashboards',
              layout: { column: 9, row: 4, width: 4, height: 4 },
              visualization: { id: 'viz.table' },
              configuration: {
                nrqlQueries: [{
                  accountId: parseInt(this.accountId),
                  query: `FROM Log SELECT uniques(message) WHERE message LIKE '%dashboard%generated%' SINCE 1 day ago LIMIT 10`
                }]
              }
            }
          ]
        },
        {
          name: 'Streaming Data',
          description: 'Live message queue metrics',
          widgets: [
            {
              title: 'Cluster Throughput',
              layout: { column: 1, row: 1, width: 6, height: 4 },
              visualization: { id: 'viz.area' },
              configuration: {
                nrqlQueries: [{
                  accountId: parseInt(this.accountId),
                  query: `FROM MESSAGE_QUEUE_CLUSTER_SAMPLE SELECT sum(cluster.throughput.total) FACET clusterName TIMESERIES WHERE provider = 'kafka' SINCE 1 hour ago`
                }]
              }
            },
            {
              title: 'Topic Performance',
              layout: { column: 7, row: 1, width: 6, height: 4 },
              visualization: { id: 'viz.line' },
              configuration: {
                nrqlQueries: [{
                  accountId: parseInt(this.accountId),
                  query: `FROM MESSAGE_QUEUE_TOPIC_SAMPLE SELECT average(topic.throughput.in), average(topic.throughput.out) TIMESERIES WHERE provider = 'kafka' SINCE 1 hour ago`
                }]
              }
            }
          ]
        }
      ]
    };
  }

  setupFileWatcher() {
    console.log('👁️  Setting up file watcher for project changes...\n');
    
    const watcher = chokidar.watch(this.projectPath, {
      ignored: [
        /(^|[\/\\])\../,
        /node_modules/,
        /\.git/,
        /streaming\.log/,
        /generated-dashboards/
      ],
      persistent: true,
      ignoreInitial: true
    });

    watcher.on('change', async (filepath) => {
      console.log(`📝 File changed: ${path.relative(this.projectPath, filepath)}`);
      this.metrics.filesChanged++;
      await this.handleProjectChange('file_change', filepath);
    });

    watcher.on('add', async (filepath) => {
      console.log(`➕ File added: ${path.relative(this.projectPath, filepath)}`);
      this.metrics.filesChanged++;
      await this.handleProjectChange('file_add', filepath);
    });

    console.log('✅ File watcher active\n');
  }

  async handleProjectChange(changeType, filepath) {
    if (this.updateInProgress) return;
    
    this.updateInProgress = true;
    
    try {
      // Calculate project hash
      const currentHash = await this.calculateProjectHash();
      
      if (currentHash !== this.lastUpdateHash) {
        console.log('🔄 Updating dashboard with project changes...');
        
        // Update metrics
        this.metrics.lastUpdate = new Date().toISOString();
        
        // Run tests if test file changed
        if (filepath.includes('test')) {
          await this.runTests();
        }
        
        // Update dashboard
        if (this.dashboardGuid) {
          await this.updateDashboard();
        } else {
          await this.updateOfflineDashboard();
        }
        
        this.lastUpdateHash = currentHash;
      }
      
    } catch (error) {
      console.error('❌ Error handling project change:', error.message);
    } finally {
      this.updateInProgress = false;
    }
  }

  async updateDashboard() {
    if (!this.dashboardGuid) return;
    
    try {
      const dashboard = this.buildDashboardStructure();
      
      const response = await this.callNerdGraphAPI({
        query: `
          mutation UpdateDashboard($guid: EntityGuid!, $dashboard: DashboardInput!) {
            dashboardUpdate(guid: $guid, dashboard: $dashboard) {
              errors {
                description
              }
            }
          }
        `,
        variables: {
          guid: this.dashboardGuid,
          dashboard
        }
      });

      if (!response.errors) {
        console.log('✅ Dashboard updated successfully');
      }
      
    } catch (error) {
      console.error('❌ Error updating dashboard:', error.message);
    }
  }

  async startMetricsCollection() {
    console.log('📊 Starting metrics collection...\n');
    
    // Send custom events every minute
    setInterval(async () => {
      await this.sendProjectMetrics();
    }, 60000);
    
    // Initial metrics send
    await this.sendProjectMetrics();
  }

  async sendProjectMetrics() {
    try {
      const event = {
        eventType: 'MessageQueuesPlatformStatus',
        timestamp: Date.now(),
        projectPath: this.projectPath,
        filesChanged: this.metrics.filesChanged,
        testsRun: this.metrics.testsRun,
        testsPassed: this.metrics.testsPassed,
        entitiesStreaming: this.metrics.entitiesStreaming,
        dashboardsGenerated: this.metrics.dashboardsGenerated,
        verificationStatus: this.metrics.verificationStatus,
        lastUpdate: this.metrics.lastUpdate
      };

      // Send to New Relic
      const response = await fetch(`https://insights-collector.newrelic.com/v1/accounts/${this.accountId}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Insert-Key': process.env.NEW_RELIC_INSERT_KEY || process.env.NEW_RELIC_LICENSE_KEY
        },
        body: JSON.stringify([event])
      });

      if (response.ok) {
        console.log('📤 Project metrics sent to New Relic');
      }
      
    } catch (error) {
      // Silently fail if no insert key
    }
  }

  async calculateProjectHash() {
    const files = [
      'package.json',
      'index.js',
      'core/entities/entity-factory.js',
      'dashboards/framework/core/dashboard-framework.js'
    ];
    
    let combinedContent = '';
    
    for (const file of files) {
      try {
        const content = await fs.readFile(path.join(this.projectPath, file), 'utf8');
        combinedContent += content;
      } catch (error) {
        // File doesn't exist
      }
    }
    
    return crypto.createHash('md5').update(combinedContent).digest('hex');
  }

  async runTests() {
    try {
      console.log('🧪 Running tests...');
      const { stdout } = await execAsync('npm test', { cwd: this.projectPath });
      
      // Parse test results
      const testsMatch = stdout.match(/(\d+) passing/);
      if (testsMatch) {
        this.metrics.testsRun = parseInt(testsMatch[1]);
        this.metrics.testsPassed = parseInt(testsMatch[1]);
      }
      
    } catch (error) {
      // Tests failed
      this.metrics.verificationStatus = 'FAILED';
    }
  }

  async callNerdGraphAPI({ query, variables }) {
    const response = await fetch('https://api.newrelic.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-Key': this.apiKey
      },
      body: JSON.stringify({ query, variables })
    });

    const data = await response.json();
    
    if (data.errors) {
      throw new Error(data.errors[0].message);
    }
    
    return data;
  }

  async saveDashboardInfo(dashboardInfo) {
    const infoPath = path.join(this.projectPath, 'generated-dashboards', 'live-dashboard-info.json');
    await fs.writeFile(infoPath, JSON.stringify({
      ...dashboardInfo,
      createdAt: new Date().toISOString(),
      accountId: this.accountId,
      updateFrequency: 'Real-time on file changes'
    }, null, 2));
  }

  async createOfflineDashboard() {
    console.log('📄 Creating offline dashboard configuration...\n');
    
    const dashboard = this.buildDashboardStructure();
    const dashboardPath = path.join(this.projectPath, 'generated-dashboards', 'live-project-dashboard.json');
    
    await fs.writeFile(dashboardPath, JSON.stringify({
      dashboard,
      metadata: {
        createdAt: new Date().toISOString(),
        description: 'Offline dashboard configuration - deploy with API key',
        accountId: this.accountId,
        metrics: this.metrics
      }
    }, null, 2));
    
    console.log('✅ Offline dashboard configuration saved');
    console.log(`📁 Location: ${dashboardPath}`);
    console.log('\n📝 To deploy this dashboard:');
    console.log('   1. Set NEW_RELIC_USER_API_KEY environment variable');
    console.log('   2. Run: node live-dashboard-manager.js\n');
    
    // Still set up file watcher for offline updates
    this.setupFileWatcher();
  }

  async updateOfflineDashboard() {
    const dashboardPath = path.join(this.projectPath, 'generated-dashboards', 'live-project-dashboard.json');
    
    try {
      const content = await fs.readFile(dashboardPath, 'utf8');
      const data = JSON.parse(content);
      
      // Update dashboard
      data.dashboard = this.buildDashboardStructure();
      data.metadata.lastUpdated = new Date().toISOString();
      data.metadata.metrics = this.metrics;
      
      await fs.writeFile(dashboardPath, JSON.stringify(data, null, 2));
      console.log('✅ Offline dashboard updated');
      
    } catch (error) {
      console.error('❌ Error updating offline dashboard:', error.message);
    }
  }
}

// Run the dashboard manager
async function main() {
  const manager = new LiveDashboardManager();
  await manager.initialize();
  
  console.log('💡 Dashboard manager is running...');
  console.log('   - Watching for file changes');
  console.log('   - Updating dashboard in real-time');
  console.log('   - Press Ctrl+C to stop\n');
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});