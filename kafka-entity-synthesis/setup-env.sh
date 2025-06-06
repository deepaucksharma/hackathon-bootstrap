#!/bin/bash

# Setup environment variables for ESVP

# Source the parent .env file
if [ -f "../.env" ]; then
  echo "Loading environment from ../.env"
  # Parse and export variables
  while IFS='=' read -r key value; do
    # Skip comments and empty lines
    if [[ ! "$key" =~ ^# ]] && [[ -n "$key" ]]; then
      # Remove quotes if present
      value="${value%\"}"
      value="${value#\"}"
      export "$key=$value"
    fi
  done < "../.env"
  
  # Map to expected variable names
  export NEW_RELIC_ACCOUNT_ID="${NR_ACCOUNT_ID:-$ACC}"
  export NEW_RELIC_INSERT_KEY="${NR_INSERT_KEY:-$IKEY}"
  export NEW_RELIC_USER_KEY="${NR_USER_KEY:-$UKEY}"
  export NEW_RELIC_QUERY_KEY="${NR_QUERY_KEY:-$QKey}"
  export AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-123456789012}"
  
  echo "✅ Environment configured:"
  echo "   Account ID: ${NEW_RELIC_ACCOUNT_ID:0:6}..."
  echo "   Insert Key: ${NEW_RELIC_INSERT_KEY:0:10}..."
  echo "   User Key: ${NEW_RELIC_USER_KEY:0:10}..."
  echo "   Query Key: ${NEW_RELIC_QUERY_KEY:0:10}..."
else
  echo "❌ Error: ../.env file not found"
  echo "Please ensure you have a .env file in the parent directory with:"
  echo "  NR_ACCOUNT_ID=your_account_id"
  echo "  NR_INSERT_KEY=your_insert_key"
  echo "  NR_USER_KEY=your_user_key"
  echo "  NR_QUERY_KEY=your_query_key"
  exit 1
fi