# Operations Guide

This guide consolidates all procedures for setting up, running, testing, and managing the New Relic Message Queues Platform V2.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Initial Setup](#initial-setup)
- [Running the Platform](#running-the-platform)
- [Testing](#testing)
- [Building & Deployment](#building--deployment)
- [Monitoring & Health](#monitoring--health)
- [Troubleshooting](#troubleshooting)

## Prerequisites

- **Node.js**: 18.0 or higher
- **npm**: 8.0 or higher
- **New Relic Account**: With appropriate API keys
- **Optional**: Minikube/Docker for infrastructure mode

## Initial Setup

### 1. Clone and Install

```bash
git clone <repository>
cd newrelic-message-queues-platform-v2
npm install
```

### 2. Configure Credentials

#### Option A: Interactive Setup (Recommended)
```bash
./setup-credentials.sh
```
This will guide you through:
- Getting your New Relic Account ID
- Creating an Ingest API Key
- Creating a User API Key (for dashboards)
- Testing the credentials

#### Option B: Manual Setup
```bash
cp .env.example .env
# Edit .env with your credentials:
# - NEW_RELIC_ACCOUNT_ID
# - NEW_RELIC_API_KEY (Ingest key starting with NRAK-)
# - NEW_RELIC_USER_API_KEY (User key for dashboards)
```

### 3. Quick Verification

```bash
# Test setup with simulation mode
./test-simulation.sh
```

## Running the Platform

### 🚀 Quick Start

```bash
# Easiest way - interactive setup and run
./setup-and-run.sh
```

### 📊 Running Modes

#### 1. Simulation Mode (Default)
Generates synthetic data for testing without infrastructure.

```bash
# Using npm scripts
npm run dev

# Using unified runner (recommended)
node run-platform-unified.js --mode simulation

# Using shell script
./setup-and-run.sh  # Choose option 1
```

#### 2. Infrastructure Mode
Collects real data from Kafka clusters via nri-kafka.

```bash
# First, verify Kafka data is available
node check-nri-kafka-data.js

# Run in infrastructure mode
npm run dev  # with PLATFORM_MODE=infrastructure in .env

# Using unified runner
node run-platform-unified.js --mode infrastructure

# Using dedicated script
./run-infrastructure-mode.sh
```

#### 3. Development Mode
With hot reload for active development.

```bash
# TypeScript with watch mode
npm run dev

# With debugger
npm run dev:debug
```

### 🎛️ Command Line Options

```bash
node run-platform-unified.js [options]

Options:
  --mode <mode>          Platform mode (simulation|infrastructure)
  --interval <seconds>   Collection interval (default: 30)
  --duration <minutes>   Run duration (default: continuous)
  --provider <provider>  Message queue provider (kafka|rabbitmq|sqs)
  --debug               Enable debug logging
  --no-dashboards       Skip dashboard generation
  --no-continuous       Run once and exit
```

### 📋 Available NPM Scripts

```bash
# Development
npm run dev              # Run with hot reload
npm run dev:debug        # Run with debugger

# Production
npm run build           # Build TypeScript
npm run start           # Start production server
npm run start:prod      # Start with production env

# Testing
npm test                # Run all tests
npm run test:unit       # Unit tests only
npm run test:integration # Integration tests
npm run test:e2e        # End-to-end tests
npm run test:coverage   # With coverage report

# Code Quality
npm run lint            # Check code style
npm run lint:fix        # Fix code style issues
npm run format          # Format code with Prettier

# Documentation
npm run docs:generate   # Generate API documentation
```

## Testing

### 🧪 Quick Test

```bash
# Test simulation mode (30 seconds)
./test-simulation.sh
```

### 🔍 Comprehensive Testing

```bash
# Test all modes and features
./test-all-modes.sh
```

This script will:
1. Verify TypeScript compilation
2. Test simulation mode
3. Test infrastructure mode (if available)
4. Test the unified runner
5. Verify entities in New Relic

### 📊 Unit Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode for development
npm test -- --watch
```

## Building & Deployment

### 🏗️ Development Build

```bash
npm run build
```

This will:
- Compile TypeScript to JavaScript
- Copy configuration files
- Copy documentation assets

### 🚀 Production Deployment

```bash
# Build for production
npm run build

# Run in production mode
NODE_ENV=production npm run start:prod
```

### 🐳 Docker Deployment

From the parent directory:
```bash
docker-compose up -d
```

## Monitoring & Health

### 📊 Health Checks

```bash
# Check platform health
curl http://localhost:3000/health

# Get metrics
curl http://localhost:3000/metrics
```

### 🔍 Verify Entity Creation

```bash
# Check if entities are being created
node check-entities.js

# View latest pipeline report
cat pipeline-reports/LATEST_PIPELINE_REPORT.md
```

### 📈 Dashboard Management

```bash
# Create dashboard via CLI
node dist/dashboards/cli/dashboard-cli.js create \
  --name "Kafka Monitoring" \
  --account $NEW_RELIC_ACCOUNT_ID

# Update existing dashboard
node dist/dashboards/cli/dashboard-cli.js update \
  --dashboard-id <id> \
  --config dashboards/configs/kafka-dashboard.json
```

## Troubleshooting

### Common Issues

#### 1. No Data in New Relic
```bash
# Check if platform is running
curl http://localhost:3000/health

# Verify credentials
./setup-credentials.sh

# Check for errors in logs
npm run dev -- --debug
```

#### 2. TypeScript Errors
```bash
# Clean and rebuild
rm -rf dist/
npm run build
```

#### 3. Infrastructure Mode Not Working
```bash
# Verify Kafka data exists
node check-nri-kafka-data.js

# Check Minikube status
minikube status

# Verify nri-kafka is installed
kubectl get pods -n newrelic
```

### 📝 Debug Mode

Enable detailed logging:
```bash
# Via environment variable
DEBUG=* npm run dev

# Via command line
node run-platform-unified.js --debug
```

### 🔧 Reset Everything

```bash
# Clean all generated files
rm -rf dist/ node_modules/ pipeline-reports/

# Reinstall and rebuild
npm install
npm run build

# Start fresh
./setup-and-run.sh
```

## Environment Variables

### Required
- `NEW_RELIC_ACCOUNT_ID` - Your New Relic account ID
- `NEW_RELIC_API_KEY` - Ingest API key (NRAK-...)
- `NEW_RELIC_USER_API_KEY` - User API key for dashboards

### Optional
- `PLATFORM_MODE` - `simulation` or `infrastructure` (default: simulation)
- `PLATFORM_INTERVAL` - Collection interval in seconds (default: 30)
- `PLATFORM_PROVIDER` - Message queue provider (default: kafka)
- `NODE_ENV` - `development` or `production`
- `PORT` - HTTP server port (default: 3000)
- `DEBUG` - Enable debug logging

## Quick Reference

```bash
# First time setup
./setup-credentials.sh && ./setup-and-run.sh

# Daily development
npm run dev

# Test everything
./test-all-modes.sh

# Production deployment
npm run build && NODE_ENV=production npm run start:prod

# Generate documentation
demo-platform-documentation.sh
```

For more details, see:
- [Technical Guide](./TECHNICAL_GUIDE.md)
- [Architecture](../architecture/ARCHITECTURE.md)
- [Development Guide](../../DEVELOPMENT.md)