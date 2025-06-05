# Kafka Metrics Verification Script

A comprehensive Node.js script that verifies Kafka metrics in New Relic NRDB using NerdGraph API. This script covers all queries from the METRICS_VERIFICATION_GUIDE.md with enhanced features for production use.

## Features

- **Complete Query Coverage**: 100+ queries across 17 categories
- **NerdGraph Optimization**: Batch queries and efficient API usage  
- **Multiple Output Formats**: Console, JSON, HTML, and Markdown reports
- **Parallel Execution**: Configurable concurrency for faster execution
- **Retry Logic**: Automatic retries for failed queries
- **Health Scoring**: Comprehensive health score calculation
- **Progress Tracking**: Real-time progress with ETA
- **Smart Recommendations**: Actionable insights based on results
- **Cluster Filtering**: Filter results by specific cluster name
- **Time Range Support**: Configurable time ranges for all queries

## Quick Start

```bash
# Basic usage
./verify-kafka-metrics.js <API_KEY> <ACCOUNT_ID>

# With cluster filter
./verify-kafka-metrics.js <API_KEY> <ACCOUNT_ID> <CLUSTER_NAME>

# Using environment variables
NRAK_API_KEY=<KEY> ACC=<ID> ./verify-kafka-metrics.js

# Full configuration
NRAK_API_KEY=<KEY> \
ACC=<ID> \
CLUSTER_NAME=production \
TIME_RANGE="2 hours ago" \
OUTPUT_FORMAT=all \
CONCURRENCY=10 \
VERBOSE=true \
./verify-kafka-metrics.js
```

## Configuration Options

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NRAK_API_KEY` | New Relic API Key | Required |
| `ACC` | New Relic Account ID | Required |
| `CLUSTER_NAME` | Filter by cluster name | None |
| `TIME_RANGE` | NRQL time range | "1 hour ago" |
| `OUTPUT_FORMAT` | Output format(s) | "all" |
| `CONCURRENCY` | Parallel query limit | 5 |
| `MAX_RETRIES` | Retry attempts | 3 |
| `VERBOSE` | Detailed logging | false |
| `BATCH_SIZE` | Batch query size | 10 |
| `CATEGORIES` | Comma-separated categories | "all" |

### Output Formats

- `console` - Terminal output with color coding
- `json` - Detailed JSON report
- `html` - Interactive HTML report
- `markdown` - Markdown documentation
- `all` - Generate all formats

## Query Categories

1. **MSK Polling Data** - AWS MSK integration metrics
2. **Metric Streams Data** - CloudWatch Metric Streams
3. **Standard Kafka Integration** - Traditional Kafka metrics
4. **Data Quality** - Null values and data freshness
5. **Throughput Calculations** - Bytes/messages per second
6. **Entity Relationships** - Broker/topic relationships
7. **Health Metrics** - Cluster and broker health
8. **Time Series Data** - Chart-ready metrics
9. **Account Aggregation** - Multi-account summaries
10. **Performance Metrics** - Query performance checks
11. **Edge Cases** - Idle topics and stale data
12. **Top N Analysis** - Top topics by throughput
13. **Confluent Cloud Compatibility** - Common patterns
14. **Filter Validation** - Dynamic filter options
15. **Metric Calculations** - Aggregations and percentages
16. **Summary Verification** - Comprehensive checks
17. **Standard vs MSK Comparison** - Side-by-side analysis

## Health Scoring

The script calculates health scores across four dimensions:

- **Data Availability (40%)** - Critical data sources present
- **Metric Completeness (30%)** - Percentage of successful queries
- **Data Freshness (20%)** - Age of most recent data
- **Entity Relationships (10%)** - Valid entity connections

Overall score interpretation:
- 90%+ ✅ Excellent - All systems operational
- 70-89% ⚠️ Good - Minor issues detected
- <70% ❌ Poor - Significant problems found

## Example Reports

### Console Output
```
================================================================================
KAFKA METRICS VERIFICATION REPORT
================================================================================
Timestamp: 2024-01-10T15:30:00.000Z
Account ID: 1234567
Time Range: 1 hour ago
================================================================================

CATEGORY SUMMARY:
--------------------------------------------------------------------------------
✅ MSK Polling Data                    9/9 queries with data (100.0%)
⚠️  Metric Streams Data                3/5 queries with data (60.0%)
✅ Standard Kafka Integration          5/5 queries with data (100.0%)
...

HEALTH SCORES:
--------------------------------------------------------------------------------
Data Availability:    95.0% ✅
Metric Completeness:  88.5% ⚠️
Data Freshness:       100.0% ✅
Entity Relationships: 100.0% ✅
OVERALL SCORE:        94.6% ✅
```

### JSON Report Structure
```json
{
  "timestamp": "2024-01-10T15:30:00.000Z",
  "config": {
    "accountId": "1234567",
    "timeRange": "1 hour ago",
    "clusterName": "production"
  },
  "summary": {
    "totalQueries": 85,
    "successful": 82,
    "withData": 75,
    "failed": 3
  },
  "scores": {
    "dataAvailability": 95.0,
    "metricCompleteness": 88.5,
    "dataFreshness": 100.0,
    "entityRelationships": 100.0,
    "overall": 94.6
  },
  "recommendations": [...],
  "categories": {...},
  "details": [...]
}
```

## Troubleshooting

### No Data Found
- Verify MSK integration is configured
- Check if Metric Streams is enabled
- Ensure proper API permissions
- Verify time range contains data

### Authentication Errors
- Confirm API key has NRQL query permissions
- Verify account ID is correct
- Check API key hasn't expired

### Timeout Issues
- Reduce concurrency setting
- Use smaller time ranges
- Filter by specific cluster

### Performance Tips
- Use `CONCURRENCY=10` for faster execution
- Filter by cluster to reduce data volume
- Use specific categories instead of "all"
- Cache results with JSON output

## Advanced Usage

### Run Specific Categories
```bash
CATEGORIES="MSK Polling Data,Health Metrics" ./verify-kafka-metrics.js
```

### Custom Time Ranges
```bash
TIME_RANGE="6 hours ago" ./verify-kafka-metrics.js
TIME_RANGE="SINCE 1 day ago" ./verify-kafka-metrics.js
```

### CI/CD Integration
```bash
# Exit code based on health score
./verify-kafka-metrics.js || echo "Health check failed"

# Parse JSON output
node verify-kafka-metrics.js | jq '.scores.overall'
```

### Scheduled Monitoring
```bash
# Cron job for hourly checks
0 * * * * cd /path/to/script && ./verify-kafka-metrics.js >> /var/log/kafka-metrics.log 2>&1
```

## Exit Codes

- `0` - Overall health score >= 90%
- `1` - Overall health score < 90% or error occurred

## Requirements

- Node.js 12+
- New Relic API Key with NRQL permissions
- Network access to api.newrelic.com

## Security Notes

- Never commit API keys to version control
- Use environment variables for sensitive data
- Consider using secret management tools
- Rotate API keys regularly

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review METRICS_VERIFICATION_GUIDE.md
3. Enable verbose mode for detailed logs
4. Check New Relic API status