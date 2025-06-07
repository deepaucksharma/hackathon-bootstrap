#!/usr/bin/env node

/**
 * Kafka Health Monitor
 * 
 * Monitors the health of Kafka data ingestion and alerts on issues
 */

require('dotenv').config({ path: '../.env' });
const axios = require('axios');
const { sendColoredLog } = require('./utils/logger');

class KafkaHealthMonitor {
  constructor(clusterName) {
    this.clusterName = clusterName;
    this.accountId = process.env.ACC;
    this.apiKey = process.env.UKEY;
    this.nrqlEndpoint = 'https://api.newrelic.com/graphql';
    
    // Thresholds
    this.thresholds = {
      dataFreshnessMinutes: 10,
      minEventsPerHour: 12, // Expecting at least 12 events per hour (every 5 min)
      criticalMetrics: ['offlinePartitionsCount', 'activeControllerCount']
    };
    
    // State tracking
    this.lastCheck = {
      timestamp: null,
      healthy: true,
      issues: []
    };
  }

  async runHealthCheck() {
    sendColoredLog('info', `\n🏥 Running health check for cluster: ${this.clusterName}`);
    
    const checks = [
      this.checkDataFreshness(),
      this.checkEventVolume(),
      this.checkCriticalMetrics(),
      this.checkAllEventTypes(),
      this.checkMetricCompleteness()
    ];
    
    const results = await Promise.all(checks);
    
    // Aggregate results
    const issues = results.flatMap(r => r.issues || []);
    const healthy = results.every(r => r.success);
    
    this.lastCheck = {
      timestamp: new Date(),
      healthy,
      issues
    };
    
    // Report summary
    this.reportHealthStatus();
    
    return { healthy, issues };
  }

  async checkDataFreshness() {
    const query = `{
      actor {
        account(id: ${this.accountId}) {
          nrql(query: "FROM AwsMskClusterSample SELECT latest(timestamp), max(timestamp) WHERE provider.clusterName = '${this.clusterName}' SINCE 30 minutes ago") {
            results
          }
        }
      }
    }`;

    try {
      const result = await this.executeQuery(query);
      const data = result.data.actor.account.nrql.results[0];
      
      if (!data['latest.timestamp']) {
        return {
          success: false,
          check: 'dataFreshness',
          issues: ['No recent data found']
        };
      }
      
      const latestTimestamp = data['latest.timestamp'];
      const ageMinutes = (Date.now() - latestTimestamp) / (1000 * 60);
      
      if (ageMinutes > this.thresholds.dataFreshnessMinutes) {
        return {
          success: false,
          check: 'dataFreshness',
          issues: [`Data is ${ageMinutes.toFixed(1)} minutes old (threshold: ${this.thresholds.dataFreshnessMinutes})`]
        };
      }
      
      return {
        success: true,
        check: 'dataFreshness',
        message: `Data is ${ageMinutes.toFixed(1)} minutes old`
      };
      
    } catch (error) {
      return {
        success: false,
        check: 'dataFreshness',
        issues: [`Error checking data freshness: ${error.message}`]
      };
    }
  }

  async checkEventVolume() {
    const query = `{
      actor {
        account(id: ${this.accountId}) {
          nrql(query: "FROM AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample SELECT count(*) WHERE provider.clusterName = '${this.clusterName}' FACET eventType() SINCE 1 hour ago") {
            results
          }
        }
      }
    }`;

    try {
      const result = await this.executeQuery(query);
      const volumes = result.data.actor.account.nrql.results;
      
      const issues = [];
      let totalEvents = 0;
      
      volumes.forEach(v => {
        const count = v['count'];
        totalEvents += count;
        
        if (count < this.thresholds.minEventsPerHour) {
          issues.push(`Low event volume for ${v.facet}: ${count} events/hour`);
        }
      });
      
      return {
        success: issues.length === 0,
        check: 'eventVolume',
        message: `Total events in last hour: ${totalEvents}`,
        issues
      };
      
    } catch (error) {
      return {
        success: false,
        check: 'eventVolume',
        issues: [`Error checking event volume: ${error.message}`]
      };
    }
  }

  async checkCriticalMetrics() {
    const query = `{
      actor {
        account(id: ${this.accountId}) {
          nrql(query: "FROM AwsMskClusterSample SELECT latest(provider.offlinePartitionsCount.Average) as offlinePartitions, latest(provider.activeControllerCount.Average) as activeController WHERE provider.clusterName = '${this.clusterName}' SINCE 10 minutes ago") {
            results
          }
        }
      }
    }`;

    try {
      const result = await this.executeQuery(query);
      const metrics = result.data.actor.account.nrql.results[0];
      
      const issues = [];
      
      if (metrics.offlinePartitions > 0) {
        issues.push(`${metrics.offlinePartitions} offline partitions detected!`);
      }
      
      if (metrics.activeController !== 1) {
        issues.push(`Active controller count is ${metrics.activeController} (expected 1)`);
      }
      
      return {
        success: issues.length === 0,
        check: 'criticalMetrics',
        message: 'Critical metrics within normal range',
        issues
      };
      
    } catch (error) {
      return {
        success: false,
        check: 'criticalMetrics',
        issues: [`Error checking critical metrics: ${error.message}`]
      };
    }
  }

  async checkAllEventTypes() {
    const query = `{
      actor {
        account(id: ${this.accountId}) {
          nrql(query: "FROM AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample SELECT uniqueCount(eventType) WHERE provider.clusterName = '${this.clusterName}' SINCE 30 minutes ago") {
            results
          }
        }
      }
    }`;

    try {
      const result = await this.executeQuery(query);
      const uniqueTypes = result.data.actor.account.nrql.results[0]['uniqueCount.eventType'];
      
      if (uniqueTypes < 3) {
        return {
          success: false,
          check: 'eventTypes',
          issues: [`Only ${uniqueTypes} of 3 event types found`]
        };
      }
      
      return {
        success: true,
        check: 'eventTypes',
        message: 'All 3 event types present'
      };
      
    } catch (error) {
      return {
        success: false,
        check: 'eventTypes',
        issues: [`Error checking event types: ${error.message}`]
      };
    }
  }

  async checkMetricCompleteness() {
    // Check for key metrics presence
    const query = `{
      actor {
        account(id: ${this.accountId}) {
          nrql(query: "FROM AwsMskBrokerSample SELECT keyset() WHERE provider.clusterName = '${this.clusterName}' SINCE 10 minutes ago LIMIT 1") {
            results
          }
        }
      }
    }`;

    try {
      const result = await this.executeQuery(query);
      const keys = result.data.actor.account.nrql.results[0]?.keyset || [];
      
      const requiredMetrics = [
        'provider.bytesInPerSec.Average',
        'provider.bytesOutPerSec.Average',
        'provider.cpuUser.Average',
        'provider.memoryUsed.Average'
      ];
      
      const missingMetrics = requiredMetrics.filter(m => !keys.includes(m));
      
      if (missingMetrics.length > 0) {
        return {
          success: false,
          check: 'metricCompleteness',
          issues: [`Missing metrics: ${missingMetrics.join(', ')}`]
        };
      }
      
      return {
        success: true,
        check: 'metricCompleteness',
        message: `Found ${keys.length} metrics`
      };
      
    } catch (error) {
      return {
        success: false,
        check: 'metricCompleteness',
        issues: [`Error checking metrics: ${error.message}`]
      };
    }
  }

  async executeQuery(query) {
    const response = await axios.post(
      this.nrqlEndpoint,
      { query },
      {
        headers: {
          'Content-Type': 'application/json',
          'API-Key': this.apiKey
        }
      }
    );
    
    if (response.data.errors) {
      throw new Error(response.data.errors[0].message);
    }
    
    return response.data;
  }

  reportHealthStatus() {
    console.log('\n' + '='.repeat(60));
    console.log('HEALTH CHECK SUMMARY');
    console.log('='.repeat(60));
    console.log(`Cluster: ${this.clusterName}`);
    console.log(`Time: ${this.lastCheck.timestamp.toISOString()}`);
    console.log(`Status: ${this.lastCheck.healthy ? '✅ HEALTHY' : '❌ UNHEALTHY'}`);
    
    if (this.lastCheck.issues.length > 0) {
      console.log('\nIssues Found:');
      this.lastCheck.issues.forEach((issue, i) => {
        console.log(`  ${i + 1}. ${issue}`);
      });
    } else {
      console.log('\nNo issues detected!');
    }
    
    console.log('='.repeat(60) + '\n');
  }

  async startContinuousMonitoring(intervalMinutes = 5) {
    sendColoredLog('info', `Starting continuous monitoring every ${intervalMinutes} minutes...`);
    
    // Run initial check
    await this.runHealthCheck();
    
    // Schedule periodic checks
    setInterval(async () => {
      await this.runHealthCheck();
      
      // Alert on critical issues
      if (!this.lastCheck.healthy) {
        sendColoredLog('error', `🚨 ALERT: Kafka monitoring unhealthy for ${this.clusterName}`);
        // Here you could send alerts via email, Slack, PagerDuty, etc.
      }
    }, intervalMinutes * 60 * 1000);
  }
}

// CLI Usage
if (require.main === module) {
  const clusterName = process.argv[2];
  const mode = process.argv[3] || 'once';
  
  if (!clusterName) {
    console.error('Usage: node monitor-kafka-health.js <cluster-name> [once|continuous]');
    process.exit(1);
  }
  
  const monitor = new KafkaHealthMonitor(clusterName);
  
  if (mode === 'continuous') {
    monitor.startContinuousMonitoring();
    
    // Keep process alive
    process.on('SIGINT', () => {
      sendColoredLog('info', '\nStopping health monitor...');
      process.exit(0);
    });
  } else {
    monitor.runHealthCheck().then(result => {
      process.exit(result.healthy ? 0 : 1);
    });
  }
}

module.exports = KafkaHealthMonitor;