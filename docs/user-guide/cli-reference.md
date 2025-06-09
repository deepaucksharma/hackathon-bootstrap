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
