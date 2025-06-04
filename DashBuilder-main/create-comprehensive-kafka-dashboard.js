#!/usr/bin/env node

const { IntelligentDashboardBuilder } = require('./src/core/IntelligentDashboardBuilder');
const fs = require('fs');
const path = require('path');

async function createKafkaDashboard() {
    console.log('🚀 Creating Comprehensive Kafka Dashboard...\n');

    // Load discovery results
    const discoveryFiles = fs.readdirSync('.').filter(f => f.startsWith('kafka-full-discovery-'));
    const latestDiscovery = discoveryFiles.sort().pop();
    
    if (!latestDiscovery) {
        console.error('❌ No discovery file found. Please run discover-kafka-all-attributes.js first.');
        process.exit(1);
    }

    const discoveryData = JSON.parse(fs.readFileSync(latestDiscovery, 'utf8'));
    console.log(`📊 Loaded discovery data from: ${latestDiscovery}`);
    console.log(`   Event Types: ${Object.keys(discoveryData.eventTypes).length}`);
    console.log(`   Total Metrics: ${discoveryData.summary.totalMetrics}`);
    console.log(`   Total Attributes: ${discoveryData.summary.totalAttributes}\n`);

    const builder = new IntelligentDashboardBuilder({
        apiKey: process.env.NEW_RELIC_API_KEY || process.env.UKEY,
        accountId: process.env.NEW_RELIC_ACCOUNT_ID || process.env.ACC,
        queryKey: process.env.NEW_RELIC_QUERY_KEY || process.env.QKey
    });

    const dashboardConfig = {
        name: 'Comprehensive Kafka Monitoring Dashboard',
        description: 'Complete Kafka monitoring with all discovered metrics and attributes',
        pages: []
    };

    // Page 1: Cluster Overview
    const overviewPage = {
        name: 'Cluster Overview',
        widgets: []
    };

    // Add cluster health widget
    overviewPage.widgets.push({
        title: 'Cluster Health Status',
        type: 'billboard',
        queries: [{
            nrql: `SELECT 
                count(DISTINCT broker.id) as 'Active Brokers',
                count(DISTINCT topic) as 'Total Topics',
                uniqueCount(partition) as 'Total Partitions'
                FROM KafkaBrokerSample, KafkaTopicSample 
                WHERE clusterName IS NOT NULL 
                SINCE 1 hour ago`
        }],
        layout: { column: 1, row: 1, width: 4, height: 3 }
    });

    // Add broker metrics
    overviewPage.widgets.push({
        title: 'Broker Throughput',
        type: 'line',
        queries: [{
            nrql: `SELECT 
                average(broker.IOInPerSecond) as 'In',
                average(broker.IOOutPerSecond) as 'Out'
                FROM KafkaBrokerSample 
                TIMESERIES SINCE 1 hour ago`
        }],
        layout: { column: 5, row: 1, width: 4, height: 3 }
    });

    // Add message rates
    overviewPage.widgets.push({
        title: 'Message Rates',
        type: 'line',
        queries: [{
            nrql: `SELECT 
                average(broker.messagesInPerSecond) as 'Messages/sec'
                FROM KafkaBrokerSample 
                TIMESERIES SINCE 1 hour ago`
        }],
        layout: { column: 9, row: 1, width: 4, height: 3 }
    });

    dashboardConfig.pages.push(overviewPage);

    // Page 2: Broker Metrics
    const brokerPage = {
        name: 'Broker Metrics',
        widgets: []
    };

    // Network metrics
    brokerPage.widgets.push({
        title: 'Network Request Rates',
        type: 'line',
        queries: [{
            nrql: `SELECT 
                average(request.avgTimeFetch) as 'Fetch Time',
                average(request.avgTimeMetadata) as 'Metadata Time',
                average(request.avgTimeProduce) as 'Produce Time'
                FROM KafkaBrokerSample 
                FACET broker.id
                TIMESERIES SINCE 1 hour ago`
        }],
        layout: { column: 1, row: 1, width: 6, height: 3 }
    });

    // Replication metrics
    brokerPage.widgets.push({
        title: 'Replication Health',
        type: 'line',
        queries: [{
            nrql: `SELECT 
                average(replication.isrExpandsPerSecond) as 'ISR Expands',
                average(replication.isrShrinksPerSecond) as 'ISR Shrinks',
                average(replication.unreplicatedPartitions) as 'Unreplicated'
                FROM KafkaBrokerSample 
                TIMESERIES SINCE 1 hour ago`
        }],
        layout: { column: 7, row: 1, width: 6, height: 3 }
    });

    dashboardConfig.pages.push(brokerPage);

    // Page 3: Consumer Lag
    const consumerPage = {
        name: 'Consumer Lag',
        widgets: []
    };

    // Consumer lag overview
    consumerPage.widgets.push({
        title: 'Consumer Group Lag',
        type: 'table',
        queries: [{
            nrql: `SELECT 
                latest(consumerGroup.totalLag) as 'Total Lag',
                latest(consumerGroup.maxLag) as 'Max Lag',
                uniqueCount(topic) as 'Topics'
                FROM KafkaOffsetSample 
                FACET consumerGroup 
                SINCE 1 hour ago
                LIMIT 20`
        }],
        layout: { column: 1, row: 1, width: 6, height: 4 }
    });

    // Lag trend
    consumerPage.widgets.push({
        title: 'Consumer Lag Trend',
        type: 'line',
        queries: [{
            nrql: `SELECT 
                average(consumer.lag) as 'Lag'
                FROM KafkaOffsetSample 
                FACET consumerGroup
                TIMESERIES SINCE 1 hour ago`
        }],
        layout: { column: 7, row: 1, width: 6, height: 4 }
    });

    dashboardConfig.pages.push(consumerPage);

    // Page 4: Topic Metrics
    const topicPage = {
        name: 'Topic Metrics',
        widgets: []
    };

    // Topic health
    topicPage.widgets.push({
        title: 'Topic Health',
        type: 'table',
        queries: [{
            nrql: `SELECT 
                latest(topic.underReplicatedPartitions) as 'Under Replicated',
                latest(topic.partitionsWithNonPreferredLeader) as 'Non-Preferred Leader'
                FROM KafkaTopicSample 
                FACET topic 
                WHERE topic.underReplicatedPartitions > 0 
                   OR topic.partitionsWithNonPreferredLeader > 0
                SINCE 1 hour ago`
        }],
        layout: { column: 1, row: 1, width: 12, height: 4 }
    });

    dashboardConfig.pages.push(topicPage);

    // Page 5: System Metrics
    const systemPage = {
        name: 'System Metrics',
        widgets: []
    };

    // JVM metrics
    systemPage.widgets.push({
        title: 'JVM Memory Usage',
        type: 'line',
        queries: [{
            nrql: `SELECT 
                average(jvm.bufferMemoryAvailable) as 'Buffer Memory Available',
                average(jvm.gc.scavengePerSecond) as 'GC Scavenge/sec'
                FROM KafkaBrokerSample 
                FACET broker.id
                TIMESERIES SINCE 1 hour ago`
        }],
        layout: { column: 1, row: 1, width: 6, height: 3 }
    });

    // File descriptors
    systemPage.widgets.push({
        title: 'File Descriptors',
        type: 'line',
        queries: [{
            nrql: `SELECT 
                average(broker.logFlushPerSecond) as 'Log Flushes/sec',
                average(disk.used) as 'Disk Usage'
                FROM KafkaBrokerSample 
                FACET broker.id
                TIMESERIES SINCE 1 hour ago`
        }],
        layout: { column: 7, row: 1, width: 6, height: 3 }
    });

    dashboardConfig.pages.push(systemPage);

    // Create the dashboard
    try {
        console.log('📤 Creating dashboard in New Relic...');
        const result = await builder.createDashboard(dashboardConfig);
        
        console.log('\n✅ Dashboard created successfully!');
        console.log(`📊 Dashboard Name: ${result.name}`);
        console.log(`🔗 Dashboard URL: https://one.newrelic.com/dashboards/${result.guid}`);
        console.log(`📱 Dashboard GUID: ${result.guid}`);
        console.log(`📄 Total Pages: ${result.pages.length}`);
        console.log(`📈 Total Widgets: ${result.pages.reduce((sum, p) => sum + p.widgets.length, 0)}`);

        // Save deployment info
        const deploymentInfo = {
            timestamp: new Date().toISOString(),
            dashboard: result,
            discoveryFile: latestDiscovery,
            metrics: discoveryData.summary
        };

        fs.writeFileSync(
            `kafka-dashboard-deployment-${Date.now()}.json`,
            JSON.stringify(deploymentInfo, null, 2)
        );

        console.log('\n💾 Deployment info saved to file.');

    } catch (error) {
        console.error('❌ Error creating dashboard:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
        process.exit(1);
    }
}

// Run the dashboard creation
createKafkaDashboard().catch(console.error);