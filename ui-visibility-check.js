#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env file if it exists
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

// Configuration
const ACCOUNTS = {
  'Your Account (Not in UI)': parseInt(process.env.ACC || process.env.NR_ACCOUNT_ID || '3630072'),
  'Working Account 1': 1,
  'Working Account 3001033': 3001033,
  'Working Account 3026020': 3026020
};

const API_KEY = process.env.UKEY || process.env.NRAK_API_KEY;

if (!API_KEY) {
  console.error('Error: API Key required. Set UKEY or NRAK_API_KEY environment variable');
  process.exit(1);
}

// Critical queries to identify UI visibility issues
const QUERIES = [
  {
    name: 'Entity Type Format',
    query: `FROM AwsMskClusterSample SELECT uniques(entity.type) as 'Entity Types' WHERE nr.accountId = {accountId} SINCE 1 hour ago`
  },
  {
    name: 'Provider Fields',
    query: `FROM AwsMskClusterSample SELECT 
      uniques(provider) as 'Provider',
      uniques(instrumentation.provider) as 'Instrumentation Provider',
      uniques(awsAccountId) as 'AWS Account ID',
      uniques(awsRegion) as 'AWS Region'
    WHERE nr.accountId = {accountId} SINCE 1 hour ago`
  },
  {
    name: 'Critical UI Fields Percentage',
    query: `FROM AwsMskClusterSample SELECT 
      percentage(count(provider), count(*)) as '% with provider',
      percentage(count(awsAccountId), count(*)) as '% with awsAccountId',
      percentage(count(awsRegion), count(*)) as '% with awsRegion',
      percentage(count(instrumentation.provider), count(*)) as '% with instrumentation.provider'
    WHERE nr.accountId = {accountId} SINCE 1 hour ago`
  },
  {
    name: 'Dimensional Metrics Check',
    query: `FROM Metric SELECT count(*) as 'Metric Count', uniques(entity.type) as 'Entity Types'
    WHERE entity.type LIKE '%KAFKA%' AND nr.accountId = {accountId} SINCE 1 hour ago`
  },
  {
    name: 'Integration Source',
    query: `FROM AwsMskClusterSample SELECT 
      uniques(collector.name) as 'Collector',
      uniques(instrumentation.name) as 'Instrumentation',
      uniques(source) as 'Source'
    WHERE nr.accountId = {accountId} SINCE 1 hour ago`
  },
  {
    name: 'Entity GUID Format',
    query: `FROM AwsMskClusterSample SELECT 
      latest(entity.guid) as 'Sample Entity GUID'
    WHERE nr.accountId = {accountId} SINCE 1 hour ago LIMIT 1`
  },
  {
    name: 'Event vs Metric Data',
    query: `SELECT 
      filter(count(*), WHERE eventType() = 'AwsMskClusterSample') as 'Event Count',
      filter(count(*), WHERE eventType() = 'Metric' AND metricName LIKE 'aws.kafka%') as 'Metric Count'
    FROM AwsMskClusterSample, Metric
    WHERE nr.accountId = {accountId} SINCE 1 hour ago`
  }
];

async function executeQuery(accountId, query) {
  const nrql = query.replace(/{accountId}/g, accountId);
  
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

async function compareAccounts() {
  console.log('🔍 UI Visibility Comparison Analysis\n');
  console.log('=' .repeat(80));

  for (const query of QUERIES) {
    console.log(`\n📊 ${query.name}`);
    console.log('-'.repeat(80));

    for (const [accountName, accountId] of Object.entries(ACCOUNTS)) {
      try {
        const results = await executeQuery(accountId, query.query);
        console.log(`\n${accountName} (${accountId}):`);
        
        if (results.length > 0) {
          console.log(JSON.stringify(results[0], null, 2));
        } else {
          console.log('❌ No data found');
        }
      } catch (error) {
        console.log(`❌ Error: ${error.message}`);
      }
    }
  }

  // Special comparison query
  console.log('\n\n🔑 KEY DIFFERENCES SUMMARY');
  console.log('=' .repeat(80));
  
  try {
    // Check field differences
    const ourAccountId = parseInt(process.env.ACC || process.env.NR_ACCOUNT_ID || '3630072');
    const ourFields = await executeQuery(ourAccountId, 
      `FROM AwsMskClusterSample SELECT keyset() WHERE nr.accountId = ${ourAccountId} SINCE 1 hour ago LIMIT 1`
    );
    
    const workingFields = await executeQuery(1,
      `FROM AwsMskClusterSample SELECT keyset() WHERE nr.accountId = 1 SINCE 1 hour ago LIMIT 1`
    );
    
    if (ourFields.length > 0 && workingFields.length > 0) {
      const ourFieldSet = new Set(ourFields[0]['keyset()'] || []);
      const workingFieldSet = new Set(workingFields[0]['keyset()'] || []);
      
      const missingInOurs = [...workingFieldSet].filter(f => !ourFieldSet.has(f));
      const extraInOurs = [...ourFieldSet].filter(f => !workingFieldSet.has(f));
      
      console.log(`\n🚨 Fields MISSING in account ${ourAccountId}:`);
      missingInOurs.forEach(f => console.log(`  - ${f}`));
      
      console.log(`\n➕ Extra fields in account ${ourAccountId}:`);
      extraInOurs.forEach(f => console.log(`  - ${f}`));
    }
  } catch (error) {
    console.error('Error in field comparison:', error.message);
  }
}

// Run the comparison
compareAccounts().catch(console.error);