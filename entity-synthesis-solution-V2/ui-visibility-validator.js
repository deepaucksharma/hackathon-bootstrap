#!/usr/bin/env node

const https = require('https');
const fs = require('fs');

// Load environment variables
if (fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const [key, ...valueParts] = trimmedLine.split('=');
      if (key && valueParts.length > 0) {
        process.env[key.trim()] = valueParts.join('=').trim();
      }
    }
  });
}

const USER_KEY = process.env.UKEY;
const ACCOUNT_ID = process.env.ACC;

class UIVisibilityValidator {
  constructor() {
    this.checks = [];
    this.uiQueries = this.loadUIQueries();
  }

  loadUIQueries() {
    // These are the actual queries the Message Queues UI runs
    return {
      clusterList: {
        name: 'Cluster List Query',
        query: `
          FROM AwsMskClusterSample
          SELECT 
            latest(provider.activeControllerCount.Sum) as 'activeControllers',
            latest(provider.offlinePartitionsCount.Sum) as 'offlinePartitions',
            latest(provider.globalPartitionCount) as 'partitionCount',
            latest(provider.globalTopicCount) as 'topicCount',
            latest(providerAccountName) as 'accountName'
          FACET clusterName, providerAccountId
          WHERE providerAccountId IS NOT NULL
          SINCE 1 hour ago
          LIMIT 100
        `
      },
      brokerDetails: {
        name: 'Broker Details Query',
        query: `
          FROM AwsMskBrokerSample
          SELECT 
            latest(provider.bytesInPerSec.Average) as 'bytesIn',
            latest(provider.bytesOutPerSec.Average) as 'bytesOut',
            latest(provider.messagesInPerSec.Average) as 'messagesIn',
            latest(provider.cpuUser) as 'cpuUser',
            latest(provider.cpuSystem) as 'cpuSystem'
          FACET provider.brokerId, clusterName
          WHERE providerAccountId IS NOT NULL
          SINCE 1 hour ago
        `
      },
      topicMetrics: {
        name: 'Topic Metrics Query',
        query: `
          FROM AwsMskTopicSample
          SELECT 
            latest(provider.messagesInPerSec.Average) as 'messagesIn',
            latest(provider.bytesInPerSec.Average) as 'bytesIn',
            latest(provider.bytesOutPerSec.Average) as 'bytesOut'
          FACET provider.topicName
          WHERE providerAccountId IS NOT NULL
          SINCE 1 hour ago
        `
      },
      entitySearch: {
        name: 'Entity Search Query',
        query: `
          FROM entity
          SELECT 
            count(*) as 'totalEntities',
            uniques(type) as 'entityTypes',
            uniques(name) as 'entityNames'
          WHERE type IN ('AWS_KAFKA_CLUSTER', 'AWS_KAFKA_BROKER', 'AWS_KAFKA_TOPIC')
          AND tags.providerAccountId IS NOT NULL
          SINCE 1 day ago
        `
      }
    };
  }

  async validate() {
    console.log('🔍 UI Visibility Validation\n');
    console.log('This tool checks if your Kafka/MSK entities will appear in the Message Queues UI.\n');

    // Run all UI queries
    for (const [key, queryDef] of Object.entries(this.uiQueries)) {
      await this.runUICheck(key, queryDef);
    }

    // Additional checks
    await this.checkMetricPresence();
    await this.checkCriticalFields();
    await this.checkEntitySynthesis();

    // Generate report
    this.generateReport();
  }

  async runUICheck(key, queryDef) {
    console.log(`\n📋 ${queryDef.name}`);
    console.log('─'.repeat(60));

    try {
      const results = await this.runQuery(queryDef.query);
      const hasData = results && results.length > 0 && 
                      (results[0].count > 0 || results[0].facets?.length > 0);

      if (hasData) {
        console.log('✅ Query returns data');
        
        if (results[0].facets) {
          console.log(`   Found ${results[0].facets.length} items:`);
          results[0].facets.slice(0, 5).forEach(facet => {
            console.log(`   - ${facet.name[0]} (${facet.name[1] || 'N/A'})`);
          });
          if (results[0].facets.length > 5) {
            console.log(`   ... and ${results[0].facets.length - 5} more`);
          }
        } else {
          console.log(`   Results:`, JSON.stringify(results[0], null, 2));
        }
      } else {
        console.log('❌ No data returned');
        console.log('   This means entities won\'t appear in the UI');
      }

      this.checks.push({
        name: queryDef.name,
        key,
        success: hasData,
        results: hasData ? results : null
      });

    } catch (error) {
      console.log(`❌ Query failed: ${error.message}`);
      this.checks.push({
        name: queryDef.name,
        key,
        success: false,
        error: error.message
      });
    }
  }

  async checkMetricPresence() {
    console.log('\n🔬 Checking Metric Presence');
    console.log('─'.repeat(60));

    const queries = [
      {
        name: 'CloudWatch Metrics',
        query: `
          FROM Metric 
          SELECT count(*), uniques(aws.MetricName)
          WHERE collector.name = 'cloudwatch-metric-streams'
          AND aws.Namespace = 'AWS/Kafka'
          SINCE 30 minutes ago
        `
      },
      {
        name: 'Any Kafka Metrics',
        query: `
          FROM Metric 
          SELECT count(*), uniques(metricName), uniques(collector.name)
          WHERE metricName LIKE '%kafka%' OR metricName LIKE '%Kafka%'
          SINCE 30 minutes ago
        `
      }
    ];

    for (const check of queries) {
      try {
        const results = await this.runQuery(check.query);
        const count = results[0]?.['count'] || 0;
        console.log(`${count > 0 ? '✅' : '❌'} ${check.name}: ${count} metrics`);
        
        if (results[0]?.['uniques.aws.MetricName']) {
          console.log(`   Metric types: ${results[0]['uniques.aws.MetricName'].join(', ')}`);
        }
      } catch (error) {
        console.log(`❌ ${check.name}: Failed to check`);
      }
    }
  }

  async checkCriticalFields() {
    console.log('\n🔑 Checking Critical Fields');
    console.log('─'.repeat(60));

    const query = `
      FROM AwsMskBrokerSample, AwsMskClusterSample
      SELECT 
        count(*) as 'totalEvents',
        percentage(count(*), WHERE provider = 'AwsMsk') as 'correctProvider',
        percentage(count(*), WHERE providerAccountId IS NOT NULL) as 'hasProviderAccountId',
        percentage(count(*), WHERE providerExternalId IS NOT NULL) as 'hasProviderExternalId',
        percentage(count(*), WHERE entity.type IS NOT NULL) as 'hasEntityType',
        uniques(provider) as 'providerValues',
        uniques(entity.type) as 'entityTypes'
      SINCE 1 hour ago
    `;

    try {
      const results = await this.runQuery(query);
      if (results[0]) {
        const r = results[0];
        console.log(`Total Events: ${r.totalEvents || 0}`);
        console.log(`\nField Analysis:`);
        console.log(`${r.correctProvider >= 90 ? '✅' : '❌'} Provider = 'AwsMsk': ${r.correctProvider?.toFixed(1) || 0}%`);
        console.log(`${r.hasProviderAccountId >= 90 ? '✅' : '❌'} Has providerAccountId: ${r.hasProviderAccountId?.toFixed(1) || 0}%`);
        console.log(`${r.hasProviderExternalId >= 90 ? '✅' : '❌'} Has providerExternalId: ${r.hasProviderExternalId?.toFixed(1) || 0}%`);
        console.log(`${r.hasEntityType >= 90 ? '✅' : '❌'} Has entity.type: ${r.hasEntityType?.toFixed(1) || 0}%`);
        
        if (r.providerValues) {
          console.log(`\nProvider values found: ${r.providerValues.join(', ')}`);
        }
        if (r.entityTypes) {
          console.log(`Entity types found: ${r.entityTypes.join(', ')}`);
        }
      }
    } catch (error) {
      console.log('❌ Failed to check critical fields');
    }
  }

  async checkEntitySynthesis() {
    console.log('\n🏗️ Checking Entity Synthesis');
    console.log('─'.repeat(60));

    // Check different time windows as entity synthesis can take time
    const timeWindows = ['5 minutes', '30 minutes', '1 hour', '1 day'];
    
    for (const window of timeWindows) {
      const query = `
        FROM AwsMskBrokerSample, AwsMskClusterSample, AwsMskTopicSample
        SELECT 
          uniques(entityGuid) as 'uniqueEntities',
          uniques(entity.name) as 'entityNames',
          count(*) as 'eventCount'
        SINCE ${window} ago
      `;

      try {
        const results = await this.runQuery(query);
        const entityCount = results[0]?.['uniqueEntities']?.length || 0;
        console.log(`${entityCount > 0 ? '✅' : '❌'} Last ${window}: ${entityCount} unique entities`);
      } catch (error) {
        console.log(`❌ Failed to check ${window} window`);
      }
    }
  }

  generateReport() {
    console.log('\n\n' + '='.repeat(80));
    console.log('📊 UI VISIBILITY REPORT');
    console.log('='.repeat(80) + '\n');

    const uiChecks = this.checks.filter(c => c.key !== 'entitySearch');
    const successfulUIChecks = uiChecks.filter(c => c.success).length;
    const totalUIChecks = uiChecks.length;

    console.log(`UI Query Success Rate: ${successfulUIChecks}/${totalUIChecks}`);
    
    if (successfulUIChecks === totalUIChecks) {
      console.log('\n✅ All UI queries return data!');
      console.log('Your Kafka/MSK entities should be visible in the Message Queues UI.');
      console.log('\n🔗 Check here: https://one.newrelic.com/nr1-core/apm-services/message-queues');
    } else {
      console.log('\n❌ Some UI queries are failing.');
      console.log('Your entities may not appear in the Message Queues UI.\n');
      
      console.log('Failed checks:');
      uiChecks.filter(c => !c.success).forEach(check => {
        console.log(`  - ${check.name}`);
      });

      console.log('\n💡 Troubleshooting Tips:');
      console.log('1. Ensure metrics are being sent with collector.name = "cloudwatch-metric-streams"');
      console.log('2. Verify providerAccountId and providerExternalId are present');
      console.log('3. Check that provider field = "AwsMsk" (not "AwsMskBroker")');
      console.log('4. Make sure entity.type is set correctly');
      console.log('5. Wait 2-5 minutes for entity synthesis to complete');
    }

    // Save report
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `entity-synthesis-solution-V2/results/ui-validation-${timestamp}.json`;
    
    if (!fs.existsSync('entity-synthesis-solution-V2/results')) {
      fs.mkdirSync('entity-synthesis-solution-V2/results', { recursive: true });
    }
    
    fs.writeFileSync(filename, JSON.stringify({
      timestamp: new Date().toISOString(),
      summary: {
        uiChecksPassed: successfulUIChecks,
        uiChecksTotal: totalUIChecks,
        uiVisible: successfulUIChecks === totalUIChecks
      },
      checks: this.checks
    }, null, 2));
    
    console.log(`\n📁 Report saved to: ${filename}`);
  }

  runQuery(nrql) {
    return new Promise((resolve, reject) => {
      const query = {
        query: `{ actor { account(id: ${ACCOUNT_ID}) { nrql(query: "${nrql.replace(/"/g, '\\"').replace(/\n/g, ' ')}") { results } } } }`
      };

      const options = {
        hostname: 'api.newrelic.com',
        path: '/graphql',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'API-Key': USER_KEY
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.data?.actor?.account?.nrql?.results) {
              resolve(response.data.actor.account.nrql.results);
            } else {
              reject(new Error('Query failed'));
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.write(JSON.stringify(query));
      req.end();
    });
  }
}

// Run validation
const validator = new UIVisibilityValidator();
validator.validate().catch(console.error);