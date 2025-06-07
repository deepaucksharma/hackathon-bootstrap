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

async function checkAWSIntegrations() {
  loadEnv();
  
  const accountId = process.env.ACC || process.env.NR_ACCOUNT_ID;
  const apiKey = process.env.UKEY || process.env.NR_USER_KEY;
  
  console.log('🔍 Checking AWS Cloud Integrations');
  console.log('==================================\n');
  
  // Check for any AWS entities
  console.log('1️⃣ Looking for AWS entities in Entity table...');
  const awsEntityQuery = `FROM Entity SELECT count(*), uniques(type) WHERE type LIKE 'AWS%' SINCE 7 days ago`;
  const awsEntities = await runQuery(awsEntityQuery, accountId, apiKey);
  
  if (awsEntities.length > 0 && awsEntities[0].count > 0) {
    console.log(`✅ Found ${awsEntities[0].count} AWS entities`);
    console.log('   Types:', awsEntities[0]['uniques.type'].join(', '));
    
    // Check for AWS integration configuration
    console.log('\n2️⃣ Checking AWS integration patterns...');
    const integrationQuery = `FROM AwsEc2InstanceSample, AwsS3BucketSample, AwsLambdaFunctionSample SELECT count(*), uniques(collector.name), uniques(integrationName), uniques(integrationVersion) SINCE 1 day ago FACET eventType LIMIT 10`;
    const integrations = await runQuery(integrationQuery, accountId, apiKey);
    
    if (integrations.length > 0) {
      console.log('\n📊 AWS Integration Details:');
      integrations.forEach(result => {
        if (result.count > 0) {
          console.log(`\n   ${result.eventType}:`);
          console.log(`   Count: ${result.count}`);
          console.log(`   Collectors: ${result['uniques.collector.name'].join(', ')}`);
          console.log(`   Integration: ${result['uniques.integrationName'].join(', ')}`);
          console.log(`   Version: ${result['uniques.integrationVersion'].join(', ')}`);
        }
      });
    }
    
    // Check for any working AWS sample with entity synthesis
    console.log('\n3️⃣ Finding a working AWS sample event...');
    const workingSampleQuery = `FROM AwsEc2InstanceSample SELECT * WHERE entityGuid IS NOT NULL LIMIT 1 SINCE 1 day ago`;
    const workingSamples = await runQuery(workingSampleQuery, accountId, apiKey);
    
    if (workingSamples.length > 0) {
      const sample = workingSamples[0];
      console.log('\n✅ Found working AWS sample:');
      
      const criticalFields = [
        'provider',
        'collector.name',
        'entityName',
        'entityGuid',
        'providerAccountId',
        'providerAccountName',
        'integrationName',
        'integrationVersion',
        'awsAccountId',
        'awsRegion',
        'tags.Name'
      ];
      
      criticalFields.forEach(field => {
        const value = sample[field];
        if (value !== undefined) {
          console.log(`   ${field}: ${JSON.stringify(value)}`);
        }
      });
      
      // Save for analysis
      fs.writeFileSync('working-aws-sample.json', JSON.stringify(sample, null, 2));
      console.log('\n📁 Saved to: working-aws-sample.json');
    }
  } else {
    console.log('❌ No AWS entities found in this account');
    console.log('\n💡 This suggests no AWS cloud integration is configured');
  }
  
  // Check collector.name patterns
  console.log('\n4️⃣ Checking collector.name patterns across all events...');
  const collectorQuery = `FROM AwsMskBrokerSample, AwsMskClusterSample, AwsMskTopicSample SELECT count(*), uniques(collector.name) SINCE 7 days ago`;
  const collectors = await runQuery(collectorQuery, accountId, apiKey);
  
  if (collectors.length > 0 && collectors[0].count > 0) {
    console.log(`\n📊 MSK Event Collectors (${collectors[0].count} events):`);
    console.log('   ', collectors[0]['uniques.collector.name'].join(', '));
  }
  
  // Check for metric streams
  console.log('\n5️⃣ Checking CloudWatch Metric Streams...');
  const metricStreamQuery = `FROM Metric SELECT count(*) WHERE metricName LIKE 'aws.kafka%' AND collector.name = 'cloudwatch-metric-streams' SINCE 1 day ago`;
  const metricStreams = await runQuery(metricStreamQuery, accountId, apiKey);
  
  if (metricStreams.length > 0 && metricStreams[0].count > 0) {
    console.log(`✅ Found ${metricStreams[0].count} metric stream events`);
  } else {
    console.log('❌ No metric stream events found');
  }
}

checkAWSIntegrations();