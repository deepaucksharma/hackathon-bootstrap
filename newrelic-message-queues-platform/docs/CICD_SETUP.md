# CI/CD Pipeline Setup

This document describes the CI/CD pipeline configuration for the New Relic Message Queues Platform.

## Pipeline Overview

The platform includes comprehensive CI/CD pipelines for:

- **GitHub Actions** (`.github/workflows/`)
- **GitLab CI/CD** (`.gitlab-ci.yml`)
- **Jenkins** (`Jenkinsfile`)

## Pipeline Stages

### 1. Validation
- Code linting (ESLint)
- Security linting (ESLint security rules)
- Helm chart validation
- Kubernetes manifest validation
- Dependency license checking

### 2. Testing
- Unit tests with coverage reporting
- Integration tests with real Kafka instance
- End-to-end testing of Docker container

### 3. Security Scanning
- Dependency vulnerability scanning (npm audit, Snyk)
- Container image scanning (Trivy)
- Secret detection (Gitleaks)
- Kubernetes security validation (Polaris, Kubesec)
- License compliance checking

### 4. Build and Package
- Docker image building and pushing
- Multi-architecture support (AMD64, ARM64)
- Helm chart packaging
- Artifact publishing

### 5. Deployment
- Staging environment deployment
- Production deployment (manual approval)
- Smoke testing and health checks
- Rollback capabilities

## GitHub Actions Setup

### Required Secrets

#### New Relic Configuration
```bash
# Test environment
TEST_NR_ACCOUNT_ID=your_test_account_id
TEST_NR_API_KEY=your_test_api_key
TEST_NR_INGEST_KEY=your_test_ingest_key

# Staging environment
STAGING_NR_ACCOUNT_ID=your_staging_account_id
STAGING_NR_API_KEY=your_staging_api_key
STAGING_NR_INGEST_KEY=your_staging_ingest_key

# Production environment
PROD_NR_ACCOUNT_ID=your_prod_account_id
PROD_NR_API_KEY=your_prod_api_key
PROD_NR_INGEST_KEY=your_prod_ingest_key
```

#### Kubernetes Configuration
```bash
# Base64 encoded kubeconfig files
STAGING_KUBECONFIG=base64_encoded_staging_kubeconfig
PRODUCTION_KUBECONFIG=base64_encoded_production_kubeconfig
```

#### External Services
```bash
# Security scanning
SNYK_TOKEN=your_snyk_token
CODECOV_TOKEN=your_codecov_token
SONAR_TOKEN=your_sonar_token

# Notifications
SLACK_WEBHOOK=your_slack_webhook_url
```

### Workflow Files

#### `ci.yml` - Continuous Integration
- Runs on every push and pull request
- Validates code quality and security
- Runs comprehensive test suite
- Validates Kubernetes manifests

#### `cd.yml` - Continuous Deployment
- Builds and pushes Docker images
- Deploys to staging on main branch
- Deploys to production on release tags
- Includes smoke testing and notifications

#### `security.yml` - Security Scanning
- Daily security scans
- Dependency vulnerability scanning
- Container and code security validation
- License compliance checking

## GitLab CI/CD Setup

### Required Variables

#### Project Variables
```bash
# Container Registry
CI_REGISTRY=your-gitlab-registry.com
CI_REGISTRY_USER=gitlab-ci-token
CI_REGISTRY_PASSWORD=$CI_JOB_TOKEN

# New Relic Configuration
STAGING_NR_ACCOUNT_ID=your_staging_account_id
STAGING_NR_API_KEY=your_staging_api_key
STAGING_NR_INGEST_KEY=your_staging_ingest_key

PROD_NR_ACCOUNT_ID=your_prod_account_id
PROD_NR_API_KEY=your_prod_api_key
PROD_NR_INGEST_KEY=your_prod_ingest_key

# Kubernetes
STAGING_KUBECONFIG=base64_encoded_staging_kubeconfig
PRODUCTION_KUBECONFIG=base64_encoded_production_kubeconfig
```

#### Group/Global Variables
```bash
# Security scanning
SNYK_TOKEN=your_snyk_token

# Notifications
SLACK_WEBHOOK=your_slack_webhook_url
```

### Pipeline Configuration

The GitLab pipeline includes:
- Parallel execution for efficiency
- Caching for faster builds
- Security scanning with SAST reports
- Manual deployment gates
- Environment-specific configurations

## Jenkins Setup

### Prerequisites

#### Required Plugins
```bash
# Essential plugins
Pipeline
Docker Pipeline
Kubernetes
Helm
NodeJS
Coverage
HTML Publisher
Email Extension
Slack Notification

# Security plugins
OWASP Dependency Check
Checkmarx
Aqua Security Scanner
```

#### Global Tool Configuration
```bash
# NodeJS installations
NodeJS 18 (name: 18)

# Docker
Docker (name: docker)

# Helm
Helm 3.12.0 (name: helm)
```

### Required Credentials

#### Kubernetes
```bash
# Credential ID: kubeconfig
# Type: Secret file
# File: kubeconfig file for cluster access
```

#### Docker Registry
```bash
# Credential ID: docker-registry-credentials
# Type: Username with password
# Username: registry username
# Password: registry password/token
```

#### New Relic
```bash
# Test environment
test-nr-account-id (Secret text)
test-nr-api-key (Secret text)
test-nr-ingest-key (Secret text)

# Staging environment
staging-nr-account-id (Secret text)
staging-nr-api-key (Secret text)
staging-nr-ingest-key (Secret text)

# Production environment
prod-nr-account-id (Secret text)
prod-nr-api-key (Secret text)
prod-nr-ingest-key (Secret text)
```

### Pipeline Features

- Parallel execution for quality gates
- Integration with SonarQube
- Docker-in-Docker for container testing
- Manual approval for production deployments
- Comprehensive notifications
- Artifact archiving

## Local Development

### Pre-commit Hooks

Install pre-commit hooks to ensure code quality:

```bash
# Install pre-commit
npm install -g @commitlint/cli @commitlint/config-conventional

# Install husky
npm install --save-dev husky

# Setup hooks
npx husky install
npx husky add .husky/pre-commit "npm run lint && npm run test"
npx husky add .husky/commit-msg "npx --no -- commitlint --edit ${1}"
```

### Testing Pipeline Locally

#### Using Act (GitHub Actions)
```bash
# Install act
brew install act  # macOS
# or
curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash

# Run CI workflow
act push --secret-file .secrets

# Run specific job
act push -j unit-tests
```

#### Using Docker
```bash
# Test Docker build
docker build -t test-image .

# Test container
docker run --rm \
  -e NEW_RELIC_ACCOUNT_ID=test \
  -e NEW_RELIC_API_KEY=test \
  -e NEW_RELIC_INGEST_KEY=test \
  -e MODE=simulation \
  -e DURATION=30 \
  test-image
```

#### Using Helm
```bash
# Lint chart
helm lint helm/message-queues-platform

# Template and validate
helm template test-release helm/message-queues-platform \
  --set secrets.newrelic.accountId=test \
  --set secrets.newrelic.apiKey=test \
  --set secrets.newrelic.ingestKey=test \
  --dry-run --debug
```

## Security Configuration

### SAST (Static Application Security Testing)

#### ESLint Security Rules
```javascript
// .eslintrc.security.js
module.exports = {
  extends: ["plugin:security/recommended"],
  plugins: ["security"],
  rules: {
    "security/detect-object-injection": "warn",
    "security/detect-non-literal-require": "warn",
    // ... additional rules
  }
};
```

#### Container Security

```yaml
# .polaris.yaml
checks:
  runAsNonRoot: warning
  runAsUser: warning
  readOnlyRootFilesystem: warning
  allowPrivilegeEscalation: danger
```

### Dependency Management

#### Allowed Licenses
```bash
MIT
ISC
Apache-2.0
BSD
BSD-2-Clause
BSD-3-Clause
CC0-1.0
Unlicense
```

#### Security Scanning
- npm audit for Node.js dependencies
- Snyk for comprehensive vulnerability scanning
- Trivy for container image scanning
- Gitleaks for secret detection

## Monitoring and Notifications

### Pipeline Metrics

#### GitHub Actions
- Workflow run duration
- Success/failure rates
- Security scan results
- Test coverage trends

#### GitLab CI/CD
- Pipeline duration and efficiency
- Parallel job execution
- Cache hit rates
- Deployment frequency

#### Jenkins
- Build duration trends
- Plugin performance
- Resource utilization
- Queue analysis

### Notifications

#### Slack Integration
```yaml
# Slack notification format
channels:
  - #deployments (deployment status)
  - #security (security scan results)
  - #development (build failures)
```

#### Email Notifications
- Build failures
- Security vulnerabilities
- Deployment confirmations
- Weekly summary reports

## Troubleshooting

### Common Issues

#### Docker Build Failures
```bash
# Check Docker daemon
docker info

# Clean up build cache
docker system prune -f

# Check available disk space
df -h
```

#### Kubernetes Deployment Issues
```bash
# Check cluster connectivity
kubectl cluster-info

# Verify RBAC permissions
kubectl auth can-i create deployments --namespace staging

# Check resource quotas
kubectl describe quota --namespace staging
```

#### Test Failures
```bash
# Run tests locally
npm test

# Check test environment variables
env | grep NEW_RELIC

# Verify Kafka connectivity
telnet kafka 9092
```

### Pipeline Debugging

#### GitHub Actions
```bash
# Enable debug logging
ACTIONS_STEP_DEBUG=true
ACTIONS_RUNNER_DEBUG=true
```

#### GitLab CI/CD
```yaml
# Add debug variables
variables:
  CI_DEBUG_TRACE: "true"
```

#### Jenkins
```groovy
// Add pipeline debugging
pipeline {
    options {
        timestamps()
        timeout(time: 1, unit: 'HOURS')
    }
}
```

## Best Practices

### Pipeline Optimization

1. **Parallel Execution**: Run independent jobs in parallel
2. **Caching**: Cache dependencies and build artifacts
3. **Early Failure**: Fail fast on critical issues
4. **Resource Management**: Use appropriate resource limits
5. **Secrets Management**: Store secrets securely

### Security Best Practices

1. **Least Privilege**: Grant minimal required permissions
2. **Secret Rotation**: Regularly rotate API keys and tokens
3. **Vulnerability Scanning**: Scan all dependencies and images
4. **Code Signing**: Sign container images and Helm charts
5. **Audit Logging**: Log all deployment activities

### Maintenance

1. **Regular Updates**: Keep pipeline tools and dependencies updated
2. **Performance Monitoring**: Monitor pipeline performance metrics
3. **Backup Strategy**: Backup pipeline configurations and secrets
4. **Documentation**: Keep documentation current with changes
5. **Testing**: Test pipeline changes in isolated environments

## Support

For pipeline issues and questions:

- [GitHub Issues](https://github.com/your-org/newrelic-message-queues-platform/issues)
- [Internal Wiki](https://wiki.example.com/message-queues-platform)
- [DevOps Team](mailto:devops@example.com)