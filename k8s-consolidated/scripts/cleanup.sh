#!/bin/bash

# Cleanup script to remove old and duplicate files
# Run with --dry-run to see what would be deleted without actually deleting

set -e

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

DRY_RUN=false
if [ "$1" == "--dry-run" ]; then
    DRY_RUN=true
    echo -e "${YELLOW}DRY RUN MODE - No files will be deleted${NC}"
fi

# Function to remove files
remove_file() {
    local file=$1
    if [ -f "$file" ]; then
        if [ "$DRY_RUN" = true ]; then
            echo -e "${YELLOW}Would remove:${NC} $file"
        else
            rm -f "$file"
            echo -e "${RED}Removed:${NC} $file"
        fi
    fi
}

# Function to remove directory
remove_dir() {
    local dir=$1
    if [ -d "$dir" ]; then
        if [ "$DRY_RUN" = true ]; then
            echo -e "${YELLOW}Would remove directory:${NC} $dir"
        else
            rm -rf "$dir"
            echo -e "${RED}Removed directory:${NC} $dir"
        fi
    fi
}

echo -e "${GREEN}=== Cleaning up duplicate and unused files ===${NC}"

# Change to project root
cd ../..

# Remove backup files
echo -e "\n${YELLOW}Removing backup files...${NC}"
remove_file "src/msk/transformer.go.bak"
remove_file "src/msk/throttle_metrics_helper.go.bak"
remove_file "src/msk/system_correlator.go.bak"
remove_file "src/msk/metric_interceptor.go.bak"
remove_file "src/msk/consumer_lag_enrichment.go.bak"

# Remove temporary files
echo -e "\n${YELLOW}Removing temporary files...${NC}"
remove_file "go1.23.4.linux-amd64.tar.gz"
remove_file "nri-kafka"
remove_file "kafka-metrics-verification-1749052907961.json"
remove_file "mock-msk-output.json"
remove_file "test-msk-dry-run.go"

# Remove duplicate Kafka deployment files
echo -e "\n${YELLOW}Removing duplicate Kafka deployment files...${NC}"
remove_file "k8s-deploy/kafka-simple-jmx.yaml"
remove_file "k8s-deploy/kafka-fixed-jmx.yaml"
remove_file "k8s-deploy/kafka-jmx-fixed.yaml"
remove_file "k8s-deploy/kafka-final-jmx.yaml"
remove_file "k8s-deploy/kafka-working-jmx.yaml"
remove_file "k8s-deploy/kafka-with-jmx-sidecar.yaml"
remove_file "k8s-deploy/kafka-statefulset-jmx.yaml"
remove_file "k8s-deploy/kafka-simple.yaml"
remove_file "k8s-deploy/kafka-single-broker.yaml"
remove_file "k8s-deploy/kafka-kraft.yaml"
remove_file "k8s-deploy/kafka-jmx-prometheus.yaml"

# Remove duplicate nri-kafka configs
echo -e "\n${YELLOW}Removing duplicate nri-kafka configs...${NC}"
remove_file "k8s-deploy/nri-kafka-debug-deployment.yaml"
remove_file "k8s-deploy/nri-kafka-fixed-config.yaml"
remove_file "k8s-deploy/nri-kafka-standalone.yaml"
remove_file "k8s-deploy/nri-kafka-working.yaml"
remove_file "k8s-deploy/nri-kafka-statefulset-config.yaml"

# Remove archive directories
echo -e "\n${YELLOW}Removing archive directories...${NC}"
remove_dir "k8s-deploy/archives"
remove_dir "strimzi-kafka-setup/archives"

# Remove duplicate test scripts
echo -e "\n${YELLOW}Removing duplicate test scripts...${NC}"
remove_file "k8s-deploy/test-jmx-connection.sh"
remove_file "k8s-deploy/test-kafka-images.sh"
remove_file "k8s-deploy/test-kafka-metrics.sh"
remove_file "k8s-deploy/test-nri-kafka-params.sh"
remove_file "k8s-deploy/verify-jmx-fix.sh"
remove_file "k8s-deploy/verify-kafka-jmx.sh"
remove_file "k8s-deploy/comprehensive-jmx-troubleshoot.sh"
remove_file "k8s-deploy/apply-jmx-fix.sh"

# Remove duplicate deployment scripts
echo -e "\n${YELLOW}Removing duplicate deployment scripts...${NC}"
remove_file "k8s-deploy/deploy-kafka-strimzi.sh"
remove_file "k8s-deploy/deploy-nri-kafka.sh"

# Remove duplicate status documents
echo -e "\n${YELLOW}Removing duplicate status documents...${NC}"
remove_file "k8s-deploy/FINAL-KAFKA-MONITORING-STATUS.md"
remove_file "k8s-deploy/KAFKA-MONITORING-SOLUTION.md"
remove_file "k8s-deploy/VERIFICATION-SUMMARY.md"
remove_file "k8s-deploy/WORKING-NRI-KAFKA-SETUP.md"
remove_file "k8s-deploy/TROUBLESHOOTING.md"
remove_file "k8s-deploy/TROUBLESHOOTING-GUIDE.md"
remove_file "k8s-deploy/NRI-KAFKA-TROUBLESHOOTING-RUNBOOK.md"

# Remove old sample files
echo -e "\n${YELLOW}Removing old sample files...${NC}"
remove_file "kafka-config.yml.k8s_sample"

# Remove debug configs directory
echo -e "\n${YELLOW}Removing debug configs...${NC}"
remove_dir "debug-configs"

# Remove DashBuilder directory (should be separate repo)
echo -e "\n${YELLOW}Removing DashBuilder directory...${NC}"
remove_dir "DashBuilder-main"

# Remove duplicate test clients
echo -e "\n${YELLOW}Removing duplicate test client configs...${NC}"
remove_file "k8s-deploy/kafka-producer-consumer.yaml"
remove_file "k8s-deploy/kafka-test-clients.yaml"

# Remove old verification results
echo -e "\n${YELLOW}Removing old verification results...${NC}"
remove_file "METRICS_VERIFICATION_RESULTS.md"
remove_file "current-config.yaml"
remove_file "fixed-kafka-config.yaml"
remove_file "nri-kafka-msk-deployment.yaml"

# Remove duplicate shell scripts
echo -e "\n${YELLOW}Removing duplicate shell scripts...${NC}"
remove_file "run-msk-dry-test.sh"
remove_file "scripts/validate-msk-shim.sh"
remove_file "test-jmx-mbeans.sh"
remove_file "analyze-mbeans.py"
remove_file "debug-kafka.sh"

# Create symlinks for important files in consolidated structure
if [ "$DRY_RUN" = false ]; then
    echo -e "\n${GREEN}Creating symlinks to consolidated files...${NC}"
    
    # Link main verification script
    ln -sf k8s-consolidated/scripts/verify-metrics.sh verify-metrics.sh
    echo -e "${GREEN}Created symlink:${NC} verify-metrics.sh -> k8s-consolidated/scripts/verify-metrics.sh"
fi

# Summary
echo -e "\n${GREEN}=== Cleanup Summary ===${NC}"
if [ "$DRY_RUN" = true ]; then
    echo "Run without --dry-run to actually delete files"
else
    echo "Cleanup complete! Old and duplicate files have been removed."
    echo "Consolidated configuration is in: k8s-consolidated/"
    echo ""
    echo "Important directories:"
    echo "  - k8s-consolidated/kafka/     - Kafka cluster configs"
    echo "  - k8s-consolidated/nri-kafka/ - NRI-Kafka monitoring configs"
    echo "  - k8s-consolidated/scripts/   - Deployment and verification scripts"
fi