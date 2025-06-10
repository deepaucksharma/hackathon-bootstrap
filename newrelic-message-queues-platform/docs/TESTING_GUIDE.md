# Testing Guide

This guide covers the comprehensive testing capabilities of the New Relic Message Queues Platform.

## Overview

The platform includes an automated test suite that validates:
- All operational modes (simulation, infrastructure, hybrid)
- Entity creation and relationships
- Multi-cluster functionality
- Custom metrics
- Error recovery mechanisms
- CLI commands

## Running Tests

### Quick Start

```bash
# Run all tests
node run-all-tests.js

# Run with verbose output
VERBOSE=true node run-all-tests.js

# Run specific test
node test-infrastructure-mode.js --mock
```

### Using npm Scripts

Add to `package.json`:
```json
{
  "scripts": {
    "test": "node run-all-tests.js",
    "test:verbose": "VERBOSE=true node run-all-tests.js",
    "test:infrastructure": "node test-infrastructure-mode.js --mock",
    "test:multi-cluster": "node test-multi-cluster.js",
    "test:custom-metrics": "node test-custom-metrics.js"
  }
}
```

Then run:
```bash
npm test
npm run test:infrastructure
```

## Test Suite Architecture

### Test Runner

The `run-all-tests.js` orchestrates all tests:

```javascript
const tests = [
  {
    name: 'Platform Integration',
    file: 'test-platform-integration.js',
    timeout: 30000,
    critical: true
  },
  {
    name: 'Infrastructure Mode',
    file: 'test-infrastructure-mode.js',
    args: ['--mock'],
    timeout: 30000,
    critical: true
  },
  // ... more tests
];
```

### Test Categories

1. **Critical Tests** - Must pass for deployment
2. **Non-Critical Tests** - Should pass but won't block
3. **Performance Tests** - Validate performance metrics

## Individual Tests

### 1. Platform Integration Test

**File**: `test-platform-integration.js`  
**Purpose**: Validates core platform functionality

Tests:
- Platform initialization
- Mode switching
- Configuration validation
- Basic streaming

```bash
node test-platform-integration.js
```

### 2. Infrastructure Mode Test

**File**: `test-infrastructure-mode.js`  
**Purpose**: Tests nri-kafka data transformation

Tests:
- Mock data transformation
- Entity GUID generation
- Metric mapping
- Relationship creation

```bash
# With mock data
node test-infrastructure-mode.js --mock

# With real infrastructure (requires setup)
node test-infrastructure-mode.js
```

### 3. Multi-Cluster Test

**File**: `test-multi-cluster.js`  
**Purpose**: Validates multi-cluster monitoring

Tests:
- Cluster discovery
- Batch processing
- Filter application
- Health aggregation

```bash
node test-multi-cluster.js
```

### 4. Custom Metrics Test

**File**: `test-custom-metrics.js`  
**Purpose**: Tests custom metric functionality

Tests:
- Metric loading from files
- Provider functionality
- Validation rules
- Collection accuracy

```bash
node test-custom-metrics.js
```

### 5. Error Recovery Test

**File**: `test-error-recovery-simple.js`  
**Purpose**: Validates error handling

Tests:
- Circuit breakers
- Retry mechanisms
- Graceful degradation
- Recovery procedures

```bash
node test-error-recovery-simple.js
```

### 6. Hybrid Mode Test

**File**: `test-hybrid-mode.js`  
**Purpose**: Tests gap detection and filling

Tests:
- Infrastructure data collection
- Gap identification
- Simulation filling
- Entity merging

```bash
node test-hybrid-mode.js
```

### 7. Relationship Test

**File**: `test-relationships.js`  
**Purpose**: Validates entity relationships

Tests:
- Relationship types
- Bidirectional links
- Consistency checks
- Graph integrity

```bash
node test-relationships.js
```

## Test Results

### Console Output

```text
🧪 New Relic Message Queues Platform - Test Suite

Running 7 tests...

✅ Platform Integration passed (1234ms)
✅ Entity Relationships passed (567ms)
✅ Infrastructure Mode passed (30007ms)
✅ Hybrid Mode passed (789ms)
❌ Error Recovery timed out after 25000ms
✅ CLI Simulation passed (85430ms) [CRITICAL]
✅ CLI Dashboard passed (474ms) [CRITICAL]

📊 Test Results Summary
──────────────────────────────────────────────────
Summary:
  ✅ Passed: 6
  ❌ Failed: 1
  ⚠️  Critical failures: 0
  ⏱️  Total duration: 118.5s

🏁 Test Suite PASSED
```

### JSON Report

Test results are saved to `test-results.json`:

```json
{
  "timestamp": "2024-01-10T10:30:00.000Z",
  "duration": 118523,
  "tests": [
    {
      "name": "Platform Integration",
      "file": "test-platform-integration.js",
      "critical": true,
      "duration": 1234,
      "passed": true,
      "exitCode": 0
    }
  ],
  "summary": {
    "total": 7,
    "passed": 6,
    "failed": 1,
    "criticalFailures": 0
  }
}
```

## Writing Tests

### Test Structure

```javascript
#!/usr/bin/env node

const chalk = require('chalk');

console.log(chalk.bold.magenta('\n🧪 Testing My Feature\n'));

async function testMyFeature() {
  try {
    // Test 1
    console.log(chalk.cyan('Test 1: Basic Functionality'));
    // ... test code ...
    console.log(chalk.green('✅ Test 1 passed'));
    
    // Test 2
    console.log(chalk.cyan('\nTest 2: Error Handling'));
    // ... test code ...
    console.log(chalk.green('✅ Test 2 passed'));
    
    console.log(chalk.green('\n✅ All tests passed!\n'));
    
  } catch (error) {
    console.error(chalk.red('\n❌ Test failed:'), error.message);
    process.exit(1);
  }
}

// Run test
testMyFeature().catch(error => {
  console.error(chalk.red('Test error:'), error.message);
  process.exit(1);
});
```

### Mock Data

Create realistic mock data for testing:

```javascript
// Mock Kafka broker data
const mockBrokerData = {
  eventType: 'KafkaBrokerSample',
  'broker.id': 1,
  clusterName: 'test-cluster',
  'broker.messagesInPerSecond': 1000,
  'broker.cpuUsage': 45.5,
  'broker.memoryUsage': 62.3
};

// Mock custom context
const mockContext = {
  broker: mockBrokerData,
  cluster: {
    brokerCount: 3,
    topicCount: 10
  }
};
```

## Continuous Integration

### GitHub Actions

```yaml
name: Test Platform

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Run tests
      run: npm test
      env:
        NEW_RELIC_ACCOUNT_ID: ${{ secrets.NEW_RELIC_ACCOUNT_ID }}
        NEW_RELIC_API_KEY: ${{ secrets.NEW_RELIC_API_KEY }}
        
    - name: Upload test results
      if: always()
      uses: actions/upload-artifact@v3
      with:
        name: test-results
        path: test-results.json
```

### Jenkins Pipeline

```groovy
pipeline {
    agent any
    
    stages {
        stage('Test') {
            steps {
                sh 'npm ci'
                sh 'npm test'
            }
        }
        
        stage('Report') {
            steps {
                publishHTML([
                    allowMissing: false,
                    alwaysLinkToLastBuild: true,
                    keepAll: true,
                    reportDir: '.',
                    reportFiles: 'test-results.json',
                    reportName: 'Test Results'
                ])
            }
        }
    }
    
    post {
        always {
            archiveArtifacts artifacts: 'test-results.json'
        }
    }
}
```

## Performance Testing

### Load Testing

Test platform under load:

```javascript
// test-performance.js
async function loadTest() {
  const iterations = 1000;
  const startTime = Date.now();
  
  for (let i = 0; i < iterations; i++) {
    await platform.processMetrics(generateMockData());
  }
  
  const duration = Date.now() - startTime;
  const metricsPerSecond = iterations / (duration / 1000);
  
  console.log(`Processed ${metricsPerSecond} metrics/second`);
}
```

### Memory Testing

Monitor memory usage:

```javascript
// test-memory.js
function measureMemory() {
  const used = process.memoryUsage();
  return {
    rss: Math.round(used.rss / 1024 / 1024),
    heapTotal: Math.round(used.heapTotal / 1024 / 1024),
    heapUsed: Math.round(used.heapUsed / 1024 / 1024)
  };
}

// Run test and measure
const before = measureMemory();
await runTest();
const after = measureMemory();

console.log('Memory increase:', {
  rss: after.rss - before.rss,
  heap: after.heapUsed - before.heapUsed
});
```

## Test Coverage

### Current Coverage

| Component | Coverage | Tests |
|-----------|----------|-------|
| Platform Core | 85% | 12 |
| Infrastructure Mode | 78% | 8 |
| Simulation Engine | 92% | 15 |
| Multi-Cluster | 75% | 6 |
| Custom Metrics | 88% | 10 |
| Error Recovery | 70% | 5 |

### Generating Coverage Report

```bash
# Install coverage tool
npm install --save-dev nyc

# Run with coverage
nyc node run-all-tests.js

# Generate HTML report
nyc report --reporter=html
```

## Debugging Tests

### Enable Debug Mode

```bash
# Debug all components
DEBUG=* node test-infrastructure-mode.js

# Debug specific component
DEBUG=platform:* node test-platform-integration.js

# Multiple components
DEBUG=platform:*,transform:* node run-all-tests.js
```

### Common Issues

#### Test Timeouts

Increase timeout in test definition:
```javascript
{
  name: 'Slow Test',
  file: 'test-slow.js',
  timeout: 60000  // 60 seconds
}
```

#### Mock Data Issues

Verify mock data structure:
```javascript
console.log(JSON.stringify(mockData, null, 2));
```

#### Environment Variables

Check required variables:
```javascript
console.log('Environment:', {
  accountId: process.env.NEW_RELIC_ACCOUNT_ID,
  apiKey: process.env.NEW_RELIC_API_KEY ? 'SET' : 'NOT SET'
});
```

## Best Practices

### 1. Test Isolation

Each test should be independent:
```javascript
beforeEach(() => {
  // Reset state
  registry.clear();
  mockData = generateFreshMockData();
});
```

### 2. Meaningful Assertions

Use descriptive test messages:
```javascript
// Good
console.log(chalk.green('✅ Entity GUID follows correct format'));

// Avoid
console.log(chalk.green('✅ Test passed'));
```

### 3. Error Scenarios

Test both success and failure:
```javascript
// Test success
const result = await processValidData();
assert(result.success);

// Test failure
try {
  await processInvalidData();
  assert.fail('Should have thrown error');
} catch (error) {
  assert(error.message.includes('Invalid'));
}
```

### 4. Performance Bounds

Set performance expectations:
```javascript
const start = Date.now();
await runOperation();
const duration = Date.now() - start;

if (duration > 1000) {
  console.warn(chalk.yellow(`⚠️ Operation took ${duration}ms (expected < 1000ms)`));
}
```

## Integration Testing

### Docker Compose

Test with real infrastructure:

```yaml
# docker-compose.test.yml
version: '3.8'

services:
  kafka:
    image: bitnami/kafka:latest
    environment:
      - KAFKA_ENABLE_KRAFT=yes
      - KAFKA_CFG_PROCESS_ROLES=broker,controller
      
  platform:
    build: .
    environment:
      - MODE=infrastructure
      - NEW_RELIC_ACCOUNT_ID=${NEW_RELIC_ACCOUNT_ID}
      - NEW_RELIC_API_KEY=${NEW_RELIC_API_KEY}
    depends_on:
      - kafka
      
  tests:
    build: .
    command: npm test
    environment:
      - TEST_MODE=integration
    depends_on:
      - platform
```

Run integration tests:
```bash
docker-compose -f docker-compose.test.yml up --abort-on-container-exit
```

## Conclusion

Comprehensive testing ensures platform reliability and enables confident deployments. Use the automated test suite for regular validation, add tests for new features, and maintain high test coverage for critical components.