#!/usr/bin/env node

/**
 * Analyze Accounts - Compare MSK implementations across accounts
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { loadEnv, parseArgs, saveResults } = require('./lib/common');

// Load environment
const env = loadEnv();

class AccountAnalyzer {
  constructor(options = {}) {
    this.config = {
      accounts: options.accounts || ['1', '3001033', '3026020'],
      userKey: env.NEW_RELIC_USER_KEY,
      saveSamples: options.saveSamples || false
    };
    
    if (!this.config.userKey) {
      console.error('❌ NEW_RELIC_USER_KEY is required for analysis');
      process.exit(1);
    }
    
    this.results = {};
  }

  async analyze() {
    console.log('🔍 Analyzing MSK Implementations Across Accounts\n');
    console.log(`Accounts: ${this.config.accounts.join(', ')}\n`);

    for (const accountId of this.config.accounts) {
      console.log(`\n📊 Analyzing Account ${accountId}`);
      console.log('='.repeat(50));
      
      this.results[accountId] = {
        accountId,
        eventTypes: {},
        fields: {},
        summary: {}
      };

      await this.analyzeAccount(accountId);
    }

    // Generate comparison
    this.generateComparison();
  }

  async analyzeAccount(accountId) {
    // Check for MSK event types
    await this.checkEventTypes(accountId);
    
    // Get sample events
    await this.getSampleEvents(accountId);
    
    // Analyze field patterns
    await this.analyzeFields(accountId);
    
    // Check collector patterns
    await this.checkCollectorPatterns(accountId);
  }

  async checkEventTypes(accountId) {
    console.log('\n📋 Event Types:');
    
    const query = `
      FROM AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample
      SELECT count(*)
      FACET eventType
      SINCE 1 day ago
      LIMIT 10
    `;
    
    const results = await this.runQuery(query, accountId);
    
    if (results?.[0]?.facets) {
      results[0].facets.forEach(facet => {
        const eventType = facet.name[0];
        const count = facet.results[0].count;
        console.log(`  ${eventType}: ${count} events`);
        
        this.results[accountId].eventTypes[eventType] = count;
      });
    } else {
      console.log('  No MSK events found');
    }
  }

  async getSampleEvents(accountId) {
    console.log('\n📝 Sample Events:');
    
    const eventTypes = ['AwsMskClusterSample', 'AwsMskBrokerSample', 'AwsMskTopicSample'];
    
    for (const eventType of eventTypes) {
      const query = `FROM ${eventType} SELECT * SINCE 1 day ago LIMIT 1`;
      const results = await this.runQuery(query, accountId);
      
      if (results?.[0]) {
        console.log(`  ${eventType}: ✅ Found`);
        
        // Extract fields
        const fields = Object.keys(results[0]);
        this.results[accountId].fields[eventType] = fields;
        
        // Save sample if requested
        if (this.config.saveSamples) {
          const sampleDir = path.join(__dirname, '..', 'reference', 'account-samples', accountId);
          if (!fs.existsSync(sampleDir)) {
            fs.mkdirSync(sampleDir, { recursive: true });
          }
          
          const filename = path.join(sampleDir, `${eventType}.json`);
          fs.writeFileSync(filename, JSON.stringify(results[0], null, 2));
        }
        
        // Extract key values
        const sample = results[0];
        if (eventType === 'AwsMskBrokerSample') {
          console.log(`    - provider: ${sample.provider}`);
          console.log(`    - collector.name: ${sample['collector.name']}`);
          console.log(`    - instrumentation.provider: ${sample['instrumentation.provider']}`);
        }
      } else {
        console.log(`  ${eventType}: ❌ Not found`);
      }
    }
  }

  async analyzeFields(accountId) {
    console.log('\n🔑 Field Analysis:');
    
    // Check critical fields in broker samples
    const query = `
      FROM AwsMskBrokerSample
      SELECT 
        uniques(provider) as 'providers',
        uniques(collector.name) as 'collectors',
        uniques(instrumentation.provider) as 'instrumentations'
      SINCE 1 day ago
    `;
    
    const results = await this.runQuery(query, accountId);
    
    if (results?.[0]) {
      const r = results[0];
      console.log(`  Providers: ${r.providers?.join(', ') || 'none'}`);
      console.log(`  Collectors: ${r.collectors?.join(', ') || 'none'}`);
      console.log(`  Instrumentations: ${r.instrumentations?.join(', ') || 'none'}`);
      
      this.results[accountId].summary = {
        providers: r.providers || [],
        collectors: r.collectors || [],
        instrumentations: r.instrumentations || []
      };
    }
  }

  async checkCollectorPatterns(accountId) {
    console.log('\n📊 Metric Patterns:');
    
    const query = `
      FROM AwsMskBrokerSample
      SELECT keyset()
      WHERE provider.bytesInPerSec.Average IS NOT NULL
      SINCE 1 day ago
      LIMIT 1
    `;
    
    const results = await this.runQuery(query, accountId);
    
    if (results?.[0]) {
      const metricFields = Object.keys(results[0])
        .filter(key => key.startsWith('provider.') && key.includes('.'))
        .map(key => {
          const parts = key.split('.');
          return `${parts[1]}.${parts[parts.length - 1]}`;
        });
      
      const uniqueMetrics = [...new Set(metricFields.map(f => f.split('.')[0]))];
      console.log(`  Metrics with aggregations: ${uniqueMetrics.length}`);
      console.log(`  Sample: ${uniqueMetrics.slice(0, 5).join(', ')}...`);
    }
  }

  generateComparison() {
    console.log('\n\n' + '='.repeat(60));
    console.log('📊 COMPARISON SUMMARY');
    console.log('='.repeat(60) + '\n');

    // Find common patterns
    const allAccounts = Object.keys(this.results);
    
    // Compare collectors
    console.log('Collector Patterns:');
    allAccounts.forEach(accountId => {
      const collectors = this.results[accountId].summary.collectors || [];
      console.log(`  Account ${accountId}: ${collectors.join(', ') || 'none'}`);
    });
    
    // Compare providers
    console.log('\nProvider Values:');
    allAccounts.forEach(accountId => {
      const providers = this.results[accountId].summary.providers || [];
      console.log(`  Account ${accountId}: ${providers.join(', ') || 'none'}`);
    });
    
    // Identify working pattern
    const workingAccounts = allAccounts.filter(accountId => {
      const summary = this.results[accountId].summary;
      return summary.collectors?.includes('cloud-integrations') &&
             summary.providers?.some(p => p.startsWith('AwsMsk'));
    });
    
    console.log('\n✅ Working Pattern Found:');
    if (workingAccounts.length > 0) {
      console.log('  - Use collector.name = "cloud-integrations"');
      console.log('  - Use provider = "AwsMskCluster/Broker/Topic"');
      console.log('  - Use Event API (not Metric API)');
      console.log(`  - Found in accounts: ${workingAccounts.join(', ')}`);
    } else {
      console.log('  No working MSK implementations found');
    }
    
    // Save comparison
    const comparison = {
      timestamp: new Date().toISOString(),
      accounts: this.results,
      patterns: {
        working: workingAccounts,
        collectors: this.extractPattern('collectors'),
        providers: this.extractPattern('providers')
      }
    };
    
    const filename = saveResults(comparison, 'account-comparison');
    console.log(`\n📁 Comparison saved to: ${filename}`);
  }

  extractPattern(field) {
    const pattern = {};
    Object.entries(this.results).forEach(([accountId, data]) => {
      const values = data.summary[field] || [];
      values.forEach(value => {
        if (!pattern[value]) pattern[value] = [];
        pattern[value].push(accountId);
      });
    });
    return pattern;
  }

  async runQuery(nrql, accountId) {
    return new Promise((resolve, reject) => {
      const query = {
        query: `{ actor { account(id: ${accountId}) { nrql(query: "${nrql.replace(/"/g, '\\"').replace(/\n/g, ' ')}") { results } } } }`
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
              console.error(`  Query error for account ${accountId}: ${response.errors?.[0]?.message || 'Unknown'}`);
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
    'accounts': { type: 'string', description: 'Comma-separated account IDs' },
    'save-samples': { type: 'boolean', description: 'Save sample events', default: false },
    'help': { type: 'boolean', description: 'Show help', default: false }
  });

  if (args.help) {
    console.log(`
Usage: node src/analyze-accounts.js [options]

Options:
  --accounts <ids>        Comma-separated account IDs to analyze
  --save-samples         Save sample events to reference directory
  --help                 Show this help message

Environment Variables:
  NEW_RELIC_USER_KEY     Your user key for queries (required)

Example:
  node src/analyze-accounts.js --accounts 1,3001033,3026020 --save-samples
`);
    process.exit(0);
  }

  const analyzer = new AccountAnalyzer({
    accounts: args.accounts ? args.accounts.split(',') : undefined,
    saveSamples: args['save-samples']
  });

  await analyzer.analyze();
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
}

module.exports = AccountAnalyzer;