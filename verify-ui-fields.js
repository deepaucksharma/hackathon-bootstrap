#!/usr/bin/env node

const https = require('https');

const ACCOUNT_ID = '3630072';
const API_KEY = process.env.NEW_RELIC_API_KEY;

async function queryNRDB(query) {
  const options = {
    hostname: 'insights-api.newrelic.com',
    path: `/v1/accounts/${ACCOUNT_ID}/query?nrql=${encodeURIComponent(query)}`,
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'X-Query-Key': API_KEY
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function verifyUIFields() {
  console.log('===============================================');
  console.log('UI Field Verification');
  console.log('===============================================');
  console.log('Time:', new Date().toISOString());
  console.log('===============================================\n');

  const queries = [
    {
      name: 'Check entity.type field',
      query: `FROM AwsMskBrokerSample SELECT latest(entity.type) WHERE entity.type IS NOT NULL SINCE 10 minutes ago LIMIT 1`
    },
    {
      name: 'Check provider field',
      query: `FROM AwsMskBrokerSample SELECT latest(provider) WHERE provider IS NOT NULL SINCE 10 minutes ago LIMIT 1`
    },
    {
      name: 'Check providerExternalId field',
      query: `FROM AwsMskBrokerSample SELECT latest(providerExternalId) WHERE providerExternalId IS NOT NULL SINCE 10 minutes ago LIMIT 1`
    },
    {
      name: 'Check all critical fields',
      query: `FROM AwsMskBrokerSample SELECT 
        latest(provider) as provider,
        latest(entity.type) as entityType,
        latest(entity.guid) as entityGuid,
        latest(awsAccountId) as awsAccountId,
        latest(providerExternalId) as providerExternalId,
        latest(instrumentation.provider) as instrumentationProvider
        SINCE 10 minutes ago LIMIT 1`
    },
    {
      name: 'Count samples with all fields',
      query: `FROM AwsMskBrokerSample SELECT count(*) 
        WHERE provider IS NOT NULL 
        AND entity.type IS NOT NULL 
        AND entity.guid IS NOT NULL 
        AND awsAccountId IS NOT NULL 
        AND providerExternalId IS NOT NULL 
        SINCE 10 minutes ago`
    },
    {
      name: 'Check cluster samples',
      query: `FROM AwsMskClusterSample SELECT 
        latest(provider) as provider,
        latest(entity.type) as entityType,
        latest(entity.guid) as entityGuid
        SINCE 10 minutes ago LIMIT 1`
    },
    {
      name: 'Check topic samples',
      query: `FROM AwsMskTopicSample SELECT 
        latest(provider) as provider,
        latest(entity.type) as entityType,
        latest(entity.guid) as entityGuid
        SINCE 10 minutes ago LIMIT 1`
    }
  ];

  for (const {name, query} of queries) {
    console.log(`\n${name}:`);
    console.log('Query:', query);
    
    try {
      const result = await queryNRDB(query);
      
      if (result.results && result.results.length > 0) {
        console.log('✅ Result:', JSON.stringify(result.results[0], null, 2));
      } else {
        console.log('❌ No results found');
      }
    } catch (error) {
      console.log('❌ Error:', error.message);
    }
  }

  console.log('\n===============================================');
  console.log('Verification Complete');
  console.log('===============================================');
}

if (!API_KEY) {
  console.error('Error: NEW_RELIC_API_KEY environment variable not set');
  process.exit(1);
}

verifyUIFields().catch(console.error);