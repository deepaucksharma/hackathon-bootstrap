const https = require('https');
const fs = require('fs');
const path = require('path');

/**
 * Common utility functions for entity synthesis testing
 */

// Load environment variables from .env file
function loadEnvironment() {
  const envPaths = ['.env', '../.env', '../../.env'];
  
  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      envContent.split('\n').forEach(line => {
        const trimmedLine = line.trim();
        if (trimmedLine && !trimmedLine.startsWith('#')) {
          const [key, ...valueParts] = trimmedLine.split('=');
          if (key && valueParts.length > 0) {
            process.env[key.trim()] = valueParts.join('=').trim();
          }
        }
      });
      break;
    }
  }
  
  return {
    LICENSE_KEY: process.env.IKEY || process.env.NEW_RELIC_LICENSE_KEY,
    USER_KEY: process.env.UKEY || process.env.NEW_RELIC_USER_KEY,
    ACCOUNT_ID: process.env.ACC || process.env.NEW_RELIC_ACCOUNT_ID
  };
}

// Run NRQL query using GraphQL API
async function runQuery(query, apiKey, accountId) {
  const options = {
    hostname: 'api.newrelic.com',
    path: '/graphql',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'API-Key': apiKey
    }
  };

  const graphqlQuery = {
    query: `{
      actor {
        account(id: ${accountId}) {
          nrql(query: "${query.replace(/"/g, '\\"').replace(/\n/g, ' ')}") {
            results
          }
        }
      }
    }`
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.data && result.data.actor && result.data.actor.account && result.data.actor.account.nrql) {
            resolve(result.data.actor.account.nrql.results);
          } else {
            resolve([]);
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    req.write(JSON.stringify(graphqlQuery));
    req.end();
  });
}

// Send metrics to New Relic Metric API
async function sendMetric(payload, licenseKey) {
  const options = {
    hostname: 'metric-api.newrelic.com',
    path: '/metric/v1',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Api-Key': licenseKey
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    
    req.on('error', reject);
    req.write(JSON.stringify(payload));
    req.end();
  });
}

// Save results to file
function saveResults(filename, data) {
  const resultsDir = path.join(__dirname, '..', 'results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  
  const filepath = path.join(resultsDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  return filepath;
}

// Generate entity GUID (simplified version)
function generateEntityGUID(entityType, accountId, ...parts) {
  const entityString = [accountId, entityType, ...parts].join(':');
  return Buffer.from(entityString).toString('base64');
}

// Sleep helper
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Format timestamp
function formatTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

// Build common metric attributes
function buildCommonAttributes(accountId) {
  return {
    'collector.name': 'cloudwatch-metric-streams',
    'eventType': 'Metric',
    'instrumentation.provider': 'cloudwatch',
    'newrelic.source': 'cloudwatch',
    'aws.Namespace': 'AWS/Kafka',
    'provider': 'AwsMsk',
    'providerAccountId': accountId,
    'providerExternalId': accountId,
    'awsAccountId': accountId,
    'awsRegion': 'us-east-1',
    'aws.accountId': accountId,
    'aws.region': 'us-east-1'
  };
}

// Export all functions
module.exports = {
  loadEnvironment,
  runQuery,
  sendMetric,
  saveResults,
  generateEntityGUID,
  sleep,
  formatTimestamp,
  buildCommonAttributes
};