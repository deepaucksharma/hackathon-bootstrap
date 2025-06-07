#!/usr/bin/env node

/**
 * UI-Compatible AWS MSK Payload Solution
 * 
 * Based on analysis of query-utils-zone, this creates payloads that match
 * exactly what the Message Queues UI expects.
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Load configuration
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

class UICompatibleMSKPayloads {
    constructor() {
        this.accountId = config.newrelic.accountId;
        this.apiKey = config.newrelic.apiKey;
        this.apiUrl = `https://insights-collector.newrelic.com/v1/accounts/${this.accountId}/events`;
        this.timestamp = Date.now();
    }

    /**
     * Create AWS MSK payloads that match UI query expectations
     * Based on query-utils.ts analysis:
     * - UI searches for entities with domain='INFRA' and specific types
     * - Uses event types: AwsMskBrokerSample, AwsMskClusterSample, AwsMskTopicSample
     * - Requires specific field mappings for provider data
     */
    createMSKPayloads(clusterName, brokerCount = 3, topicCount = 5) {
        const events = [];
        
        // 1. Cluster Sample - matches AWS_CLUSTER_QUERY_FILTER
        events.push({
            eventType: "AwsMskClusterSample",
            entityGuid: this.generateGuid('cluster', clusterName),
            entityName: clusterName,
            entityType: "AWSMSKCLUSTER",
            "provider": "AwsMskCluster",
            "provider.clusterName": clusterName,
            "provider.activeControllerCount.Sum": 1,
            "provider.offlinePartitionsCount.Sum": 0,
            "provider.globalPartitionCount.Average": topicCount * 3,
            "aws.clusterName": clusterName,
            "aws.kafka.ClusterName": clusterName,
            "aws.msk.clusterName": clusterName,
            "aws.region": "us-east-1",
            "collector.name": "cloudwatch-metric-streams",
            "timestamp": this.timestamp
        });

        // 2. Broker Samples - matches AWS_BROKER_QUERY_FILTER
        for (let i = 1; i <= brokerCount; i++) {
            const brokerName = `${clusterName}-broker-${i}`;
            events.push({
                eventType: "AwsMskBrokerSample",
                entityGuid: this.generateGuid('broker', brokerName),
                entityName: brokerName,
                entityType: "AWSMSKBROKER",
                displayName: brokerName,
                "provider": "AwsMskBroker",
                "provider.clusterName": clusterName,
                "provider.brokerId": i.toString(),
                "provider.bytesInPerSec.Average": Math.random() * 100000,
                "provider.bytesOutPerSec.Average": Math.random() * 80000,
                "provider.underReplicatedPartitions.Sum": 0,
                "provider.underMinIsrPartitionCount.Sum": 0,
                "aws.clusterName": clusterName,
                "aws.kafka.ClusterName": clusterName,
                "aws.msk.clusterName": clusterName,
                "aws.kafka.BrokerID": i.toString(),
                "aws.msk.brokerId": i.toString(),
                "aws.region": "us-east-1",
                "collector.name": "cloudwatch-metric-streams",
                "timestamp": this.timestamp
            });
        }

        // 3. Topic Samples - matches AWS_TOPIC_QUERY_FILTER
        const topics = [
            "orders", "payments", "inventory", "users", "events"
        ].slice(0, topicCount);

        topics.forEach((topicName, idx) => {
            const fullTopicName = `${clusterName}-${topicName}`;
            
            // Create topic samples for each broker (matching query expectations)
            for (let brokerId = 1; brokerId <= brokerCount; brokerId++) {
                events.push({
                    eventType: "AwsMskTopicSample",
                    entityGuid: this.generateGuid('topic', `${fullTopicName}-${brokerId}`),
                    entityName: fullTopicName,
                    entityType: "AWSMSKTOPIC",
                    displayName: fullTopicName,
                    "provider": "AwsMskTopic",
                    "provider.clusterName": clusterName,
                    "provider.brokerId": brokerId.toString(),
                    "provider.topic": topicName,
                    "provider.bytesInPerSec.Average": Math.random() * 50000,
                    "provider.bytesOutPerSec.Average": Math.random() * 40000,
                    "provider.messagesInPerSec.Average": Math.random() * 1000,
                    "provider.messagesOutPerSec.Average": Math.random() * 800,
                    "aws.clusterName": clusterName,
                    "aws.kafka.ClusterName": clusterName,
                    "aws.msk.clusterName": clusterName,
                    "aws.kafka.Topic": topicName,
                    "aws.msk.topic": topicName,
                    "aws.kafka.BrokerID": brokerId.toString(),
                    "aws.msk.brokerId": brokerId.toString(),
                    "aws.region": "us-east-1",
                    "collector.name": "cloudwatch-metric-streams",
                    "timestamp": this.timestamp
                });
            }
        });

        // 4. Also create Metric events (for metric stream compatibility)
        // These match the MTS_QUERIES patterns in query-utils.ts
        events.push(...this.createMetricStreamEvents(clusterName, brokerCount, topics));

        return events;
    }

    /**
     * Create Metric events that match metric stream query patterns
     */
    createMetricStreamEvents(clusterName, brokerCount, topics) {
        const metricEvents = [];
        
        // Cluster-level metrics
        metricEvents.push({
            eventType: "Metric",
            metricName: "aws.kafka.ActiveControllerCount",
            "aws.kafka.ClusterName": clusterName,
            "aws.msk.clusterName": clusterName,
            "entity.guid": this.generateGuid('cluster', clusterName),
            "entity.name": clusterName,
            "entity.type": "AWSMSKCLUSTER",
            value: 1,
            timestamp: this.timestamp
        });

        metricEvents.push({
            eventType: "Metric",
            metricName: "aws.kafka.OfflinePartitionsCount",
            "aws.kafka.ClusterName": clusterName,
            "aws.msk.clusterName": clusterName,
            "entity.guid": this.generateGuid('cluster', clusterName),
            "entity.name": clusterName,
            "entity.type": "AWSMSKCLUSTER",
            value: 0,
            timestamp: this.timestamp
        });

        // Broker-level metrics
        for (let i = 1; i <= brokerCount; i++) {
            const brokerName = `${clusterName}-broker-${i}`;
            
            metricEvents.push({
                eventType: "Metric",
                metricName: "aws.kafka.BytesInPerSec.byBroker",
                "aws.kafka.ClusterName": clusterName,
                "aws.msk.clusterName": clusterName,
                "aws.kafka.BrokerID": i.toString(),
                "aws.msk.brokerId": i.toString(),
                "entity.guid": this.generateGuid('broker', brokerName),
                "entity.name": brokerName,
                "entity.type": "AWSMSKBROKER",
                value: Math.random() * 100000,
                timestamp: this.timestamp
            });
        }

        // Topic-level metrics
        topics.forEach(topicName => {
            const fullTopicName = `${clusterName}-${topicName}`;
            
            metricEvents.push({
                eventType: "Metric",
                metricName: "aws.kafka.BytesInPerSec.byTopic",
                "aws.kafka.ClusterName": clusterName,
                "aws.msk.clusterName": clusterName,
                "aws.kafka.Topic": topicName,
                "aws.msk.topic": topicName,
                "entity.guid": this.generateGuid('topic', fullTopicName),
                "entity.name": fullTopicName,
                "entity.type": "AWSMSKTOPIC",
                displayName: fullTopicName,
                value: Math.random() * 50000,
                timestamp: this.timestamp
            });
        });

        return metricEvents;
    }

    /**
     * Create entity synthesis rules to ensure entity creation
     */
    createEntitySynthesisPayloads(clusterName) {
        // Based on the entity synthesis guide, we need to provide
        // the minimum required fields for entity creation
        const synthesisTriggers = [];

        // Cluster entity synthesis trigger
        synthesisTriggers.push({
            eventType: "InfrastructureEvent",
            entityGuid: this.generateGuid('cluster', clusterName),
            entityName: clusterName,
            entityType: "AWSMSKCLUSTER",
            "entity.guid": this.generateGuid('cluster', clusterName),
            "entity.name": clusterName,
            "entity.type": "AWSMSKCLUSTER",
            "domain": "INFRA",
            "type": "AWSMSKCLUSTER",
            "provider": "AwsMsk",
            "integrationName": "aws-msk",
            "integrationVersion": "1.0.0",
            timestamp: this.timestamp
        });

        return synthesisTriggers;
    }

    generateGuid(type, name) {
        // Generate consistent GUIDs based on account, type, and name
        const components = [
            this.accountId,
            'INFRA',
            type.toUpperCase(),
            name
        ];
        
        // Simple hash function for consistent GUID generation
        const hash = components.join('|');
        const encoded = Buffer.from(hash).toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
        
        return encoded.substring(0, 32);
    }

    async submitEvents(events) {
        try {
            console.log(`Submitting ${events.length} events to New Relic...`);
            
            const response = await axios.post(
                this.apiUrl,
                events,
                {
                    headers: {
                        'Api-Key': this.apiKey,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('✅ Events submitted successfully:', response.data);
            return true;
        } catch (error) {
            console.error('❌ Error submitting events:', error.response?.data || error.message);
            return false;
        }
    }

    async verifyInUI() {
        console.log('\n📊 Verification Queries for New Relic UI:\n');
        
        console.log('1. Check for AWS MSK Entities:');
        console.log(`FROM AwsMskClusterSample SELECT count(*) WHERE provider.clusterName = '${this.clusterName}' SINCE 10 minutes ago`);
        
        console.log('\n2. Check Entity Explorer:');
        console.log(`Navigate to: Entity Explorer > Infrastructure > AWS MSK`);
        
        console.log('\n3. Check Message Queues UI:');
        console.log(`Navigate to: Infrastructure > Third-party services > Message queues`);
        
        console.log('\n4. GraphQL Query for Entities:');
        console.log(`{
  actor {
    entitySearch(query: "domain IN ('INFRA') AND type IN ('AWSMSKCLUSTER', 'AWSMSKBROKER', 'AWSMSKTOPIC') AND name LIKE '%${this.clusterName}%'") {
      results {
        entities {
          guid
          name
          type
          reporting
        }
      }
    }
  }
}`);
    }
}

// Execute the solution
async function main() {
    const solution = new UICompatibleMSKPayloads();
    
    // Generate cluster name with timestamp
    const clusterName = `test-msk-cluster-${Date.now()}`;
    solution.clusterName = clusterName;
    
    console.log('🚀 Creating UI-Compatible AWS MSK Payloads\n');
    console.log(`Cluster Name: ${clusterName}`);
    console.log(`Account ID: ${solution.accountId}`);
    console.log('----------------------------------------\n');
    
    // Create all required payloads
    const mskPayloads = solution.createMSKPayloads(clusterName, 3, 5);
    const synthesisTriggers = solution.createEntitySynthesisPayloads(clusterName);
    
    console.log(`📦 Generated Payloads:`);
    console.log(`- MSK Event Samples: ${mskPayloads.filter(e => e.eventType.includes('Sample')).length}`);
    console.log(`- Metric Events: ${mskPayloads.filter(e => e.eventType === 'Metric').length}`);
    console.log(`- Entity Synthesis Triggers: ${synthesisTriggers.length}`);
    
    // Submit all events
    console.log('\n📤 Submitting Events...\n');
    
    // Submit synthesis triggers first
    await solution.submitEvents(synthesisTriggers);
    
    // Wait a moment for entity creation
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Submit MSK events
    await solution.submitEvents(mskPayloads);
    
    // Save payloads for reference
    const outputDir = path.join(__dirname, 'test-payloads');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
    }
    
    fs.writeFileSync(
        path.join(outputDir, `ui-compatible-payloads-${Date.now()}.json`),
        JSON.stringify({
            clusterName,
            timestamp: solution.timestamp,
            mskPayloads,
            synthesisTriggers
        }, null, 2)
    );
    
    console.log('\n✅ Payloads saved to test-payloads directory');
    
    // Show verification instructions
    await solution.verifyInUI();
}

// Run the solution
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { UICompatibleMSKPayloads };