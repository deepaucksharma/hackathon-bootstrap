# Strimzi Kafka Quick Start Guide

## 🚀 Deploy in 5 Minutes

```bash
# 1. Deploy everything
./deploy-strimzi-kafka.sh

# 2. Verify deployment (wait ~2-3 minutes for pods to start)
./verify-strimzi-deployment.sh

# 3. Run end-to-end tests
./end-to-end-test.sh

# 4. Monitor in real-time
./realtime-monitor.sh
```

## 🔍 If Something Goes Wrong

```bash
# Run automated troubleshooter
./automated-troubleshooter.sh

# Or check health status
./comprehensive-health-check.sh
```

## 📊 Check in New Relic

```sql
FROM KafkaBrokerSample 
SELECT * 
WHERE clusterName = 'strimzi-production-kafka' 
SINCE 5 minutes ago
```

## 🛠️ Quick Debug

See `quick-debug-commands.md` for copy-paste troubleshooting commands.

## 📚 Full Documentation

- `README.md` - Complete setup guide
- `manual-verification-guide.md` - Step-by-step verification
- `VERIFICATION-SUMMARY.md` - All verification approaches