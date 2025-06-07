#!/usr/bin/env node

/**
 * Entity Relationship Builder for Complete MSK Hierarchy
 * Creates entities with proper relationships for full UI functionality
 */

const axios = require('axios');
const crypto = require('crypto');

class EntityRelationshipBuilder {
    constructor(config) {
        this.accountId = config.accountId;
        this.apiKey = config.apiKey;
        this.apiUrl = `https://insights-collector.newrelic.com/v1/accounts/${this.accountId}/events`;
        this.guidCache = new Map();
    }

    /**
     * Build complete MSK hierarchy with relationships
     */
    async buildMSKHierarchy(options = {}) {
        const {
            clusterName = `msk-hierarchy-${Date.now()}`,
            brokerCount = 3,
            topicsPerBroker = 3,
            partitionsPerTopic = 3,
            consumerGroups = 2,
            producerApplications = 2,
            consumerApplications = 2
        } = options;

        console.log('🏗️  Building MSK Entity Hierarchy');
        console.log('================================\n');
        console.log(`Cluster: ${clusterName}`);
        console.log(`Structure: ${brokerCount} brokers × ${topicsPerBroker} topics × ${partitionsPerTopic} partitions`);
        console.log(`Applications: ${producerApplications} producers, ${consumerApplications} consumers`);
        console.log(`Consumer Groups: ${consumerGroups}\n`);

        const timestamp = Date.now();
        const events = [];

        // 1. Create Cluster Entity
        const clusterGuid = this.generateGuid('cluster', clusterName);
        const clusterEntity = this.createClusterEntity(clusterName, clusterGuid, timestamp);
        events.push(...clusterEntity);

        // 2. Create Broker Entities with relationships to cluster
        const brokerGuids = [];
        for (let i = 1; i <= brokerCount; i++) {
            const brokerName = `${clusterName}-broker-${i}`;
            const brokerGuid = this.generateGuid('broker', brokerName);
            brokerGuids.push({ id: i, guid: brokerGuid, name: brokerName });

            const brokerEntity = this.createBrokerEntity(
                brokerName, 
                brokerGuid, 
                clusterName, 
                clusterGuid, 
                i, 
                timestamp
            );
            events.push(...brokerEntity);
        }

        // 3. Create Topics with relationships to brokers and cluster
        const topicGuids = [];
        const topicNames = this.generateTopicNames(topicsPerBroker * brokerCount);
        
        topicNames.forEach((topicName, idx) => {
            const fullTopicName = `${clusterName}-${topicName}`;
            const topicGuid = this.generateGuid('topic', fullTopicName);
            const assignedBroker = brokerGuids[idx % brokerCount];
            
            topicGuids.push({ 
                name: topicName, 
                fullName: fullTopicName, 
                guid: topicGuid,
                leadBroker: assignedBroker
            });

            const topicEntity = this.createTopicEntity(
                fullTopicName,
                topicGuid,
                topicName,
                clusterName,
                clusterGuid,
                assignedBroker,
                partitionsPerTopic,
                timestamp
            );
            events.push(...topicEntity);
        });

        // 4. Create Consumer Groups
        const consumerGroupGuids = [];
        for (let i = 1; i <= consumerGroups; i++) {
            const groupName = `consumer-group-${i}`;
            const groupGuid = this.generateGuid('consumergroup', groupName);
            consumerGroupGuids.push({ name: groupName, guid: groupGuid });

            const consumerGroupEntity = this.createConsumerGroupEntity(
                groupName,
                groupGuid,
                clusterName,
                clusterGuid,
                topicGuids.slice(0, Math.ceil(topicGuids.length / consumerGroups)),
                timestamp
            );
            events.push(...consumerGroupEntity);
        }

        // 5. Create Producer Applications
        for (let i = 1; i <= producerApplications; i++) {
            const appName = `producer-app-${i}`;
            const appGuid = this.generateGuid('application', appName);
            
            // Each producer writes to multiple topics
            const producedTopics = topicGuids.filter((_, idx) => idx % producerApplications === i - 1);
            
            const producerEntity = this.createProducerApplicationEntity(
                appName,
                appGuid,
                clusterName,
                producedTopics,
                timestamp
            );
            events.push(...producerEntity);
        }

        // 6. Create Consumer Applications
        for (let i = 1; i <= consumerApplications; i++) {
            const appName = `consumer-app-${i}`;
            const appGuid = this.generateGuid('application', appName);
            
            // Each consumer reads from multiple topics
            const consumedTopics = topicGuids.filter((_, idx) => idx % consumerApplications === i - 1);
            const consumerGroup = consumerGroupGuids[i % consumerGroups];
            
            const consumerEntity = this.createConsumerApplicationEntity(
                appName,
                appGuid,
                clusterName,
                consumedTopics,
                consumerGroup,
                timestamp
            );
            events.push(...consumerEntity);
        }

        // 7. Create partition-level metrics for granular visibility
        topicGuids.forEach(topic => {
            for (let partition = 0; partition < partitionsPerTopic; partition++) {
                const partitionEvents = this.createPartitionMetrics(
                    topic,
                    partition,
                    clusterName,
                    timestamp
                );
                events.push(...partitionEvents);
            }
        });

        // 8. Create relationship events to ensure connections
        const relationshipEvents = this.createRelationshipEvents(
            clusterGuid,
            brokerGuids,
            topicGuids,
            consumerGroupGuids,
            timestamp
        );
        events.push(...relationshipEvents);

        console.log(`\n📊 Total Events Generated: ${events.length}`);
        
        // Submit events in batches
        await this.submitEventBatches(events);

        // Return summary for verification
        return {
            clusterName,
            clusterGuid,
            brokerCount: brokerGuids.length,
            topicCount: topicGuids.length,
            eventCount: events.length,
            hierarchy: {
                cluster: clusterName,
                brokers: brokerGuids.map(b => b.name),
                topics: topicGuids.map(t => t.name),
                consumerGroups: consumerGroupGuids.map(g => g.name)
            }
        };
    }

    createClusterEntity(name, guid, timestamp) {
        const events = [];
        
        // Primary cluster sample
        events.push({
            eventType: "AwsMskClusterSample",
            entityGuid: guid,
            entityName: name,
            entityType: "AWSMSKCLUSTER",
            "entity.guid": guid,
            "entity.name": name,
            "entity.type": "AWSMSKCLUSTER",
            domain: "INFRA",
            type: "AWSMSKCLUSTER",
            provider: "AwsMskCluster",
            "provider.clusterName": name,
            "provider.activeControllerCount.Sum": 1,
            "provider.offlinePartitionsCount.Sum": 0,
            "provider.globalPartitionCount.Average": 9,
            "provider.globalTopicCount.Average": 9,
            "aws.clusterName": name,
            "aws.kafka.ClusterName": name,
            "aws.msk.clusterName": name,
            "aws.region": "us-east-1",
            "aws.arn": `arn:aws:kafka:us-east-1:${this.accountId}:cluster/${name}`,
            "collector.name": "cloudwatch-metric-streams",
            timestamp
        });

        // Metric event for metric stream compatibility
        events.push({
            eventType: "Metric",
            metricName: "aws.kafka.ActiveControllerCount",
            "entity.guid": guid,
            "entity.name": name,
            "entity.type": "AWSMSKCLUSTER",
            "aws.kafka.ClusterName": name,
            value: 1,
            timestamp
        });

        return events;
    }

    createBrokerEntity(name, guid, clusterName, clusterGuid, brokerId, timestamp) {
        const events = [];
        
        events.push({
            eventType: "AwsMskBrokerSample",
            entityGuid: guid,
            entityName: name,
            entityType: "AWSMSKBROKER",
            displayName: name,
            "entity.guid": guid,
            "entity.name": name,
            "entity.type": "AWSMSKBROKER",
            domain: "INFRA",
            type: "AWSMSKBROKER",
            provider: "AwsMskBroker",
            "provider.clusterName": clusterName,
            "provider.brokerId": brokerId.toString(),
            "provider.bytesInPerSec.Average": 100000 + Math.random() * 50000,
            "provider.bytesOutPerSec.Average": 80000 + Math.random() * 40000,
            "provider.cpuUser.Average": 20 + Math.random() * 30,
            "provider.underReplicatedPartitions.Sum": 0,
            "provider.underMinIsrPartitionCount.Sum": 0,
            "aws.clusterName": clusterName,
            "aws.kafka.ClusterName": clusterName,
            "aws.msk.clusterName": clusterName,
            "aws.kafka.BrokerID": brokerId.toString(),
            "aws.msk.brokerId": brokerId.toString(),
            // Relationships
            "relationship.clusterGuid": clusterGuid,
            "relationship.clusterName": clusterName,
            timestamp
        });

        return events;
    }

    createTopicEntity(fullName, guid, topicName, clusterName, clusterGuid, broker, partitions, timestamp) {
        const events = [];
        
        events.push({
            eventType: "AwsMskTopicSample",
            entityGuid: guid,
            entityName: fullName,
            entityType: "AWSMSKTOPIC",
            displayName: fullName,
            "entity.guid": guid,
            "entity.name": fullName,
            "entity.type": "AWSMSKTOPIC",
            domain: "INFRA",
            type: "AWSMSKTOPIC",
            provider: "AwsMskTopic",
            "provider.clusterName": clusterName,
            "provider.topic": topicName,
            "provider.brokerId": broker.id.toString(),
            "provider.partitionCount": partitions,
            "provider.replicationFactor": Math.min(3, broker.id),
            "provider.bytesInPerSec.Average": 50000 + Math.random() * 25000,
            "provider.bytesOutPerSec.Average": 40000 + Math.random() * 20000,
            "provider.messagesInPerSec.Average": 1000 + Math.random() * 500,
            "aws.clusterName": clusterName,
            "aws.kafka.ClusterName": clusterName,
            "aws.kafka.Topic": topicName,
            "aws.msk.topic": topicName,
            "aws.kafka.BrokerID": broker.id.toString(),
            // Relationships
            "relationship.clusterGuid": clusterGuid,
            "relationship.clusterName": clusterName,
            "relationship.leadBrokerGuid": broker.guid,
            "relationship.leadBrokerName": broker.name,
            timestamp
        });

        return events;
    }

    createConsumerGroupEntity(name, guid, clusterName, clusterGuid, topics, timestamp) {
        const events = [];
        
        // Consumer group is represented through offset tracking
        topics.forEach(topic => {
            events.push({
                eventType: "KafkaOffsetSample",
                consumerGroup: name,
                "topic": topic.name,
                "provider.clusterName": clusterName,
                "provider.consumerGroup": name,
                "provider.topic": topic.name,
                "provider.lag": Math.floor(Math.random() * 1000),
                "provider.offset": Math.floor(Math.random() * 100000),
                // Relationships
                "relationship.clusterGuid": clusterGuid,
                "relationship.topicGuid": topic.guid,
                timestamp
            });
        });

        return events;
    }

    createProducerApplicationEntity(name, guid, clusterName, topics, timestamp) {
        const events = [];
        
        // APM-style event showing producer relationship
        topics.forEach(topic => {
            events.push({
                eventType: "Transaction",
                appName: name,
                name: `Produce to ${topic.name}`,
                "entity.guid": guid,
                "entity.name": name,
                "entity.type": "APPLICATION",
                // Kafka producer metrics
                "kafka.producer.topic": topic.name,
                "kafka.producer.cluster": clusterName,
                "kafka.producer.recordsSent": Math.floor(Math.random() * 10000),
                "kafka.producer.bytesSent": Math.floor(Math.random() * 1000000),
                // Relationships
                "produces.topicGuid": topic.guid,
                "produces.topicName": topic.fullName,
                "produces.clusterName": clusterName,
                duration: Math.random() * 100,
                timestamp
            });
        });

        return events;
    }

    createConsumerApplicationEntity(name, guid, clusterName, topics, consumerGroup, timestamp) {
        const events = [];
        
        // APM-style event showing consumer relationship
        topics.forEach(topic => {
            events.push({
                eventType: "Transaction",
                appName: name,
                name: `Consume from ${topic.name}`,
                "entity.guid": guid,
                "entity.name": name,
                "entity.type": "APPLICATION",
                // Kafka consumer metrics
                "kafka.consumer.topic": topic.name,
                "kafka.consumer.cluster": clusterName,
                "kafka.consumer.group": consumerGroup.name,
                "kafka.consumer.recordsConsumed": Math.floor(Math.random() * 8000),
                "kafka.consumer.bytesConsumed": Math.floor(Math.random() * 800000),
                "kafka.consumer.lag": Math.floor(Math.random() * 100),
                // Relationships
                "consumes.topicGuid": topic.guid,
                "consumes.topicName": topic.fullName,
                "consumes.clusterName": clusterName,
                "memberOf.consumerGroup": consumerGroup.name,
                duration: Math.random() * 150,
                timestamp
            });
        });

        return events;
    }

    createPartitionMetrics(topic, partition, clusterName, timestamp) {
        const events = [];
        
        events.push({
            eventType: "KafkaPartitionSample",
            "provider.clusterName": clusterName,
            "provider.topic": topic.name,
            "provider.partition": partition,
            "provider.highWaterMark": Math.floor(Math.random() * 100000),
            "provider.lowWaterMark": Math.floor(Math.random() * 90000),
            "provider.logSize": Math.floor(Math.random() * 1000000),
            // Relationships
            "relationship.topicGuid": topic.guid,
            "relationship.leadBrokerGuid": topic.leadBroker.guid,
            timestamp
        });

        return events;
    }

    createRelationshipEvents(clusterGuid, brokers, topics, consumerGroups, timestamp) {
        const events = [];
        
        // Entity relationship event (custom format to ensure relationships)
        events.push({
            eventType: "EntityRelationship",
            relationshipType: "kafka-hierarchy",
            cluster: {
                guid: clusterGuid,
                brokerCount: brokers.length,
                topicCount: topics.length
            },
            brokers: brokers.map(b => ({
                guid: b.guid,
                name: b.name,
                id: b.id
            })),
            topics: topics.map(t => ({
                guid: t.guid,
                name: t.name,
                leadBroker: t.leadBroker.id
            })),
            consumerGroups: consumerGroups.map(g => ({
                name: g.name,
                guid: g.guid
            })),
            timestamp
        });

        return events;
    }

    generateTopicNames(count) {
        const baseTopics = [
            'orders', 'payments', 'inventory', 'users', 'events',
            'logs', 'metrics', 'notifications', 'analytics', 'audit',
            'sessions', 'transactions', 'products', 'customers', 'reports'
        ];

        const topics = [];
        for (let i = 0; i < count; i++) {
            if (i < baseTopics.length) {
                topics.push(baseTopics[i]);
            } else {
                topics.push(`topic-${i + 1}`);
            }
        }

        return topics;
    }

    generateGuid(type, name) {
        const key = `${type}:${name}`;
        if (this.guidCache.has(key)) {
            return this.guidCache.get(key);
        }

        const hash = crypto.createHash('sha256')
            .update(`${this.accountId}:INFRA:${type.toUpperCase()}:${name}`)
            .digest('base64')
            .replace(/[+/=]/g, '')
            .substring(0, 32);

        this.guidCache.set(key, hash);
        return hash;
    }

    async submitEventBatches(events, batchSize = 1000) {
        const batches = [];
        for (let i = 0; i < events.length; i += batchSize) {
            batches.push(events.slice(i, i + batchSize));
        }

        console.log(`\n📤 Submitting ${batches.length} batches...`);

        for (let i = 0; i < batches.length; i++) {
            try {
                await axios.post(this.apiUrl, batches[i], {
                    headers: {
                        'Api-Key': this.apiKey,
                        'Content-Type': 'application/json'
                    }
                });
                console.log(`   ✅ Batch ${i + 1}/${batches.length} submitted (${batches[i].length} events)`);
            } catch (error) {
                console.error(`   ❌ Batch ${i + 1} failed:`, error.response?.data || error.message);
            }
        }
    }
}

// CLI interface
if (require.main === module) {
    async function main() {
        const config = {
            accountId: process.env.NEW_RELIC_ACCOUNT_ID || 'YOUR_ACCOUNT_ID',
            apiKey: process.env.NEW_RELIC_API_KEY || 'YOUR_API_KEY'
        };

        if (config.accountId === 'YOUR_ACCOUNT_ID') {
            console.error('❌ Please set NEW_RELIC_ACCOUNT_ID and NEW_RELIC_API_KEY environment variables');
            process.exit(1);
        }

        const builder = new EntityRelationshipBuilder(config);
        
        const options = {
            clusterName: `hierarchy-test-${Date.now()}`,
            brokerCount: 3,
            topicsPerBroker: 3,
            partitionsPerTopic: 3,
            consumerGroups: 2,
            producerApplications: 2,
            consumerApplications: 2
        };

        const result = await builder.buildMSKHierarchy(options);
        
        console.log('\n\n✅ Hierarchy Build Complete!');
        console.log('===========================\n');
        console.log('Summary:', JSON.stringify(result, null, 2));
        
        console.log('\n📋 Next Steps:');
        console.log(`1. Run entity verifier: node entity-verifier.js ${result.clusterName} --continuous`);
        console.log('2. Check Entity Explorer for the cluster and related entities');
        console.log('3. Check Message Queues UI for the complete hierarchy');
        console.log('4. Look for APM applications showing producer/consumer relationships');
    }

    main().catch(console.error);
}

module.exports = { EntityRelationshipBuilder };