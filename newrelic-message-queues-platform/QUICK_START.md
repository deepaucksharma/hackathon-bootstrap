# 🚀 Quick Start Guide

## One Command Setup

```bash
node launch.js quick-start
```

This single command will:
1. ✅ Deploy minikube cluster with Kafka
2. ✅ Start v3.0 compliant monitoring
3. ✅ Generate comprehensive dashboards
4. ✅ Begin real-time data collection

## Interactive Menu

```bash
node launch.js
```

Select from 8 different actions including demo mode, individual components, or full cleanup.

## Requirements

- Node.js v14+
- kubectl
- minikube  
- Docker

## Environment Variables (Optional)

```bash
export NEW_RELIC_ACCOUNT_ID="your-account-id"
export NEW_RELIC_USER_API_KEY="your-user-api-key" 
export NEW_RELIC_INGEST_KEY="your-ingest-license-key"
```

*Runs in demo mode if not provided*

## Key Features

- 🎯 **v3.0 Data Model**: 100% compliant with New Relic's latest specification
- 🚀 **Automated Deployment**: Complete Kafka infrastructure in minutes
- 📊 **Real-time Dashboards**: Auto-generated with golden metrics
- 🔄 **Live Monitoring**: 30-second data collection intervals
- 🧹 **Easy Cleanup**: One command removes everything

## Support

Run `node launch.js help` for detailed command information.