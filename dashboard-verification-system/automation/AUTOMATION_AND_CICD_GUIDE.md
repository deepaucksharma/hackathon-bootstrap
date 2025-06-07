# Automation and CI/CD Guide for Kafka UI Verification

This guide provides automation scripts and CI/CD pipelines for continuous verification of the Message Queues UI.

## Automated Verification Scripts

### 1. Continuous Monitoring Script

Save as `continuous-monitor.sh`:

```bash
#!/bin/bash

# continuous-monitor.sh - Run verification every 5 minutes and alert on failures

# Configuration
API_KEY="${NR_API_KEY}"
AWS_ACCOUNT="${AWS_ACCOUNT_ID}"
NR_ACCOUNT="${NR_ACCOUNT_ID}"
SLACK_WEBHOOK="${SLACK_WEBHOOK_URL}"
CHECK_INTERVAL=300  # 5 minutes

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Function to send Slack alert
send_slack_alert() {
    local status=$1
    local message=$2
    local color="#36a64f"  # green
    
    if [ "$status" = "FAIL" ]; then
        color="#ff0000"  # red
    elif [ "$status" = "WARN" ]; then
        color="#ffaa00"  # yellow
    fi
    
    curl -X POST -H 'Content-type: application/json' \
        --data "{
            \"attachments\": [{
                \"color\": \"$color\",
                \"title\": \"Kafka UI Verification $status\",
                \"text\": \"$message\",
                \"timestamp\": \"$(date +%s)\"
            }]
        }" \
        "$SLACK_WEBHOOK"
}

# Function to run verification
run_verification() {
    echo -e "${YELLOW}Running verification at $(date)${NC}"
    
    # Run the verification
    node /path/to/ultimate-verification-runner.js \
        --apiKey="$API_KEY" \
        --accountId="$AWS_ACCOUNT" \
        --nrAccountId="$NR_ACCOUNT" \
        --provider=awsMsk \
        > /tmp/verification-result.json 2>&1
    
    EXIT_CODE=$?
    
    # Parse results
    if [ $EXIT_CODE -eq 0 ]; then
        echo -e "${GREEN}✓ Verification PASSED${NC}"
        LAST_SUCCESS=$(date +%s)
    else
        echo -e "${RED}✗ Verification FAILED${NC}"
        
        # Extract failure details
        FAILURES=$(jq -r '.summary.failed' /tmp/verification-result.json 2>/dev/null || echo "Unknown")
        MESSAGE="Verification failed with $FAILURES test failures. Check logs for details."
        
        send_slack_alert "FAIL" "$MESSAGE"
    fi
    
    # Log to file
    echo "$(date +%Y-%m-%d_%H:%M:%S),${EXIT_CODE}" >> /var/log/kafka-ui-verification.log
}

# Main loop
echo "Starting continuous Kafka UI monitoring..."
echo "Checking every $CHECK_INTERVAL seconds"

while true; do
    run_verification
    sleep $CHECK_INTERVAL
done
```

### 2. Health Check Endpoint

Save as `health-check-server.js`:

```javascript
#!/usr/bin/env node

// health-check-server.js - HTTP endpoint for verification status

const http = require('http');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const PORT = process.env.PORT || 8080;
const API_KEY = process.env.NR_API_KEY;
const AWS_ACCOUNT = process.env.AWS_ACCOUNT_ID;
const NR_ACCOUNT = process.env.NR_ACCOUNT_ID;

let lastCheckResult = null;
let lastCheckTime = null;

async function runVerification() {
    try {
        const { stdout, stderr } = await execPromise(
            `node ultimate-verification-runner.js --apiKey=${API_KEY} --accountId=${AWS_ACCOUNT} --nrAccountId=${NR_ACCOUNT} --provider=awsMsk`
        );
        
        const result = JSON.parse(stdout);
        lastCheckResult = {
            status: result.summary.failed === 0 ? 'healthy' : 'unhealthy',
            passed: result.summary.passed,
            failed: result.summary.failed,
            total: result.summary.total,
            criticalPassed: result.summary.critical.passed,
            criticalTotal: result.summary.critical.total,
            timestamp: new Date().toISOString()
        };
        lastCheckTime = Date.now();
        
    } catch (error) {
        lastCheckResult = {
            status: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
        };
        lastCheckTime = Date.now();
    }
}

// Run verification every 5 minutes
setInterval(runVerification, 5 * 60 * 1000);
runVerification(); // Initial run

const server = http.createServer((req, res) => {
    if (req.url === '/health') {
        const response = {
            ...lastCheckResult,
            lastCheckAge: lastCheckTime ? Math.floor((Date.now() - lastCheckTime) / 1000) : null
        };
        
        const statusCode = response.status === 'healthy' ? 200 : 503;
        
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response, null, 2));
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

server.listen(PORT, () => {
    console.log(`Health check server running on port ${PORT}`);
    console.log(`Access health status at http://localhost:${PORT}/health`);
});
```

## CI/CD Pipeline Integration

### 1. GitHub Actions Workflow

Save as `.github/workflows/kafka-ui-verification.yml`:

```yaml
name: Kafka UI Verification

on:
  # Run on infrastructure changes
  push:
    paths:
      - 'infrastructure/kafka/**'
      - 'terraform/msk/**'
  
  # Run on schedule
  schedule:
    - cron: '0 */4 * * *'  # Every 4 hours
  
  # Allow manual trigger
  workflow_dispatch:

env:
  NR_API_KEY: ${{ secrets.NR_API_KEY }}
  AWS_ACCOUNT_ID: ${{ secrets.AWS_ACCOUNT_ID }}
  NR_ACCOUNT_ID: ${{ secrets.NR_ACCOUNT_ID }}

jobs:
  verify-staging:
    name: Verify Staging Environment
    runs-on: ubuntu-latest
    environment: staging
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: |
          cd ultimate-verification-system
          npm install
      
      - name: Run verification tests
        id: verification
        run: |
          node ultimate-verification-runner.js \
            --apiKey="${{ env.NR_API_KEY }}" \
            --accountId="${{ env.AWS_ACCOUNT_ID }}" \
            --nrAccountId="${{ env.NR_ACCOUNT_ID }}" \
            --provider=awsMsk \
            | tee verification-output.json
          
          # Extract summary for PR comment
          PASSED=$(jq -r '.summary.passed' verification-output.json)
          FAILED=$(jq -r '.summary.failed' verification-output.json)
          TOTAL=$(jq -r '.summary.total' verification-output.json)
          
          echo "passed=$PASSED" >> $GITHUB_OUTPUT
          echo "failed=$FAILED" >> $GITHUB_OUTPUT
          echo "total=$TOTAL" >> $GITHUB_OUTPUT
      
      - name: Upload verification report
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: verification-report-staging
          path: verification-output.json
      
      - name: Comment PR
        if: github.event_name == 'push'
        uses: actions/github-script@v6
        with:
          script: |
            const passed = ${{ steps.verification.outputs.passed }};
            const failed = ${{ steps.verification.outputs.failed }};
            const total = ${{ steps.verification.outputs.total }};
            
            const status = failed === 0 ? '✅' : '❌';
            const comment = `## Kafka UI Verification ${status}
            
            - **Passed**: ${passed}/${total}
            - **Failed**: ${failed}
            - **Environment**: Staging
            
            ${failed > 0 ? '⚠️ Please check the verification report for details.' : '✨ All tests passed!'}`;
            
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: comment
            });
      
      - name: Fail if tests failed
        if: steps.verification.outputs.failed != '0'
        run: exit 1

  verify-production:
    name: Verify Production Environment
    runs-on: ubuntu-latest
    needs: verify-staging
    environment: production
    if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Run production verification
        run: |
          node ultimate-verification-runner.js \
            --apiKey="${{ secrets.PROD_NR_API_KEY }}" \
            --accountId="${{ secrets.PROD_AWS_ACCOUNT_ID }}" \
            --nrAccountId="${{ secrets.PROD_NR_ACCOUNT_ID }}" \
            --provider=awsMsk
      
      - name: Send notification on failure
        if: failure()
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          text: 'Production Kafka UI verification failed!'
          webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

### 2. Jenkins Pipeline

Save as `Jenkinsfile`:

```groovy
pipeline {
    agent any
    
    environment {
        NR_API_KEY = credentials('nr-api-key')
        AWS_ACCOUNT_ID = credentials('aws-account-id')
        NR_ACCOUNT_ID = credentials('nr-account-id')
    }
    
    triggers {
        // Run every 6 hours
        cron('0 */6 * * *')
    }
    
    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }
        
        stage('Setup') {
            steps {
                sh '''
                    cd ultimate-verification-system
                    npm install
                '''
            }
        }
        
        stage('Verify Development') {
            steps {
                script {
                    def result = sh(
                        script: '''
                            node ultimate-verification-runner.js \
                                --apiKey="$NR_API_KEY" \
                                --accountId="$AWS_ACCOUNT_ID" \
                                --nrAccountId="$NR_ACCOUNT_ID" \
                                --provider=awsMsk
                        ''',
                        returnStatus: true
                    )
                    
                    if (result != 0) {
                        currentBuild.result = 'UNSTABLE'
                        error("Development verification failed")
                    }
                }
            }
        }
        
        stage('Verify Staging') {
            when {
                expression { currentBuild.result != 'UNSTABLE' }
            }
            steps {
                script {
                    withCredentials([
                        string(credentialsId: 'staging-nr-api-key', variable: 'STAGING_API_KEY'),
                        string(credentialsId: 'staging-aws-account', variable: 'STAGING_AWS_ACCOUNT')
                    ]) {
                        sh '''
                            node ultimate-verification-runner.js \
                                --apiKey="$STAGING_API_KEY" \
                                --accountId="$STAGING_AWS_ACCOUNT" \
                                --nrAccountId="$NR_ACCOUNT_ID" \
                                --provider=awsMsk
                        '''
                    }
                }
            }
        }
        
        stage('Generate Report') {
            steps {
                publishHTML([
                    allowMissing: false,
                    alwaysLinkToLastBuild: true,
                    keepAll: true,
                    reportDir: '.',
                    reportFiles: 'ultimate-verification-*.json',
                    reportName: 'Kafka UI Verification Report'
                ])
            }
        }
    }
    
    post {
        failure {
            emailext(
                subject: "Kafka UI Verification Failed - ${env.BUILD_NUMBER}",
                body: "The Kafka UI verification has failed. Please check the Jenkins logs for details.",
                to: "${env.TEAM_EMAIL}"
            )
            
            slackSend(
                color: 'danger',
                message: "Kafka UI Verification Failed :x: - ${env.BUILD_URL}"
            )
        }
        
        success {
            slackSend(
                color: 'good',
                message: "Kafka UI Verification Passed :white_check_mark:"
            )
        }
    }
}
```

### 3. GitLab CI Pipeline

Save as `.gitlab-ci.yml`:

```yaml
stages:
  - verify
  - report

variables:
  NR_API_KEY: $NR_API_KEY
  AWS_ACCOUNT_ID: $AWS_ACCOUNT_ID
  NR_ACCOUNT_ID: $NR_ACCOUNT_ID

.verification_template: &verification_template
  image: node:18
  before_script:
    - cd ultimate-verification-system
    - npm install
  artifacts:
    when: always
    paths:
      - ultimate-verification-*.json
    reports:
      junit: verification-junit.xml
    expire_in: 30 days

verify:development:
  <<: *verification_template
  stage: verify
  script:
    - |
      node ultimate-verification-runner.js \
        --apiKey="$NR_API_KEY" \
        --accountId="$AWS_ACCOUNT_ID" \
        --nrAccountId="$NR_ACCOUNT_ID" \
        --provider=awsMsk \
        --output=junit > verification-junit.xml
  only:
    - merge_requests
    - schedules

verify:staging:
  <<: *verification_template
  stage: verify
  script:
    - |
      node ultimate-verification-runner.js \
        --apiKey="$STAGING_NR_API_KEY" \
        --accountId="$STAGING_AWS_ACCOUNT_ID" \
        --nrAccountId="$STAGING_NR_ACCOUNT_ID" \
        --provider=awsMsk
  environment:
    name: staging
  only:
    - main
    - schedules

verify:production:
  <<: *verification_template
  stage: verify
  script:
    - |
      node ultimate-verification-runner.js \
        --apiKey="$PROD_NR_API_KEY" \
        --accountId="$PROD_AWS_ACCOUNT_ID" \
        --nrAccountId="$PROD_NR_ACCOUNT_ID" \
        --provider=awsMsk
  environment:
    name: production
  only:
    - schedules
  when: manual

generate_report:
  stage: report
  image: alpine:latest
  script:
    - apk add --no-cache jq
    - |
      for report in ultimate-verification-*.json; do
        echo "Processing $report"
        PASSED=$(jq -r '.summary.passed' $report)
        FAILED=$(jq -r '.summary.failed' $report)
        echo "Passed: $PASSED, Failed: $FAILED"
      done
  dependencies:
    - verify:development
    - verify:staging
  only:
    - schedules
```

## Automated Remediation Scripts

### 1. Auto-Fix Common Issues

Save as `auto-remediate.sh`:

```bash
#!/bin/bash

# auto-remediate.sh - Automatically fix common verification failures

API_KEY="$1"
NR_ACCOUNT="$2"
CLUSTER_NAME="$3"

echo "Running auto-remediation for cluster: $CLUSTER_NAME"

# Function to check and fix UI fields
fix_ui_fields() {
    echo "Checking UI visibility fields..."
    
    # Check current state
    RESULT=$(curl -s -X POST https://api.newrelic.com/graphql \
        -H "API-Key: $API_KEY" \
        -H "Content-Type: application/json" \
        -d '{
            "query": "query { actor { account(id: '$NR_ACCOUNT') { nrql(query: \"SELECT percentage(count(provider), count(*)) FROM AwsMskClusterSample WHERE entityName = '\''$CLUSTER_NAME'\'' SINCE 10 minutes ago\") { results } } } }"
        }' | jq -r '.data.actor.account.nrql.results[0]."percentage"')
    
    if [[ $(echo "$RESULT < 100" | bc -l) -eq 1 ]]; then
        echo "UI fields incomplete ($RESULT%). Attempting fix..."
        
        # Restart integration with correct env vars
        sudo systemctl stop newrelic-infra
        
        # Update config
        sudo sed -i 's/MSK_USE_DIMENSIONAL: false/MSK_USE_DIMENSIONAL: true/g' \
            /etc/newrelic-infra/integrations.d/kafka-config.yml
        
        # Ensure labels are set
        if ! grep -q "instrumentation.provider: aws" /etc/newrelic-infra/integrations.d/kafka-config.yml; then
            echo "Adding missing labels..."
            # Add labels section
        fi
        
        sudo systemctl start newrelic-infra
        echo "Integration restarted. Waiting for data..."
        sleep 180
        
        return 0
    else
        echo "UI fields OK"
        return 1
    fi
}

# Function to check and fix data freshness
fix_data_freshness() {
    echo "Checking data freshness..."
    
    # Implementation for restarting stale integration
    FRESHNESS=$(curl -s -X POST https://api.newrelic.com/graphql \
        -H "API-Key: $API_KEY" \
        -H "Content-Type: application/json" \
        -d '{
            "query": "query { actor { account(id: '$NR_ACCOUNT') { nrql(query: \"SELECT (now() - max(timestamp))/1000/60 FROM AwsMskClusterSample WHERE entityName = '\''$CLUSTER_NAME'\'' SINCE 1 hour ago\") { results } } } }"
        }' | jq -r '.data.actor.account.nrql.results[0]."(now() - max(timestamp))/1000/60"')
    
    if [[ $(echo "$FRESHNESS > 10" | bc -l) -eq 1 ]]; then
        echo "Data is stale (${FRESHNESS} minutes old). Restarting integration..."
        sudo systemctl restart newrelic-infra
        return 0
    else
        echo "Data freshness OK"
        return 1
    fi
}

# Run fixes
FIXED=0

fix_ui_fields && FIXED=$((FIXED + 1))
fix_data_freshness && FIXED=$((FIXED + 1))

if [ $FIXED -gt 0 ]; then
    echo "Applied $FIXED fixes. Re-running verification in 5 minutes..."
    sleep 300
    
    # Re-run verification
    node ultimate-verification-runner.js \
        --apiKey="$API_KEY" \
        --accountId="$AWS_ACCOUNT_ID" \
        --nrAccountId="$NR_ACCOUNT" \
        --provider=awsMsk
else
    echo "No automated fixes needed"
fi
```

### 2. Terraform Integration

Save as `terraform/kafka-monitoring.tf`:

```hcl
# terraform/kafka-monitoring.tf

resource "null_resource" "verify_kafka_ui" {
  # Trigger verification after Kafka changes
  triggers = {
    cluster_id = aws_msk_cluster.main.id
    integration_version = var.nri_kafka_version
  }
  
  provisioner "local-exec" {
    command = <<-EOT
      # Wait for cluster to be ready
      sleep 300
      
      # Run verification
      node ${path.module}/../ultimate-verification-system/ultimate-verification-runner.js \
        --apiKey="${var.nr_api_key}" \
        --accountId="${data.aws_caller_identity.current.account_id}" \
        --nrAccountId="${var.nr_account_id}" \
        --provider=awsMsk
      
      # Store result
      if [ $? -eq 0 ]; then
        echo "Kafka UI verification passed" > ${path.module}/verification-status.txt
      else
        echo "Kafka UI verification failed" > ${path.module}/verification-status.txt
        exit 1
      fi
    EOT
    
    environment = {
      NR_API_KEY = var.nr_api_key
      AWS_ACCOUNT_ID = data.aws_caller_identity.current.account_id
    }
  }
}

# Output verification status
output "kafka_ui_verification_status" {
  value = file("${path.module}/verification-status.txt")
  depends_on = [null_resource.verify_kafka_ui]
}
```

## Monitoring Dashboard as Code

### New Relic Dashboard JSON

Save as `dashboards/kafka-ui-verification-dashboard.json`:

```json
{
  "name": "Kafka UI Verification Status",
  "description": "Monitor the health of Kafka UI data pipeline",
  "permissions": "PUBLIC_READ_WRITE",
  "pages": [
    {
      "name": "Overview",
      "description": null,
      "widgets": [
        {
          "title": "Verification Status",
          "layout": {
            "column": 1,
            "row": 1,
            "width": 4,
            "height": 3
          },
          "visualization": {
            "id": "viz.billboard"
          },
          "rawConfiguration": {
            "nrqlQueries": [
              {
                "accountId": YOUR_ACCOUNT_ID,
                "query": "FROM Log SELECT latest(CASE WHEN message LIKE '%SYSTEM READY%' THEN 'READY' ELSE 'NOT READY' END) as 'Status' WHERE message LIKE '%Kafka UI Verification%' SINCE 1 hour ago"
              }
            ]
          }
        },
        {
          "title": "UI Fields Completeness",
          "layout": {
            "column": 5,
            "row": 1,
            "width": 4,
            "height": 3
          },
          "visualization": {
            "id": "viz.line"
          },
          "rawConfiguration": {
            "nrqlQueries": [
              {
                "accountId": YOUR_ACCOUNT_ID,
                "query": "SELECT percentage(count(provider), count(*)) as 'Provider %', percentage(count(awsAccountId), count(*)) as 'Account %', percentage(count(instrumentation.provider), count(*)) as 'Instrumentation %' FROM AwsMskClusterSample TIMESERIES 5 minutes SINCE 1 hour ago"
              }
            ]
          }
        },
        {
          "title": "Data Freshness",
          "layout": {
            "column": 9,
            "row": 1,
            "width": 4,
            "height": 3
          },
          "visualization": {
            "id": "viz.line"
          },
          "rawConfiguration": {
            "nrqlQueries": [
              {
                "accountId": YOUR_ACCOUNT_ID,
                "query": "SELECT (now() - max(timestamp))/1000/60 as 'Minutes Since Update' FROM AwsMskClusterSample TIMESERIES 5 minutes SINCE 1 hour ago"
              }
            ],
            "thresholds": [
              {
                "value": 10,
                "severity": "WARNING"
              }
            ]
          }
        }
      ]
    }
  ]
}
```

## Scheduled Reports

### Email Report Script

Save as `send-verification-report.js`:

```javascript
#!/usr/bin/env node

const nodemailer = require('nodemailer');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function generateReport() {
    // Run verification
    const { stdout } = await execPromise(
        `node ultimate-verification-runner.js --apiKey=${process.env.NR_API_KEY} --accountId=${process.env.AWS_ACCOUNT_ID} --nrAccountId=${process.env.NR_ACCOUNT_ID} --provider=awsMsk`
    );
    
    const results = JSON.parse(stdout);
    
    // Generate HTML report
    const html = `
        <h2>Kafka UI Verification Report</h2>
        <p>Generated: ${new Date().toISOString()}</p>
        
        <h3>Summary</h3>
        <ul>
            <li>Total Tests: ${results.summary.total}</li>
            <li>Passed: ${results.summary.passed}</li>
            <li>Failed: ${results.summary.failed}</li>
            <li>Critical Tests: ${results.summary.critical.passed}/${results.summary.critical.total}</li>
        </ul>
        
        <h3>Status: ${results.summary.failed === 0 ? '✅ PASS' : '❌ FAIL'}</h3>
        
        ${results.summary.failed > 0 ? `
            <h3>Failed Tests</h3>
            <ul>
                ${Object.entries(results.suites).map(([suite, data]) => 
                    data.tests.filter(t => !t.passed).map(t => 
                        `<li>${suite} - ${t.name}: ${t.message}</li>`
                    ).join('')
                ).join('')}
            </ul>
        ` : ''}
    `;
    
    return { html, passed: results.summary.failed === 0 };
}

async function sendEmail(html, passed) {
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
    
    await transporter.sendMail({
        from: 'kafka-monitoring@company.com',
        to: process.env.REPORT_RECIPIENTS,
        subject: `Kafka UI Verification ${passed ? 'PASSED' : 'FAILED'} - ${new Date().toLocaleDateString()}`,
        html: html
    });
}

// Run and send
generateReport()
    .then(({ html, passed }) => sendEmail(html, passed))
    .then(() => console.log('Report sent successfully'))
    .catch(err => console.error('Failed to send report:', err));
```

## Integration with Monitoring Tools

### 1. Datadog Integration

```python
# datadog_verification_check.py
from datadog_checks.base import AgentCheck

class KafkaUIVerificationCheck(AgentCheck):
    def check(self, instance):
        import subprocess
        import json
        
        # Run verification
        result = subprocess.run([
            'node', '/path/to/ultimate-verification-runner.js',
            '--apiKey=' + instance['nr_api_key'],
            '--accountId=' + instance['aws_account_id'],
            '--nrAccountId=' + instance['nr_account_id'],
            '--provider=awsMsk'
        ], capture_output=True, text=True)
        
        if result.returncode == 0:
            data = json.loads(result.stdout)
            
            # Send metrics
            self.gauge('kafka.ui.verification.passed', data['summary']['passed'])
            self.gauge('kafka.ui.verification.failed', data['summary']['failed'])
            self.gauge('kafka.ui.verification.critical.passed', data['summary']['critical']['passed'])
            
            # Send service check
            if data['summary']['failed'] == 0:
                self.service_check('kafka.ui.verification', AgentCheck.OK)
            else:
                self.service_check('kafka.ui.verification', AgentCheck.CRITICAL)
```

### 2. Prometheus Exporter

```javascript
// prometheus-exporter.js
const express = require('express');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const app = express();
const port = 9090;

app.get('/metrics', async (req, res) => {
    try {
        const { stdout } = await execPromise(
            `node ultimate-verification-runner.js --apiKey=${process.env.NR_API_KEY} --accountId=${process.env.AWS_ACCOUNT_ID} --nrAccountId=${process.env.NR_ACCOUNT_ID} --provider=awsMsk`
        );
        
        const results = JSON.parse(stdout);
        
        const metrics = `
# HELP kafka_ui_verification_total Total number of verification tests
# TYPE kafka_ui_verification_total gauge
kafka_ui_verification_total ${results.summary.total}

# HELP kafka_ui_verification_passed Number of passed tests
# TYPE kafka_ui_verification_passed gauge
kafka_ui_verification_passed ${results.summary.passed}

# HELP kafka_ui_verification_failed Number of failed tests
# TYPE kafka_ui_verification_failed gauge
kafka_ui_verification_failed ${results.summary.failed}

# HELP kafka_ui_verification_critical_passed Number of critical tests passed
# TYPE kafka_ui_verification_critical_passed gauge
kafka_ui_verification_critical_passed ${results.summary.critical.passed}

# HELP kafka_ui_verification_status Overall verification status
# TYPE kafka_ui_verification_status gauge
kafka_ui_verification_status ${results.summary.failed === 0 ? 1 : 0}
`;
        
        res.set('Content-Type', 'text/plain');
        res.send(metrics);
    } catch (error) {
        res.status(500).send(`# Error: ${error.message}`);
    }
});

app.listen(port, () => {
    console.log(`Prometheus exporter listening on port ${port}`);
});
```

This comprehensive automation guide provides everything needed to continuously verify and monitor the Kafka UI data pipeline in production environments.