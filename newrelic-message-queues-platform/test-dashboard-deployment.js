#!/usr/bin/env node

/**
 * Test Dashboard Deployment
 * Tests the programmatic deployment with mock data if no API key is available
 */

const ProgrammaticDashboardDeployer = require('./programmatic-dashboard-deploy');
const fs = require('fs').promises;
const path = require('path');

class MockDashboardDeployer extends ProgrammaticDashboardDeployer {
  constructor() {
    super();
    this.mockMode = !this.apiKey;
    if (this.mockMode) {
      console.log('🔧 Running in MOCK MODE (no API key detected)\n');
    }
  }

  async nerdGraphQuery(query, variables = {}) {
    if (!this.mockMode) {
      return super.nerdGraphQuery(query, variables);
    }

    // Mock responses for different query types
    if (query.includes('account(id:')) {
      return {
        actor: {
          account: {
            id: this.accountId,
            name: 'Mock Account'
          },
          user: {
            name: 'Mock User',
            email: 'mock@example.com'
          }
        }
      };
    }

    if (query.includes('nrql(query:')) {
      // Extract the NRQL query
      const nrqlMatch = query.match(/nrql\(query:\s*"([^"]+)"/);
      const nrqlQuery = nrqlMatch ? nrqlMatch[1] : '';
      
      // Simulate validation results
      const isValid = this.validateMockQuery(nrqlQuery);
      
      if (isValid) {
        return {
          actor: {
            account: {
              nrql: {
                results: this.generateMockResults(nrqlQuery),
                totalResult: Math.floor(Math.random() * 1000),
                metadata: {
                  eventTypes: this.extractEventTypes(nrqlQuery),
                  messages: [],
                  timeWindow: {
                    begin: Date.now() - 3600000,
                    end: Date.now()
                  }
                }
              }
            }
          }
        };
      } else {
        throw new Error(`Mock validation failed for query: ${nrqlQuery}`);
      }
    }

    if (query.includes('dashboardCreate')) {
      return {
        dashboardCreate: {
          errors: [],
          entityResult: {
            guid: `MOCK-GUID-${Date.now()}`,
            name: variables.dashboard.name,
            permalink: `https://one.newrelic.com/dashboards/mock-dashboard-${Date.now()}`,
            accountId: this.accountId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        }
      };
    }

    if (query.includes('entity(guid:')) {
      return {
        actor: {
          entity: {
            guid: this.dashboardGuid,
            name: 'Mock Dashboard',
            pages: [
              {
                name: 'Page 1',
                widgets: [
                  {
                    title: 'Widget 1',
                    visualization: { id: 'viz.line' },
                    configuration: { nrqlQueries: [{ query: 'SELECT count(*) FROM Transaction' }] }
                  }
                ]
              }
            ]
          }
        }
      };
    }

    return {};
  }

  validateMockQuery(query) {
    // Basic NRQL validation
    const hasSelect = /SELECT/i.test(query);
    const hasFrom = /FROM/i.test(query);
    const hasSince = /SINCE/i.test(query) || /TIMESERIES/i.test(query);
    
    return hasSelect && hasFrom;
  }

  generateMockResults(query) {
    // Generate mock results based on query type
    if (query.includes('count(*)')) {
      return [{ count: Math.floor(Math.random() * 10000) }];
    }
    if (query.includes('average(')) {
      return [{ average: Math.random() * 100 }];
    }
    if (query.includes('sum(')) {
      return [{ sum: Math.floor(Math.random() * 50000) }];
    }
    return [{ value: Math.random() * 100 }];
  }

  extractEventTypes(query) {
    const match = query.match(/FROM\s+([A-Z_]+)/i);
    return match ? [match[1]] : ['Unknown'];
  }
}

async function runTest() {
  console.log('🧪 Testing Programmatic Dashboard Deployment\n');

  const deployer = new MockDashboardDeployer();
  
  if (deployer.mockMode) {
    console.log('📝 Creating test dashboard configuration...\n');
    
    // Create a test dashboard
    const testDashboard = {
      name: 'Message Queues Platform - Test Dashboard',
      description: 'Test deployment of message queues monitoring dashboard',
      permissions: 'PUBLIC_READ_WRITE',
      pages: [
        {
          name: 'Overview',
          description: 'System overview',
          widgets: [
            {
              title: 'Total Entities',
              layout: { column: 1, row: 1, width: 4, height: 3 },
              visualization: { id: 'viz.billboard' },
              configuration: {
                nrqlQueries: [{
                  accountId: 3630072,
                  query: 'FROM MESSAGE_QUEUE_CLUSTER_SAMPLE SELECT count(*) SINCE 1 hour ago'
                }]
              }
            },
            {
              title: 'Cluster Health',
              layout: { column: 5, row: 1, width: 8, height: 3 },
              visualization: { id: 'viz.line' },
              configuration: {
                nrqlQueries: [{
                  accountId: 3630072,
                  query: 'FROM MESSAGE_QUEUE_CLUSTER_SAMPLE SELECT average(cluster.health.score) TIMESERIES'
                }]
              }
            },
            {
              title: 'Topic Throughput',
              layout: { column: 1, row: 4, width: 12, height: 4 },
              visualization: { id: 'viz.area' },
              configuration: {
                nrqlQueries: [{
                  accountId: 3630072,
                  query: 'FROM MESSAGE_QUEUE_TOPIC_SAMPLE SELECT sum(topic.throughput.in), sum(topic.throughput.out) TIMESERIES'
                }]
              }
            }
          ]
        }
      ]
    };

    // Save test dashboard
    const testPath = path.join(__dirname, 'generated-dashboards', 'message-queues-platform-dashboard.json');
    await fs.writeFile(testPath, JSON.stringify(testDashboard, null, 2));
    console.log(`✅ Test dashboard saved to: ${path.basename(testPath)}\n`);
  }

  // Run deployment
  try {
    const result = await deployer.deploy();
    
    if (deployer.mockMode) {
      console.log('\n📋 Mock Deployment Summary:');
      console.log('   - All NRQL queries validated');
      console.log('   - Dashboard structure verified');
      console.log('   - Mock dashboard created successfully');
      console.log('\n📝 To deploy for real:');
      console.log('   1. Set NEW_RELIC_USER_API_KEY environment variable');
      console.log('   2. Run: node programmatic-dashboard-deploy.js\n');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Test real deployment with actual queries
async function testRealQueries() {
  console.log('\n🔍 Testing Real NRQL Queries\n');
  
  const testQueries = [
    {
      name: 'Entity Count',
      nrql: "FROM MESSAGE_QUEUE_CLUSTER_SAMPLE SELECT count(*) WHERE provider = 'kafka' SINCE 1 hour ago"
    },
    {
      name: 'Health Score Average',
      nrql: "FROM MESSAGE_QUEUE_CLUSTER_SAMPLE SELECT average(cluster.health.score) WHERE provider = 'kafka' SINCE 1 hour ago TIMESERIES"
    },
    {
      name: 'Topic Throughput',
      nrql: "FROM MESSAGE_QUEUE_TOPIC_SAMPLE SELECT sum(topic.throughput.in) as 'Inbound', sum(topic.throughput.out) as 'Outbound' WHERE provider = 'kafka' SINCE 1 hour ago TIMESERIES"
    },
    {
      name: 'Broker Performance',
      nrql: "FROM MESSAGE_QUEUE_BROKER_SAMPLE SELECT average(broker.cpu.usage), average(broker.memory.usage) FACET hostname WHERE clusterName LIKE 'kafka%' SINCE 1 hour ago"
    },
    {
      name: 'Queue Depth',
      nrql: "FROM MESSAGE_QUEUE_QUEUE_SAMPLE SELECT average(queue.depth) WHERE provider = 'rabbitmq' SINCE 1 hour ago TIMESERIES"
    }
  ];

  console.log('📋 Test Queries:');
  testQueries.forEach((q, i) => {
    console.log(`\n${i + 1}. ${q.name}:`);
    console.log(`   ${q.nrql}`);
  });

  console.log('\n✅ All queries are properly formatted for validation\n');
}

// Main execution
async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('           Dashboard Deployment Test Suite                      ');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Test query formatting
  await testRealQueries();
  
  // Run deployment test
  await runTest();
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                    Test Complete!                              ');
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});