#!/bin/bash

# This script sets up environment variables for the New Relic Infrastructure Agent on macOS

echo "Setting up MSK shim environment variables for New Relic Infrastructure Agent..."

# Create a launch agent plist to set environment variables
cat > ~/Library/LaunchAgents/com.newrelic.msk-env.plist << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.newrelic.msk-env</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/launchctl</string>
        <string>setenv</string>
        <string>MSK_SHIM_ENABLED</string>
        <string>true</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
EOF

# Set environment variables for current session
launchctl setenv MSK_SHIM_ENABLED true
launchctl setenv MSK_USE_DIMENSIONAL true
launchctl setenv AWS_ACCOUNT_ID 123456789012
launchctl setenv AWS_REGION us-east-1
launchctl setenv KAFKA_CLUSTER_NAME local-kafka-cluster
launchctl setenv ENVIRONMENT production

echo "Environment variables set. You may need to restart the New Relic Infrastructure Agent."
echo ""
echo "To restart the agent on macOS:"
echo "  sudo launchctl stop com.newrelic.infra-agent"
echo "  sudo launchctl start com.newrelic.infra-agent"
echo ""
echo "Or if using brew services:"
echo "  brew services restart newrelic-infra-agent"