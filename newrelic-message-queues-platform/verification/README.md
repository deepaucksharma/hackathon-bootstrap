# Dashboard Verification System

The Dashboard Verification System provides comprehensive testing and validation for New Relic dashboards, ensuring they meet performance, functionality, and usability standards.

## Features

### 🔍 Comprehensive Testing
- **Dashboard Structure Validation**: Verifies proper dashboard configuration, variables, and layout
- **Widget Functionality Testing**: Tests individual widget performance and data retrieval
- **NRQL Query Validation**: Validates query syntax, performance, and best practices
- **Performance Benchmarking**: Measures load times and response performance
- **Mobile Compatibility**: Tests dashboard responsiveness and mobile optimization
- **Load Testing**: Simulates concurrent users and stress testing
- **Accessibility Testing**: Validates accessibility standards compliance

### 📊 Detailed Reporting
- **Multiple Report Formats**: JSON, HTML, and CSV output options
- **Comprehensive Scoring**: 0-100 scoring system with category breakdowns
- **Actionable Recommendations**: Specific suggestions for improvement
- **Batch Processing**: Verify multiple dashboards with aggregate reporting
- **Performance Benchmarks**: Historical performance tracking

### 🚀 Enterprise Features
- **Concurrent Processing**: Parallel verification for faster batch operations
- **Retry Logic**: Automatic retry with exponential backoff for failed verifications
- **Rate Limiting**: Respects New Relic API rate limits
- **Error Recovery**: Graceful handling of failures with detailed error reporting

## Quick Start

### Installation

```bash
# Install dependencies
npm install

# Set environment variables
export NEW_RELIC_USER_API_KEY="your-user-api-key"
export NEW_RELIC_ACCOUNT_ID="your-account-id"
```

### CLI Usage

```bash
# Verify a single dashboard
./tools/cli/mq-platform.js verify dashboard --guid "your-dashboard-guid"

# Verify multiple dashboards
./tools/cli/mq-platform.js verify batch --guids "guid1,guid2,guid3"

# Verify from file
./tools/cli/mq-platform.js verify batch --file dashboard-guids.txt

# Include load testing
./tools/cli/mq-platform.js verify dashboard --guid "your-guid" --load-test

# Custom output format and location
./tools/cli/mq-platform.js verify dashboard --guid "your-guid" --format html --output ./reports
```

### Programmatic Usage

```javascript
const { VerificationRunner, DashboardVerifier } = require('./verification');

// Single dashboard verification
const runner = new VerificationRunner({
  apiKey: process.env.NEW_RELIC_USER_API_KEY,
  accountId: process.env.NEW_RELIC_ACCOUNT_ID
});

const results = await runner.verifyDashboard('dashboard-guid');
console.log(`Score: ${results.summary.overallScore}/100`);

// Batch verification
const batchResults = await runner.verifyDashboards([
  'guid1', 'guid2', 'guid3'
], {
  concurrency: 3,
  includeLoadTest: true
});

// Direct verifier usage
const verifier = new DashboardVerifier();
const structureResults = await verifier.validateDashboardStructure('guid');
const performanceResults = await verifier.runPerformanceBenchmarks('guid');
```

## Verification Categories

### Structure Validation (20 points)
- Dashboard has proper title and description
- Contains meaningful variables
- Has organized pages with widgets
- Widgets have appropriate sizing and positioning
- No layout conflicts or overlaps

### Widget Functionality (25 points)
- All widgets load successfully
- Widgets have valid configurations
- Data retrieval works correctly
- Widget types are appropriate for data
- No broken or empty widgets

### NRQL Query Validation (25 points)
- Queries have valid syntax
- Uses appropriate MESSAGE_QUEUE_* event types
- Includes proper filtering and aggregation
- Follows performance best practices
- No potentially expensive operations

### Performance Benchmarking (15 points)
- Dashboard loads within acceptable time limits
- Widget response times meet thresholds
- Memory usage remains reasonable
- No performance bottlenecks detected

### Mobile Compatibility (10 points)
- Responsive design implementation
- Touch-friendly interface elements
- Readable text and appropriate sizing
- Functional on mobile devices

### Accessibility (5 points)
- Proper color contrast ratios
- Keyboard navigation support
- Screen reader compatibility
- Alternative text for visual elements

## Configuration

### Default Configuration

```javascript
const config = {
  performanceThresholds: {
    widgetLoadTime: 3000,      // 3 seconds
    dashboardLoadTime: 5000,   // 5 seconds
    queryResponseTime: 2000,   // 2 seconds
    errorRate: 0.05            // 5%
  },
  batchSize: 5,
  parallelExecutions: 3,
  retryAttempts: 2,
  reportFormats: ['json', 'html'],
  outputDir: './verification-results'
};
```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `NEW_RELIC_USER_API_KEY` | New Relic User API Key for dashboard operations | Yes |
| `NEW_RELIC_ACCOUNT_ID` | New Relic Account ID | Yes |
| `NEW_RELIC_API_KEY` | New Relic Ingest API Key (for load testing) | Optional |

## Report Examples

### Single Dashboard Report

```json
{
  "dashboardGuid": "abc123...",
  "verificationId": "verification-123",
  "startTime": "2025-06-07T12:00:00Z",
  "summary": {
    "overallScore": 87.5,
    "passRate": 85.7,
    "testsPassed": 6,
    "totalTests": 7
  },
  "tests": {
    "structure": { "passed": true, "score": 95 },
    "widgets": { "passed": true, "score": 88 },
    "queries": { "passed": true, "score": 92 },
    "performance": { "passed": false, "score": 65 },
    "mobile": { "passed": true, "score": 90 },
    "accessibility": { "passed": true, "score": 85 }
  },
  "recommendations": [
    {
      "category": "Performance",
      "priority": "high",
      "issue": "Dashboard loads too slowly",
      "recommendation": "Optimize queries and reduce widget complexity"
    }
  ]
}
```

### Batch Report Summary

```json
{
  "totalDashboards": 10,
  "averageScore": 82.3,
  "passRate": 80.0,
  "topPerformers": [
    { "dashboardGuid": "abc123", "score": 95.2 },
    { "dashboardGuid": "def456", "score": 91.8 }
  ],
  "needsAttention": [
    { "dashboardGuid": "xyz789", "score": 58.5, "criticalIssues": 3 }
  ],
  "commonIssues": [
    { "issue": "Missing provider filter", "occurrences": 6, "percentage": 60 },
    { "issue": "Slow query performance", "occurrences": 4, "percentage": 40 }
  ]
}
```

## Testing Framework

The verification system includes a comprehensive testing framework to ensure reliability:

```bash
# Run all tests
./tools/cli/mq-platform.js verify test-framework

# Run specific test categories
./tools/cli/mq-platform.js verify test-framework --unit
./tools/cli/mq-platform.js verify test-framework --integration --performance
```

### Test Categories

- **Unit Tests**: Individual component testing
- **Integration Tests**: End-to-end workflow testing
- **Performance Tests**: System performance validation
- **End-to-End Tests**: Complete pipeline testing

## Best Practices

### Dashboard Design
1. **Use Clear Titles**: Descriptive dashboard and widget titles
2. **Implement Variables**: Provider, environment, and time range filters
3. **Optimize Queries**: Use appropriate aggregation and filtering
4. **Responsive Layout**: Ensure mobile compatibility
5. **Performance**: Keep widget count reasonable (< 20 widgets per page)

### NRQL Query Optimization
1. **Use Specific Event Types**: MESSAGE_QUEUE_CLUSTER_SAMPLE, etc.
2. **Add Provider Filters**: `WHERE provider = 'kafka'`
3. **Limit Results**: Use `LIMIT` with `FACET` queries
4. **Time Ranges**: Appropriate time windows for data volume
5. **Aggregation**: Use proper aggregation functions

### Verification Workflow
1. **Regular Verification**: Schedule weekly dashboard checks
2. **Batch Processing**: Verify related dashboards together
3. **Performance Monitoring**: Track score trends over time
4. **Issue Resolution**: Address high-priority recommendations first
5. **Documentation**: Keep verification results for compliance

## Troubleshooting

### Common Issues

#### API Authentication
```bash
# Check API key configuration
./tools/cli/mq-platform.js config validate

# Set environment variables
export NEW_RELIC_USER_API_KEY="NRAK-..."
export NEW_RELIC_ACCOUNT_ID="1234567"
```

#### Rate Limiting
```javascript
// Reduce concurrency for rate limit issues
const runner = new VerificationRunner({
  parallelExecutions: 1,
  batchSize: 3
});
```

#### Memory Usage
```javascript
// For large batch operations
const runner = new VerificationRunner({
  batchSize: 2,  // Smaller batches
  cleanupInterval: 60000  // Clean up every minute
});
```

### Error Codes

| Error Code | Description | Solution |
|------------|-------------|----------|
| `VER001` | Dashboard not found | Check dashboard GUID |
| `VER002` | API authentication failed | Verify API key |
| `VER003` | Rate limit exceeded | Reduce concurrency |
| `VER004` | Query validation failed | Check NRQL syntax |
| `VER005` | Performance threshold exceeded | Optimize dashboard |

## API Reference

### VerificationRunner

#### Methods

- `verifyDashboard(guid, options)`: Verify single dashboard
- `verifyDashboards(guids, options)`: Batch verification
- `generateBatchReport(results)`: Create batch report
- `getStatistics()`: Get runner statistics

#### Options

- `includeLoadTest`: Include load testing (default: false)
- `concurrency`: Parallel executions (default: 3)
- `stopOnFirstFailure`: Stop batch on failure (default: false)
- `retryFailures`: Retry failed verifications (default: true)

### DashboardVerifier

#### Methods

- `verifyDashboard(guid, options)`: Complete verification
- `validateDashboardStructure(guid)`: Structure validation
- `testWidgetFunctionality(guid)`: Widget testing
- `validateNRQLQueries(guid)`: Query validation
- `runPerformanceBenchmarks(guid)`: Performance testing

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Run the test suite: `npm test`
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues and questions:
- Create an issue in the repository
- Check the troubleshooting section
- Review the API documentation
- Run the test framework to validate setup