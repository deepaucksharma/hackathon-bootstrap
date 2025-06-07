const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Load environment
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=:#]+?)[=:](.*)/)
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        process.env[key] = value;
      }
    });
  }
}

async function runQuery(query, accountId, apiKey) {
  const graphqlQuery = {
    query: `
      {
        actor {
          account(id: ${accountId}) {
            nrql(query: "${query.replace(/"/g, '\\"')}") {
              results
            }
          }
        }
      }
    `
  };
  
  try {
    const response = await axios.post(
      'https://api.newrelic.com/graphql',
      graphqlQuery,
      {
        headers: {
          'Content-Type': 'application/json',
          'API-Key': apiKey
        }
      }
    );
    
    return response.data?.data?.actor?.account?.nrql?.results || [];
  } catch (error) {
    console.error('Query error:', error.message);
    return [];
  }
}

async function verifyEntitySynthesis() {
  loadEnv();
  
  const accountId = process.env.ACC || process.env.NR_ACCOUNT_ID;
  const apiKey = process.env.UKEY || process.env.NR_USER_KEY;
  
  console.log('🔍 Entity Synthesis Verification Report');
  console.log('======================================\n');
  console.log('Based on New Relic Entity Synthesis Master Plan\n');
  
  // Check 1: Domain and Type Requirements
  console.log('1️⃣ DOMAIN AND TYPE VERIFICATION');
  console.log('--------------------------------');
  console.log('Expected domain: INFRA');
  console.log('Expected types: AWSMSKCLUSTER, AWSMSKBROKER, AWSMSKTOPIC\n');
  
  const entityTypesQuery = `FROM Entity SELECT count(*), uniques(type), uniques(domain) WHERE type IN ('AWSMSKCLUSTER', 'AWSMSKBROKER', 'AWSMSKTOPIC', 'KAFKA_CLUSTER', 'KAFKA_BROKER', 'KAFKA_TOPIC') SINCE 7 days ago`;
  const entityTypes = await runQuery(entityTypesQuery, accountId, apiKey);
  
  if (entityTypes.length > 0 && entityTypes[0].count > 0) {
    console.log(`✅ Found ${entityTypes[0].count} Kafka entities`);
    console.log(`   Domains: ${entityTypes[0]['uniques.domain'].join(', ')}`);
    console.log(`   Types: ${entityTypes[0]['uniques.type'].join(', ')}`);
  } else {
    console.log('❌ No Kafka entities found');
  }
  
  // Check 2: Identifier Requirements
  console.log('\n\n2️⃣ IDENTIFIER FIELD VERIFICATION');
  console.log('----------------------------------');
  console.log('Master Plan Requirements:');
  console.log('- Cluster: clusterName (≤36 chars)');
  console.log('- Broker: composite of cluster + broker ID');
  console.log('- Topic: topic name scoped to cluster\n');
  
  // Check our events
  const clusterEvents = await runQuery(`FROM AwsMskClusterSample SELECT * LIMIT 1 SINCE 1 day ago`, accountId, apiKey);
  const brokerEvents = await runQuery(`FROM AwsMskBrokerSample SELECT * LIMIT 1 SINCE 1 day ago`, accountId, apiKey);
  const topicEvents = await runQuery(`FROM AwsMskTopicSample SELECT * LIMIT 1 SINCE 1 day ago`, accountId, apiKey);
  
  if (clusterEvents.length > 0) {
    const event = clusterEvents[0];
    console.log('Cluster Sample:');
    console.log(`   clusterName: ${event['provider.clusterName'] ? '✅' : '❌'} ${event['provider.clusterName'] || 'MISSING'}`);
    console.log(`   entityName: ${event.entityName ? '✅' : '❌'} ${event.entityName || 'MISSING'}`);
    console.log(`   Length check: ${event.entityName && event.entityName.length <= 36 ? '✅ OK' : '❌ TOO LONG'}`);
  }
  
  if (brokerEvents.length > 0) {
    const event = brokerEvents[0];
    console.log('\nBroker Sample:');
    console.log(`   entityName format: ${event.entityName || 'MISSING'}`);
    const expectedFormat = event.entityName && event.entityName.includes(':');
    console.log(`   Uses composite ID: ${expectedFormat ? '✅' : '❌'} (should be brokerId:clusterName)`);
  }
  
  if (topicEvents.length > 0) {
    const event = topicEvents[0];
    console.log('\nTopic Sample:');
    console.log(`   entityName format: ${event.entityName || 'MISSING'}`);
    console.log(`   Has cluster context: ${event['provider.clusterName'] ? '✅' : '❌'}`);
  }
  
  // Check 3: Collector Name Requirements
  console.log('\n\n3️⃣ COLLECTOR NAME VERIFICATION');
  console.log('--------------------------------');
  console.log('Master Plan: collector.name identifies source integration\n');
  
  const collectorQuery = `FROM AwsMskBrokerSample, AwsMskClusterSample, AwsMskTopicSample SELECT count(*), uniques(collector.name) SINCE 1 day ago`;
  const collectors = await runQuery(collectorQuery, accountId, apiKey);
  
  if (collectors.length > 0) {
    console.log(`Found collectors: ${collectors[0]['uniques.collector.name'].join(', ')}`);
    const hasCloudIntegrations = collectors[0]['uniques.collector.name'].includes('cloud-integrations');
    const hasNriKafka = collectors[0]['uniques.collector.name'].includes('nri-kafka-msk');
    console.log(`   cloud-integrations: ${hasCloudIntegrations ? '✅' : '❌'}`);
    console.log(`   nri-kafka-msk: ${hasNriKafka ? '✅' : '❌'}`);
  }
  
  // Check 4: Provider Field Requirements  
  console.log('\n\n4️⃣ PROVIDER FIELD VERIFICATION');
  console.log('--------------------------------');
  console.log('Master Plan: provider must match entity type\n');
  
  const providerQuery = `FROM AwsMskBrokerSample, AwsMskClusterSample, AwsMskTopicSample SELECT count(*), uniques(provider) SINCE 1 day ago FACET eventType`;
  const providers = await runQuery(providerQuery, accountId, apiKey);
  
  providers.forEach(result => {
    if (result.count > 0) {
      console.log(`${result.eventType}:`);
      console.log(`   Providers: ${result['uniques.provider'].join(', ')}`);
      const expectedProvider = result.eventType.replace('Sample', '');
      const hasCorrectProvider = result['uniques.provider'].includes(expectedProvider);
      console.log(`   Matches expected: ${hasCorrectProvider ? '✅' : '❌'} (should be ${expectedProvider})`);
    }
  });
  
  // Check 5: Critical Fields
  console.log('\n\n5️⃣ CRITICAL FIELDS VERIFICATION');
  console.log('---------------------------------');
  console.log('Master Plan required fields:\n');
  
  const criticalFieldsQuery = `FROM AwsMskBrokerSample SELECT * WHERE collector.name = 'cloud-integrations' LIMIT 1 SINCE 1 day ago`;
  const criticalSample = await runQuery(criticalFieldsQuery, accountId, apiKey);
  
  if (criticalSample.length > 0) {
    const event = criticalSample[0];
    const requiredFields = {
      'entityName': 'Entity identifier',
      'entityGuid': 'Entity GUID',
      'provider': 'Provider type (AwsMskBroker, etc)',
      'providerAccountId': 'Account ID for provider',
      'providerAccountName': 'Human-readable account name',
      'providerExternalId': 'External ID (ARN for AWS)',
      'integrationName': 'Integration identifier',
      'integrationVersion': 'Integration version',
      'collector.name': 'Collector identifier',
      'awsAccountId': 'AWS account (for MSK)',
      'awsRegion': 'AWS region (for MSK)'
    };
    
    Object.entries(requiredFields).forEach(([field, desc]) => {
      const value = event[field];
      console.log(`${field}: ${value !== undefined ? '✅' : '❌'} ${desc}`);
      if (value !== undefined) {
        console.log(`   Value: ${JSON.stringify(value)}`);
      }
    });
  }
  
  // Check 6: Entity Creation
  console.log('\n\n6️⃣ ENTITY SYNTHESIS VERIFICATION');
  console.log('----------------------------------');
  
  // Check if ANY entities exist
  const entityExistsQuery = `FROM Entity SELECT count(*) WHERE type IN ('AWSMSKCLUSTER', 'AWSMSKBROKER', 'AWSMSKTOPIC') SINCE 7 days ago`;
  const entityExists = await runQuery(entityExistsQuery, accountId, apiKey);
  
  if (entityExists.length > 0 && entityExists[0].count > 0) {
    console.log(`✅ ${entityExists[0].count} MSK entities exist\!`);
    
    // Get entity details
    const entityDetailsQuery = `FROM Entity SELECT name, type, guid, reporting WHERE type IN ('AWSMSKCLUSTER', 'AWSMSKBROKER', 'AWSMSKTOPIC') LIMIT 5 SINCE 7 days ago`;
    const entityDetails = await runQuery(entityDetailsQuery, accountId, apiKey);
    
    console.log('\nSample entities:');
    entityDetails.forEach(entity => {
      console.log(`   ${entity.type}: ${entity.name}`);
      console.log(`      GUID: ${entity.guid}`);
      console.log(`      Reporting: ${entity.reporting ? 'Yes' : 'No'}`);
    });
  } else {
    console.log('❌ No MSK entities synthesized');
    
    // Check if we have AWS integration at all
    console.log('\nChecking AWS integration status...');
    const awsCheckQuery = `FROM Entity SELECT count(*), uniques(type) WHERE domain = 'INFRA' AND type LIKE 'AWS%' SINCE 1 day ago`;
    const awsCheck = await runQuery(awsCheckQuery, accountId, apiKey);
    
    if (awsCheck.length > 0 && awsCheck[0].count > 0) {
      console.log(`   Found ${awsCheck[0].count} other AWS entities`);
      console.log(`   Types: ${awsCheck[0]['uniques.type'].join(', ')}`);
    } else {
      console.log('   ❌ No AWS entities at all - AWS integration not configured');
    }
  }
  
  // Check 7: Relationships
  console.log('\n\n7️⃣ RELATIONSHIP VERIFICATION');
  console.log('-----------------------------');
  console.log('Master Plan expected relationships:');
  console.log('- Cluster MANAGES Broker');
  console.log('- Cluster MANAGES Topic');
  console.log('- Service PRODUCES Topic');
  console.log('- Service CONSUMES Topic\n');
  
  // This would require GraphQL entity API to check relationships
  console.log('⚠️  Relationship verification requires GraphQL entity API');
  console.log('   (Not available via NRQL)');
  
  // Check 8: UI Visibility
  console.log('\n\n8️⃣ UI VISIBILITY CHECK');
  console.log('------------------------');
  console.log('Checking if data appears in Message Queues UI...\n');
  
  // Check for metrics that drive the UI
  const uiMetricsQuery = `FROM AwsMskBrokerSample SELECT average(provider.bytesInPerSec.Average), average(provider.messagesInPerSec.Average) WHERE provider.clusterName IS NOT NULL SINCE 1 hour ago FACET provider.clusterName LIMIT 5`;
  const uiMetrics = await runQuery(uiMetricsQuery, accountId, apiKey);
  
  if (uiMetrics.length > 0) {
    console.log('Clusters with metrics:');
    uiMetrics.forEach(cluster => {
      if (cluster['provider.clusterName']) {
        console.log(`   ${cluster['provider.clusterName']}:`);
        console.log(`      Throughput: ${cluster['average.provider.bytesInPerSec.Average'] || 0} bytes/sec`);
        console.log(`      Message rate: ${cluster['average.provider.messagesInPerSec.Average'] || 0} msg/sec`);
      }
    });
  }
  
  // Final recommendations
  console.log('\n\n📌 RECOMMENDATIONS');
  console.log('------------------');
  
  if (entityExists[0]?.count === 0) {
    console.log('❌ Entity synthesis is NOT working. Issues found:');
    
    if (!criticalSample[0]?.providerAccountName) {
      console.log('   - Missing providerAccountName field');
    }
    if (!criticalSample[0]?.integrationName) {
      console.log('   - Missing integrationName field');
    }
    if (!criticalSample[0]?.integrationVersion) {
      console.log('   - Missing integrationVersion field');
    }
    
    console.log('\n   Possible causes:');
    console.log('   1. AWS cloud integration not configured in this account');
    console.log('   2. Entity definitions require specific field combinations');
    console.log('   3. Account may not have entity synthesis enabled');
    console.log('\n   Next steps:');
    console.log('   1. Verify AWS integration is set up in this account');
    console.log('   2. Check with New Relic support about entity synthesis');
    console.log('   3. Try using actual MSK integration instead of synthetic data');
  } else {
    console.log('✅ Entity synthesis is working\!');
    console.log('   Entities are being created from your events.');
    console.log('   Check the Message Queues UI for your clusters.');
  }
}

verifyEntitySynthesis();