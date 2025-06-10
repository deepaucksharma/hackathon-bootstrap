#!/usr/bin/env node

/**
 * Complete Infrastructure Mode Test
 * 
 * Tests the full pipeline from nri-kafka data to entity synthesis
 */

import 'dotenv/config';
import chalk from 'chalk';
import { spawn } from 'child_process';
import https from 'https';

console.log(chalk.blue.bold(`
╔═══════════════════════════════════════════════════════════════╗
║         Complete Infrastructure Mode Test                     ║
╚═══════════════════════════════════════════════════════════════╝
`));

const config = {
  accountId: process.env.NEW_RELIC_ACCOUNT_ID,
  apiKey: process.env.NEW_RELIC_API_KEY,
  region: process.env.NEW_RELIC_REGION || 'US'
};

// Test steps
const tests = {
  credentials: false,
  nriKafkaData: false,
  platformStart: false,
  entityCreation: false,
  dashboardCreation: false
};

// Helper to run NRQL queries
async function runNRQL(query) {
  const endpoint = config.region === 'EU' ? 'api.eu.newrelic.com' : 'api.newrelic.com';
  
  return new Promise((resolve, reject) => {
    const graphqlQuery = {
      query: `
        query($accountId: Int!, $nrqlQuery: Nrql!) {
          actor {
            account(id: $accountId) {
              nrql(query: $nrqlQuery) {
                results
              }
            }
          }
        }
      `,
      variables: {
        accountId: parseInt(config.accountId),
        nrqlQuery: query
      }
    };

    const postData = JSON.stringify(graphqlQuery);
    
    const options = {
      hostname: endpoint,
      path: '/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Api-Key': config.apiKey,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.errors) {
            reject(new Error(JSON.stringify(response.errors)));
          } else {
            resolve(response.data?.actor?.account?.nrql?.results || []);
          }
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function testCredentials() {
  console.log(chalk.blue('\n1️⃣  Testing Credentials...'));
  
  if (!config.accountId || config.accountId === '123456') {
    console.log(chalk.red('   ❌ Invalid account ID'));
    return false;
  }
  
  if (!config.apiKey || !config.apiKey.startsWith('NRAK-')) {
    console.log(chalk.red('   ❌ Invalid API key (should start with NRAK-)'));
    return false;
  }
  
  try {
    // Simple query to test credentials
    await runNRQL('SELECT count(*) FROM Transaction SINCE 1 minute ago');
    console.log(chalk.green('   ✅ Credentials are valid'));
    return true;
  } catch (error) {
    console.log(chalk.red('   ❌ Authentication failed'));
    return false;
  }
}

async function testNriKafkaData() {
  console.log(chalk.blue('\n2️⃣  Checking nri-kafka Data...'));
  
  try {
    const brokerCount = await runNRQL('FROM KafkaBrokerSample SELECT count(*) SINCE 5 minutes ago');
    const topicCount = await runNRQL('FROM KafkaTopicSample SELECT count(*) SINCE 5 minutes ago');
    
    const hasBrokers = brokerCount[0]?.count > 0;
    const hasTopics = topicCount[0]?.count > 0;
    
    if (hasBrokers) {
      console.log(chalk.green(`   ✅ Found ${brokerCount[0].count} broker samples`));
    } else {
      console.log(chalk.red('   ❌ No KafkaBrokerSample data found'));
    }
    
    if (hasTopics) {
      console.log(chalk.green(`   ✅ Found ${topicCount[0].count} topic samples`));
    } else {
      console.log(chalk.yellow('   ⚠️  No KafkaTopicSample data found'));
    }
    
    return hasBrokers;
  } catch (error) {
    console.log(chalk.red('   ❌ Error querying data:', error.message));
    return false;
  }
}

async function testPlatformStart() {
  console.log(chalk.blue('\n3️⃣  Starting Platform...'));
  
  return new Promise((resolve) => {
    const platform = spawn('npx', ['tsx', 'src/platform.ts', '--mode', 'infrastructure', '--interval', '30'], {
      env: { ...process.env, PLATFORM_MODE: 'infrastructure' }
    });
    
    let output = '';
    let success = false;
    
    platform.stdout.on('data', (data) => {
      output += data.toString();
      process.stdout.write(chalk.gray(`   ${data.toString().trim()}\n`));
      
      if (output.includes('Platform initialized in infrastructure mode')) {
        success = true;
      }
      
      if (output.includes('Streamed') && output.includes('entities')) {
        console.log(chalk.green('   ✅ Platform is collecting and streaming data'));
        platform.kill();
      }
    });
    
    platform.stderr.on('data', (data) => {
      console.error(chalk.red(`   Error: ${data}`));
    });
    
    platform.on('close', () => {
      resolve(success);
    });
    
    // Give it 45 seconds to complete at least one cycle
    setTimeout(() => {
      if (platform.killed) return;
      platform.kill();
      resolve(success);
    }, 45000);
  });
}

async function testEntityCreation() {
  console.log(chalk.blue('\n4️⃣  Checking Entity Creation...'));
  
  // Wait a bit for entities to synthesize
  console.log(chalk.gray('   Waiting 30 seconds for entity synthesis...'));
  await new Promise(resolve => setTimeout(resolve, 30000));
  
  try {
    const entities = await runNRQL(
      `FROM MessageQueue SELECT count(*) FACET entityType WHERE entityType LIKE 'MESSAGE_QUEUE_%' SINCE 5 minutes ago`
    );
    
    if (entities.length > 0) {
      console.log(chalk.green('   ✅ MESSAGE_QUEUE entities created:'));
      entities.forEach(e => {
        if (e.facet) {
          console.log(chalk.gray(`      - ${e.facet}: ${e.count}`));
        }
      });
      return true;
    } else {
      console.log(chalk.red('   ❌ No MESSAGE_QUEUE entities found'));
      return false;
    }
  } catch (error) {
    console.log(chalk.red('   ❌ Error checking entities:', error.message));
    return false;
  }
}

async function runAllTests() {
  console.log(chalk.cyan('Starting comprehensive infrastructure mode test...\n'));
  
  // Test 1: Credentials
  tests.credentials = await testCredentials();
  if (!tests.credentials) {
    console.log(chalk.red('\n❌ Cannot proceed without valid credentials'));
    printSummary();
    return;
  }
  
  // Test 2: nri-kafka data
  tests.nriKafkaData = await testNriKafkaData();
  if (!tests.nriKafkaData) {
    console.log(chalk.red('\n❌ Cannot proceed without nri-kafka data'));
    printSummary();
    return;
  }
  
  // Test 3: Platform start
  tests.platformStart = await testPlatformStart();
  
  // Test 4: Entity creation
  if (tests.platformStart) {
    tests.entityCreation = await testEntityCreation();
  }
  
  printSummary();
}

function printSummary() {
  console.log(chalk.blue('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(chalk.blue('                        TEST SUMMARY                           '));
  console.log(chalk.blue('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  
  Object.entries(tests).forEach(([test, passed]) => {
    const icon = passed ? '✅' : '❌';
    const color = passed ? chalk.green : chalk.red;
    console.log(color(`${icon} ${test.replace(/([A-Z])/g, ' $1').trim()}`));
  });
  
  const allPassed = Object.values(tests).every(t => t);
  
  if (allPassed) {
    console.log(chalk.green('\n🎉 All tests passed! Infrastructure mode is working correctly.'));
    console.log(chalk.cyan('\nYou can now run continuously with:'));
    console.log(chalk.white('   ./run-infrastructure-mode.sh'));
  } else {
    console.log(chalk.red('\n❌ Some tests failed. Please check the errors above.'));
  }
  
  console.log(chalk.blue('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
}

// Run the tests
runAllTests().catch(console.error);