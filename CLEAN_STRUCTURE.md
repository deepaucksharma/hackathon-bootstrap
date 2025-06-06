# Clean Project Structure

## Core Components

### 1. Source Code (`src/`)
- Main Kafka integration code
- MSK shim implementation with CloudWatch emulation

### 2. Entity Synthesis Testing (`entity-synthesis-solution-V2/`)
- `test.js` - Interactive menu entry point
- `entity-synthesis-tester.js` - Unified testing framework
- `lib/common.js` - Shared utilities

### 3. Kubernetes Deployment (`minikube-consolidated/`)
- Kafka cluster manifests
- New Relic monitoring setup
- Deployment scripts

### 4. Verification System (`ultimate-verification-system/`)
- Comprehensive verification queries
- UI visibility validation
- Performance monitoring

### 5. Key Scripts
- `verify-kafka-metrics.js` - Main verification tool
- `run-verification.sh` - Run full verification
- `build-msk.sh` - Build MSK-enabled binary

## Quick Start

\`\`\`bash
# Test entity synthesis
cd entity-synthesis-solution-V2
./test.js

# Verify metrics
./verify-kafka-metrics.js

# Build and deploy
./build-msk.sh
\`\`\`
