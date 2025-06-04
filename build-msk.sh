#!/bin/bash
# Build script for nri-kafka with MSK shim

set -e

echo "Building nri-kafka with MSK shim support..."
echo "Note: This requires Go 1.20 or higher"

# Check Go version
GO_VERSION=$(go version | awk '{print $3}' | sed 's/go//')
REQUIRED_VERSION="1.20"

if ! printf '%s\n' "$REQUIRED_VERSION" "$GO_VERSION" | sort -V | tail -n1 | grep -q "$GO_VERSION"; then
    echo "Error: Go version $GO_VERSION is too old. Minimum required: $REQUIRED_VERSION"
    echo "Please upgrade Go or use Docker build:"
    echo "  docker build -f build/docker/Dockerfile.msk -t nri-kafka-msk ."
    exit 1
fi

# Clean previous builds
echo "Cleaning previous builds..."
rm -rf bin/

# Download dependencies
echo "Downloading dependencies..."
go mod download

# Run tests
echo "Running tests..."
go test ./src/msk/... -v

# Build binary
echo "Building binary..."
go build -o bin/nri-kafka ./src

echo "Build complete! Binary available at: bin/nri-kafka"
echo ""
echo "To test MSK shim functionality:"
echo "  export MSK_SHIM_ENABLED=true"
echo "  export AWS_ACCOUNT_ID=123456789012"
echo "  export AWS_REGION=us-east-1"
echo "  export KAFKA_CLUSTER_NAME=my-cluster"
echo "  ./bin/nri-kafka -verbose"