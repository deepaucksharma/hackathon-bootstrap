#!/bin/bash

# Install Strimzi Operator
STRIMZI_VERSION="0.38.0"
NAMESPACE="strimzi-kafka"

echo "Installing Strimzi Operator version $STRIMZI_VERSION..."

# Create namespace
kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

# Install Strimzi operator
kubectl create -f "https://strimzi.io/install/latest?namespace=$NAMESPACE" -n $NAMESPACE

# Wait for operator to be ready
echo "Waiting for Strimzi operator to be ready..."
kubectl wait --for=condition=ready --timeout=300s pod -l name=strimzi-cluster-operator -n $NAMESPACE

echo "Strimzi operator installed successfully!"