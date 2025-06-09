#!/bin/bash

# Documentation Consolidation Script
# This script implements the documentation consolidation plan

set -e

echo "🔧 Starting Documentation Consolidation..."

# Create new directory structure
echo "📁 Creating new directory structure..."

mkdir -p docs/getting-started
mkdir -p docs/user-guide
mkdir -p docs/developer-guide
mkdir -p docs/operations
mkdir -p docs/reference
mkdir -p docs/project
mkdir -p docs/archive/v2-vision
mkdir -p docs/archive/legacy

echo "✅ Directory structure created"

# Function to safely move files with backup
move_with_backup() {
    local source="$1"
    local dest="$2"
    
    if [ -f "$source" ]; then
        echo "📄 Moving $source → $dest"
        cp "$source" "${source}.backup"
        mv "$source" "$dest"
    else
        echo "⚠️  File not found: $source"
    fi
}

# Function to archive files
archive_file() {
    local source="$1"
    local dest="docs/archive/legacy/$(basename "$1")"
    
    if [ -f "$source" ]; then
        echo "📦 Archiving $source → $dest"
        mv "$source" "$dest"
    else
        echo "⚠️  File not found: $source"
    fi
}

echo ""
echo "📚 Phase 1: Archive Outdated Documentation"

# Archive outdated vision docs
echo "📦 Archiving v2.0 vision documents..."
archive_file "vision/TECHNICAL_ARCHITECTURE_V2.md"
archive_file "vision/IMPLEMENTATION_PLAN_V2.md"
archive_file "vision/EVOLUTION_VISION.md"

# Archive failed v2.0 implementation
echo "📦 Archiving failed v2.0 implementation..."
if [ -d "newrelic-message-queues-platform/v2" ]; then
    mv "newrelic-message-queues-platform/v2" "docs/archive/v2-vision/"
    echo "✅ Archived v2 directory"
fi

# Archive redundant files
echo "📦 Archiving redundant project overviews..."
archive_file "newrelic-message-queues-platform/PROJECT_OVERVIEW.md"
archive_file "newrelic-message-queues-platform/docs/INFRASTRUCTURE_INTEGRATION.md"

echo ""
echo "📚 Phase 2: Consolidate Core Documentation"

# Create consolidated documentation index
echo "📄 Creating main documentation hub..."
if [ ! -f "docs/README.md" ]; then
    cp "docs/README_NEW.md" "docs/README.md"
    echo "✅ Created docs/README.md"
else
    echo "⚠️  docs/README.md already exists, check docs/README_NEW.md for new version"
fi

# Consolidate getting started guides
echo "📄 Consolidating getting started guides..."
if [ ! -f "docs/getting-started/README.md" ]; then
    cp "docs/getting-started/README_CONSOLIDATED.md" "docs/getting-started/README.md"
    echo "✅ Created consolidated getting started guide"
else
    echo "⚠️  Getting started guide exists, check README_CONSOLIDATED.md for new version"
fi

# Consolidate infrastructure setup
echo "📄 Consolidating infrastructure guides..."
if [ ! -f "docs/operations/infrastructure-setup.md" ]; then
    cp "docs/operations/infrastructure-setup_CONSOLIDATED.md" "docs/operations/infrastructure-setup.md"
    echo "✅ Created consolidated infrastructure setup guide"
else
    echo "⚠️  Infrastructure setup guide exists, check infrastructure-setup_CONSOLIDATED.md for new version"
fi

echo ""
echo "📚 Phase 3: Organize Existing Documentation"

# Move platform documentation to appropriate locations
echo "📄 Organizing platform documentation..."

# Developer documentation
move_with_backup "newrelic-message-queues-platform/docs/ARCHITECTURE.md" "docs/developer-guide/architecture.md"
move_with_backup "newrelic-message-queues-platform/docs/DEVELOPER_GUIDE.md" "docs/developer-guide/README.md"
move_with_backup "newrelic-message-queues-platform/docs/ENTITY_FRAMEWORK.md" "docs/developer-guide/entity-framework.md"
move_with_backup "newrelic-message-queues-platform/docs/API_REFERENCE.md" "docs/developer-guide/api-reference.md"

# User documentation
move_with_backup "newrelic-message-queues-platform/docs/QUICKSTART.md" "docs/user-guide/quickstart-legacy.md"

# Operations documentation  
move_with_backup "newrelic-message-queues-platform/INFRASTRUCTURE_INTEGRATION_COMPLETE.md" "docs/operations/infrastructure-integration-legacy.md"
move_with_backup "newrelic-message-queues-platform/INFRASTRUCTURE_SETUP_GUIDE.md" "docs/operations/infrastructure-setup-legacy.md"

# Reference documentation
move_with_backup "docs/metrics-reference.md" "docs/reference/metrics-reference.md"

# Project documentation
move_with_backup "vision/README.md" "docs/project/vision-index.md"
move_with_backup "vision/vision.md" "docs/project/vision.md"
move_with_backup "vision/vision-summary.md" "docs/project/vision-summary.md"
move_with_backup "vision/IMPLEMENTATION_RESULTS.md" "docs/project/implementation-results.md"

# Component documentation (keep in place but create references)
echo "📄 Creating references to component documentation..."

# Dashboard documentation
echo "📄 Dashboard documentation is at: newrelic-message-queues-platform/dashboards/README.md"
echo "📄 Dashboard CLI docs: newrelic-message-queues-platform/dashboards/cli/README.md"
echo "📄 Dashboard API docs: newrelic-message-queues-platform/dashboards/api/README.md"

echo ""
echo "📚 Phase 4: Create Missing Documentation"

# Create CLI reference if it doesn't exist
if [ ! -f "docs/user-guide/cli-reference.md" ]; then
    cat > "docs/user-guide/cli-reference.md" << 'EOF'
# CLI Reference

> **Purpose**: Complete reference for all CLI commands  
> **Audience**: Platform operators  
> **Prerequisites**: Platform installed and configured

## Platform Commands

### Main Platform
```bash
# Start platform in different modes
node platform.js --mode=simulation|infrastructure|hybrid

# Common options
--interval=30        # Collection interval in seconds
--duration=300       # Run duration in seconds (simulation only)
--debug             # Enable debug logging
```

### Dashboard CLI
```bash
# Create dashboard from template
node dashboards/cli.js create --template=cluster-overview --provider=kafka

# List available templates
node dashboards/cli.js list-templates

# Generate dashboard suite
node dashboards/cli.js generate-suite --provider=kafka
```

### Testing and Verification
```bash
# Test infrastructure connection
node test-infra-connection.js

# Verify platform configuration
node test-config-validation.js

# Run health checks
node health-check.js
```

For detailed examples, see the [Getting Started Guide](../getting-started/README.md).
EOF
    echo "✅ Created CLI reference"
fi

# Create troubleshooting guide if it doesn't exist
if [ ! -f "docs/user-guide/troubleshooting.md" ]; then
    cat > "docs/user-guide/troubleshooting.md" << 'EOF'
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
EOF
    echo "✅ Created troubleshooting guide"
fi

# Create configuration reference if it doesn't exist
if [ ! -f "docs/reference/configuration-reference.md" ]; then
    cat > "docs/reference/configuration-reference.md" << 'EOF'
# Configuration Reference

> **Purpose**: Complete reference for all configuration options  
> **Audience**: Platform operators and developers  
> **Format**: Environment variables and CLI flags

## Required Configuration

```bash
# New Relic API Access
NEW_RELIC_API_KEY="nrak-..."          # User API Key (required for all modes)
NEW_RELIC_ACCOUNT_ID="1234567"        # Account ID where data should appear

# Platform Mode
PLATFORM_MODE="simulation"            # simulation|infrastructure|hybrid
```

## Optional Configuration

```bash
# New Relic Settings
NEW_RELIC_REGION="US"                 # US or EU
NEW_RELIC_USER_API_KEY="nrak-..."     # Alternative to API_KEY

# Platform Behavior
DEBUG="platform:*"                    # Enable debug logging
COLLECTION_INTERVAL="30"              # Seconds between collections
BATCH_SIZE="100"                      # Entities per batch

# Infrastructure Mode
KAFKA_CLUSTER_NAME="production"       # Cluster identifier
KAFKA_BOOTSTRAP_SERVERS="kafka:9092"  # Kafka connection string

# Simulation Mode
SIMULATION_CLUSTERS="2"               # Number of clusters to simulate
SIMULATION_DURATION="300"             # Simulation duration in seconds
```

## CLI Options

```bash
# Override mode
--mode=simulation|infrastructure|hybrid

# Override intervals
--interval=30                         # Collection interval
--duration=300                        # Run duration (simulation only)

# Debugging
--debug                              # Enable debug output
--verbose                            # Verbose logging
```

For examples, see [Getting Started](../getting-started/README.md).
EOF
    echo "✅ Created configuration reference"
fi

echo ""
echo "📚 Phase 5: Update Navigation"

# Create navigation helpers
echo "📄 Creating navigation helpers..."

# Update main platform README to point to new docs
if [ -f "newrelic-message-queues-platform/README.md" ]; then
    echo "" >> "newrelic-message-queues-platform/README.md"
    echo "## 📚 Documentation" >> "newrelic-message-queues-platform/README.md"
    echo "" >> "newrelic-message-queues-platform/README.md"
    echo "**New unified documentation location**: [/docs/README.md](../docs/README.md)" >> "newrelic-message-queues-platform/README.md"
    echo "" >> "newrelic-message-queues-platform/README.md"
    echo "- [Getting Started](../docs/getting-started/README.md)" >> "newrelic-message-queues-platform/README.md"
    echo "- [User Guide](../docs/user-guide/README.md)" >> "newrelic-message-queues-platform/README.md"
    echo "- [Developer Guide](../docs/developer-guide/README.md)" >> "newrelic-message-queues-platform/README.md"
    echo "- [Operations](../docs/operations/README.md)" >> "newrelic-message-queues-platform/README.md"
    echo "✅ Updated platform README with navigation"
fi

echo ""
echo "📊 Consolidation Summary"
echo "======================"
echo ""
echo "✅ Created new directory structure"
echo "✅ Archived outdated documentation" 
echo "✅ Consolidated redundant guides"
echo "✅ Organized existing documentation"
echo "✅ Created missing documentation"
echo "✅ Updated navigation"
echo ""
echo "📁 New Structure:"
echo "  docs/"
echo "  ├── README.md                    # Main documentation hub"
echo "  ├── getting-started/             # Quick start guides"
echo "  ├── user-guide/                  # User-focused docs"
echo "  ├── developer-guide/             # Developer-focused docs"
echo "  ├── operations/                  # Infrastructure and deployment"
echo "  ├── reference/                   # Lookups and specifications"
echo "  ├── project/                     # Project vision and roadmap"
echo "  └── archive/                     # Outdated documentation"
echo ""
echo "📋 Next Steps:"
echo "1. Review generated documentation in docs/"
echo "2. Update internal links between documents"
echo "3. Test all examples and code snippets"
echo "4. Update any remaining references to old doc locations"
echo "5. Delete .backup files when satisfied with migration"
echo ""
echo "🔗 Key Entry Points:"
echo "- Main hub: docs/README.md"
echo "- Quick start: docs/getting-started/README.md"
echo "- Infrastructure setup: docs/operations/infrastructure-setup.md"
echo ""
echo "✨ Documentation consolidation complete!"