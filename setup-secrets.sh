#!/bin/bash

# Load environment variables from .env file
if [ ! -f .env ]; then
    echo "Error: .env file not found!"
    echo "Please create a .env file with the following variables:"
    echo "  IKEY=<your-license-key>"
    echo "  UKEY=<your-user-key>"
    echo "  QKey=<your-query-key>"
    echo "  ACC=<your-account-id>"
    exit 1
fi

# Source the .env file
export $(cat .env | grep -v '^#' | xargs)

echo "Setting up New Relic secrets in Kubernetes..."

# Create namespace if it doesn't exist
kubectl create namespace newrelic --dry-run=client -o yaml | kubectl apply -f -

# Create the secret using values from .env
kubectl create secret generic newrelic-credentials \
  --namespace=newrelic \
  --from-literal=license-key="${IKEY}" \
  --from-literal=user-key="${UKEY}" \
  --from-literal=query-key="${QKey}" \
  --from-literal=account-id="${ACC}" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "✅ Secrets created/updated successfully"

# Verify the secret was created
echo
echo "Verifying secret creation..."
kubectl get secret newrelic-credentials -n newrelic

echo
echo "Secret keys:"
kubectl get secret newrelic-credentials -n newrelic -o jsonpath='{.data}' | jq 'keys'