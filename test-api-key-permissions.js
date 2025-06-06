#!/usr/bin/env node

const https = require('https');
const fs = require('fs');

// Load environment
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

const API_KEY = process.env.UKEY;
const ACCOUNT_ID = process.env.ACC;

async function testAPIKey() {
  console.log('🔑 Testing API Key permissions...\n');

  // Test 1: GraphQL API (User API Key)
  console.log('1. Testing GraphQL API access:');
  try {
    const graphqlResult = await testGraphQLAPI();
    console.log('✅ GraphQL API: Success');
  } catch (error) {
    console.log('❌ GraphQL API: Failed -', error.message);
  }

  // Test 2: Metric API
  console.log('\n2. Testing Metric API access:');
  try {
    const metricResult = await testMetricAPI();
    console.log('✅ Metric API: Success');
  } catch (error) {
    console.log('❌ Metric API: Failed -', error.message);
  }

  // Test 3: Entity API
  console.log('\n3. Testing Entity API access:');
  try {
    const entityResult = await testEntityAPI();
    console.log('✅ Entity API: Success');
  } catch (error) {
    console.log('❌ Entity API: Failed -', error.message);
  }
}

function testGraphQLAPI() {
  return new Promise((resolve, reject) => {
    const query = {
      query: `{ actor { user { name email } } }`
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
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Status ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify(query));
    req.end();
  });
}

function testMetricAPI() {
  return new Promise((resolve, reject) => {
    const metric = [{
      metrics: [{
        name: 'test.metric',
        type: 'gauge',
        value: 1.0,
        timestamp: Date.now()
      }],
      common: {
        attributes: {
          'entity.type': 'Test',
          'test': true
        }
      }
    }];

    const options = {
      hostname: 'metric-api.newrelic.com',
      path: '/metric/v1',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Api-Key': API_KEY
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`  Response status: ${res.statusCode}`);
        console.log(`  Response body: ${data}`);
        if (res.statusCode === 202) {
          resolve({ status: res.statusCode, body: data });
        } else {
          reject(new Error(`Status ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify(metric));
    req.end();
  });
}

function testEntityAPI() {
  return new Promise((resolve, reject) => {
    const query = {
      query: `{ actor { entities(guids: ["test"]) { results { name } } } }`
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
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Status ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify(query));
    req.end();
  });
}

testAPIKey().catch(console.error);