#!/usr/bin/env node

/**
 * UI Visibility Validator
 * 
 * Specialized validator that checks all requirements for data to appear
 * in the New Relic Message Queues UI by comparing accounts
 */

const https = require('https');
const fs = require('fs').promises;

// UI Visibility Requirements based on our analysis
const UI_VISIBILITY_REQUIREMENTS = {
  // Required fields for AWS provider mapping
  awsFields: {
    required: [
      'provider',           // Must be 'AwsMsk*' format
      'awsAccountId',      // Must be 12-digit AWS account
      'awsRegion',         // AWS region
      'providerAccountId', // Provider's account ID
      'providerExternalId' // CRITICAL: External ID for account mapping
    ],
    recommended: [
      'instrumentation.provider', // Should be 'aws'
      'collector.name',          // Integration identifier
      'providerAccountName'      // Human-readable account name
    ]
  },
  
  // Entity synthesis requirements
  entityFields: {
    required: [
      'entity.type',  // AWS_KAFKA_CLUSTER, AWS_KAFKA_BROKER, AWS_KAFKA_TOPIC
      'entity.name',  // Unique entity identifier
      'entity.guid'   // New Relic entity GUID
    ],
    recommended: [
      'displayName',
      'entityName',
      'clusterName'
    ]
  },
  
  // Event types that should exist
  eventTypes: {
    msk: [
      'AwsMskClusterSample',
      'AwsMskBrokerSample',
      'AwsMskTopicSample'
    ],
    kafka: [
      'KafkaBrokerSample',
      'KafkaTopicSample', 
      'KafkaOffsetSample'
    ]
  },
  
  // Metric patterns for dimensional metrics
  metricPatterns: {
    broker: /^kafka\.broker\.(BytesInPerSec|BytesOutPerSec|MessagesInPerSec)/,
    cluster: /^kafka\.cluster\.(BytesInPerSec|BytesOutPerSec|ActiveControllerCount)/,
    topic: /^kafka\.topic\.(BytesInPerSec|BytesOutPerSec|MessagesInPerSec)/
  }
};

class UIVisibilityValidator {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.results = {
      timestamp: new Date().toISOString(),
      accounts: {},
      validationSummary: {}
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
                eventTypes
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

    const options = {
      hostname: 'api.newrelic.com',
      path: '/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-Key': this.apiKey
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
              console.error(`NRQL Error:`, result.errors);
              resolve(null);
            } else {
              resolve(result.data?.actor?.account?.nrql);
            }
          } catch (error) {
            console.error(`Parse error:`, error);
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

  async validateAccount(accountId) {
    console.log(`\n🔍 Validating UI Visibility for Account ${accountId}`);
    console.log('=' * 60);
    
    const validation = {
      accountId,
      timestamp: new Date().toISOString(),
      awsFieldValidation: await this.validateAWSFields(accountId),
      entityValidation: await this.validateEntityFields(accountId),
      eventTypeValidation: await this.validateEventTypes(accountId),
      dimensionalMetrics: await this.validateDimensionalMetrics(accountId),
      messageQueueVisibility: await this.checkMessageQueueVisibility(accountId),
      score: 0
    };
    
    // Calculate overall score
    validation.score = this.calculateScore(validation);
    
    this.results.accounts[accountId] = validation;
    return validation;
  }

  async validateAWSFields(accountId) {
    const query = `
      FROM AwsMskBrokerSample, AwsMskClusterSample, AwsMskTopicSample
      SELECT 
        latest(provider) as provider,
        latest(awsAccountId) as awsAccountId,
        latest(awsRegion) as awsRegion,
        latest(providerAccountId) as providerAccountId,
        latest(providerExternalId) as providerExternalId,
        latest(\`instrumentation.provider\`) as instrumentationProvider,
        latest(\`collector.name\`) as collectorName,
        latest(providerAccountName) as providerAccountName,
        count(*) as sampleCount
      FACET eventType()
      SINCE 1 hour ago
    `;

    const result = await this.runNRQL(accountId, query);
    const validation = {
      hasData: false,
      byEventType: {},
      overallStatus: 'FAIL',
      criticalIssues: []
    };

    if (result?.results && result.results.length > 0) {
      validation.hasData = true;
      
      for (const item of result.results) {
        const eventType = item.facet[0];
        const typeValidation = {
          required: {},
          recommended: {},
          issues: []
        };
        
        // Check required fields
        for (const field of UI_VISIBILITY_REQUIREMENTS.awsFields.required) {
          const value = item[field] || item[field.replace(/\./g, '_')];
          typeValidation.required[field] = {
            present: !!value && value !== 'NULL',
            value: value
          };
          
          if (!value || value === 'NULL') {
            typeValidation.issues.push(`Missing required field: ${field}`);
            validation.criticalIssues.push(`${eventType}: Missing ${field}`);
          }
        }
        
        // Check recommended fields
        for (const field of UI_VISIBILITY_REQUIREMENTS.awsFields.recommended) {
          const value = item[field] || item[field.replace(/\./g, '_')];
          typeValidation.recommended[field] = {
            present: !!value && value !== 'NULL',
            value: value
          };
        }
        
        // Special validations
        if (item.awsAccountId && item.awsAccountId.length !== 12) {
          typeValidation.issues.push(`Invalid AWS account ID format: ${item.awsAccountId}`);
          validation.criticalIssues.push(`Invalid AWS account ID: ${item.awsAccountId}`);
        }
        
        if (!item.providerExternalId) {
          validation.criticalIssues.push(`${eventType}: Missing providerExternalId (CRITICAL)`);
        }
        
        typeValidation.sampleCount = item.sampleCount;
        validation.byEventType[eventType] = typeValidation;
      }
      
      // Determine overall status
      if (validation.criticalIssues.length === 0) {
        validation.overallStatus = 'PASS';
      } else if (validation.criticalIssues.some(i => i.includes('providerExternalId'))) {
        validation.overallStatus = 'CRITICAL_FAIL';
      } else {
        validation.overallStatus = 'PARTIAL';
      }
    }

    return validation;
  }

  async validateEntityFields(accountId) {
    const query = `
      FROM AwsMskBrokerSample, AwsMskClusterSample, AwsMskTopicSample
      SELECT 
        latest(\`entity.type\`) as entityType,
        latest(\`entity.name\`) as entityName,
        latest(\`entity.guid\`) as entityGuid,
        latest(displayName) as displayName,
        latest(entityName) as legacyEntityName,
        latest(clusterName) as clusterName
      FACET eventType()
      SINCE 1 hour ago
    `;

    const result = await this.runNRQL(accountId, query);
    const validation = {
      hasData: false,
      byEventType: {},
      entityTypesFound: [],
      issues: []
    };

    if (result?.results && result.results.length > 0) {
      validation.hasData = true;
      
      for (const item of result.results) {
        const eventType = item.facet[0];
        const typeValidation = {
          entityType: item.entityType,
          entityName: item.entityName,
          entityGuid: item.entityGuid,
          hasRequiredFields: !!(item.entityType && item.entityName && item.entityGuid)
        };
        
        if (item.entityType) {
          validation.entityTypesFound.push(item.entityType);
        } else {
          validation.issues.push(`${eventType}: Missing entity.type`);
        }
        
        validation.byEventType[eventType] = typeValidation;
      }
    }

    return validation;
  }

  async validateEventTypes(accountId) {
    const validation = {
      msk: {},
      kafka: {},
      hasRequiredMSKEvents: false
    };

    // Check MSK events
    for (const eventType of UI_VISIBILITY_REQUIREMENTS.eventTypes.msk) {
      const query = `FROM ${eventType} SELECT count(*) SINCE 1 hour ago`;
      const result = await this.runNRQL(accountId, query);
      
      validation.msk[eventType] = {
        exists: result?.results?.[0]?.count > 0,
        count: result?.results?.[0]?.count || 0
      };
    }

    // Check Kafka events
    for (const eventType of UI_VISIBILITY_REQUIREMENTS.eventTypes.kafka) {
      const query = `FROM ${eventType} SELECT count(*) SINCE 1 hour ago`;
      const result = await this.runNRQL(accountId, query);
      
      validation.kafka[eventType] = {
        exists: result?.results?.[0]?.count > 0,
        count: result?.results?.[0]?.count || 0
      };
    }

    // Check if all required MSK events exist
    validation.hasRequiredMSKEvents = Object.values(validation.msk).every(v => v.exists);

    return validation;
  }

  async validateDimensionalMetrics(accountId) {
    const query = `
      FROM Metric
      SELECT count(*)
      WHERE metricName LIKE 'kafka.%'
      FACET metricName, dimensions()
      SINCE 1 hour ago
      LIMIT MAX
    `;

    const result = await this.runNRQL(accountId, query);
    const validation = {
      hasData: false,
      metrics: {
        broker: [],
        cluster: [],
        topic: []
      },
      coverage: {
        broker: 0,
        cluster: 0,
        topic: 0
      }
    };

    if (result?.results && result.results.length > 0) {
      validation.hasData = true;
      
      for (const item of result.results) {
        const metricName = item.facet[0];
        const dimensions = item.facet.slice(1).join(',');
        
        // Categorize metrics
        if (UI_VISIBILITY_REQUIREMENTS.metricPatterns.broker.test(metricName)) {
          validation.metrics.broker.push({ name: metricName, dimensions, count: item.count });
        } else if (UI_VISIBILITY_REQUIREMENTS.metricPatterns.cluster.test(metricName)) {
          validation.metrics.cluster.push({ name: metricName, dimensions, count: item.count });
        } else if (UI_VISIBILITY_REQUIREMENTS.metricPatterns.topic.test(metricName)) {
          validation.metrics.topic.push({ name: metricName, dimensions, count: item.count });
        }
      }
      
      // Calculate coverage
      validation.coverage.broker = Math.min((validation.metrics.broker.length / 3) * 100, 100);
      validation.coverage.cluster = Math.min((validation.metrics.cluster.length / 3) * 100, 100);
      validation.coverage.topic = Math.min((validation.metrics.topic.length / 3) * 100, 100);
    }

    return validation;
  }

  async checkMessageQueueVisibility(accountId) {
    // This checks if data appears in the Message Queues data model
    const query = `
      FROM MessageQueueSample
      SELECT count(*)
      WHERE \`entity.type\` IN ('AWS_KAFKA_CLUSTER', 'AWS_KAFKA_BROKER', 'AWS_KAFKA_TOPIC')
      FACET \`entity.type\`, \`entity.name\`
      SINCE 1 hour ago
    `;

    const result = await this.runNRQL(accountId, query);
    
    return {
      visibleInUI: result?.results?.length > 0,
      entityCount: result?.results?.length || 0,
      entities: result?.results?.map(r => ({
        type: r.facet[0],
        name: r.facet[1],
        count: r.count
      })) || []
    };
  }

  calculateScore(validation) {
    let score = 0;
    let maxScore = 0;
    
    // AWS Field Validation (40 points)
    maxScore += 40;
    if (validation.awsFieldValidation.overallStatus === 'PASS') {
      score += 40;
    } else if (validation.awsFieldValidation.overallStatus === 'PARTIAL') {
      score += 20;
    }
    
    // Entity Validation (20 points)
    maxScore += 20;
    if (validation.entityValidation.hasData && validation.entityValidation.issues.length === 0) {
      score += 20;
    } else if (validation.entityValidation.hasData) {
      score += 10;
    }
    
    // Event Types (10 points)
    maxScore += 10;
    if (validation.eventTypeValidation.hasRequiredMSKEvents) {
      score += 10;
    }
    
    // Dimensional Metrics (20 points)
    maxScore += 20;
    const avgCoverage = (
      validation.dimensionalMetrics.coverage.broker +
      validation.dimensionalMetrics.coverage.cluster +
      validation.dimensionalMetrics.coverage.topic
    ) / 3;
    score += (avgCoverage / 100) * 20;
    
    // UI Visibility (10 points)
    maxScore += 10;
    if (validation.messageQueueVisibility.visibleInUI) {
      score += 10;
    }
    
    return Math.round((score / maxScore) * 100);
  }

  generateComparison(accounts) {
    console.log('\n\n📊 UI VISIBILITY COMPARISON REPORT');
    console.log('=' * 80);
    
    // Sort accounts by score
    const sortedAccounts = accounts.sort((a, b) => 
      this.results.accounts[b].score - this.results.accounts[a].score
    );
    
    console.log('\n📈 Overall Scores:');
    sortedAccounts.forEach(accountId => {
      const validation = this.results.accounts[accountId];
      const scoreColor = validation.score >= 80 ? '🟢' : validation.score >= 60 ? '🟡' : '🔴';
      console.log(`   ${scoreColor} Account ${accountId}: ${validation.score}% ${validation.messageQueueVisibility.visibleInUI ? '(Visible in UI)' : '(NOT visible in UI)'}`);
    });
    
    // Detailed comparison
    console.log('\n🔍 Critical Field Comparison:');
    console.log('Field                  |', accounts.map(a => ` ${a} `).join('|'));
    console.log('-'.repeat(23 + accounts.length * 10));
    
    // Compare providerExternalId
    console.log('providerExternalId     |', accounts.map(accountId => {
      const hasField = Object.values(this.results.accounts[accountId].awsFieldValidation.byEventType)
        .some(v => v.required?.providerExternalId?.present);
      return hasField ? '   ✅   ' : '   ❌   ';
    }).join('|'));
    
    // Compare AWS Account ID format
    console.log('Valid AWS Account ID   |', accounts.map(accountId => {
      const issues = this.results.accounts[accountId].awsFieldValidation.criticalIssues;
      const hasInvalidId = issues.some(i => i.includes('Invalid AWS account ID'));
      return hasInvalidId ? '   ❌   ' : '   ✅   ';
    }).join('|'));
    
    // Compare entity.type
    console.log('entity.type present    |', accounts.map(accountId => {
      const hasEntityType = this.results.accounts[accountId].entityValidation.entityTypesFound.length > 0;
      return hasEntityType ? '   ✅   ' : '   ❌   ';
    }).join('|'));
    
    // Compare UI visibility
    console.log('Visible in MQ UI       |', accounts.map(accountId => {
      const visible = this.results.accounts[accountId].messageQueueVisibility.visibleInUI;
      return visible ? '   ✅   ' : '   ❌   ';
    }).join('|'));
    
    // Identify winning configuration
    console.log('\n🏆 Best Configuration:');
    const bestAccount = sortedAccounts[0];
    const bestValidation = this.results.accounts[bestAccount];
    
    if (bestValidation.score >= 80) {
      console.log(`   Account ${bestAccount} has the best configuration (${bestValidation.score}%)`);
      console.log('   Key success factors:');
      
      if (bestValidation.awsFieldValidation.overallStatus === 'PASS') {
        console.log('   ✅ All AWS fields properly configured');
      }
      if (bestValidation.messageQueueVisibility.visibleInUI) {
        console.log('   ✅ Data visible in Message Queues UI');
      }
      if (bestValidation.dimensionalMetrics.hasData) {
        console.log('   ✅ Dimensional metrics enabled');
      }
    } else {
      console.log('   ⚠️  No account has a complete configuration');
      console.log('   All accounts are missing critical requirements');
    }
    
    // Generate fixes for current account
    const currentAccount = accounts[0]; // Assume first account is current
    this.generateFixes(currentAccount);
  }

  generateFixes(accountId) {
    const validation = this.results.accounts[accountId];
    
    console.log(`\n\n🔧 RECOMMENDED FIXES FOR ACCOUNT ${accountId}`);
    console.log('=' * 80);
    
    const fixes = [];
    
    // Check for missing providerExternalId
    if (validation.awsFieldValidation.criticalIssues.some(i => i.includes('providerExternalId'))) {
      fixes.push({
        priority: 'CRITICAL',
        issue: 'Missing providerExternalId field',
        fix: `Add to all MSK samples: attribute.Attribute{Key: "providerExternalId", Value: AWS_ACCOUNT_ID}`,
        files: ['src/msk/simple_transformer.go', 'src/msk/dimensional_transformer.go']
      });
    }
    
    // Check for invalid AWS account ID
    if (validation.awsFieldValidation.criticalIssues.some(i => i.includes('Invalid AWS account ID'))) {
      fixes.push({
        priority: 'CRITICAL',
        issue: 'Using New Relic account ID instead of AWS account ID',
        fix: 'Change AWS_ACCOUNT_ID from NR format (e.g., 3630072) to AWS format (e.g., 123456789012)',
        files: ['src/msk/config.go', 'Kubernetes ConfigMaps']
      });
    }
    
    // Check for missing entity.type
    if (validation.entityValidation.issues.some(i => i.includes('entity.type'))) {
      fixes.push({
        priority: 'HIGH',
        issue: 'Missing entity.type field',
        fix: 'Ensure entity.type is set to AWS_KAFKA_CLUSTER, AWS_KAFKA_BROKER, or AWS_KAFKA_TOPIC',
        files: ['src/msk/dimensional_transformer.go']
      });
    }
    
    // Check for dimensional metrics
    if (!validation.dimensionalMetrics.hasData) {
      fixes.push({
        priority: 'MEDIUM',
        issue: 'Dimensional metrics not enabled',
        fix: 'Set environment variable: MSK_USE_DIMENSIONAL=true',
        files: ['Environment configuration', 'Kubernetes ConfigMaps']
      });
    }
    
    // Print fixes
    fixes.sort((a, b) => {
      const priorityOrder = { 'CRITICAL': 0, 'HIGH': 1, 'MEDIUM': 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
    
    fixes.forEach((fix, index) => {
      console.log(`\n${index + 1}. [${fix.priority}] ${fix.issue}`);
      console.log(`   Fix: ${fix.fix}`);
      console.log(`   Files: ${fix.files.join(', ')}`);
    });
    
    if (fixes.length === 0) {
      console.log('\n✅ No critical issues found!');
    }
  }

  async generateReport(accounts) {
    const report = {
      ...this.results,
      comparison: {
        bestAccount: null,
        criticalGaps: [],
        recommendations: []
      }
    };
    
    // Find best account
    let bestScore = 0;
    accounts.forEach(accountId => {
      if (this.results.accounts[accountId].score > bestScore) {
        bestScore = this.results.accounts[accountId].score;
        report.comparison.bestAccount = accountId;
      }
    });
    
    // Save report
    const filename = `ui-visibility-validation-${Date.now()}.json`;
    await fs.writeFile(filename, JSON.stringify(report, null, 2));
    
    console.log(`\n\n📄 Full report saved to: ${filename}`);
  }

  async run(accounts) {
    console.log('🚀 UI Visibility Validator');
    console.log('   Checking requirements for New Relic Message Queues UI');
    
    // Validate each account
    for (const accountId of accounts) {
      await this.validateAccount(accountId);
    }
    
    // Generate comparison
    this.generateComparison(accounts);
    
    // Save report
    await this.generateReport(accounts);
    
    console.log('\n\n✅ Validation complete!');
  }
}

// Main execution
async function main() {
  const apiKey = process.env.NEW_RELIC_API_KEY;
  if (!apiKey) {
    console.error('❌ NEW_RELIC_API_KEY environment variable not set');
    process.exit(1);
  }
  
  // Get accounts from command line or use defaults
  const accounts = process.argv.slice(2).length > 0 
    ? process.argv.slice(2)
    : ['3630072', '3001033', '1', '3026020'];
  
  console.log(`Validating accounts: ${accounts.join(', ')}`);
  
  const validator = new UIVisibilityValidator(apiKey);
  await validator.run(accounts);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { UIVisibilityValidator, UI_VISIBILITY_REQUIREMENTS };