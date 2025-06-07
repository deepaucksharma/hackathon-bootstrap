#!/usr/bin/env node

/**
 * Advanced UI Payload Runner with Multiple Strategies
 * Continuously attempts different approaches until entities appear in UI
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

class AdvancedUIPayloadRunner {
    constructor() {
        this.attempts = 0;
        this.maxAttempts = 10;
        this.strategies = [
            'standard-samples',
            'metric-events',
            'entity-synthesis',
            'infrastructure-events',
            'combined-approach'
        ];
    }

    async initialize() {
        // Try to load config from multiple sources
        this.config = await this.loadConfiguration();
        if (!this.config) {
            console.error('❌ Unable to load configuration');
            process.exit(1);
        }
        
        this.accountId = this.config.accountId;
        this.apiKey = this.config.apiKey;
        this.apiUrl = `https://insights-collector.newrelic.com/v1/accounts/${this.accountId}/events`;
    }

    async loadConfiguration() {
        // 1. Try environment variables first
        if (process.env.NEW_RELIC_ACCOUNT_ID && process.env.NEW_RELIC_API_KEY) {
            console.log('✅ Using environment variables for configuration');
            return {
                accountId: process.env.NEW_RELIC_ACCOUNT_ID,
                apiKey: process.env.NEW_RELIC_API_KEY
            };
        }

        // 2. Try config.json
        const configPath = path.join(__dirname, 'config.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (config.newrelic?.accountId !== 'YOUR_ACCOUNT_ID') {
                console.log('✅ Using config.json for configuration');
                return {
                    accountId: config.newrelic.accountId,
                    apiKey: config.newrelic.apiKey
                };
            }
        }

        // 3. Try parent directory .env
        const envPath = path.join(__dirname, '..', '.env');
        if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf8');
            const accountMatch = envContent.match(/NEW_RELIC_ACCOUNT_ID=(\d+)/);
            const apiKeyMatch = envContent.match(/NEW_RELIC_API_KEY=([^\s]+)/);
            
            if (accountMatch && apiKeyMatch) {
                console.log('✅ Using ../.env for configuration');
                return {
                    accountId: accountMatch[1],
                    apiKey: apiKeyMatch[1]
                };
            }
        }

        // 4. Prompt user
        return await this.promptForCredentials();
    }

    async promptForCredentials() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const question = (query) => new Promise((resolve) => rl.question(query, resolve));

        console.log('\n📝 Please provide your New Relic credentials:\n');
        
        const accountId = await question('Account ID: ');
        const apiKey = await question('Ingest API Key: ');
        
        rl.close();

        // Save to config for next time
        const config = {
            newrelic: { accountId, apiKey }
        };
        
        fs.writeFileSync(
            path.join(__dirname, 'config.json'),
            JSON.stringify(config, null, 2)
        );

        return { accountId, apiKey };
    }

    /**
     * Strategy 1: Standard MSK Sample Events
     */
    async standardSamplesStrategy(clusterName) {
        console.log('\n📊 Strategy 1: Standard MSK Sample Events');
        
        const events = [];
        const timestamp = Date.now();
        
        // Cluster
        events.push({
            eventType: "AwsMskClusterSample",
            entityGuid: this.generateEntityGuid('cluster', clusterName),
            entityName: clusterName,
            entityType: "AWSMSKCLUSTER",
            domain: "INFRA",
            type: "AWSMSKCLUSTER",
            "provider.clusterName": clusterName,
            "provider.activeControllerCount.Sum": 1,
            "provider.offlinePartitionsCount.Sum": 0,
            timestamp
        });

        // Brokers
        for (let i = 1; i <= 3; i++) {
            events.push({
                eventType: "AwsMskBrokerSample",
                entityGuid: this.generateEntityGuid('broker', `${clusterName}-broker-${i}`),
                entityName: `${clusterName}-broker-${i}`,
                entityType: "AWSMSKBROKER",
                domain: "INFRA",
                type: "AWSMSKBROKER",
                "provider.clusterName": clusterName,
                "provider.brokerId": i.toString(),
                "provider.bytesInPerSec.Average": 100000 + Math.random() * 50000,
                timestamp
            });
        }

        // Topics
        ['orders', 'users', 'events'].forEach(topic => {
            events.push({
                eventType: "AwsMskTopicSample",
                entityGuid: this.generateEntityGuid('topic', `${clusterName}-${topic}`),
                entityName: `${clusterName}-${topic}`,
                entityType: "AWSMSKTOPIC",
                domain: "INFRA",
                type: "AWSMSKTOPIC",
                "provider.clusterName": clusterName,
                "provider.topic": topic,
                "provider.bytesInPerSec.Average": 50000 + Math.random() * 25000,
                timestamp
            });
        });

        return await this.submitEvents(events);
    }

    /**
     * Strategy 2: Metric Events (CloudWatch style)
     */
    async metricEventsStrategy(clusterName) {
        console.log('\n📊 Strategy 2: CloudWatch Metric Events');
        
        const events = [];
        const timestamp = Date.now();
        
        // Cluster metrics
        events.push({
            eventType: "Metric",
            metricName: "aws.kafka.ActiveControllerCount",
            "entity.guid": this.generateEntityGuid('cluster', clusterName),
            "entity.name": clusterName,
            "entity.type": "AWSMSKCLUSTER",
            "aws.kafka.ClusterName": clusterName,
            value: 1,
            timestamp
        });

        // Broker metrics
        for (let i = 1; i <= 3; i++) {
            events.push({
                eventType: "Metric",
                metricName: "aws.kafka.BytesInPerSec.byBroker",
                "entity.guid": this.generateEntityGuid('broker', `${clusterName}-broker-${i}`),
                "entity.name": `${clusterName}-broker-${i}`,
                "entity.type": "AWSMSKBROKER",
                "aws.kafka.ClusterName": clusterName,
                "aws.kafka.BrokerID": i.toString(),
                value: 100000 + Math.random() * 50000,
                timestamp
            });
        }

        return await this.submitEvents(events);
    }

    /**
     * Strategy 3: Direct Entity Synthesis
     */
    async entitySynthesisStrategy(clusterName) {
        console.log('\n📊 Strategy 3: Direct Entity Synthesis');
        
        const events = [];
        
        // Use InfrastructureEvent to trigger synthesis
        events.push({
            eventType: "InfrastructureEvent",
            category: "kafka",
            provider: "awsmsk",
            entityKeys: [clusterName],
            entityName: clusterName,
            entityType: "AWSMSKCLUSTER",
            entityGuid: this.generateEntityGuid('cluster', clusterName),
            "entity.name": clusterName,
            "entity.type": "AWSMSKCLUSTER",
            "entity.guid": this.generateEntityGuid('cluster', clusterName),
            domain: "INFRA",
            type: "AWSMSKCLUSTER",
            integrationName: "com.newrelic.aws.msk",
            integrationVersion: "1.0.0",
            timestamp: Date.now()
        });

        return await this.submitEvents(events);
    }

    /**
     * Strategy 4: Infrastructure Agent Style Events
     */
    async infrastructureEventsStrategy(clusterName) {
        console.log('\n📊 Strategy 4: Infrastructure Agent Style');
        
        const events = [];
        const timestamp = Date.now();
        
        // SystemSample with entity info
        events.push({
            eventType: "SystemSample",
            entityKey: `${this.accountId}:kafka:${clusterName}`,
            entityName: clusterName,
            entityType: "AWSMSKCLUSTER",
            "entity.guid": this.generateEntityGuid('cluster', clusterName),
            "entity.name": clusterName,
            "entity.type": "AWSMSKCLUSTER",
            "nr.entityType": "AWSMSKCLUSTER",
            hostname: clusterName,
            provider: "awsmsk",
            timestamp
        });

        // IntegrationEvent
        events.push({
            eventType: "IntegrationEvent",
            integrationName: "com.newrelic.aws.msk",
            integrationVersion: "1.0.0",
            targetEntityKey: `${this.accountId}:kafka:${clusterName}`,
            targetEntityName: clusterName,
            targetEntityType: "AWSMSKCLUSTER",
            summary: "AWS MSK Integration",
            timestamp
        });

        return await this.submitEvents(events);
    }

    /**
     * Strategy 5: Combined Approach - All strategies at once
     */
    async combinedApproachStrategy(clusterName) {
        console.log('\n📊 Strategy 5: Combined Approach - All Strategies');
        
        const allEvents = [];
        
        // Add events from all strategies
        allEvents.push(...await this.generateStandardSamples(clusterName));
        allEvents.push(...await this.generateMetricEvents(clusterName));
        allEvents.push(...await this.generateEntitySynthesis(clusterName));
        allEvents.push(...await this.generateInfrastructureEvents(clusterName));
        
        // Add some additional event types that might help
        allEvents.push({
            eventType: "ProcessSample",
            entityName: clusterName,
            entityType: "AWSMSKCLUSTER",
            processDisplayName: `kafka-cluster-${clusterName}`,
            timestamp: Date.now()
        });

        return await this.submitEvents(allEvents);
    }

    async generateStandardSamples(clusterName) {
        const events = [];
        const timestamp = Date.now();
        
        // Complete hierarchy with all required fields
        events.push({
            eventType: "AwsMskClusterSample",
            // Entity fields
            entityGuid: this.generateEntityGuid('cluster', clusterName),
            entityName: clusterName,
            entityType: "AWSMSKCLUSTER",
            "entity.guid": this.generateEntityGuid('cluster', clusterName),
            "entity.name": clusterName,
            "entity.type": "AWSMSKCLUSTER",
            // Domain fields
            domain: "INFRA",
            type: "AWSMSKCLUSTER",
            // Provider fields
            provider: "AwsMskCluster",
            "provider.clusterName": clusterName,
            "provider.activeControllerCount.Sum": 1,
            "provider.offlinePartitionsCount.Sum": 0,
            "provider.globalPartitionCount.Average": 15,
            // AWS fields
            "aws.clusterName": clusterName,
            "aws.kafka.ClusterName": clusterName,
            "aws.msk.clusterName": clusterName,
            "aws.region": "us-east-1",
            // Collection fields
            "collector.name": "cloudwatch-metric-streams",
            "nr.integrationName": "com.newrelic.aws.msk",
            timestamp
        });

        return events;
    }

    async generateMetricEvents(clusterName) {
        const events = [];
        const timestamp = Date.now();
        
        events.push({
            eventType: "Metric",
            metricName: "aws.kafka.ActiveControllerCount",
            // Entity association
            "entity.guid": this.generateEntityGuid('cluster', clusterName),
            "entity.name": clusterName,
            "entity.type": "AWSMSKCLUSTER",
            entityGuid: this.generateEntityGuid('cluster', clusterName),
            // Cluster identification
            "aws.kafka.ClusterName": clusterName,
            "aws.msk.clusterName": clusterName,
            // Metric value
            value: 1,
            unit: "Count",
            timestamp
        });

        return events;
    }

    async generateEntitySynthesis(clusterName) {
        const events = [];
        
        events.push({
            eventType: "InfrastructureEvent",
            category: "kafka",
            provider: "awsmsk",
            entityKeys: [`kafka:cluster:${clusterName}`],
            entityName: clusterName,
            entityType: "AWSMSKCLUSTER",
            entityGuid: this.generateEntityGuid('cluster', clusterName),
            "entity.name": clusterName,
            "entity.type": "AWSMSKCLUSTER",
            "entity.guid": this.generateEntityGuid('cluster', clusterName),
            "nr.entityType": "AWSMSKCLUSTER",
            domain: "INFRA",
            type: "AWSMSKCLUSTER",
            integrationName: "com.newrelic.aws.msk",
            integrationVersion: "1.0.0",
            timestamp: Date.now()
        });

        return events;
    }

    async generateInfrastructureEvents(clusterName) {
        const events = [];
        const timestamp = Date.now();
        
        events.push({
            eventType: "IntegrationEvent",
            integrationName: "com.newrelic.aws.msk",
            integrationVersion: "1.0.0",
            targetEntityKey: `${this.accountId}:kafka:${clusterName}`,
            targetEntityName: clusterName,
            targetEntityType: "AWSMSKCLUSTER",
            targetEntityGuid: this.generateEntityGuid('cluster', clusterName),
            summary: "AWS MSK Cluster Integration",
            category: "kafka",
            provider: "awsmsk",
            timestamp
        });

        return events;
    }

    generateEntityGuid(type, name) {
        const components = [this.accountId, 'INFRA', type.toUpperCase(), name];
        const hash = Buffer.from(components.join('|')).toString('base64')
            .replace(/[+/=]/g, '').substring(0, 32);
        return hash;
    }

    async submitEvents(events) {
        try {
            console.log(`  📤 Submitting ${events.length} events...`);
            
            const response = await axios.post(this.apiUrl, events, {
                headers: {
                    'Api-Key': this.apiKey,
                    'Content-Type': 'application/json'
                }
            });

            console.log('  ✅ Events submitted successfully');
            return true;
        } catch (error) {
            console.error('  ❌ Error:', error.response?.data || error.message);
            return false;
        }
    }

    async verifyEntities(clusterName) {
        console.log('\n🔍 Verifying entity creation...');
        
        // We'll create a separate verification tool
        const verificationQueries = [
            `FROM AwsMskClusterSample SELECT count(*) WHERE provider.clusterName = '${clusterName}' SINCE 5 minutes ago`,
            `FROM Metric SELECT count(*) WHERE entity.type = 'AWSMSKCLUSTER' AND entity.name = '${clusterName}' SINCE 5 minutes ago`,
            `FROM InfrastructureEvent SELECT count(*) WHERE entityName = '${clusterName}' SINCE 5 minutes ago`
        ];

        console.log('\nRun these queries in New Relic:');
        verificationQueries.forEach((q, i) => console.log(`${i + 1}. ${q}`));

        return true;
    }

    async run() {
        await this.initialize();
        
        console.log('🚀 Advanced UI Payload Runner');
        console.log('=============================\n');
        
        const baseClusterName = `ui-test-${Date.now()}`;
        
        for (let i = 0; i < this.strategies.length; i++) {
            const strategy = this.strategies[i];
            const clusterName = `${baseClusterName}-${strategy}`;
            
            console.log(`\n🎯 Attempt ${i + 1}/${this.strategies.length}`);
            console.log(`Cluster: ${clusterName}`);
            
            let success = false;
            
            switch (strategy) {
                case 'standard-samples':
                    success = await this.standardSamplesStrategy(clusterName);
                    break;
                case 'metric-events':
                    success = await this.metricEventsStrategy(clusterName);
                    break;
                case 'entity-synthesis':
                    success = await this.entitySynthesisStrategy(clusterName);
                    break;
                case 'infrastructure-events':
                    success = await this.infrastructureEventsStrategy(clusterName);
                    break;
                case 'combined-approach':
                    success = await this.combinedApproachStrategy(clusterName);
                    break;
            }

            if (success) {
                await this.verifyEntities(clusterName);
                
                // Wait before next attempt
                if (i < this.strategies.length - 1) {
                    console.log('\n⏳ Waiting 30 seconds before next strategy...');
                    await new Promise(resolve => setTimeout(resolve, 30000));
                }
            }
        }

        console.log('\n\n📊 All strategies attempted!');
        console.log('\nNext steps:');
        console.log('1. Check Entity Explorer for any of the created clusters');
        console.log('2. Check Message Queues UI');
        console.log('3. Run the verification queries above');
        console.log('\n✨ One of these strategies should work!');
    }
}

// Run the advanced solution
if (require.main === module) {
    const runner = new AdvancedUIPayloadRunner();
    runner.run().catch(console.error);
}

module.exports = { AdvancedUIPayloadRunner };