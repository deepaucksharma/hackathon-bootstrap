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
