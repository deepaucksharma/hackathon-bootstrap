#!/usr/bin/env node

/**
 * Validate UI Visibility - Check if Kafka/MSK entities appear in the UI
 */

const https = require('https');
const { loadEnv, parseArgs, sleep, saveResults } = require('./lib/common');

// Load environment
const env = loadEnv();

class UIValidator {
  constructor(options = {}) {
    this.config = {
      clusterName: options.clusterName,
      accountId: env.NEW_RELIC_ACCOUNT_ID,
      userKey: env.NEW_RELIC_USER_KEY,
      detailed: options.detailed || false
    };
    
    if (!this.config.userKey) {
      console.error('❌ NEW_RELIC_USER_KEY is required for validation');
      process.exit(1);
    }
    
    this.results = {
      timestamp: new Date().toISOString(),
      checks: []
    };
  }

  async validate() {
    console.log('🔍 Validating Kafka/MSK UI Visibility\n');
    
    if (this.config.clusterName) {
      console.log(`Checking specific cluster: ${this.config.clusterName}\n`);
    }

    // Run validation checks
    await this.checkEventIngestion();
    await this.checkEntitySynthesis();
    await this.checkUIQueries();
    await this.checkMessageQueueData();
    await this.checkCriticalFields();

    // Generate report
    this.generateReport();
  }

  async checkEventIngestion() {
    console.log('📊 Checking Event Ingestion...');
    
    const baseQuery = this.config.clusterName 
      ? `WHERE entityName = '${this.config.clusterName}' OR provider.clusterName = '${this.config.clusterName}'`
      : '';
    
    const queries = [
      {
        name: 'Cluster Events',
        query: `FROM AwsMskClusterSample SELECT count(*), uniques(entityName) ${baseQuery} SINCE 30 minutes ago`
      },
      {
        name: 'Broker Events',
        query: `FROM AwsMskBrokerSample SELECT count(*), uniques(provider.brokerId) ${baseQuery} SINCE 30 minutes ago`
      },
      {
        name: 'Topic Events',
        query: `FROM AwsMskTopicSample SELECT count(*), uniques(provider.topicName) ${baseQuery} SINCE 30 minutes ago`
      }
    ];

    for (const check of queries) {
      const result = await this.runQuery(check.query);
      const count = result?.[0]?.count || 0;
      
      console.log(`  ${count > 0 ? '✅' : '❌'} ${check.name}: ${count} events`);
      
      if (this.config.detailed && result?.[0]) {
        const details = Object.entries(result[0])
          .filter(([key]) => key.startsWith('uniques.'))
          .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`);
        
        if (details.length > 0) {
          console.log(`     ${details.join('\n     ')}`);
        }
      }
      
      this.results.checks.push({
        category: 'Event Ingestion',
        name: check.name,
        success: count > 0,
        count,
        details: result?.[0]
      });
    }
  }

  async checkEntitySynthesis() {
    console.log('\n🏗️  Checking Entity Synthesis...');
    
    const query = `
      FROM entity 
      SELECT count(*), uniques(type), uniques(name)
      WHERE type IN ('AWS_KAFKA_CLUSTER', 'AWS_KAFKA_BROKER', 'AWS_KAFKA_TOPIC')
      ${this.config.clusterName ? `AND name LIKE '%${this.config.clusterName}%'` : ''}
      SINCE 1 hour ago
    `;
    
    const result = await this.runQuery(query);
    const count = result?.[0]?.count || 0;
    const types = result?.[0]?.['uniques.type'] || [];
    
    console.log(`  ${count > 0 ? '✅' : '❌'} Entities found: ${count}`);
    if (types.length > 0) {
      console.log(`     Types: ${types.join(', ')}`);
    }
    
    this.results.checks.push({
      category: 'Entity Synthesis',
      name: 'Entity Creation',
      success: count > 0,
      count,
      types
    });
  }

  async checkUIQueries() {
    console.log('\n📋 Checking UI Query Compatibility...');
    
    const clusterFilter = this.config.clusterName 
      ? `WHERE clusterName = '${this.config.clusterName}'` 
      : 'WHERE clusterName IS NOT NULL';
    
    const queries = [
      {
        name: 'Cluster List Query',
        query: `
          FROM AwsMskClusterSample
          SELECT 
            latest(provider.activeControllerCount.Sum) as 'activeControllers',
            latest(provider.offlinePartitionsCount.Sum) as 'offlinePartitions',
            latest(provider.globalPartitionCount.Sum) as 'partitionCount',
            latest(provider.globalTopicCount.Sum) as 'topicCount'
          FACET clusterName, providerAccountId
          ${clusterFilter}
          AND providerAccountId IS NOT NULL
          SINCE 1 hour ago
          LIMIT 10
        `
      },
      {
        name: 'Broker Details Query',
        query: `
          FROM AwsMskBrokerSample
          SELECT 
            latest(provider.bytesInPerSec.Average) as 'bytesIn',
            latest(provider.bytesOutPerSec.Average) as 'bytesOut',
            latest(provider.messagesInPerSec.Average) as 'messagesIn'
          FACET provider.brokerId, provider.clusterName
          ${this.config.clusterName ? `WHERE provider.clusterName = '${this.config.clusterName}'` : ''}
          ${this.config.clusterName ? 'AND' : 'WHERE'} providerAccountId IS NOT NULL
          SINCE 1 hour ago
          LIMIT 10
        `
      }
    ];

    for (const check of queries) {
      const result = await this.runQuery(check.query);
      const hasData = result && result.length > 0 && 
                      (result[0].count > 0 || result[0].facets?.length > 0);
      
      console.log(`  ${hasData ? '✅' : '❌'} ${check.name}`);
      
      if (hasData && result[0].facets) {
        console.log(`     Found ${result[0].facets.length} items`);
        if (this.config.detailed) {
          result[0].facets.slice(0, 3).forEach(facet => {
            console.log(`     - ${facet.name.join(' / ')}`);
          });
        }
      }
      
      this.results.checks.push({
        category: 'UI Queries',
        name: check.name,
        success: hasData,
        resultCount: result?.[0]?.facets?.length || 0
      });
    }
  }

  async checkMessageQueueData() {
    console.log('\n📨 Checking MessageQueue Integration...');
    
    const query = `
      FROM MessageQueueSample
      SELECT count(*), uniques(queue.name), uniques(provider)
      WHERE provider = 'AwsMsk'
      ${this.config.clusterName ? `AND queue.name LIKE '%${this.config.clusterName}%'` : ''}
      SINCE 1 hour ago
    `;
    
    const result = await this.runQuery(query);
    const count = result?.[0]?.count || 0;
    
    console.log(`  ${count > 0 ? '✅' : '❌'} MessageQueue events: ${count}`);
    
    this.results.checks.push({
      category: 'MessageQueue',
      name: 'MessageQueue Integration',
      success: count > 0,
      count
    });
  }

  async checkCriticalFields() {
    console.log('\n🔑 Checking Critical Field Presence...');
    
    const query = `
      FROM AwsMskBrokerSample
      SELECT 
        count(*) as 'total',
        percentage(count(*), WHERE provider IN ('AwsMskBroker', 'AwsMskCluster', 'AwsMskTopic')) as 'correctProvider',
        percentage(count(*), WHERE providerAccountId IS NOT NULL) as 'hasProviderAccountId',
        percentage(count(*), WHERE providerExternalId IS NOT NULL) as 'hasProviderExternalId',
        percentage(count(*), WHERE collector.name = 'cloud-integrations') as 'correctCollector'
      ${this.config.clusterName ? `WHERE provider.clusterName = '${this.config.clusterName}'` : ''}
      SINCE 1 hour ago
    `;
    
    const result = await this.runQuery(query);
    
    if (result?.[0]) {
      const r = result[0];
      const checks = [
        { field: 'Provider values', value: r.correctProvider, threshold: 90 },
        { field: 'providerAccountId', value: r.hasProviderAccountId, threshold: 90 },
        { field: 'providerExternalId', value: r.hasProviderExternalId, threshold: 90 },
        { field: 'collector.name', value: r.correctCollector, threshold: 90 }
      ];
      
      checks.forEach(check => {
        const value = check.value || 0;
        const passed = value >= check.threshold;
        console.log(`  ${passed ? '✅' : '❌'} ${check.field}: ${value.toFixed(1)}%`);
      });
      
      this.results.checks.push({
        category: 'Critical Fields',
        name: 'Field Validation',
        success: checks.every(c => (c.value || 0) >= c.threshold),
        details: result[0]
      });
    }
  }

  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 VALIDATION REPORT');
    console.log('='.repeat(60) + '\n');

    // Calculate success rate
    const totalChecks = this.results.checks.length;
    const successfulChecks = this.results.checks.filter(c => c.success).length;
    const successRate = (successfulChecks / totalChecks * 100).toFixed(1);

    console.log(`Success Rate: ${successfulChecks}/${totalChecks} (${successRate}%)`);
    
    // Check overall UI visibility
    const hasEvents = this.results.checks
      .filter(c => c.category === 'Event Ingestion')
      .some(c => c.success);
    
    const hasUIQueries = this.results.checks
      .filter(c => c.category === 'UI Queries')
      .some(c => c.success);
    
    const uiVisible = hasEvents && hasUIQueries;
    
    console.log(`\n🎯 UI Visibility Status: ${uiVisible ? '✅ VISIBLE' : '❌ NOT VISIBLE'}`);
    
    if (uiVisible) {
      console.log('\n✨ Your Kafka/MSK cluster should be visible in:');
      console.log('   https://one.newrelic.com/nr1-core/apm-services/message-queues');
    } else {
      console.log('\n💡 Troubleshooting:');
      
      if (!hasEvents) {
        console.log('- No events found - check if events were sent recently');
        console.log('- Run: node src/send-events.js');
      }
      
      if (hasEvents && !hasUIQueries) {
        console.log('- Events exist but UI queries failing');
        console.log('- Wait 2-5 more minutes for entity synthesis');
        console.log('- Check critical fields are present');
      }
      
      console.log('\nRun with --detailed for more information');
    }
    
    // Save detailed report
    this.results.summary = {
      successRate,
      uiVisible,
      totalChecks,
      successfulChecks
    };
    
    const filename = saveResults(this.results, 'ui-validation');
    console.log(`\n📁 Detailed report saved to: ${filename}`);
  }

  async runQuery(nrql) {
    return new Promise((resolve, reject) => {
      const query = {
        query: `{ actor { account(id: ${this.config.accountId}) { nrql(query: "${nrql.replace(/"/g, '\\"').replace(/\n/g, ' ')}") { results } } } }`
      };

      const options = {
        hostname: 'api.newrelic.com',
        path: '/graphql',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'API-Key': this.config.userKey
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
              console.error('Query error:', response.errors?.[0]?.message || 'Unknown error');
              resolve(null);
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

// Command line interface
async function main() {
  const args = parseArgs(process.argv.slice(2), {
    'cluster-name': { type: 'string', description: 'Specific cluster to validate' },
    'detailed': { type: 'boolean', description: 'Show detailed results', default: false },
    'help': { type: 'boolean', description: 'Show help', default: false }
  });

  if (args.help) {
    console.log(`
Usage: node src/validate-ui.js [options]

Options:
  --cluster-name <name>    Validate specific cluster
  --detailed              Show detailed validation results
  --help                  Show this help message

Environment Variables:
  NEW_RELIC_USER_KEY      Your user key for queries (required)
  NEW_RELIC_ACCOUNT_ID    Your account ID (required)
`);
    process.exit(0);
  }

  const validator = new UIValidator({
    clusterName: args['cluster-name'],
    detailed: args.detailed
  });

  await validator.validate();
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
}

module.exports = UIValidator;