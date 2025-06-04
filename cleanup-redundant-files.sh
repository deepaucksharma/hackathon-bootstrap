#!/bin/bash

# Script to clean up redundant files after consolidation
# Keeps only the consolidated solution and essential files

set -e

echo "=== Cleaning Up Redundant Files ==="
echo "This will remove old verification and deployment files"
echo "The consolidated solution in k8s-consolidated/ will be preserved"
echo

# Backup important files first
echo "Creating backup of important files..."
mkdir -p backup-before-cleanup
cp -r k8s-consolidated backup-before-cleanup/ 2>/dev/null || true
cp METRICS_VERIFICATION_GUIDE.md backup-before-cleanup/ 2>/dev/null || true
cp METRICS_VERIFICATION_RESULTS.md backup-before-cleanup/ 2>/dev/null || true
cp COMPLETE_KAFKA_FIX_SUMMARY.md backup-before-cleanup/ 2>/dev/null || true

echo "Backup created in backup-before-cleanup/"
echo

# Remove redundant verification scripts
echo "Removing redundant verification scripts..."
rm -f verify-metrics-nodejs.js
rm -f verify-metrics-comparison.sh
rm -f verify-nrdb-metrics.sh
rm -f verify-specific-clusters.js
rm -f check-all-kafka-data.js
rm -f verify-metrics.sh
rm -f check-strimzi-cluster.js

# Remove old deployment scripts
echo "Removing old deployment scripts..."
rm -f fix-kafka-monitoring.sh
rm -f fix-kafka-monitoring-complete.sh

# Remove old test/temp files
echo "Removing test and temporary files..."
rm -f test-local-config.yml
rm -f kafka-metrics-verification-*.json
rm -f kafka-metrics-comparison-*.txt

# Clean up old deployment directories (keep k8s-consolidated)
echo "Cleaning up old deployment directories..."
# Keep k8s-fixes as it has the individual fix files referenced in docs
# rm -rf k8s-fixes

# Remove redundant deployment files from other directories
rm -rf k8s-deploy/deploy-*.sh 2>/dev/null || true
rm -rf k8s-deploy/verify-*.sh 2>/dev/null || true
rm -rf strimzi-kafka-setup/deploy-*.sh 2>/dev/null || true
rm -rf strimzi-kafka-setup/verify-*.sh 2>/dev/null || true

# Clean up DashBuilder directory (not related to core nri-kafka)
echo "Moving DashBuilder to separate location..."
if [ -d "DashBuilder-main" ]; then
    mkdir -p archived
    mv DashBuilder-main archived/ 2>/dev/null || true
fi

# Remove duplicate test files
echo "Removing duplicate test configurations..."
rm -f kafka-msk-demo.yml
rm -f mock-msk-output.json

# Clean up old scripts in root
echo "Cleaning up old scripts..."
rm -f run-msk-dry-test.sh
rm -f test-msk-dry-run.go
rm -f test-msk-integration.sh
rm -f test-jmx-mbeans.sh

# Create a summary of what's left
echo
echo "=== Cleanup Complete ==="
echo
echo "Preserved directories:"
echo "- k8s-consolidated/  (main deployment solution)"
echo "- k8s-fixes/         (individual fix files)"
echo "- src/               (source code with MSK enhancements)"
echo "- tests/             (integration tests)"
echo "- backup-before-cleanup/ (backup of important files)"
echo
echo "Key files preserved:"
echo "- METRICS_VERIFICATION_GUIDE.md"
echo "- METRICS_VERIFICATION_RESULTS.md" 
echo "- COMPLETE_KAFKA_FIX_SUMMARY.md"
echo "- README.md, LICENSE, etc."
echo
echo "To use the consolidated solution:"
echo "cd k8s-consolidated"
echo "./deploy-kafka-monitoring.sh full"
echo "./verify-kafka-monitoring.js --apiKey=<KEY> --accountId=<ID>"
echo