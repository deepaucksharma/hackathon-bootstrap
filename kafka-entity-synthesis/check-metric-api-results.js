#!/usr/bin/env node

const https = require('https');
require('dotenv').config({ path: '../.env' });

const config = {
  accountId: parseInt(process.env.ACC),
  apiKey: process.env.UKEY || process.env.QKey
};

class MetricAPIChecker {
  constructor() {
    this.accountId = config.accountId;
    this.apiKey = config.apiKey;
    this.graphqlEndpoint = 'https://api.newrelic.com/graphql';
    this.clusterName = 'working-cluster-1749192314301';
    this.collectorName = 'cloudwatch-metric-streams';
  }

  async makeGraphQLRequest(query, variables = {}) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.newrelic.com',
        path: '/graphql',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'API-Key': this.apiKey
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            if (result.errors) {
              console.error('GraphQL errors:', JSON.stringify(result.errors, null, 2));
            }
            resolve(result);
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.write(JSON.stringify({ query, variables }));
      req.end();
    });
  }

  async checkMetrics() {
    console.log('🔍 Checking for metrics sent via Metric API...\n');
    
    // Check for raw metrics with our collector name
    const metricsQuery = `
      query($accountId: Int!) {
        actor {
          account(id: $accountId) {
            nrql(query: "SELECT * FROM Metric WHERE collector.name = 'cloudwatch-metric-streams' AND aws.msk.cluster.name = '${this.clusterName}' SINCE 30 minutes ago LIMIT 100") {
              results
              totalResult
            }
          }
        }
      }
    `;

    const metricsResult = await this.makeGraphQLRequest(metricsQuery, { accountId: this.accountId });
    
    if (metricsResult.data?.actor?.account?.nrql?.results) {
      const results = metricsResult.data.actor.account.nrql.results;
      console.log(`✅ Found ${results.length} metrics with collector.name = '${this.collectorName}'`);
      
      if (results.length > 0) {
        console.log('\nSample metric:');
        console.log(JSON.stringify(results[0], null, 2));
        
        // Get unique metric names
        const metricNames = [...new Set(results.map(r => r.metricName))].filter(Boolean);
        console.log('\nUnique metric names found:');
        metricNames.forEach(name => console.log(`  - ${name}`));
      }
    } else {
      console.log('❌ No metrics found with the specified collector name');
    }
  }

  async checkAwsMskSamples() {
    console.log('\n\n🔍 Checking for AwsMskBrokerSample events...\n');
    
    const brokerQuery = `
      query($accountId: Int!) {
        actor {
          account(id: $accountId) {
            nrql(query: "SELECT * FROM AwsMskBrokerSample WHERE aws.msk.cluster.name = '${this.clusterName}' SINCE 30 minutes ago LIMIT 10") {
              results
              totalResult
            }
          }
        }
      }
    `;

    const brokerResult = await this.makeGraphQLRequest(brokerQuery, { accountId: this.accountId });
    
    if (brokerResult.data?.actor?.account?.nrql?.results?.length > 0) {
      const results = brokerResult.data.actor.account.nrql.results;
      console.log(`✅ Found ${results.length} AwsMskBrokerSample events`);
      console.log('\nSample event:');
      console.log(JSON.stringify(results[0], null, 2));
    } else {
      console.log('❌ No AwsMskBrokerSample events found');
    }

    // Check ClusterSample
    console.log('\n🔍 Checking for AwsMskClusterSample events...\n');
    
    const clusterQuery = `
      query($accountId: Int!) {
        actor {
          account(id: $accountId) {
            nrql(query: "SELECT * FROM AwsMskClusterSample WHERE aws.msk.cluster.name = '${this.clusterName}' SINCE 30 minutes ago LIMIT 10") {
              results
              totalResult
            }
          }
        }
      }
    `;

    const clusterResult = await this.makeGraphQLRequest(clusterQuery, { accountId: this.accountId });
    
    if (clusterResult.data?.actor?.account?.nrql?.results?.length > 0) {
      const results = clusterResult.data.actor.account.nrql.results;
      console.log(`✅ Found ${results.length} AwsMskClusterSample events`);
      console.log('\nSample event:');
      console.log(JSON.stringify(results[0], null, 2));
    } else {
      console.log('❌ No AwsMskClusterSample events found');
    }

    // Check TopicSample
    console.log('\n🔍 Checking for AwsMskTopicSample events...\n');
    
    const topicQuery = `
      query($accountId: Int!) {
        actor {
          account(id: $accountId) {
            nrql(query: "SELECT * FROM AwsMskTopicSample WHERE aws.msk.cluster.name = '${this.clusterName}' SINCE 30 minutes ago LIMIT 10") {
              results
              totalResult
            }
          }
        }
      }
    `;

    const topicResult = await this.makeGraphQLRequest(topicQuery, { accountId: this.accountId });
    
    if (topicResult.data?.actor?.account?.nrql?.results?.length > 0) {
      const results = topicResult.data.actor.account.nrql.results;
      console.log(`✅ Found ${results.length} AwsMskTopicSample events`);
      console.log('\nSample event:');
      console.log(JSON.stringify(results[0], null, 2));
    } else {
      console.log('❌ No AwsMskTopicSample events found');
    }
  }

  async checkEntities() {
    console.log('\n\n🔍 Checking for entity synthesis...\n');
    
    const entityQuery = `
      query($accountId: Int!) {
        actor {
          entitySearch(query: "type IN ('AWSMSKBROKER', 'AWSMSKCLUSTER', 'AWSMSKTOPIC') AND tags.aws.msk.cluster.name = '${this.clusterName}'") {
            results {
              entities {
                guid
                name
                type
                tags {
                  key
                  values
                }
              }
            }
          }
        }
      }
    `;

    const entityResult = await this.makeGraphQLRequest(entityQuery, { accountId: this.accountId });
    
    if (entityResult.data?.actor?.entitySearch?.results?.entities?.length > 0) {
      const entities = entityResult.data.actor.entitySearch.results.entities;
      console.log(`✅ Found ${entities.length} entities`);
      
      entities.forEach(entity => {
        console.log(`\n${entity.type}: ${entity.name}`);
        console.log(`  GUID: ${entity.guid}`);
        
        // Show relevant tags
        const relevantTags = entity.tags.filter(tag => 
          tag.key.includes('aws') || 
          tag.key.includes('kafka') || 
          tag.key.includes('broker') ||
          tag.key.includes('cluster')
        );
        
        if (relevantTags.length > 0) {
          console.log('  Tags:');
          relevantTags.forEach(tag => {
            console.log(`    ${tag.key}: ${tag.values.join(', ')}`);
          });
        }
      });
    } else {
      console.log('❌ No entities found with the specified cluster name');
    }
  }

  async checkUIVisibility() {
    console.log('\n\n🔍 Checking UI visibility in entity details...\n');
    
    // First get the entity GUID
    const entityQuery = `
      query($accountId: Int!) {
        actor {
          entitySearch(query: "type = 'AWSMSKCLUSTER' AND tags.aws.msk.cluster.name = '${this.clusterName}'") {
            results {
              entities {
                guid
                name
              }
            }
          }
        }
      }
    `;

    const entityResult = await this.makeGraphQLRequest(entityQuery, { accountId: this.accountId });
    
    if (entityResult.data?.actor?.entitySearch?.results?.entities?.length > 0) {
      const entity = entityResult.data.actor.entitySearch.results.entities[0];
      console.log(`✅ Found cluster entity: ${entity.name}`);
      console.log(`   GUID: ${entity.guid}`);
      console.log(`\n   View in UI: https://one.newrelic.com/redirect/entity/${entity.guid}`);
      
      // Check for metrics on this entity
      const metricsQuery = `
        query($guid: EntityGuid!) {
          actor {
            entity(guid: $guid) {
              goldenMetrics {
                metrics {
                  name
                  title
                  unit
                  query
                }
              }
              recentAlertViolations {
                alertSeverity
                violationUrl
              }
            }
          }
        }
      `;

      const metricsResult = await this.makeGraphQLRequest(metricsQuery, { guid: entity.guid });
      
      if (metricsResult.data?.actor?.entity?.goldenMetrics?.metrics) {
        const metrics = metricsResult.data.actor.entity.goldenMetrics.metrics;
        console.log(`\n   Golden metrics: ${metrics.length > 0 ? metrics.map(m => m.title).join(', ') : 'None found'}`);
      }
    } else {
      console.log('❌ No cluster entity found to check UI visibility');
    }
  }

  async run() {
    console.log('='.repeat(80));
    console.log('Metric API Results Checker');
    console.log(`Cluster: ${this.clusterName}`);
    console.log(`Collector: ${this.collectorName}`);
    console.log('='.repeat(80));
    
    try {
      await this.checkMetrics();
      await this.checkAwsMskSamples();
      await this.checkEntities();
      await this.checkUIVisibility();
      
      console.log('\n' + '='.repeat(80));
      console.log('✨ Check complete!');
      console.log('='.repeat(80));
    } catch (error) {
      console.error('❌ Error during check:', error);
    }
  }
}

// Run the checker
const checker = new MetricAPIChecker();
checker.run();