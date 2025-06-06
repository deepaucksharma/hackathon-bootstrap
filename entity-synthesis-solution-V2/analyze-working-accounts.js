#!/usr/bin/env node

/**
 * Analyze Working Accounts - Extract all metrics and entities from working accounts
 * 
 * This script queries the 3 working accounts to extract:
 * 1. All metrics and their attributes
 * 2. All entity types and structures
 * 3. Event types and samples
 * 4. Field patterns and values
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

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

const USER_KEY = process.env.UKEY || process.env.NEW_RELIC_USER_KEY;

if (!USER_KEY) {
  console.error('❌ ERROR: User key not found!');
  console.error('Set UKEY or NEW_RELIC_USER_KEY environment variable');
  process.exit(1);
}

class WorkingAccountAnalyzer {
  constructor() {
    this.accounts = {
      '3001033': 'Account 3001033',
      '1': 'Account 1',
      '3026020': 'Account 3026020'
    };
    this.results = {};
    this.outputDir = 'working-accounts-analysis';
  }

  async analyze() {
    console.log('🔍 Analyzing Working Accounts for Queues and Streams\n');

    // Create output directory
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    // Analyze each account
    for (const [accountId, accountName] of Object.entries(this.accounts)) {
      console.log(`\n📊 Analyzing ${accountName} (${accountId})`);
      console.log('='.repeat(60));
      
      this.results[accountId] = {
        accountName,
        metrics: {},
        entities: {},
        eventTypes: {},
        summary: {}
      };

      await this.analyzeAccount(accountId);
    }

    // Generate comparison report
    await this.generateComparisonReport();
    
    console.log('\n✅ Analysis complete! Check the working-accounts-analysis directory.');
  }

  async analyzeAccount(accountId) {
    // 1. Get MSK/Kafka event types
    console.log('\n📋 Fetching Event Types...');
    await this.getEventTypes(accountId);

    // 2. Get metric details
    console.log('\n📊 Fetching Metrics...');
    await this.getMetrics(accountId);

    // 3. Get entity details
    console.log('\n🏢 Fetching Entities...');
    await this.getEntities(accountId);

    // 4. Get sample events
    console.log('\n📝 Fetching Sample Events...');
    await this.getSampleEvents(accountId);

    // 5. Get MessageQueue data
    console.log('\n📨 Fetching MessageQueue Data...');
    await this.getMessageQueueData(accountId);

    // Save account data
    this.saveAccountData(accountId);
  }

  async getEventTypes(accountId) {
    const queries = [
      {
        name: 'MSK Event Types',
        query: `FROM AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample 
                SELECT uniques(eventType), count(*) 
                FACET eventType 
                SINCE 1 day ago LIMIT 100`
      },
      {
        name: 'Kafka Event Types',
        query: `FROM KafkaBrokerSample, KafkaTopicSample, KafkaOffsetSample 
                SELECT uniques(eventType), count(*) 
                FACET eventType 
                SINCE 1 day ago LIMIT 100`
      },
      {
        name: 'All Event Types with Kafka/MSK',
        query: `FROM Event 
                SELECT count(*) 
                WHERE eventType LIKE '%Kafka%' OR eventType LIKE '%Msk%' 
                FACET eventType 
                SINCE 1 day ago LIMIT 100`
      }
    ];

    for (const queryDef of queries) {
      try {
        const results = await this.runQuery(queryDef.query, accountId);
        this.results[accountId].eventTypes[queryDef.name] = results;
        
        if (results[0]?.facets) {
          console.log(`  ${queryDef.name}: ${results[0].facets.length} types found`);
        }
      } catch (error) {
        console.log(`  ❌ ${queryDef.name}: Failed`);
      }
    }
  }

  async getMetrics(accountId) {
    const queries = [
      {
        name: 'CloudWatch Kafka Metrics',
        query: `FROM Metric 
                SELECT uniques(metricName), uniques(aws.MetricName), count(*) 
                WHERE collector.name = 'cloudwatch-metric-streams' 
                AND aws.Namespace = 'AWS/Kafka' 
                FACET metricName 
                SINCE 1 day ago LIMIT 200`
      },
      {
        name: 'All Kafka Metrics',
        query: `FROM Metric 
                SELECT uniques(metricName), count(*), uniques(collector.name) 
                WHERE metricName LIKE '%kafka%' OR metricName LIKE '%Kafka%' 
                FACET metricName, collector.name 
                SINCE 1 day ago LIMIT 200`
      },
      {
        name: 'Metric Attributes',
        query: `FROM Metric 
                SELECT keyset() 
                WHERE collector.name = 'cloudwatch-metric-streams' 
                AND aws.Namespace = 'AWS/Kafka' 
                SINCE 1 day ago LIMIT 1`
      }
    ];

    for (const queryDef of queries) {
      try {
        const results = await this.runQuery(queryDef.query, accountId);
        this.results[accountId].metrics[queryDef.name] = results;
        
        if (queryDef.name === 'Metric Attributes' && results[0]) {
          console.log(`  Found ${Object.keys(results[0]).length} metric attributes`);
        } else if (results[0]?.facets) {
          console.log(`  ${queryDef.name}: ${results[0].facets.length} metrics found`);
        }
      } catch (error) {
        console.log(`  ❌ ${queryDef.name}: Failed`);
      }
    }
  }

  async getEntities(accountId) {
    const queries = [
      {
        name: 'MSK Entities',
        query: `FROM entity 
                SELECT count(*), uniques(type), uniques(name) 
                WHERE type IN ('AWS_KAFKA_CLUSTER', 'AWS_KAFKA_BROKER', 'AWS_KAFKA_TOPIC') 
                FACET type 
                SINCE 1 day ago`
      },
      {
        name: 'Kafka Entities',
        query: `FROM entity 
                SELECT count(*), uniques(type), uniques(name) 
                WHERE type LIKE '%KAFKA%' 
                FACET type 
                SINCE 1 day ago`
      },
      {
        name: 'Entity Tags',
        query: `FROM entity 
                SELECT keyset() 
                WHERE type = 'AWS_KAFKA_CLUSTER' 
                SINCE 1 day ago LIMIT 1`
      }
    ];

    for (const queryDef of queries) {
      try {
        const results = await this.runQuery(queryDef.query, accountId);
        this.results[accountId].entities[queryDef.name] = results;
        
        if (results[0]?.facets) {
          console.log(`  ${queryDef.name}: ${results[0].facets.length} types found`);
        }
      } catch (error) {
        console.log(`  ❌ ${queryDef.name}: Failed`);
      }
    }
  }

  async getSampleEvents(accountId) {
    const eventTypes = [
      'AwsMskClusterSample',
      'AwsMskBrokerSample',
      'AwsMskTopicSample',
      'KafkaBrokerSample',
      'KafkaTopicSample'
    ];

    for (const eventType of eventTypes) {
      try {
        const query = `FROM ${eventType} SELECT * SINCE 1 hour ago LIMIT 5`;
        const results = await this.runQuery(query, accountId);
        
        if (results && results.length > 0) {
          this.results[accountId].eventTypes[`${eventType}_samples`] = results;
          console.log(`  ${eventType}: ${results.length} samples retrieved`);
          
          // Get all field names from the first sample
          if (results[0]) {
            const fields = Object.keys(results[0]);
            this.results[accountId].eventTypes[`${eventType}_fields`] = fields;
            console.log(`    Fields: ${fields.length} unique fields`);
          }
        }
      } catch (error) {
        // Event type might not exist in this account
      }
    }
  }

  async getMessageQueueData(accountId) {
    const queries = [
      {
        name: 'MessageQueue Sample',
        query: `FROM MessageQueueSample 
                SELECT * 
                WHERE provider LIKE '%Kafka%' OR provider LIKE '%Msk%' 
                SINCE 1 day ago LIMIT 10`
      },
      {
        name: 'MessageQueue Providers',
        query: `FROM MessageQueueSample 
                SELECT count(*), uniques(provider), uniques(queue.name) 
                FACET provider 
                SINCE 1 day ago`
      }
    ];

    for (const queryDef of queries) {
      try {
        const results = await this.runQuery(queryDef.query, accountId);
        this.results[accountId].eventTypes[queryDef.name] = results;
        
        if (results && results.length > 0) {
          console.log(`  ${queryDef.name}: ${results.length} records found`);
        }
      } catch (error) {
        console.log(`  ❌ ${queryDef.name}: Failed`);
      }
    }
  }

  async generateComparisonReport() {
    console.log('\n\n📊 Generating Comparison Report...');
    
    const comparison = {
      timestamp: new Date().toISOString(),
      accounts: this.accounts,
      commonPatterns: {},
      differences: {},
      recommendations: []
    };

    // Find common event types
    const allEventTypes = new Set();
    Object.keys(this.results).forEach(accountId => {
      const mskTypes = this.results[accountId].eventTypes['MSK Event Types'];
      if (mskTypes?.[0]?.facets) {
        mskTypes[0].facets.forEach(f => allEventTypes.add(f.name[0]));
      }
    });
    comparison.commonPatterns.eventTypes = Array.from(allEventTypes);

    // Find common metrics
    const allMetrics = new Set();
    Object.keys(this.results).forEach(accountId => {
      const metrics = this.results[accountId].metrics['CloudWatch Kafka Metrics'];
      if (metrics?.[0]?.facets) {
        metrics[0].facets.forEach(f => allMetrics.add(f.name[0]));
      }
    });
    comparison.commonPatterns.metrics = Array.from(allMetrics);

    // Extract key patterns from sample events
    comparison.criticalFields = this.extractCriticalFields();

    // Save comparison
    const comparisonPath = path.join(this.outputDir, 'comparison-report.json');
    fs.writeFileSync(comparisonPath, JSON.stringify(comparison, null, 2));
    console.log(`✅ Comparison report saved to: ${comparisonPath}`);
  }

  extractCriticalFields() {
    const criticalFields = {
      required: new Set(),
      common: new Set(),
      providers: new Set(),
      entityTypes: new Set()
    };

    Object.keys(this.results).forEach(accountId => {
      // Check AwsMskBrokerSample fields
      const brokerFields = this.results[accountId].eventTypes['AwsMskBrokerSample_fields'];
      if (brokerFields) {
        brokerFields.forEach(field => {
          if (field.includes('provider') || field.includes('entity') || 
              field.includes('aws') || field.includes('account')) {
            criticalFields.common.add(field);
          }
        });
      }

      // Check sample events for provider values
      const brokerSamples = this.results[accountId].eventTypes['AwsMskBrokerSample_samples'];
      if (brokerSamples?.[0]) {
        if (brokerSamples[0].provider) {
          criticalFields.providers.add(brokerSamples[0].provider);
        }
        if (brokerSamples[0]['entity.type']) {
          criticalFields.entityTypes.add(brokerSamples[0]['entity.type']);
        }
      }
    });

    return {
      required: Array.from(criticalFields.required),
      common: Array.from(criticalFields.common),
      providers: Array.from(criticalFields.providers),
      entityTypes: Array.from(criticalFields.entityTypes)
    };
  }

  saveAccountData(accountId) {
    const accountDir = path.join(this.outputDir, `account-${accountId}`);
    if (!fs.existsSync(accountDir)) {
      fs.mkdirSync(accountDir, { recursive: true });
    }

    // Save full data
    const fullDataPath = path.join(accountDir, 'full-data.json');
    fs.writeFileSync(fullDataPath, JSON.stringify(this.results[accountId], null, 2));

    // Save event type samples separately
    Object.entries(this.results[accountId].eventTypes).forEach(([name, data]) => {
      if (name.includes('_samples') && data && data.length > 0) {
        const fileName = `${name.replace(/_samples$/, '')}-samples.json`;
        const filePath = path.join(accountDir, fileName);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      }
    });

    // Save metrics list
    const metrics = this.results[accountId].metrics['CloudWatch Kafka Metrics'];
    if (metrics?.[0]?.facets) {
      const metricsList = metrics[0].facets.map(f => f.name[0]);
      const metricsPath = path.join(accountDir, 'metrics-list.json');
      fs.writeFileSync(metricsPath, JSON.stringify(metricsList, null, 2));
    }

    console.log(`  ✅ Data saved to: ${accountDir}/`);
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
            } else if (response.errors) {
              console.error(`Query error for account ${accountId}:`, response.errors[0].message);
              resolve(null);
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

// Run the analyzer
if (require.main === module) {
  const analyzer = new WorkingAccountAnalyzer();
  analyzer.analyze().catch(console.error);
}

module.exports = WorkingAccountAnalyzer;