# Security and Credentials Management

## Overview

This project uses environment variables to manage sensitive credentials. All API keys, license keys, and other secrets should be stored in a `.env` file that is NOT committed to version control.

## Setup

1. **Create `.env` file**: Copy `env.example` to `.env` and fill in your actual values:
   ```bash
   cp env.example .env
   ```

2. **Edit `.env`**: Add your New Relic credentials:
   ```
   IKEY=your-license-key-here
   UKEY=your-user-api-key-here
   QKey=your-query-key-here
   ACC=your-account-id-here
   ```

3. **Setup Kubernetes secrets**: Run the setup script to create Kubernetes secrets from your `.env` file:
   ```bash
   ./setup-secrets.sh
   ```

## Important Security Notes

### ⚠️ Never Commit Secrets

- The `.env` file is listed in `.gitignore` and should NEVER be committed
- Do not hardcode API keys in YAML files, scripts, or source code
- Always use environment variables or Kubernetes secrets

### Files That Use Credentials

1. **Kubernetes Deployments**: Reference secrets via `secretKeyRef`
   - `minikube-consolidated/monitoring/04-daemonset-bundle.yaml`
   - Uses `newrelic-credentials` secret for license and user keys

2. **Verification Scripts**: Load credentials from `.env`
   - `verify-kafka-metrics.js`
   - `final-ui-check.sh`
   - `ultimate-verification-system/verify.js`

3. **ConfigMaps**: Should NOT contain actual credentials
   - Only configuration values like cluster names, regions, etc.

### Credential Types

- **License Key (IKEY)**: For data ingestion (starts with NRAL)
- **User API Key (UKEY)**: For API queries (starts with NRAK)
- **Query Key (QKey)**: For NRQL queries (starts with NRIQ)
- **Account ID (ACC)**: Your New Relic account number

### Best Practices

1. **Local Development**: Always use `.env` file
2. **CI/CD**: Use secure environment variables or secret management systems
3. **Production**: Use Kubernetes secrets or cloud provider secret managers
4. **Sharing**: Share the `env.example` file, never the actual `.env`

### Checking for Exposed Secrets

Run this command to check for any hardcoded secrets:
```bash
grep -r "NRAK-\|NRAL\|NRIQ-" . --exclude-dir=node_modules --exclude-dir=.git --exclude=.env
```

### If Secrets Are Exposed

1. **Immediately revoke** the exposed keys in New Relic
2. **Generate new keys**
3. **Update** your `.env` file
4. **Re-run** `./setup-secrets.sh`
5. **Restart** affected pods

## AWS Configuration

For MSK shim functionality, you may also need AWS configuration:
- Use proper 12-digit AWS account IDs (not New Relic account IDs)
- AWS credentials should be managed via IAM roles when possible
- For local testing, use mock AWS account ID: `123456789012`