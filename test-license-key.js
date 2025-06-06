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

const LICENSE_KEY = process.env.IKEY;
const ACCOUNT_ID = process.env.ACC;

async function testLicenseKey() {
  console.log('🔑 Testing License Key for Metric API...\n');
  
  console.log(`License key length: ${LICENSE_KEY ? LICENSE_KEY.length : 0}`);
  console.log(`License key prefix: ${LICENSE_KEY ? LICENSE_KEY.substring(0, 4) + '...' : 'N/A'}\n`);

  // Test Metric API with license key
  console.log('Testing Metric API access with license key:');
  try {
    const metricResult = await testMetricAPI();
    console.log('✅ Metric API: Success');
    console.log(`Response: ${JSON.stringify(metricResult, null, 2)}`);
  } catch (error) {
    console.log('❌ Metric API: Failed -', error.message);
  }
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
        'Api-Key': LICENSE_KEY
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

testLicenseKey().catch(console.error);