#!/usr/bin/env node

/**
 * Comprehensive Account Comparison and Verification Script
 * 
 * This script performs deep analysis comparing the current account (3630072)
 * with reference accounts (3001033, 1, 3026020) across all critical aspects:
 * - UI Visibility Requirements
 * - Entity Synthesis
 * - Metric Completeness
 * - Data Freshness
 * - AWS Field Validation
 * - Dimensional vs Event Metrics
 */

const https = require('https');
const fs = require('fs').promises;

// Configuration
const CONFIG = {
  accounts: {
    current: '3630072',
    reference: ['3001033', '1', '3026020']
  },
  apiKey: process.env.NEW_RELIC_API_KEY || 'YOUR_API_KEY',
  region: 'US',
  outputDir: './verification-results'
};

// Critical UI visibility fields identified from our analysis
const CRITICAL_UI_FIELDS = [
  'provider',
  'awsAccountId', 
  'awsRegion',
  'providerAccountId',
  'providerExternalId',
  'instrumentation.provider',
  'entity.type',
  'entity.name',
  'entity.guid',
  'collector.name'
];

// Required entity types for MSK
const REQUIRED_ENTITY_TYPES = [
  'AWS_KAFKA_CLUSTER',
  'AWS_KAFKA_BROKER', 
  'AWS_KAFKA_TOPIC'
];

// Core MSK metrics
const CORE_MSK_METRICS = {
  cluster: [
    'provider.bytesInPerSec.Sum',
    'provider.bytesOutPerSec.Sum',
    'provider.messagesInPerSec.Sum',
    'provider.activeControllerCount.Sum',
    'provider.offlinePartitionsCount.Sum',
    'provider.underReplicatedPartitions.Sum'
  ],
  broker: [
    'provider.bytesInPerSec.Average',
    'provider.bytesOutPerSec.Average',
    'provider.messagesInPerSec.Average',
    'provider.cpuIdle',
    'provider.memoryUsed',
    'provider.underReplicatedPartitions'
  ],
  topic: [
    'provider.bytesInPerSec.Average',
    'provider.bytesOutPerSec.Average',
    'provider.messagesInPerSec.Average'
  ]
};

// Dimensional metrics patterns
const DIMENSIONAL_METRICS = [
  'kafka.broker.BytesInPerSec',
  'kafka.broker.BytesOutPerSec',
  'kafka.broker.MessagesInPerSec',
  'kafka.cluster.BytesInPerSec',
  'kafka.cluster.BytesOutPerSec',
  'kafka.cluster.ActiveControllerCount',
  'kafka.topic.BytesInPerSec',
  'kafka.topic.BytesOutPerSec'
];

class ComprehensiveVerifier {
  constructor(config) {
    this.config = config;
    this.results = {
      timestamp: new Date().toISOString(),
      accounts: {},
      comparisons: {},
      recommendations: []
    };
  }

  async runNRQL(accountId, query) {
    const gqlQuery = `
      query($accountId: Int!, $nrqlQuery: Nrql!) {
        actor {
          account(id: $accountId) {
            nrql(query: $nrqlQuery, timeout: 120) {
              results
              metadata {
                facets
                eventTypes
                messages
                timeWindow {
                  begin
                  compareWith
                  end
                  since
                  until
                }
              }
            }
          }
        }
      }
    `;

    const options = {
      hostname: 'api.newrelic.com',
      path: '/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-Key': this.config.apiKey
      }
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            if (result.errors) {
              console.error(`NRQL Error for account ${accountId}:`, result.errors);
              resolve(null);
            } else {
              resolve(result.data?.actor?.account?.nrql);
            }
          } catch (error) {
            console.error(`Parse error for account ${accountId}:`, error);
            resolve(null);
          }
        });
      });

      req.on('error', reject);
      req.write(JSON.stringify({
        query: gqlQuery,
        variables: { accountId: parseInt(accountId), nrqlQuery: query }
      }));
      req.end();
    });
  }

  async verifyAccount(accountId) {
    console.log(`\n🔍 Verifying account ${accountId}...`);
    
    const accountResults = {
      id: accountId,
      timestamp: new Date().toISOString(),
      checks: {}
    };

    // 1. Check UI visibility fields
    accountResults.checks.uiVisibility = await this.checkUIVisibility(accountId);
    
    // 2. Check entity synthesis
    accountResults.checks.entitySynthesis = await this.checkEntitySynthesis(accountId);
    
    // 3. Check event samples
    accountResults.checks.eventSamples = await this.checkEventSamples(accountId);
    
    // 4. Check dimensional metrics
    accountResults.checks.dimensionalMetrics = await this.checkDimensionalMetrics(accountId);
    
    // 5. Check metric completeness
    accountResults.checks.metricCompleteness = await this.checkMetricCompleteness(accountId);
    
    // 6. Check data freshness
    accountResults.checks.dataFreshness = await this.checkDataFreshness(accountId);
    
    // 7. Check AWS integration
    accountResults.checks.awsIntegration = await this.checkAWSIntegration(accountId);
    
    // 8. Check message queue visibility
    accountResults.checks.messageQueueUI = await this.checkMessageQueueUI(accountId);

    this.results.accounts[accountId] = accountResults;
    return accountResults;
  }

  async checkUIVisibility(accountId) {
    console.log(`  📋 Checking UI visibility fields...`);
    
    const query = `
      FROM AwsMskBrokerSample, AwsMskClusterSample, AwsMskTopicSample 
      SELECT 
        latest(provider) as provider,
        latest(awsAccountId) as awsAccountId,
        latest(awsRegion) as awsRegion,
        latest(providerAccountId) as providerAccountId,
        latest(providerExternalId) as providerExternalId,
        latest(\`instrumentation.provider\`) as instrumentationProvider,
        latest(\`entity.type\`) as entityType,
        latest(\`entity.name\`) as entityName,
        latest(\`entity.guid\`) as entityGuid,
        latest(\`collector.name\`) as collectorName,
        latest(clusterName) as clusterName
      FACET eventType()
      SINCE 1 hour ago
      LIMIT MAX
    `;

    const result = await this.runNRQL(accountId, query);
    const analysis = {
      hasData: false,
      eventTypes: [],
      missingFields: {},
      presentFields: {},
      issues: []
    };

    if (result?.results) {
      analysis.hasData = result.results.length > 0;
      
      for (const item of result.results) {
        const eventType = item.facet[0];
        analysis.eventTypes.push(eventType);
        
        analysis.missingFields[eventType] = [];
        analysis.presentFields[eventType] = [];
        
        for (const field of CRITICAL_UI_FIELDS) {
          const fieldKey = field.replace(/\./g, '_').replace('instrumentation_provider', 'instrumentationProvider');
          const value = item[fieldKey];
          
          if (!value || value === 'NULL' || value === '') {
            analysis.missingFields[eventType].push(field);
            analysis.issues.push(`${eventType} missing critical field: ${field}`);
          } else {
            analysis.presentFields[eventType].push({ field, value });
          }
        }
        
        // Special checks
        if (item.awsAccountId && item.awsAccountId.length !== 12) {
          analysis.issues.push(`Invalid AWS account ID format: ${item.awsAccountId} (should be 12 digits)`);
        }
        
        if (!item.providerExternalId) {
          analysis.issues.push(`Missing providerExternalId - CRITICAL for UI visibility`);
        }
      }
    }

    return analysis;
  }

  async checkEntitySynthesis(accountId) {
    console.log(`  🔗 Checking entity synthesis...`);
    
    const query = `
      FROM NrIntegrationError 
      SELECT count(*) 
      WHERE newRelicFeature = 'Event Pipeline' 
      FACET category, message 
      SINCE 1 hour ago 
      LIMIT MAX
    `;

    const entitiesQuery = `
      {
        actor {
          entitySearch(query: "accountId = ${accountId} AND (type = 'AWSMSKCLUSTER' OR type = 'AWSMSKBROKER' OR type = 'AWSMSKTOPIC')") {
            count
            results {
              entities {
                guid
                name
                type
                accountId
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

    const result = await this.runNRQL(accountId, query);
    
    return {
      hasIntegrationErrors: result?.results?.length > 0,
      errors: result?.results || [],
      entityCheckQuery: entitiesQuery
    };
  }

  async checkEventSamples(accountId) {
    console.log(`  📊 Checking event samples...`);
    
    const queries = {
      mskBroker: `FROM AwsMskBrokerSample SELECT count(*) SINCE 1 hour ago`,
      mskCluster: `FROM AwsMskClusterSample SELECT count(*) SINCE 1 hour ago`,
      mskTopic: `FROM AwsMskTopicSample SELECT count(*) SINCE 1 hour ago`,
      kafkaBroker: `FROM KafkaBrokerSample SELECT count(*) SINCE 1 hour ago`,
      kafkaTopic: `FROM KafkaTopicSample SELECT count(*) SINCE 1 hour ago`,
      kafkaOffset: `FROM KafkaOffsetSample SELECT count(*) SINCE 1 hour ago`
    };

    const results = {};
    for (const [name, query] of Object.entries(queries)) {
      const result = await this.runNRQL(accountId, query);
      results[name] = {
        count: result?.results?.[0]?.count || 0,
        hasData: (result?.results?.[0]?.count || 0) > 0
      };
    }

    return {
      ...results,
      hasMSKData: results.mskBroker.hasData || results.mskCluster.hasData || results.mskTopic.hasData,
      hasKafkaData: results.kafkaBroker.hasData || results.kafkaTopic.hasData || results.kafkaOffset.hasData
    };
  }

  async checkDimensionalMetrics(accountId) {
    console.log(`  📐 Checking dimensional metrics...`);
    
    const query = `
      FROM Metric 
      SELECT count(*) 
      WHERE metricName IN (${DIMENSIONAL_METRICS.map(m => `'${m}'`).join(',')})
      FACET metricName, dimensions()
      SINCE 1 hour ago
      LIMIT MAX
    `;

    const result = await this.runNRQL(accountId, query);
    const analysis = {
      hasData: false,
      metrics: {},
      missingMetrics: [],
      dimensionIssues: []
    };

    if (result?.results) {
      analysis.hasData = result.results.length > 0;
      
      const foundMetrics = new Set();
      for (const item of result.results) {
        const metricName = item.facet[0];
        foundMetrics.add(metricName);
        
        analysis.metrics[metricName] = {
          count: item.count,
          dimensions: item.facet.slice(1)
        };
        
        // Check for required dimensions
        const dims = item.facet.slice(1).join(',');
        if (!dims.includes('cluster.name')) {
          analysis.dimensionIssues.push(`${metricName} missing cluster.name dimension`);
        }
        if (metricName.includes('broker') && !dims.includes('broker.id')) {
          analysis.dimensionIssues.push(`${metricName} missing broker.id dimension`);
        }
      }
      
      // Check for missing metrics
      for (const metric of DIMENSIONAL_METRICS) {
        if (!foundMetrics.has(metric)) {
          analysis.missingMetrics.push(metric);
        }
      }
    }

    return analysis;
  }

  async checkMetricCompleteness(accountId) {
    console.log(`  ✅ Checking metric completeness...`);
    
    const brokerMetricsQuery = `
      FROM AwsMskBrokerSample 
      SELECT 
        ${CORE_MSK_METRICS.broker.map(m => `average(\`${m}\`) as \`${m}\``).join(', ')}
      WHERE \`provider.brokerId\` IS NOT NULL
      SINCE 1 hour ago
    `;

    const clusterMetricsQuery = `
      FROM AwsMskClusterSample 
      SELECT 
        ${CORE_MSK_METRICS.cluster.map(m => `average(\`${m}\`) as \`${m}\``).join(', ')}
      SINCE 1 hour ago
    `;

    const [brokerResult, clusterResult] = await Promise.all([
      this.runNRQL(accountId, brokerMetricsQuery),
      this.runNRQL(accountId, clusterMetricsQuery)
    ]);

    const analysis = {
      broker: { present: [], missing: [], nullValues: [] },
      cluster: { present: [], missing: [], nullValues: [] }
    };

    // Analyze broker metrics
    if (brokerResult?.results?.[0]) {
      for (const metric of CORE_MSK_METRICS.broker) {
        const value = brokerResult.results[0][metric];
        if (value === null || value === undefined) {
          analysis.broker.missing.push(metric);
        } else if (value === 'NULL') {
          analysis.broker.nullValues.push(metric);
        } else {
          analysis.broker.present.push({ metric, value });
        }
      }
    }

    // Analyze cluster metrics
    if (clusterResult?.results?.[0]) {
      for (const metric of CORE_MSK_METRICS.cluster) {
        const value = clusterResult.results[0][metric];
        if (value === null || value === undefined) {
          analysis.cluster.missing.push(metric);
        } else if (value === 'NULL') {
          analysis.cluster.nullValues.push(metric);
        } else {
          analysis.cluster.present.push({ metric, value });
        }
      }
    }

    analysis.completenessScore = {
      broker: (analysis.broker.present.length / CORE_MSK_METRICS.broker.length) * 100,
      cluster: (analysis.cluster.present.length / CORE_MSK_METRICS.cluster.length) * 100
    };

    return analysis;
  }

  async checkDataFreshness(accountId) {
    console.log(`  🕒 Checking data freshness...`);
    
    const query = `
      FROM AwsMskBrokerSample, AwsMskClusterSample, AwsMskTopicSample 
      SELECT 
        latest(timestamp) as lastSeen,
        count(*) as sampleCount,
        uniqueCount(entityName) as entityCount
      FACET eventType()
      SINCE 5 minutes ago
    `;

    const result = await this.runNRQL(accountId, query);
    const analysis = {
      eventTypes: {},
      issues: []
    };

    const now = Date.now();
    
    if (result?.results) {
      for (const item of result.results) {
        const eventType = item.facet[0];
        const lastSeen = item.lastSeen;
        const ageMs = now - lastSeen;
        const ageMinutes = ageMs / (1000 * 60);
        
        analysis.eventTypes[eventType] = {
          lastSeen: new Date(lastSeen).toISOString(),
          ageMinutes: ageMinutes.toFixed(2),
          sampleCount: item.sampleCount,
          entityCount: item.entityCount,
          isFresh: ageMinutes < 2
        };
        
        if (ageMinutes > 2) {
          analysis.issues.push(`${eventType} data is ${ageMinutes.toFixed(2)} minutes old`);
        }
      }
    }

    return analysis;
  }

  async checkAWSIntegration(accountId) {
    console.log(`  ☁️  Checking AWS integration fields...`);
    
    const query = `
      FROM AwsMskBrokerSample, AwsMskClusterSample 
      SELECT 
        latest(\`provider.clusterArn\`) as clusterArn,
        latest(\`provider.accountId\`) as providerAccountId,
        latest(awsAccountId) as awsAccountId,
        latest(\`provider.region\`) as providerRegion,
        latest(awsRegion) as awsRegion,
        uniqueCount(\`provider.brokerId\`) as brokerCount
      SINCE 1 hour ago
    `;

    const result = await this.runNRQL(accountId, query);
    const analysis = {
      hasAWSData: false,
      arnFormat: null,
      accountIdConsistency: null,
      regionConsistency: null,
      issues: []
    };

    if (result?.results?.[0]) {
      const data = result.results[0];
      analysis.hasAWSData = true;
      
      // Check ARN format
      if (data.clusterArn) {
        const arnPattern = /^arn:aws:kafka:[a-z0-9-]+:\d{12}:cluster\/[^\/]+\/[a-f0-9-]+$/;
        analysis.arnFormat = arnPattern.test(data.clusterArn) ? 'valid' : 'invalid';
        if (analysis.arnFormat === 'invalid') {
          analysis.issues.push(`Invalid ARN format: ${data.clusterArn}`);
        }
      }
      
      // Check account ID consistency
      if (data.providerAccountId && data.awsAccountId) {
        analysis.accountIdConsistency = data.providerAccountId === data.awsAccountId;
        if (!analysis.accountIdConsistency) {
          analysis.issues.push(`Account ID mismatch: provider=${data.providerAccountId}, aws=${data.awsAccountId}`);
        }
      }
      
      // Check region consistency
      if (data.providerRegion && data.awsRegion) {
        analysis.regionConsistency = data.providerRegion === data.awsRegion;
        if (!analysis.regionConsistency) {
          analysis.issues.push(`Region mismatch: provider=${data.providerRegion}, aws=${data.awsRegion}`);
        }
      }
      
      analysis.brokerCount = data.brokerCount || 0;
    }

    return analysis;
  }

  async checkMessageQueueUI(accountId) {
    console.log(`  🖥️  Checking Message Queue UI visibility...`);
    
    // This query checks if data appears in the Message Queues UI
    const query = `
      FROM MessageQueueSample 
      SELECT count(*) 
      WHERE \`entity.type\` IN ('AWS_KAFKA_CLUSTER', 'AWS_KAFKA_BROKER', 'AWS_KAFKA_TOPIC')
      FACET \`entity.type\`, \`entity.name\`
      SINCE 1 hour ago
      LIMIT MAX
    `;

    const result = await this.runNRQL(accountId, query);
    
    return {
      hasMessageQueueData: result?.results?.length > 0,
      entities: result?.results || [],
      note: "If empty, data may not be appearing in Message Queues UI"
    };
  }

  compareAccounts() {
    console.log('\n\n📊 ACCOUNT COMPARISON ANALYSIS');
    console.log('=' * 80);
    
    const current = this.results.accounts[this.config.accounts.current];
    const references = this.config.accounts.reference.map(id => this.results.accounts[id]);
    
    // Compare each aspect
    this.compareUIVisibility(current, references);
    this.compareEntitySynthesis(current, references);
    this.compareMetricCompleteness(current, references);
    this.compareDataFreshness(current, references);
    this.identifyGaps(current, references);
    this.generateRecommendations(current, references);
  }

  compareUIVisibility(current, references) {
    console.log('\n🔍 UI VISIBILITY COMPARISON');
    console.log('-' * 40);
    
    const currentIssues = current.checks.uiVisibility.issues || [];
    
    console.log(`Current Account (${current.id}):`);
    console.log(`  - Issues: ${currentIssues.length}`);
    console.log(`  - Missing providerExternalId: ${currentIssues.some(i => i.includes('providerExternalId'))}`);
    
    references.forEach(ref => {
      const refIssues = ref.checks.uiVisibility.issues || [];
      console.log(`\nReference Account (${ref.id}):`);
      console.log(`  - Issues: ${refIssues.length}`);
      console.log(`  - Has providerExternalId: ${!refIssues.some(i => i.includes('providerExternalId'))}`);
    });
    
    // Identify unique issues in current account
    const uniqueIssues = currentIssues.filter(issue => {
      return !references.some(ref => 
        (ref.checks.uiVisibility.issues || []).includes(issue)
      );
    });
    
    if (uniqueIssues.length > 0) {
      console.log('\n⚠️  Unique issues in current account:');
      uniqueIssues.forEach(issue => console.log(`  - ${issue}`));
    }
  }

  compareEntitySynthesis(current, references) {
    console.log('\n\n🔗 ENTITY SYNTHESIS COMPARISON');
    console.log('-' * 40);
    
    console.log(`Current Account (${current.id}):`);
    console.log(`  - Has Integration Errors: ${current.checks.entitySynthesis.hasIntegrationErrors}`);
    console.log(`  - Error Count: ${current.checks.entitySynthesis.errors.length}`);
    
    references.forEach(ref => {
      console.log(`\nReference Account (${ref.id}):`);
      console.log(`  - Has Integration Errors: ${ref.checks.entitySynthesis.hasIntegrationErrors}`);
      console.log(`  - Error Count: ${ref.checks.entitySynthesis.errors.length}`);
    });
  }

  compareMetricCompleteness(current, references) {
    console.log('\n\n✅ METRIC COMPLETENESS COMPARISON');
    console.log('-' * 40);
    
    const currentScore = current.checks.metricCompleteness.completenessScore;
    console.log(`Current Account (${current.id}):`);
    console.log(`  - Broker Completeness: ${currentScore.broker.toFixed(1)}%`);
    console.log(`  - Cluster Completeness: ${currentScore.cluster.toFixed(1)}%`);
    
    references.forEach(ref => {
      const refScore = ref.checks.metricCompleteness.completenessScore;
      console.log(`\nReference Account (${ref.id}):`);
      console.log(`  - Broker Completeness: ${refScore.broker.toFixed(1)}%`);
      console.log(`  - Cluster Completeness: ${refScore.cluster.toFixed(1)}%`);
    });
  }

  compareDataFreshness(current, references) {
    console.log('\n\n🕒 DATA FRESHNESS COMPARISON');
    console.log('-' * 40);
    
    const currentIssues = current.checks.dataFreshness.issues || [];
    console.log(`Current Account (${current.id}):`);
    console.log(`  - Freshness Issues: ${currentIssues.length}`);
    
    references.forEach(ref => {
      const refIssues = ref.checks.dataFreshness.issues || [];
      console.log(`\nReference Account (${ref.id}):`);
      console.log(`  - Freshness Issues: ${refIssues.length}`);
    });
  }

  identifyGaps(current, references) {
    console.log('\n\n🔎 CRITICAL GAPS IDENTIFIED');
    console.log('-' * 40);
    
    const gaps = [];
    
    // Check for AWS field gaps
    if (current.checks.uiVisibility.issues.some(i => i.includes('providerExternalId'))) {
      gaps.push({
        type: 'CRITICAL',
        area: 'UI Visibility',
        issue: 'Missing providerExternalId field',
        impact: 'Data will not appear in Message Queues UI'
      });
    }
    
    if (current.checks.uiVisibility.issues.some(i => i.includes('Invalid AWS account ID'))) {
      gaps.push({
        type: 'CRITICAL',
        area: 'AWS Integration',
        issue: 'Using New Relic account ID instead of AWS account ID',
        impact: 'AWS entity mapping will fail'
      });
    }
    
    // Check for metric gaps
    const brokerCompleteness = current.checks.metricCompleteness.completenessScore.broker;
    const avgRefCompleteness = references.reduce((sum, ref) => 
      sum + ref.checks.metricCompleteness.completenessScore.broker, 0) / references.length;
    
    if (brokerCompleteness < avgRefCompleteness - 10) {
      gaps.push({
        type: 'HIGH',
        area: 'Metric Completeness',
        issue: `Broker metrics ${brokerCompleteness.toFixed(1)}% vs avg ${avgRefCompleteness.toFixed(1)}%`,
        impact: 'Incomplete monitoring data'
      });
    }
    
    // Check for dimensional metrics
    if (current.checks.dimensionalMetrics.missingMetrics.length > 0) {
      gaps.push({
        type: 'MEDIUM',
        area: 'Dimensional Metrics',
        issue: `Missing ${current.checks.dimensionalMetrics.missingMetrics.length} dimensional metrics`,
        impact: 'Limited querying capabilities'
      });
    }
    
    gaps.forEach(gap => {
      console.log(`\n[${gap.type}] ${gap.area}`);
      console.log(`  Issue: ${gap.issue}`);
      console.log(`  Impact: ${gap.impact}`);
    });
    
    this.results.gaps = gaps;
  }

  generateRecommendations(current, references) {
    console.log('\n\n💡 RECOMMENDATIONS');
    console.log('-' * 40);
    
    const recommendations = [];
    
    // Based on gaps, generate specific recommendations
    if (this.results.gaps.some(g => g.issue.includes('providerExternalId'))) {
      recommendations.push({
        priority: 'CRITICAL',
        action: 'Add providerExternalId field to all MSK samples',
        implementation: 'Update MSK shim to include providerExternalId = AWS_ACCOUNT_ID'
      });
    }
    
    if (this.results.gaps.some(g => g.issue.includes('New Relic account ID'))) {
      recommendations.push({
        priority: 'CRITICAL',
        action: 'Use real AWS account ID format',
        implementation: 'Change from NR account ID (3630072) to AWS format (123456789012)'
      });
    }
    
    if (!current.checks.dimensionalMetrics.hasData) {
      recommendations.push({
        priority: 'HIGH',
        action: 'Enable dimensional metrics',
        implementation: 'Set MSK_USE_DIMENSIONAL=true or NRI_KAFKA_USE_DIMENSIONAL=true'
      });
    }
    
    recommendations.forEach((rec, index) => {
      console.log(`\n${index + 1}. [${rec.priority}] ${rec.action}`);
      console.log(`   Implementation: ${rec.implementation}`);
    });
    
    this.results.recommendations = recommendations;
  }

  async generateReport() {
    const reportPath = `${this.config.outputDir}/comprehensive-comparison-${Date.now()}.json`;
    await fs.mkdir(this.config.outputDir, { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(this.results, null, 2));
    
    console.log(`\n\n📄 Full report saved to: ${reportPath}`);
    
    // Generate summary
    const summary = {
      timestamp: this.results.timestamp,
      currentAccount: this.config.accounts.current,
      criticalGaps: this.results.gaps.filter(g => g.type === 'CRITICAL').length,
      totalGaps: this.results.gaps.length,
      recommendations: this.results.recommendations.length,
      nextSteps: this.results.recommendations
        .filter(r => r.priority === 'CRITICAL')
        .map(r => r.action)
    };
    
    console.log('\n\n📋 EXECUTIVE SUMMARY');
    console.log('=' * 80);
    console.log(JSON.stringify(summary, null, 2));
  }

  async run() {
    console.log('🚀 Starting Comprehensive Account Comparison');
    console.log(`   Current Account: ${this.config.accounts.current}`);
    console.log(`   Reference Accounts: ${this.config.accounts.reference.join(', ')}`);
    
    // Verify all accounts
    for (const accountId of [this.config.accounts.current, ...this.config.accounts.reference]) {
      await this.verifyAccount(accountId);
    }
    
    // Run comparisons
    this.compareAccounts();
    
    // Generate report
    await this.generateReport();
    
    console.log('\n\n✅ Verification complete!');
  }
}

// Main execution
async function main() {
  const verifier = new ComprehensiveVerifier(CONFIG);
  await verifier.run();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { ComprehensiveVerifier, CONFIG };