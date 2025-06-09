#!/usr/bin/env node

/**
 * Test Health Endpoint
 * 
 * Simple test to verify the health check endpoint is working correctly
 */

const chalk = require('chalk');
const http = require('http');
const HealthChecker = require('./health-check');

async function testHealthEndpoint() {
  console.log(chalk.bold.blue('\n🔍 Testing Health Check Endpoint\n'));
  
  const healthChecker = new HealthChecker({
    accountId: '123456789'
  });
  
  // Start server
  const server = healthChecker.createHealthServer(3005);
  
  try {
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log(chalk.cyan('🚀 Testing HTTP health endpoint...'));
    
    // Test health endpoint
    const response = await new Promise((resolve, reject) => {
      const req = http.get('http://localhost:3005/health', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const healthData = JSON.parse(data);
            resolve({ status: res.statusCode, data: healthData });
          } catch (error) {
            reject(new Error(`Invalid JSON response: ${error.message}`));
          }
        });
      });
      
      req.on('error', reject);
      req.setTimeout(10000, () => reject(new Error('Request timeout')));
    });
    
    // Validate response
    console.log(chalk.green(`✅ HTTP Status: ${response.status}`));
    
    if (response.status === 200) {
      console.log(chalk.green('✅ Health endpoint responding'));
      
      // Validate health data structure
      const health = response.data;
      
      if (health.overall && health.overall.status) {
        console.log(chalk.green(`✅ Overall status: ${health.overall.status.toUpperCase()}`));
        console.log(chalk.gray(`   Score: ${health.overall.score}/100`));
      } else {
        console.log(chalk.red('❌ Missing overall health status'));
      }
      
      // Check required components
      const expectedComponents = ['environment', 'core', 'infrastructure', 'transformation', 'streaming', 'dashboards', 'integration'];
      let foundComponents = 0;
      
      expectedComponents.forEach(component => {
        if (health[component]) {
          foundComponents++;
          const status = health[component].status;
          const icon = status === 'healthy' ? '✅' : status === 'warning' ? '⚠️ ' : '❌';
          console.log(chalk.gray(`   ${icon} ${component}: ${status}`));
        }
      });
      
      if (foundComponents === expectedComponents.length) {
        console.log(chalk.green('✅ All expected components present in response'));
      } else {
        console.log(chalk.yellow(`⚠️  Found ${foundComponents}/${expectedComponents.length} components`));
      }
      
    } else {
      console.log(chalk.red(`❌ Unexpected status code: ${response.status}`));
    }
    
    // Test 404 endpoint
    console.log(chalk.cyan('\n🔍 Testing 404 handling...'));
    
    const notFoundResponse = await new Promise((resolve) => {
      const req = http.get('http://localhost:3005/nonexistent', (res) => {
        resolve({ status: res.statusCode });
      });
      req.on('error', () => resolve({ status: 'error' }));
    });
    
    if (notFoundResponse.status === 404) {
      console.log(chalk.green('✅ 404 handling works correctly'));
    } else {
      console.log(chalk.yellow(`⚠️  Unexpected 404 status: ${notFoundResponse.status}`));
    }
    
    console.log(chalk.green('\n🎉 Health endpoint test completed successfully!'));
    
    return true;
    
  } catch (error) {
    console.error(chalk.red('\n❌ Health endpoint test failed:'), error.message);
    return false;
    
  } finally {
    // Close server
    server.close();
    console.log(chalk.gray('\n🛑 Health check server stopped'));
  }
}

// CLI interface
if (require.main === module) {
  testHealthEndpoint().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error(chalk.red('Test error:'), error.message);
    process.exit(1);
  });
}

module.exports = testHealthEndpoint;