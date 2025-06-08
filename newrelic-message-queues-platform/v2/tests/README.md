# V2 Platform Test Suite

Comprehensive test suite for the v2 Message Queues Platform, covering unit tests, integration tests, performance tests, and mode transition tests.

## Test Categories

### Unit Tests
- **Mode Controller**: Tests mode management, validation, and transitions
- **Platform Orchestrator**: Tests orchestration logic and component coordination
- **Streaming Orchestrator**: Tests streaming logic, batching, and error handling

### Integration Tests
- **Data Pipeline**: End-to-end tests from discovery to streaming
- Tests complete data flow through all components
- Validates data transformation and integrity

### Performance Tests
- **Latency Requirements**: Validates <100ms transformation latency
- **Throughput**: Tests 10,000+ events/second capability
- **Resource Utilization**: Monitors CPU and memory usage
- **Scalability**: Tests performance with varying entity counts

### Mode Transition Tests
- **Seamless Switching**: Tests transitions between simulation, infrastructure, and hybrid modes
- **Data Continuity**: Ensures no data loss during transitions
- **Component State**: Validates proper component lifecycle management

## Running Tests

### Run All Tests
```bash
npm run test:v2
```

### Run Specific Category
```bash
# Unit tests only
npm run test:v2:unit

# Integration tests only
npm run test:v2:integration

# Performance tests only
npm run test:v2:performance

# Mode transition tests only
npm run test:v2:transitions
```

### Run with Options
```bash
# Verbose output with coverage and report
npm run test:v2:all

# Using test runner directly
node v2/tests/test-runner.js --verbose --coverage --report

# Watch mode
node v2/tests/test-runner.js --watch

# Stop on first failure
node v2/tests/test-runner.js --bail
```

## Test Structure

```
v2/tests/
├── unit/                    # Unit tests for individual components
│   ├── mode-controller.test.js
│   ├── platform-orchestrator.test.js
│   └── streaming-orchestrator.test.js
├── integration/             # Integration tests for data pipeline
│   └── data-pipeline.test.js
├── performance/             # Performance and scalability tests
│   └── performance.test.js
├── mode-transition/         # Mode transition tests
│   └── mode-transition.test.js
├── helpers/                 # Test utilities and helpers
│   └── test-utils.js
├── fixtures/                # Test data and fixtures
│   └── test-data.js
├── jest.config.js          # Jest configuration
├── setup.js                # Global test setup
├── test-runner.js          # Test execution orchestrator
└── README.md               # This file
```

## Performance Targets

The v2 platform must meet these performance requirements:

| Metric | Target | Test Coverage |
|--------|--------|---------------|
| Transformation Latency | <100ms | ✅ Performance tests |
| Streaming Throughput | >10,000 events/sec | ✅ Performance tests |
| Mode Transition Time | <500ms | ✅ Mode transition tests |
| Memory Growth | <200MB for 10k entities | ✅ Performance tests |
| CPU Usage | <100ms per 1k events | ✅ Performance tests |

## Test Helpers

### Mock Utilities
- `createMockModeController()`: Creates a mock mode controller
- `createMockDiscoveryService()`: Creates a mock discovery service
- `createMockShimAdapter()`: Creates a mock SHIM adapter
- `createMockStreamData()`: Generates mock streaming data

### Performance Utilities
- `PerformanceTracker`: Class for measuring execution time
- `withTimeout()`: Async operation with timeout
- `waitForCondition()`: Wait for condition with polling

### Test Data Fixtures
- `testEntities`: Sample MESSAGE_QUEUE entities
- `testMetrics`: Sample metric values
- `infrastructureResources`: Docker/Kubernetes resource samples
- `streamingEvents`: Event data for streaming tests

## Writing New Tests

### Unit Test Template
```javascript
describe('ComponentName', () => {
  let component;
  
  beforeEach(() => {
    component = new Component();
  });
  
  afterEach(() => {
    component.cleanup();
  });
  
  describe('feature', () => {
    test('should behave correctly', async () => {
      // Arrange
      const input = createTestData();
      
      // Act
      const result = await component.process(input);
      
      // Assert
      expect(result).toMatchObject({
        status: 'success',
        data: expect.any(Object)
      });
    });
  });
});
```

### Performance Test Template
```javascript
test('should meet performance requirement', async () => {
  const tracker = new PerformanceTracker();
  
  tracker.start('operation');
  
  // Perform operation
  await performOperation();
  
  const duration = tracker.end('operation');
  
  expect(duration).toBeLessThan(100); // ms
});
```

## CI/CD Integration

The test suite is designed for CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Run V2 Tests
  run: |
    npm run test:v2:all
    
- name: Upload Test Report
  uses: actions/upload-artifact@v2
  with:
    name: v2-test-report
    path: v2-test-report.json
    
- name: Upload Coverage
  uses: actions/upload-artifact@v2
  with:
    name: v2-coverage
    path: v2/tests/coverage/
```

## Debugging Tests

### Enable Verbose Output
```bash
node v2/tests/test-runner.js --verbose
```

### Run Single Test File
```bash
npm test -- v2/tests/unit/mode-controller.test.js
```

### Debug with Node Inspector
```bash
node --inspect-brk node_modules/.bin/jest v2/tests/unit/mode-controller.test.js
```

## Test Reports

Test reports are generated in JSON format and include:
- Test results by category
- Performance metrics
- Failed test details
- Execution environment info

Example report structure:
```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "results": {
    "passed": 145,
    "failed": 2,
    "skipped": 3,
    "totalDuration": 45678,
    "suites": {
      "Unit Tests": { ... },
      "Integration Tests": { ... }
    }
  },
  "environment": {
    "node": "v18.12.0",
    "platform": "linux"
  }
}
```

## Troubleshooting

### Tests Timing Out
- Increase timeout in jest.config.js
- Check for unresolved promises
- Verify mock implementations

### Memory Issues
- Run tests with increased heap size: `NODE_OPTIONS=--max-old-space-size=4096 npm run test:v2`
- Check for memory leaks in test cleanup

### Flaky Tests
- Use `waitForCondition()` instead of fixed timeouts
- Ensure proper test isolation
- Mock external dependencies