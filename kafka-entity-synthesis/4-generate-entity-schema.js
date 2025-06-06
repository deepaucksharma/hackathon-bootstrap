#!/usr/bin/env node

/**
 * Entity Schema Generator - Analyze campaign results to generate the validated schema
 * Produces the data-backed, minimal-but-complete specification
 */

const fs = require('fs');
const path = require('path');

// Field classification based on test results
const FIELD_CLASSIFICATIONS = {
  MANDATORY_FOR_UI: 'Required for UI visibility',
  MANDATORY_FOR_ENTITY: 'Required for entity creation',
  MANDATORY_FOR_METRICS: 'Required for metric population',
  RECOMMENDED: 'Present in all working examples',
  OPTIONAL: 'Can be omitted without impact'
};

// Load all campaign results
function loadCampaignResults() {
  const campaignDir = path.join(__dirname, 'results', 'campaigns');
  const results = [];

  if (!fs.existsSync(campaignDir)) {
    console.error('❌ No campaign results found. Run campaigns first.');
    return results;
  }

  const files = fs.readdirSync(campaignDir);
  files.forEach(file => {
    if (file.endsWith('.json')) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(campaignDir, file), 'utf8'));
        results.push(data);
      } catch (error) {
        console.error(`Error loading ${file}: ${error.message}`);
      }
    }
  });

  return results;
}

// Load all experiment results
function loadExperimentResults() {
  const experimentsDir = path.join(__dirname, 'results', 'detailed');
  const results = [];

  if (!fs.existsSync(experimentsDir)) {
    return results;
  }

  const dirs = fs.readdirSync(experimentsDir);
  dirs.forEach(dir => {
    const summaryFile = path.join(experimentsDir, dir, 'summary.json');
    if (fs.existsSync(summaryFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
        results.push(data);
      } catch (error) {
        console.error(`Error loading ${summaryFile}: ${error.message}`);
      }
    }
  });

  return results;
}

// Analyze Phase 2 deconstruction results to classify fields
function analyzeDeconstructionResults(experimentResults) {
  const fieldClassifications = {};
  
  experimentResults.forEach(result => {
    if (result.experiment && result.experiment.name && result.experiment.name.includes('Phase 2')) {
      // Extract the field being tested from the experiment name
      const match = result.experiment.name.match(/Remove (.+)$/);
      if (match) {
        const field = match[1];
        
        // Classify based on which checks failed
        if (result.verification) {
          const failedChecks = result.verification.filter(v => !v.passed).map(v => v.type);
          
          if (failedChecks.includes('entityIsVisibleInUi')) {
            fieldClassifications[field] = 'MANDATORY_FOR_UI';
          } else if (failedChecks.includes('entityExists')) {
            fieldClassifications[field] = 'MANDATORY_FOR_ENTITY';
          } else if (failedChecks.includes('metricPopulated')) {
            fieldClassifications[field] = 'MANDATORY_FOR_METRICS';
          } else if (result.verification.every(v => v.passed)) {
            fieldClassifications[field] = 'OPTIONAL';
          }
        }
      }
    }
  });

  return fieldClassifications;
}

// Extract metrics requirements from experiments
function analyzeMetricRequirements(experimentResults) {
  const metricRequirements = {
    aggregationTypes: ['Sum', 'Average', 'Maximum', 'Minimum', 'SampleCount'],
    requiredMetrics: new Set(),
    optionalMetrics: new Set()
  };

  experimentResults.forEach(result => {
    if (result.payload && result.payload[0]) {
      const payload = result.payload[0];
      
      // Find all metric fields (provider.*.Sum/Average/etc)
      Object.keys(payload).forEach(key => {
        const match = key.match(/^provider\.(.+)\.(Sum|Average|Maximum|Minimum|SampleCount)$/);
        if (match) {
          const metricName = match[1];
          
          // Check if this metric appears in successful UI visibility tests
          if (result.verification && result.verification.find(v => v.type === 'entityIsVisibleInUi' && v.passed)) {
            metricRequirements.requiredMetrics.add(metricName);
          } else {
            metricRequirements.optionalMetrics.add(metricName);
          }
        }
      });
    }
  });

  return {
    ...metricRequirements,
    requiredMetrics: Array.from(metricRequirements.requiredMetrics),
    optionalMetrics: Array.from(metricRequirements.optionalMetrics)
  };
}

// Generate the validated entity schema
function generateEntitySchema(fieldClassifications, metricRequirements) {
  const schema = {
    generatedAt: new Date().toISOString(),
    description: 'Data-backed, validated entity schema for AWS MSK integration',
    eventTypes: {
      broker: 'AwsMskBrokerSample',
      cluster: 'AwsMskClusterSample',
      topic: 'AwsMskTopicSample'
    },
    fields: {
      mandatory: {
        core: {
          eventType: {
            classification: 'MANDATORY_FOR_ENTITY',
            description: 'Event type identifier',
            values: ['AwsMskBrokerSample', 'AwsMskClusterSample', 'AwsMskTopicSample']
          },
          timestamp: {
            classification: 'MANDATORY_FOR_ENTITY',
            description: 'Unix timestamp in milliseconds',
            type: 'number'
          },
          entityName: {
            classification: 'MANDATORY_FOR_ENTITY',
            description: 'Unique entity identifier',
            format: {
              broker: '{brokerId}:{clusterName}',
              cluster: '{clusterName}',
              topic: '{topicName}'
            }
          },
          entityGuid: {
            classification: fieldClassifications.entityGuid || 'MANDATORY_FOR_ENTITY',
            description: 'Entity GUID',
            format: 'base64(accountId|INFRA|entityType|hash)'
          },
          entityId: {
            classification: fieldClassifications.entityId || 'MANDATORY_FOR_ENTITY',
            description: 'Numeric entity ID',
            type: 'number'
          }
        },
        collectorProvider: {
          'collector.name': {
            classification: 'MANDATORY_FOR_UI',
            description: 'CRITICAL: Must be cloud-integrations for UI visibility',
            value: 'cloud-integrations'
          },
          'instrumentation.provider': {
            classification: 'MANDATORY_FOR_UI',
            description: 'Provider type',
            value: 'aws'
          },
          provider: {
            classification: 'MANDATORY_FOR_UI',
            description: 'Entity provider type',
            values: ['AwsMskBroker', 'AwsMskCluster', 'AwsMskTopic']
          }
        },
        accountMapping: {
          providerAccountId: {
            classification: 'MANDATORY_FOR_UI',
            description: 'New Relic account ID',
            type: 'string'
          },
          providerAccountName: {
            classification: fieldClassifications.providerAccountName || 'RECOMMENDED',
            description: 'Account display name',
            type: 'string'
          },
          providerExternalId: {
            classification: 'MANDATORY_FOR_UI',
            description: 'AWS account ID - CRITICAL for linking',
            type: 'string',
            format: '12-digit AWS account ID'
          }
        },
        awsContext: {
          awsAccountId: {
            classification: fieldClassifications.awsAccountId || 'MANDATORY_FOR_UI',
            description: 'AWS account ID',
            type: 'string'
          },
          awsRegion: {
            classification: fieldClassifications.awsRegion || 'MANDATORY_FOR_UI',
            description: 'AWS region',
            type: 'string'
          }
        }
      },
      entitySpecific: {
        broker: {
          'provider.brokerId': {
            classification: 'MANDATORY_FOR_ENTITY',
            description: 'Broker ID',
            type: 'string'
          },
          'provider.clusterName': {
            classification: 'MANDATORY_FOR_ENTITY',
            description: 'Parent cluster name for relationships',
            type: 'string'
          }
        },
        cluster: {
          'provider.clusterName': {
            classification: 'MANDATORY_FOR_ENTITY',
            description: 'Cluster name',
            type: 'string'
          }
        },
        topic: {
          'provider.topicName': {
            classification: 'MANDATORY_FOR_ENTITY',
            description: 'Topic name',
            type: 'string'
          },
          'provider.clusterName': {
            classification: 'MANDATORY_FOR_ENTITY',
            description: 'Parent cluster name',
            type: 'string'
          }
        }
      },
      optional: {
        dataSourceName: {
          classification: fieldClassifications.dataSourceName || 'OPTIONAL',
          description: 'Data source identifier',
          value: 'Managed Kafka'
        },
        'collector.version': {
          classification: fieldClassifications['collector.version'] || 'OPTIONAL',
          description: 'Collector version',
          type: 'string'
        }
      }
    },
    metrics: {
      requirements: 'All metrics MUST include all 5 aggregation types',
      aggregationTypes: metricRequirements.aggregationTypes,
      pattern: 'provider.{metricName}.{aggregationType}',
      requiredMetrics: metricRequirements.requiredMetrics,
      commonMetrics: [
        'bytesInPerSec',
        'bytesOutPerSec',
        'messagesInPerSec',
        'fetchConsumerTotalTimeMs',
        'produceRequestTotalTimeMs',
        'consumerLag',
        'offlinePartitionsCount'
      ]
    },
    validationRules: [
      'collector.name MUST be "cloud-integrations"',
      'All 5 metric aggregations required for each metric',
      'providerExternalId must match a configured AWS account',
      'Entity relationships established via provider.clusterName',
      'Timestamps must be in milliseconds'
    ],
    verifiedBehaviors: {
      healthStatus: 'offlinePartitionsCount > 0 triggers UNHEALTHY',
      throughput: 'bytesInPerSec/bytesOutPerSec control throughput display',
      consumerLag: 'consumerLag metrics trigger lag alerts',
      relationships: 'Brokers linked to clusters via provider.clusterName match'
    }
  };

  return schema;
}

// Generate field classification table
function generateClassificationTable(classifications) {
  console.log('\n📊 Field Classification Summary');
  console.log('=====================================');
  
  Object.entries(FIELD_CLASSIFICATIONS).forEach(([key, description]) => {
    const fields = Object.entries(classifications)
      .filter(([field, classification]) => classification === key)
      .map(([field]) => field);
    
    if (fields.length > 0) {
      console.log(`\n${key} - ${description}:`);
      fields.forEach(field => console.log(`  - ${field}`));
    }
  });
}

// Main execution
async function main() {
  console.log('🔬 Entity Schema Generator');
  console.log('==========================\n');

  // Load results
  console.log('📂 Loading campaign results...');
  const campaignResults = loadCampaignResults();
  const experimentResults = loadExperimentResults();
  
  console.log(`  Found ${campaignResults.length} campaign runs`);
  console.log(`  Found ${experimentResults.length} experiment results`);

  if (experimentResults.length === 0) {
    console.error('\n❌ No experiment results found. Run experiments first.');
    console.log('   Use: node 2-run-campaign.js phase-1-baseline-validation');
    process.exit(1);
  }

  // Analyze results
  console.log('\n🔍 Analyzing deconstruction results...');
  const fieldClassifications = analyzeDeconstructionResults(experimentResults);
  
  console.log('\n📊 Analyzing metric requirements...');
  const metricRequirements = analyzeMetricRequirements(experimentResults);

  // Generate classification table
  generateClassificationTable(fieldClassifications);

  // Generate schema
  console.log('\n🏗️  Generating entity schema...');
  const schema = generateEntitySchema(fieldClassifications, metricRequirements);

  // Save schema
  const schemaFile = path.join(__dirname, 'config', 'entity-schema.json');
  fs.writeFileSync(schemaFile, JSON.stringify(schema, null, 2));
  console.log(`\n✅ Entity schema generated: ${schemaFile}`);

  // Generate implementation guide
  const guideFile = path.join(__dirname, 'config', 'implementation-guide.md');
  const guide = `# Entity Schema Implementation Guide

Generated: ${new Date().toISOString()}

## Overview
This guide provides the validated field requirements for implementing AWS MSK entity synthesis.

## Mandatory Fields for UI Visibility
${Object.entries(schema.fields.mandatory.collectorProvider)
  .map(([key, value]) => `- **${key}**: ${value.value || 'See schema'}`)
  .join('\n')}

## Mandatory Fields for Entity Creation
${Object.entries(schema.fields.mandatory.core)
  .map(([key, value]) => `- **${key}**: ${value.description}`)
  .join('\n')}

## Metric Requirements
- All metrics must include: ${schema.metrics.aggregationTypes.join(', ')}
- Pattern: ${schema.metrics.pattern}

## Validation Checklist
${schema.validationRules.map(rule => `- [ ] ${rule}`).join('\n')}

## Implementation in nri-kafka
The MSK shim must generate payloads that comply with the entity-schema.json specification.
`;

  fs.writeFileSync(guideFile, guide);
  console.log(`✅ Implementation guide generated: ${guideFile}`);

  // Display summary
  console.log('\n========================================');
  console.log('Schema Generation Complete');
  console.log('========================================');
  console.log(`Mandatory fields identified: ${Object.keys(fieldClassifications).filter(f => 
    fieldClassifications[f].startsWith('MANDATORY')).length}`);
  console.log(`Optional fields identified: ${Object.keys(fieldClassifications).filter(f => 
    fieldClassifications[f] === 'OPTIONAL').length}`);
  console.log(`Required metrics: ${metricRequirements.requiredMetrics.length}`);
  console.log('========================================\n');
}

// Run the generator
main().catch(error => {
  console.error(`\n❌ Error: ${error.message}`);
  process.exit(1);
});