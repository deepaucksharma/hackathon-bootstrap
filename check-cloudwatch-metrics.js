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

async function checkCloudWatchMetrics() {
  console.log('🔍 Checking for CloudWatch-style metrics...\n');

  const queries = [
    {
      name: 'CloudWatch collector metrics',
      query: `FROM Metric SELECT count(*) WHERE collector.name = 'cloudwatch-metric-streams' SINCE 30 minutes ago`
    },
    {
      name: 'AWS namespace metrics',
      query: `FROM Metric SELECT count(*), uniques(aws.Namespace) WHERE aws.Namespace IS NOT NULL SINCE 30 minutes ago`
    },
    {
      name: 'Kafka metrics by collector',
      query: `FROM Metric SELECT count(*), uniques(collector.name) WHERE metricName LIKE '%kafka%' OR metricName LIKE '%Kafka%' SINCE 30 minutes ago`
    },
    {
      name: 'All metric names with kafka',
      query: `FROM Metric SELECT uniques(metricName) WHERE metricName LIKE '%kafka%' OR metricName LIKE '%Kafka%' SINCE 30 minutes ago LIMIT 20`
    },
    {
      name: 'Check for BytesInPerSec metric',
      query: `FROM Metric SELECT count(*), latest(collector.name) WHERE metricName = 'BytesInPerSec' SINCE 30 minutes ago`
    }
  ];

  for (const {name, query} of queries) {
    console.log(`\n${name}:`);
    
    const result = await runQuery(query);
    if (result) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log('No results');
    }
  }
}

function runQuery(nrql) {
  return new Promise((resolve, reject) => {
    const query = {
      query: `{ actor { account(id: ${ACCOUNT_ID}) { nrql(query: "${nrql.replace(/"/g, '\\"')}") { results } } } }`
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
        try {
          const response = JSON.parse(data);
          if (response.data?.actor?.account?.nrql?.results) {
            resolve(response.data.actor.account.nrql.results);
          } else {
            console.error('Query error:', response.errors);
            resolve(null);
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify(query));
    req.end();
  });
}

checkCloudWatchMetrics().catch(console.error);