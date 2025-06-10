#!/bin/bash

# Setup and Run Script for Message Queues Platform v2
# This script helps set up the environment and run the platform

set -e

echo "🚀 Message Queues Platform v2 Setup"
echo "====================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required but not installed"
    echo "Please install Node.js 18+ and try again"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt "18" ]; then
    echo "❌ Node.js 18+ is required (found v$NODE_VERSION)"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo "✅ Dependencies installed"
else
    echo "✅ Dependencies already installed"
fi

# Check .env file
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "⚠️  Please edit .env with your New Relic credentials"
    echo "   - NEW_RELIC_ACCOUNT_ID"
    echo "   - NEW_RELIC_API_KEY (ingest key)"
    echo "   - NEW_RELIC_USER_API_KEY (for dashboards)"
else
    echo "✅ .env file exists"
fi

# Show available modes
echo ""
echo "🎯 Available Modes:"
echo "1. Simulation Mode (default) - Generate test data"
echo "2. Infrastructure Mode - Connect to real Kafka in Minikube"
echo ""

# Ask user which mode to run
read -p "Which mode would you like to run? [1-2] (default: 1): " MODE_CHOICE

case $MODE_CHOICE in
    2)
        echo "🔧 Running in Infrastructure Mode..."
        echo "📋 Prerequisites for Infrastructure Mode:"
        echo "   - Minikube running"
        echo "   - Kafka deployed in Minikube"
        echo "   - nri-kafka integration configured"
        echo ""
        
        # Check if Minikube is running
        if command -v minikube &> /dev/null; then
            if minikube status | grep -q "Running"; then
                echo "✅ Minikube is running"
                echo "   IP: $(minikube ip)"
                
                # Check if Kafka namespace exists
                if kubectl get namespace kafka &> /dev/null; then
                    echo "✅ Kafka namespace exists"
                else
                    echo "❌ Kafka namespace not found"
                    echo "📄 To deploy Kafka, run:"
                    echo "   kubectl apply -f kafka-minikube-deployment.yaml"
                    echo ""
                    read -p "Continue anyway? [y/N]: " CONTINUE
                    if [[ ! $CONTINUE =~ ^[Yy]$ ]]; then
                        exit 1
                    fi
                fi
            else
                echo "❌ Minikube is not running"
                echo "Please start Minikube first: minikube start"
                exit 1
            fi
        else
            echo "❌ Minikube not found"
            echo "Infrastructure mode requires Minikube"
            exit 1
        fi
        
        export PLATFORM_MODE=infrastructure
        ;;
    *)
        echo "🎮 Running in Simulation Mode..."
        export PLATFORM_MODE=simulation
        ;;
esac

# Set other environment variables
export PLATFORM_INTERVAL=30  # Faster for demo

echo ""
echo "🏃 Starting Message Queues Platform v2..."
echo "   Mode: $PLATFORM_MODE"
echo "   Interval: ${PLATFORM_INTERVAL}s"
echo ""
echo "📄 A data model report will be generated after the first cycle"
echo "⏹️  Press Ctrl+C to stop"
echo ""

# Run the platform
node run-platform-unified.js