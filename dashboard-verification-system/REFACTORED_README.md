# Ultimate Verification System

A comprehensive, modular verification system for New Relic Message Queues UI that ensures 100% functionality guarantee.

## Features

- **Modular Architecture**: Clean separation of concerns with dedicated modules
- **Comprehensive Test Coverage**: 60+ tests across 9 categories
- **Multiple Providers**: Support for AWS MSK and Confluent Cloud
- **Flexible Reporting**: JSON, HTML, and Markdown output formats
- **Smart Test Execution**: Critical tests run first, non-critical skip on failures
- **Detailed Validation**: Proper validation logic for all test types
- **Rate Limiting**: Built-in protection against API rate limits

## Quick Start

```bash
# Run full verification for AWS MSK
node verify.js --apiKey=YOUR_API_KEY --accountId=123456789012 --nrAccountId=3630072

# Run specific test suite
node verify.js --apiKey=YOUR_API_KEY --accountId=123456789012 --nrAccountId=3630072 --suite=CRITICAL_FOUNDATION

# Run for Confluent Cloud
node verify.js --apiKey=YOUR_API_KEY --accountId=CONFLUENT_ACCOUNT --nrAccountId=3630072 --provider=confluent

# Generate only JSON report
node verify.js --apiKey=YOUR_API_KEY --accountId=123456789012 --nrAccountId=3630072 --output=json
```

## Architecture

```
ultimate-verification-system/
├── verify.js                 # Main entry point
├── lib/
│   ├── config.js            # Configuration and constants
│   ├── api-client.js        # NRQL query execution
│   ├── validators.js        # Result validation logic
│   ├── query-definitions.js # Test query definitions
│   ├── test-runner.js       # Test execution engine
│   └── reporter.js          # Report generation
└── README.md
```

## Test Suites

### 1. Critical Foundation Tests 🔨
- Entity Type Existence
- UI Visibility Fields
- Dimensional Metrics
- Data Freshness

### 2. Home Page Verification 🏠
- Account Aggregation
- Throughput Metrics

### 3. Summary Page Verification 📊
- Billboard Metrics
- Time Series Data

### 4. Entity Health Verification 🏥
- Cluster Health Metrics
- Broker Health

### 5. Data Quality Verification 🔍
- Null Value Handling
- Metric Value Ranges

### 6. Performance Verification ⚡
- Query Performance

### 7. Topic Analysis 📚
- Topic Count and Health
- Top Topics by Throughput

### 8. Consumer Group Analysis 👥
- Consumer Group Lag

### 9. Advanced Metrics 🚀
- Partition Distribution
- Resource Utilization

## Configuration

### Environment Variables
- `NEW_RELIC_API_KEY`: Can be set as env var instead of CLI argument

### Thresholds (lib/config.js)
```javascript
thresholds: {
    dataFreshness: {
        critical: 5,  // minutes
        warning: 10   // minutes
    },
    metricCompleteness: {
        critical: 95, // percentage
        warning: 80   // percentage
    },
    entityGuid: {
        critical: 90, // percentage
        warning: 70   // percentage
    }
}
```

## Output Formats

### Console Output
- Color-coded results
- Progress indicators
- Summary statistics
- Actionable recommendations

### JSON Report
- Complete test results
- Detailed metrics
- Machine-readable format

### HTML Report
- Visual dashboard
- Color-coded test results
- Summary charts
- Detailed test information

### Markdown Report
- GitHub-friendly format
- Test results documentation
- Easy to share and review

## Exit Codes

- `0`: All critical tests passed
- `1`: One or more critical tests failed

## Extending the System

### Adding New Test Suites

1. Add test definition in `lib/query-definitions.js`:
```javascript
getYourNewTests() {
    return {
        name: '🆕 Your Test Suite',
        critical: false,
        tests: [
            {
                id: '10.1',
                name: 'Your Test',
                query: `SELECT ...`,
                validate: (result) => {
                    // Your validation logic
                    return { passed: true, message: 'Test passed!' };
                }
            }
        ]
    };
}
```

2. Add to `getAllSuites()` method:
```javascript
getAllSuites() {
    return {
        // ... existing suites
        YOUR_NEW_SUITE: this.getYourNewTests()
    };
}
```

### Adding New Validators

Add validation functions to `lib/validators.js`:
```javascript
static validateYourMetric(result) {
    // Validation logic
    return {
        passed: result.someCondition,
        message: 'Descriptive message'
    };
}
```

## Troubleshooting

### Common Issues

1. **No data found**: Ensure the integration is running and sending data
2. **API errors**: Check API key permissions
3. **Timeout errors**: Reduce concurrency or add retry logic
4. **Rate limiting**: Built-in delays prevent this, but can be adjusted

### Debug Mode

Run with verbose flag for detailed error information:
```bash
node verify.js --apiKey=KEY --accountId=ID --nrAccountId=ID --verbose=true
```

## Best Practices

1. **Run Critical Tests First**: The system automatically prioritizes critical tests
2. **Monitor Pass Rates**: Aim for 100% critical test pass rate
3. **Regular Verification**: Run verification after any configuration changes
4. **Review Failed Tests**: Focus on critical failures first
5. **Use Specific Suites**: For faster debugging, run individual suites

## Support

For issues or questions:
1. Check the detailed JSON report for complete error information
2. Review the test query and validation logic
3. Ensure your Kafka integration is properly configured
4. Verify API key has necessary permissions