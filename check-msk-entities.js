#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env file
const envPath = path.resolve(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const [key, ...valueParts] = trimmedLine.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim();
        if (!process.env[key.trim()]) {
          process.env[key.trim()] = value;
        }
      }
    }
  });
}

const API_KEY = process.env.UKEY || process.env.NRAK_API_KEY;
const ACCOUNTS = [parseInt(process.env.ACC || process.env.NR_ACCOUNT_ID || '3630072'), 1, 3001033, 3026020];

async function executeQuery(accountId, nrql) {
  const graphqlQuery = `
    query($accountId: Int!, $nrqlQuery: Nrql!) {
      actor {
        account(id: $accountId) {
          nrql(query: $nrqlQuery) {
            results
          }
        }
      }
    }
  `;

  const requestBody = JSON.stringify({
    query: graphqlQuery,
    variables: {
      accountId: parseInt(accountId),
      nrqlQuery: nrql
    }
  });

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'API-Key': API_KEY
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request('https://api.newrelic.com/graphql', options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.errors) {
            reject(new Error(result.errors[0].message));
          } else {
            resolve(result.data?.actor?.account?.nrql?.results || []);
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(requestBody);
    req.end();
  });
}

async function checkAccount(accountId) {
  console.log(`\n=== Account ${accountId} ===`);

  // 1. Check if AwsMskClusterSample exists
  try {
    const clusterData = await executeQuery(accountId, 
      `SELECT count(*) FROM AwsMskClusterSample SINCE 1 hour ago`
    );
    console.log('AwsMskClusterSample count:', clusterData[0]?.count || 0);
  } catch (e) {
    console.log('AwsMskClusterSample error:', e.message);
  }

  // 2. Check provider field specifically
  try {
    const providerData = await executeQuery(accountId,
      `FROM AwsMskClusterSample SELECT latest(provider) as provider SINCE 1 hour ago LIMIT 1`
    );
    console.log('Provider value:', providerData[0]?.provider || 'MISSING');
  } catch (e) {
    console.log('Provider query error:', e.message);
  }

  // 3. Check entity.type field
  try {
    const entityTypeData = await executeQuery(accountId,
      `FROM AwsMskClusterSample SELECT latest(entity.type) as entityType SINCE 1 hour ago LIMIT 1`
    );
    console.log('Entity.type value:', entityTypeData[0]?.entityType || 'MISSING');
  } catch (e) {
    console.log('Entity.type query error:', e.message);
  }

  // 4. Check for dimensional metrics
  try {
    const metricData = await executeQuery(accountId,
      `FROM Metric SELECT count(*) WHERE metricName LIKE 'kafka.%' AND entity.type LIKE '%KAFKA%' SINCE 1 hour ago`
    );
    console.log('Kafka dimensional metrics count:', metricData[0]?.count || 0);
  } catch (e) {
    console.log('Dimensional metrics error:', e.message);
  }

  // 5. Check AWS integration metrics
  try {
    const awsMetricData = await executeQuery(accountId,
      `FROM Metric SELECT count(*) WHERE metricName LIKE 'aws.kafka%' SINCE 1 hour ago`
    );
    console.log('AWS Kafka metrics count:', awsMetricData[0]?.count || 0);
  } catch (e) {
    console.log('AWS metrics error:', e.message);
  }

  // 6. Sample one complete record
  try {
    const sampleData = await executeQuery(accountId,
      `FROM AwsMskClusterSample SELECT * SINCE 1 hour ago LIMIT 1`
    );
    if (sampleData.length > 0) {
      console.log('\nSample record fields:');
      Object.keys(sampleData[0]).sort().forEach(key => {
        const value = sampleData[0][key];
        if (key.includes('provider') || key.includes('aws') || key.includes('entity')) {
          console.log(`  ${key}: ${JSON.stringify(value)}`);
        }
      });
    }
  } catch (e) {
    console.log('Sample record error:', e.message);
  }

  // 7. Check for AWS MSK entities
  try {
    const entityQuery = await executeQuery(accountId,
      `FROM NrdbQuery SELECT uniques(type) WHERE type LIKE '%KAFKA%' SINCE 1 day ago`
    );
    console.log('\nKafka entity types found:', entityQuery[0]?.uniques || []);
  } catch (e) {
    // This query might not work in all accounts
  }
}

async function main() {
  console.log('🔍 MSK Entity Deep Dive Analysis\n');

  for (const accountId of ACCOUNTS) {
    await checkAccount(accountId);
  }

  // Compare specific fields
  console.log('\n\n📊 FIELD COMPARISON');
  console.log('='.repeat(50));

  for (const accountId of ACCOUNTS) {
    try {
      const fieldList = await executeQuery(accountId,
        `FROM AwsMskClusterSample SELECT keyset() SINCE 1 hour ago LIMIT 1`
      );
      
      if (fieldList.length > 0 && fieldList[0]['keyset()']) {
        const fields = fieldList[0]['keyset()'];
        console.log(`\nAccount ${accountId} has ${fields.length} fields`);
        
        // Check for critical UI fields
        const criticalFields = ['provider', 'awsAccountId', 'awsRegion', 'entity.type', 'instrumentation.provider'];
        const missingFields = criticalFields.filter(f => !fields.includes(f));
        
        if (missingFields.length > 0) {
          console.log('  ❌ Missing critical fields:', missingFields.join(', '));
        } else {
          console.log('  ✅ All critical fields present');
        }
      } else {
        console.log(`\nAccount ${accountId}: No AwsMskClusterSample data`);
      }
    } catch (e) {
      console.log(`\nAccount ${accountId}: Error - ${e.message}`);
    }
  }
}

main().catch(console.error);