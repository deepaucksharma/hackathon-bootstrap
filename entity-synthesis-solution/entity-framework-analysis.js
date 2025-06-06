#!/usr/bin/env node

/**
 * Entity Framework Analysis Tool
 * 
 * This tool analyzes how the New Relic Entity Framework processes metrics
 * and synthesizes entities. It helps us understand:
 * 1. What fields trigger entity synthesis
 * 2. How metrics are transformed into entities
 * 3. What the final NRDB structure looks like
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Load environment variables
if (fs.existsSync('.env')) {
  require('dotenv').config();
}

const API_KEY = process.env.UKEY;
const ACCOUNT_ID = process.env.ACC;

class EntityFrameworkAnalyzer {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      findings: {},
      recommendations: []
    };
  }

  async analyze() {
    console.log('🔍 Entity Framework Analysis\n');

    // Step 1: Analyze current data structure
    await this.analyzeCurrentDataStructure();

    // Step 2: Analyze entity synthesis patterns
    await this.analyzeEntitySynthesisPatterns();

    // Step 3: Compare with CloudWatch Metric Streams
    await this.analyzeCloudWatchFormat();

    // Step 4: Test different collector configurations
    await this.testCollectorConfigurations();

    // Step 5: Generate recommendations
    this.generateRecommendations();

    // Save results
    this.saveResults();
  }

  async analyzeCurrentDataStructure() {
    console.log('📊 Analyzing Current Data Structure...\n');

    const queries = [
      {
        name: 'Event Sample Structure',
        query: `FROM AwsMskBrokerSample SELECT keyset() SINCE 1 hour ago LIMIT 1`
      },
      {
        name: 'Metric Event Structure',
        query: `FROM Metric SELECT keyset() WHERE metricName LIKE 'kafka.%' SINCE 1 hour ago LIMIT 1`
      },
      {
        name: 'Entity Attributes',
        query: `FROM AwsMskBrokerSample SELECT 
          latest(provider) as provider,
          latest(entity.guid) as entityGuid,
          latest(entity.type) as entityType,
          latest(entityGuid) as altEntityGuid,
          latest(entityName) as entityName,
          latest(instrumentation.provider) as instrumentationProvider,
          latest(collector.name) as collectorName,
          latest(reportingAgent) as reportingAgent
        SINCE 1 hour ago`
      },
      {
        name: 'Provider Field Analysis',
        query: `FROM AwsMskBrokerSample SELECT uniques(provider) SINCE 1 day ago`
      }
    ];

    for (const {name, query} of queries) {
      console.log(`Running: ${name}`);
      const result = await this.runQuery(query);
      this.results.findings[name] = result;
      console.log(`Result:`, JSON.stringify(result, null, 2), '\n');
    }
  }

  async analyzeEntitySynthesisPatterns() {
    console.log('\n🧩 Analyzing Entity Synthesis Patterns...\n');

    // Test what happens with different field combinations
    const patterns = [
      {
        name: 'Entity Type Patterns',
        analysis: `
          Known entity types that work:
          - AWSKAFKACLUSTER (no underscores)
          - AWS_KAFKA_CLUSTER (with underscores)
          
          The entity framework may normalize these differently.
        `
      },
      {
        name: 'Provider Field Patterns',
        analysis: `
          Provider field controls UI routing:
          - "AwsMsk" → Routes to AWS MSK UI
          - "AwsMskCluster/Broker/Topic" → May be auto-generated from event type
          
          The SDK might override manually set values.
        `
      },
      {
        name: 'Collector Name Impact',
        analysis: `
          Different collectors may have different synthesis rules:
          - "infrastructure-agent" → Standard processing
          - "cloudwatch-metric-streams" → AWS-specific processing
          - "nri-kafka" → Custom integration processing
        `
      }
    ];

    this.results.findings['Entity Synthesis Patterns'] = patterns;
  }

  async analyzeCloudWatchFormat() {
    console.log('\n☁️ Analyzing CloudWatch Metric Streams Format...\n');

    // CloudWatch Metric Streams sends data in a specific format
    const cloudWatchFormat = {
      eventType: 'Metric',
      metricName: 'aws.kafka.BytesInPerSec',
      dimensions: {
        'aws.AccountId': '123456789012',
        'aws.Region': 'us-east-1',
        'aws.kafka.ClusterName': 'my-cluster',
        'aws.kafka.BrokerId': '1'
      },
      attributes: {
        'collector.name': 'cloudwatch-metric-streams',
        'instrumentation.provider': 'aws',
        'aws.MetricStreamName': 'NewRelic-Metric-Stream'
      }
    };

    this.results.findings['CloudWatch Format'] = {
      description: 'CloudWatch Metric Streams format that triggers proper entity synthesis',
      format: cloudWatchFormat,
      keyPoints: [
        'Uses Metric event type, not custom samples',
        'Dimensions use aws.* prefix',
        'collector.name is cloudwatch-metric-streams',
        'No provider field needed - inferred from dimensions'
      ]
    };
  }

  async testCollectorConfigurations() {
    console.log('\n🧪 Testing Collector Configurations...\n');

    const configurations = [
      {
        name: 'Standard Infrastructure Agent',
        config: {
          'collector.name': 'infrastructure-agent',
          'instrumentation.provider': 'nri-kafka',
          'instrumentation.name': 'com.newrelic.kafka'
        }
      },
      {
        name: 'CloudWatch Mimicry',
        config: {
          'collector.name': 'cloudwatch-metric-streams',
          'instrumentation.provider': 'aws',
          'aws.MetricStreamName': 'NewRelic-Metric-Stream'
        }
      },
      {
        name: 'Custom MSK Collector',
        config: {
          'collector.name': 'aws-msk-collector',
          'instrumentation.provider': 'aws',
          'instrumentation.source': 'msk-integration'
        }
      }
    ];

    this.results.findings['Collector Configurations'] = configurations;
  }

  generateRecommendations() {
    console.log('\n💡 Generating Recommendations...\n');

    this.results.recommendations = [
      {
        priority: 'HIGH',
        recommendation: 'Switch to Metric event type instead of custom samples',
        rationale: 'CloudWatch Metric Streams uses Metric events which have proven entity synthesis',
        implementation: `
          // Instead of creating AwsMskBrokerSample
          // Send metrics as dimensional metrics:
          {
            "eventType": "Metric",
            "metricName": "aws.kafka.BytesInPerSec",
            "value": 1234.5,
            "timestamp": 1234567890,
            "dimensions": {
              "aws.AccountId": "123456789012",
              "aws.Region": "us-east-1",
              "aws.kafka.ClusterName": "my-cluster",
              "aws.kafka.BrokerId": "1"
            }
          }
        `
      },
      {
        priority: 'HIGH',
        recommendation: 'Use aws.* prefixed dimensions',
        rationale: 'Entity framework recognizes aws.* dimensions for AWS entity synthesis',
        implementation: 'Convert provider.* fields to aws.* dimensions'
      },
      {
        priority: 'MEDIUM',
        recommendation: 'Set collector.name to cloudwatch-metric-streams',
        rationale: 'This collector name has special entity synthesis rules for AWS services',
        implementation: 'ms.SetMetric("collector.name", "cloudwatch-metric-streams", metric.ATTRIBUTE)'
      },
      {
        priority: 'MEDIUM',
        recommendation: 'Remove explicit provider field',
        rationale: 'Let entity framework infer provider from dimensions and collector',
        implementation: 'Remove attribute.Attribute{Key: "provider", Value: "AwsMsk"}'
      },
      {
        priority: 'LOW',
        recommendation: 'Test with raw integration protocol',
        rationale: 'Bypass SDK limitations by crafting exact JSON output',
        implementation: 'Use integration.Integration.Publish() with raw metric data'
      }
    ];

    this.results.recommendations.forEach(rec => {
      console.log(`[${rec.priority}] ${rec.recommendation}`);
      console.log(`   Rationale: ${rec.rationale}\n`);
    });
  }

  async runQuery(nrql) {
    return new Promise((resolve, reject) => {
      const query = {
        query: `{ actor { account(id: ${ACCOUNT_ID}) { nrql(query: "${nrql.replace(/"/g, '\\"')}") { results } } } }`
      };

      const options = {
        hostname: 'api.newrelic.com',
        path: '/graphql',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'API-Key': API_KEY
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

  saveResults() {
    const filename = `entity-framework-analysis-${Date.now()}.json`;
    fs.writeFileSync(filename, JSON.stringify(this.results, null, 2));
    console.log(`\n📁 Analysis saved to: ${filename}`);
  }
}

// Main execution
if (!API_KEY || !ACCOUNT_ID) {
  console.error('Error: Missing required environment variables (UKEY, ACC)');
  console.error('Please ensure your .env file is configured properly.');
  process.exit(1);
}

const analyzer = new EntityFrameworkAnalyzer();
analyzer.analyze().catch(console.error);