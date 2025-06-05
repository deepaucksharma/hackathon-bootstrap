# Project Structure

This document describes the organization of the nri-kafka repository after cleanup and consolidation.

## Directory Structure

```
nri-kafka/
├── bin/                              # Compiled binaries
│   ├── nri-kafka                     # Main integration binary
│   ├── nri-kafka-amd64              # AMD64 specific binary
│   ├── nri-kafka-test               # Test binary
│   └── kind                         # Kubernetes in Docker binary
│
├── build/                           # Build artifacts (gitignored)
│
├── config-samples/                  # Configuration examples
│   ├── jmx-config-msk.yml          # MSK JMX configuration
│   ├── kafka-config.yml.sample     # Standard Kafka configuration
│   ├── kafka-msk-config.yml.sample # MSK-specific configuration
│   └── kafka-win-config.yml.sample # Windows configuration
│
├── development-docs/                # Development and verification documentation
│   ├── CODE_CONSOLIDATION_REVIEW.md
│   ├── FINAL_CODE_REVIEW.md
│   ├── KAFKA_METRICS_ROADMAP.md
│   ├── KAFKA_METRICS_VERIFICATION_README.md
│   └── METRICS_VERIFICATION_GUIDE.md
│
├── docker/                          # Docker-related files
│   ├── Dockerfile                   # Main Dockerfile
│   ├── Dockerfile.bundle           # Infrastructure bundle
│   ├── Dockerfile.bundle-fixed     # Fixed bundle version
│   ├── Dockerfile.infrastructure-bundle-msk
│   ├── Dockerfile.local
│   ├── Dockerfile.msk              # MSK-specific build
│   ├── Dockerfile.msk-bundle       # MSK bundle build
│   └── docker-desktop-setup.md     # Docker Desktop setup guide
│
├── docs/                           # User documentation
│   ├── Enhancements.md
│   ├── MSK-SHIM.md
│   ├── README.md
│   ├── index.md
│   ├── metrics-reference.md
│   └── msk-shim-implementation.md
│
├── k8s-consolidated/               # Consolidated Kubernetes manifests
│
├── kubernetes-manifests/           # Individual Kubernetes manifests
│   ├── generate-comprehensive-traffic.yaml
│   ├── kafka-jmx-clients.yaml
│   ├── strimzi-kafka-cluster.yaml
│   ├── strimzi-kafka-fixed.yaml
│   ├── strimzi-kafka-kraft.yaml
│   ├── test-consumer.yaml
│   └── test-producer.yaml
│
├── minikube-consolidated/          # Minikube-specific setup
│
├── scripts/                        # Utility scripts
│   ├── build-msk.sh               # MSK build script
│   └── minikube-setup.sh          # Minikube setup script
│
├── src/                           # Go source code
│   ├── args/                      # Argument parsing
│   ├── broker/                    # Broker metrics collection
│   ├── client/                    # Client metrics collection
│   ├── connection/                # Connection management
│   ├── consumeroffset/           # Consumer offset collection
│   ├── metrics/                   # Metric definitions
│   ├── msk/                      # MSK shim implementation
│   ├── testutils/                # Test utilities
│   ├── topic/                    # Topic metrics collection
│   ├── zookeeper/                # Zookeeper integration
│   └── kafka.go                  # Main entry point
│
├── tests/                         # Integration tests
│
├── ultimate-verification-system/   # Comprehensive verification framework
│   ├── automation/                # CI/CD automation
│   ├── operations/               # Operations guides
│   ├── reference/                # Reference documentation
│   ├── setup/                    # Setup guides
│   ├── troubleshooting/          # Troubleshooting guides
│   └── verification/             # Verification scripts
│
├── verification-scripts/          # Standalone verification scripts
│   ├── check-kafka-status.sh
│   ├── run-verification.sh
│   ├── test-mock-scenarios.js
│   ├── test-topic-metrics.sh
│   ├── test-verification-scenarios.sh
│   └── verify-kafka-metrics.js
│
├── CHANGELOG.md                   # Version history
├── CLAUDE.md                      # Claude AI instructions
├── CONTRIBUTING.md                # Contribution guidelines
├── LICENSE                        # Apache 2.0 license
├── Makefile                       # Build automation
├── README.md                      # Main project documentation
├── THIRD_PARTY_NOTICES.md        # Third-party licenses
├── TROUBLESHOOTING.md            # Troubleshooting guide
├── go.mod                        # Go module definition
├── go.sum                        # Go module checksums
├── papers_manifest.yml           # Papers manifest
├── spec.csv                      # Metric specifications
└── spec.inventory.csv            # Inventory specifications
```

## Key Directories

### Source Code (`src/`)
Contains all Go source code for the integration, including the MSK shim implementation.

### Configuration (`config-samples/`)
Example configuration files for different deployment scenarios (standard Kafka, MSK, Windows).

### Docker (`docker/`)
All Docker-related files including various build configurations for different deployment targets.

### Verification (`verification-scripts/` and `ultimate-verification-system/`)
- `verification-scripts/`: Quick standalone scripts for testing
- `ultimate-verification-system/`: Comprehensive verification framework with documentation

### Documentation
- `docs/`: User-facing documentation
- `development-docs/`: Internal development and verification documentation

### Kubernetes (`kubernetes-manifests/` and `k8s-consolidated/`)
- `kubernetes-manifests/`: Individual manifest files
- `k8s-consolidated/`: Complete deployment solutions

## Binary Outputs
All compiled binaries are stored in the `bin/` directory.

## Scripts
Utility scripts for building and setup are in the `scripts/` directory.