# Fix UI Visibility for Account 3630072

## Root Cause
The Message Queues UI requires **real AWS account mapping**, not mock data. Your account is sending mock AWS data while working accounts have real AWS integration.

## Key Differences Found:

| Field | Your Account (3630072) | Working Accounts | Issue |
|-------|------------------------|------------------|-------|
| awsAccountId | "3630072" | "463657938898" | Using NR account ID instead of AWS ID |
| providerExternalId | MISSING | "463657938898" | Required for AWS account mapping |
| provider.clusterArn | Fake ARN | Real ARN | UI validates ARN format |
| entity.type | MISSING | MISSING | Both missing but UI might synthesize |

## Fix Implementation

### Option 1: Use Real AWS Account ID (Recommended)

Update your MSK shim to use a real AWS account ID:

```go
// In shim.go or transformer
const (
    // Use a real AWS account ID (12 digits)
    DEFAULT_AWS_ACCOUNT_ID = "123456789012" // Change to your real AWS account
    DEFAULT_AWS_REGION = "us-east-1"
)

func (s *Shim) Transform() {
    sample := &types.AwsMskClusterSample{
        EventType: "AwsMskClusterSample",
        Provider: "AwsMskCluster",
        
        // Critical fields for UI visibility
        AwsAccountId: os.Getenv("AWS_ACCOUNT_ID"), // Use real AWS account
        AwsRegion: os.Getenv("AWS_REGION"),
        
        // Add missing field
        ProviderExternalId: os.Getenv("AWS_ACCOUNT_ID"), // Same as awsAccountId
        
        // Fix ARN format
        ClusterArn: fmt.Sprintf("arn:aws:kafka:%s:%s:cluster/%s/%s",
            awsRegion,
            awsAccountId,
            clusterName,
            uuid.New().String(),
        ),
    }
}
```

### Option 2: Environment Variable Configuration

Add these to your Kubernetes deployment:

```yaml
env:
  - name: AWS_ACCOUNT_ID
    value: "123456789012"  # Use a real AWS account ID
  - name: AWS_REGION
    value: "us-east-1"
  - name: MSK_USE_DIMENSIONAL
    value: "true"
```

### Option 3: Update ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: infrastructure-config
  namespace: newrelic
data:
  kafka-config.yml: |
    integrations:
      - name: nri-kafka
        env:
          CLUSTER_NAME: minikube-kafka
          AWS_ACCOUNT_ID: "123456789012"  # Real AWS account ID
          AWS_REGION: "us-east-1"
          
          # Map to AWS account in New Relic
          PROVIDER_EXTERNAL_ID: "123456789012"
          
          # Enable dimensional metrics
          MSK_USE_DIMENSIONAL: "true"
          NRI_KAFKA_USE_DIMENSIONAL: "true"
```

### Option 4: Code Fix in MSK Shim

```go
// In msk/shim.go
func (s *MSKShim) createClusterSample(stats *broker.BrokerStats) map[string]interface{} {
    awsAccountId := os.Getenv("AWS_ACCOUNT_ID")
    if awsAccountId == "" {
        // Don't use New Relic account ID!
        awsAccountId = "123456789012" // Default real AWS account
    }
    
    return map[string]interface{}{
        "event_type": "AwsMskClusterSample",
        "provider": "AwsMskCluster",
        "entityName": s.ClusterName,
        
        // Required AWS fields
        "awsAccountId": awsAccountId,
        "awsRegion": s.getAWSRegion(),
        "providerExternalId": awsAccountId, // ADD THIS!
        
        // Fix ARN to be valid
        "provider.clusterArn": fmt.Sprintf(
            "arn:aws:kafka:%s:%s:cluster/%s/%s",
            s.getAWSRegion(),
            awsAccountId,
            s.ClusterName,
            s.generateClusterUUID(),
        ),
        
        // Add entity type (uppercase)
        "entity.type": "AWS_KAFKA_CLUSTER",
        
        // Rest of metrics...
    }
}
```

## Testing the Fix

1. **Update the code with real AWS account ID**
2. **Rebuild nri-kafka binary**
3. **Deploy to Kubernetes**
4. **Wait 5 minutes for data**
5. **Verify with this query:**

```sql
FROM AwsMskClusterSample 
SELECT 
  latest(awsAccountId) as 'AWS Account',
  latest(providerExternalId) as 'External ID',
  latest(provider.clusterArn) as 'ARN'
WHERE nr.accountId = 3630072
SINCE 5 minutes ago
```

Expected output:
```
AWS Account: "123456789012"  (12-digit AWS account)
External ID: "123456789012"  (same as AWS account)
ARN: "arn:aws:kafka:us-east-1:123456789012:cluster/..."
```

## Why This Works

The New Relic UI for Message Queues:
1. **Validates AWS account IDs** - Must be 12-digit numbers
2. **Requires providerExternalId** - Links to AWS account in NR
3. **Checks ARN format** - Must be valid AWS ARN
4. **Uses AWS entity synthesis** - Creates entities based on AWS metadata

Your current implementation uses mock data (NR account ID as AWS account ID) which the UI rejects.

## Quick Test

Try this hardcoded fix first:

```bash
# SSH to your infrastructure pod
kubectl exec -it -n newrelic <pod> -- /bin/sh

# Set environment variables
export AWS_ACCOUNT_ID="123456789012"
export AWS_REGION="us-east-1"

# Run nri-kafka manually
/var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka \
  --cluster_name="test" \
  --dry_run \
  --pretty
```

Look for:
- awsAccountId: "123456789012" (not "3630072")
- providerExternalId: "123456789012"
- Valid ARN format