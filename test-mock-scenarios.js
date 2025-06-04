#!/usr/bin/env node

// Mock test scenarios for verify-kafka-metrics.js
// This simulates different data conditions without requiring real API access

const fs = require('fs');
const path = require('path');

// Mock scenarios
const SCENARIOS = {
  'healthy-cluster': {
    name: 'Healthy Cluster - All metrics present',
    description: 'Simulates a fully healthy Kafka cluster with all metrics',
    mockData: {
      'MSK Polling Data': {
        '1.1': { count: 3, hasData: true },
        '1.2': { hasActiveController: 3, hasOfflinePartitions: 3, hasGlobalPartitions: 3 },
        '1.3': { count: 9, hasData: true },
        '1.4': { hasBytesIn: 9, hasBytesOut: 9, hasMessagesIn: 9 },
        '1.5': { count: 150, hasData: true },
        '1.6': { hasBytesIn: 150, hasBytesOut: 150 },
        '1.7': { hasClusterName: 3, hasEntityGuid: 3 },
        '1.8': { hasClusterName: 9, hasBrokerId: 9 },
        '1.9': { hasTopicName: 150, hasDisplayName: 150 }
      },
      'Health Metrics': {
        '7.1': { 
          clusters: [
            { name: 'prod-1', activeControllers: 1, offlinePartitions: 0, status: 'OK' },
            { name: 'prod-2', activeControllers: 1, offlinePartitions: 0, status: 'OK' },
            { name: 'prod-3', activeControllers: 1, offlinePartitions: 0, status: 'OK' }
          ]
        },
        '7.2': { underReplicated: 0, underMinIsr: 0 },
        '7.3': { total: 3, unhealthy: 0 }
      },
      'Data Quality': {
        '4.2': { clusters: [
          { name: 'prod-1', lastDataPoint: Date.now() - 30000, ageInSeconds: 30 },
          { name: 'prod-2', lastDataPoint: Date.now() - 45000, ageInSeconds: 45 },
          { name: 'prod-3', lastDataPoint: Date.now() - 60000, ageInSeconds: 60 }
        ]}
      }
    },
    expectedScore: 95
  },
  
  'unhealthy-cluster': {
    name: 'Unhealthy Cluster - Critical issues',
    description: 'Simulates a cluster with offline partitions and controller issues',
    mockData: {
      'MSK Polling Data': {
        '1.1': { count: 3, hasData: true },
        '1.2': { hasActiveController: 3, hasOfflinePartitions: 3, hasGlobalPartitions: 3 },
        '1.3': { count: 9, hasData: true },
        '1.4': { hasBytesIn: 9, hasBytesOut: 9, hasMessagesIn: 9 },
        '1.5': { count: 150, hasData: true }
      },
      'Health Metrics': {
        '7.1': { 
          clusters: [
            { name: 'prod-1', activeControllers: 0, offlinePartitions: 5, status: 'CRITICAL' },
            { name: 'prod-2', activeControllers: 2, offlinePartitions: 0, status: 'CRITICAL' },
            { name: 'prod-3', activeControllers: 1, offlinePartitions: 3, status: 'CRITICAL' }
          ]
        },
        '7.2': { underReplicated: 15, underMinIsr: 8 },
        '7.3': { total: 3, unhealthy: 3 }
      }
    },
    expectedScore: 60
  },
  
  'partial-data': {
    name: 'Partial Data - Missing metric streams',
    description: 'Simulates environment with only polling data, no metric streams',
    mockData: {
      'MSK Polling Data': {
        '1.1': { count: 3, hasData: true },
        '1.2': { hasActiveController: 3, hasOfflinePartitions: 3, hasGlobalPartitions: 3 },
        '1.3': { count: 9, hasData: true }
      },
      'Metric Streams Data': {
        '2.1': { count: 0, hasData: false },
        '2.2': { hasActiveController: 0, hasOfflinePartitions: 0 },
        '2.3': { hasBrokerBytesIn: 0, hasBrokerBytesOut: 0 },
        '2.4': { hasTopicBytesIn: 0, hasTopicBytesOut: 0 },
        '2.5': { hasClusterName: 0, hasBrokerId: 0 }
      }
    },
    expectedScore: 75
  },
  
  'stale-data': {
    name: 'Stale Data - Old timestamps',
    description: 'Simulates cluster with data older than 10 minutes',
    mockData: {
      'Data Quality': {
        '4.2': { clusters: [
          { name: 'prod-1', lastDataPoint: Date.now() - 900000, ageInSeconds: 900 },
          { name: 'prod-2', lastDataPoint: Date.now() - 1200000, ageInSeconds: 1200 },
          { name: 'prod-3', lastDataPoint: Date.now() - 1800000, ageInSeconds: 1800 }
        ]},
        '4.3': { clusters: [
          { name: 'prod-1', lastDataPoint: Date.now() - 900000, ageInSeconds: 900 }
        ]}
      },
      'Edge Cases': {
        '11.2': { 
          staleClusters: [
            { name: 'prod-1', minutesSinceUpdate: 15 },
            { name: 'prod-2', minutesSinceUpdate: 20 },
            { name: 'prod-3', minutesSinceUpdate: 30 }
          ]
        }
      }
    },
    expectedScore: 50
  },
  
  'no-data': {
    name: 'No Data - Complete failure',
    description: 'Simulates complete lack of data',
    mockData: {
      'MSK Polling Data': {
        '1.1': { count: 0, hasData: false },
        '1.2': { hasActiveController: 0, hasOfflinePartitions: 0, hasGlobalPartitions: 0 },
        '1.3': { count: 0, hasData: false }
      },
      'Metric Streams Data': {
        '2.1': { count: 0, hasData: false }
      },
      'Standard Kafka Integration': {
        '3.1': { count: 0, hasData: false },
        '3.2': { count: 0, hasData: false }
      }
    },
    expectedScore: 0
  },
  
  'large-scale': {
    name: 'Large Scale - High volume metrics',
    description: 'Simulates very large Kafka deployment',
    mockData: {
      'MSK Polling Data': {
        '1.1': { count: 50, hasData: true },
        '1.3': { count: 500, hasData: true },
        '1.5': { count: 10000, hasData: true }
      },
      'Performance Metrics': {
        '10.1': { clusterEvents: 50000, brokerEvents: 500000, topicEvents: 1000000 },
        '10.2': { largeClusters: [
          { name: 'mega-cluster-1', topicCount: 5000 },
          { name: 'mega-cluster-2', topicCount: 3500 },
          { name: 'mega-cluster-3', topicCount: 2000 }
        ]}
      },
      'Edge Cases': {
        '14.4': { 
          clustersWithManyTopics: [
            { name: 'mega-cluster-1', topicCount: 5000 },
            { name: 'mega-cluster-2', topicCount: 3500 }
          ]
        }
      }
    },
    expectedScore: 90
  },
  
  'mixed-health': {
    name: 'Mixed Health - Some healthy, some unhealthy',
    description: 'Simulates environment with mixed cluster health',
    mockData: {
      'Health Metrics': {
        '7.1': { 
          clusters: [
            { name: 'prod-1', activeControllers: 1, offlinePartitions: 0, status: 'OK' },
            { name: 'prod-2', activeControllers: 0, offlinePartitions: 10, status: 'CRITICAL' },
            { name: 'prod-3', activeControllers: 1, offlinePartitions: 0, status: 'OK' },
            { name: 'prod-4', activeControllers: 1, offlinePartitions: 2, status: 'CRITICAL' },
            { name: 'prod-5', activeControllers: 1, offlinePartitions: 0, status: 'OK' }
          ]
        },
        '7.3': { total: 5, unhealthy: 2 }
      },
      'Account Aggregation': {
        '9.2': { totalClusters: 5, unhealthyClusters: 2 }
      }
    },
    expectedScore: 80
  }
};

// Generate mock verification report
function generateMockReport(scenario) {
  const report = {
    scenario: scenario.name,
    description: scenario.description,
    timestamp: new Date().toISOString(),
    summary: {
      expectedScore: scenario.expectedScore,
      mockDataPoints: Object.keys(scenario.mockData).reduce((acc, cat) => {
        return acc + Object.keys(scenario.mockData[cat]).length;
      }, 0)
    },
    categories: {},
    recommendations: []
  };

  // Process each category
  Object.entries(scenario.mockData).forEach(([category, queries]) => {
    report.categories[category] = {
      queries: Object.entries(queries).map(([queryId, data]) => ({
        id: queryId,
        data: data,
        hasData: data.hasData !== false && (data.count > 0 || Object.values(data).some(v => v > 0))
      }))
    };
  });

  // Generate recommendations based on scenario
  if (scenario.expectedScore < 50) {
    report.recommendations.push({
      severity: 'critical',
      message: 'Critical: No data available. Check integration configuration.'
    });
  } else if (scenario.expectedScore < 80) {
    report.recommendations.push({
      severity: 'warning', 
      message: 'Warning: Some metrics missing or clusters unhealthy.'
    });
  }

  return report;
}

// Main execution
function main() {
  const scenarioName = process.argv[2] || 'healthy-cluster';
  
  if (scenarioName === 'list') {
    console.log('Available scenarios:');
    Object.keys(SCENARIOS).forEach(name => {
      console.log(`  ${name}: ${SCENARIOS[name].description}`);
    });
    return;
  }

  const scenario = SCENARIOS[scenarioName];
  if (!scenario) {
    console.error(`Unknown scenario: ${scenarioName}`);
    console.error('Use "list" to see available scenarios');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log(`Running Mock Scenario: ${scenario.name}`);
  console.log('='.repeat(60));
  console.log(`Description: ${scenario.description}`);
  console.log(`Expected Score: ${scenario.expectedScore}%\n`);

  const report = generateMockReport(scenario);
  
  // Display summary
  console.log('Mock Data Summary:');
  console.log('-'.repeat(60));
  Object.entries(report.categories).forEach(([category, data]) => {
    const withData = data.queries.filter(q => q.hasData).length;
    const total = data.queries.length;
    console.log(`${category}: ${withData}/${total} queries with data`);
  });

  // Display recommendations
  if (report.recommendations.length > 0) {
    console.log('\nRecommendations:');
    console.log('-'.repeat(60));
    report.recommendations.forEach(rec => {
      console.log(`[${rec.severity.toUpperCase()}] ${rec.message}`);
    });
  }

  // Save report
  const filename = `mock-report-${scenarioName}-${Date.now()}.json`;
  fs.writeFileSync(filename, JSON.stringify(report, null, 2));
  console.log(`\nMock report saved to: ${filename}`);

  // Exit with appropriate code
  process.exit(scenario.expectedScore >= 90 ? 0 : 1);
}

// Run if executed directly
if (require.main === module) {
  main();
}