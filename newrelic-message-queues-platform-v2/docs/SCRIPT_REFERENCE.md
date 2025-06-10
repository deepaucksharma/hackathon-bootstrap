# Script Reference Guide

This document provides a quick reference for all scripts in the platform.

## 🚀 Setup Scripts

### `setup-credentials.sh`
Interactive credential setup wizard.
```bash
./setup-credentials.sh
```
- Guides through getting New Relic credentials
- Creates `.env` file
- Tests credentials

### `setup-and-run.sh`
Complete setup and run wizard.
```bash
./setup-and-run.sh
```
- Checks prerequisites (Node.js 18+)
- Installs dependencies
- Sets up credentials
- Offers choice of simulation or infrastructure mode
- Runs the platform

## 🏃 Running Scripts

### `run-platform-unified.js` ⭐ (Recommended)
Main platform runner with all features.
```bash
node run-platform-unified.js [options]

Options:
  --mode <mode>          simulation|infrastructure
  --interval <seconds>   Collection interval
  --duration <minutes>   Run duration
  --provider <provider>  kafka|rabbitmq|sqs
  --debug               Enable debug logging
  --no-dashboards       Skip dashboard generation
  --no-continuous       Run once and exit
```

### `run-infrastructure-mode.sh`
Dedicated script for infrastructure mode.
```bash
./run-infrastructure-mode.sh
```
- Validates environment
- Checks for nri-kafka data
- Runs platform with real Kafka metrics

### `run-platform-tsx.js`
Alternative TypeScript runner.
```bash
node run-platform-tsx.js
```
- Direct TypeScript execution
- Used internally by other scripts

## 🧪 Testing Scripts

### `test-simulation.sh`
Quick 30-second simulation test.
```bash
./test-simulation.sh
```
- Minimal configuration
- Verifies basic functionality
- Good for quick checks

### `test-all-modes.sh` ⭐
Comprehensive test suite.
```bash
./test-all-modes.sh
```
Tests:
1. TypeScript compilation
2. Simulation mode
3. Infrastructure mode (if available)
4. Unified runner
5. Entity creation in New Relic

### `test-dashboard-integration.js`
Tests dashboard generation.
```bash
node test-dashboard-integration.js
```
- Creates test dashboard
- Verifies dashboard API integration
- Cleans up after test

### `test-error-handling.js`
Tests error recovery and circuit breakers.
```bash
node test-error-handling.js
```
- Simulates various error conditions
- Verifies recovery mechanisms
- Tests circuit breaker patterns

### `test-infrastructure-complete.js`
Full infrastructure mode test.
```bash
node test-infrastructure-complete.js
```
- Comprehensive infrastructure validation
- Entity synthesis verification
- Dashboard creation test

## 📊 Utility Scripts

### `demo-platform-documentation.sh`
Generates platform documentation.
```bash
./demo-platform-documentation.sh
```
- Runs platform with documentation mode
- Generates pipeline reports
- Creates visual diagrams

### `check-nri-kafka-data.js`
Verifies Kafka data availability.
```bash
node check-nri-kafka-data.js
```
- Queries New Relic for Kafka samples
- Shows available data
- Helps troubleshoot infrastructure mode

### `check-entities.js`
Verifies entity creation.
```bash
node check-entities.js
```
- Queries for MESSAGE_QUEUE entities
- Shows entity counts by type
- Validates entity synthesis

## 📋 NPM Scripts

Quick reference for package.json scripts:

```bash
# Development
npm run dev              # Run with hot reload
npm run dev:debug        # With debugger

# Building
npm run build           # Compile TypeScript
npm run build:assets    # Copy static assets

# Production
npm run start           # Start server
npm run start:prod      # Production mode

# Testing
npm test                # All tests
npm run test:unit       # Unit tests
npm run test:integration # Integration tests
npm run test:e2e        # End-to-end tests
npm run test:coverage   # Coverage report

# Code Quality
npm run lint            # Check style
npm run lint:fix        # Fix style issues
npm run format          # Format code

# Documentation
npm run docs:generate   # API docs
```

## 🎯 Common Workflows

### First Time Setup
```bash
./setup-credentials.sh
./setup-and-run.sh
```

### Daily Development
```bash
npm run dev
# or
node run-platform-unified.js --debug
```

### Testing Changes
```bash
./test-simulation.sh     # Quick test
./test-all-modes.sh      # Full test
```

### Production Deployment
```bash
npm run build
NODE_ENV=production npm run start:prod
```

### Troubleshooting
```bash
node check-nri-kafka-data.js  # Check data
node check-entities.js         # Check entities
./test-all-modes.sh           # Full validation
```

## 🔧 Script Capabilities Matrix

| Script | Setup | Run | Test | Debug | Dashboards |
|--------|-------|-----|------|-------|------------|
| setup-credentials.sh | ✅ | - | ✅ | - | - |
| setup-and-run.sh | ✅ | ✅ | - | - | - |
| run-platform-unified.js | - | ✅ | - | ✅ | ✅ |
| run-infrastructure-mode.sh | - | ✅ | - | - | - |
| test-simulation.sh | - | ✅ | ✅ | - | - |
| test-all-modes.sh | - | ✅ | ✅ | ✅ | ✅ |
| test-dashboard-integration.js | - | - | ✅ | - | ✅ |

## 📝 Notes

- Most scripts include helpful output and progress indicators
- All scripts check for required dependencies
- Scripts exit with proper codes for CI/CD integration
- Use `--debug` flag for troubleshooting
- Scripts are designed to be idempotent