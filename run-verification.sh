#!/bin/bash

# Load environment variables from .env file
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Use UKEY as NRAK_API_KEY
export NRAK_API_KEY=$UKEY

# Run the verification script with any passed arguments
node verify-kafka-metrics.js "$@"