# Troubleshooting Guide

> **Purpose**: Solutions for common issues  
> **Audience**: All users  
> **When to use**: When things aren't working as expected

## Common Issues

### No Entities Appearing in New Relic

**Symptoms**: Platform runs successfully but no MESSAGE_QUEUE entities appear

**Solutions**:
1. **Wait 2-3 minutes** - Entity synthesis takes time
2. **Check API credentials** - Verify User API Key, not Insert Key
3. **Verify account ID** - Must be numeric, check New Relic URL
4. **Test API access**:
   ```bash
   curl -H "Api-Key: $NEW_RELIC_USER_API_KEY" \
        "https://api.newrelic.com/graphql" \
        -d '{"query": "{ actor { user { email } } }"}'
   ```

### Platform Fails to Start

**Symptoms**: Error messages during platform startup

**Solutions**:
1. **Check Node.js version**: `node --version` (need 14+)
2. **Install dependencies**: `npm install`
3. **Verify environment variables**:
   ```bash
   echo "API Key: $NEW_RELIC_API_KEY"
   echo "Account: $NEW_RELIC_ACCOUNT_ID"
   ```

### Infrastructure Mode Issues

**Symptoms**: "No Kafka data found" or transformation errors

**Solutions**:
1. **Verify nri-kafka integration**:
   ```sql
   FROM KafkaBrokerSample SELECT count(*) SINCE 1 hour ago
   ```
2. **Check data account**: Ensure account ID matches where Kafka data reports
3. **Test infrastructure connection**: `node test-infra-connection.js`

For more help, see [Getting Started](../getting-started/README.md) or [Infrastructure Setup](../operations/infrastructure-setup.md).
