#!/usr/bin/env node

/**
 * APM Service Bridge Approach
 * 
 * Creates APM service entities to represent Kafka components
 * APM has more flexible entity creation rules
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Load environment
function loadEnv() {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split('\n').forEach(line => {
            const match = line.match(/^([^=:#]+?)[=:](.*)/);
            if (match) {
                const key = match[1].trim();
                const value = match[2].trim().replace(/^["']|["']$/g, '');
                process.env[key] = value;
            }
        });
    }
}

class APMServiceBridge {
    constructor() {
        loadEnv();
        
        this.accountId = process.env.ACC;
        this.insertKey = process.env.IKEY;
        this.userKey = process.env.UKEY;
        
        if (!this.accountId || !this.insertKey) {
            console.error('❌ Missing required environment variables');
            process.exit(1);
        }
    }

    /**
     * Create APM Transaction events for Kafka services
     */
    createAPMEvents(clusterName) {
        const timestamp = Date.now();
        const events = [];
        
        // Create a service for the Kafka cluster
        events.push({
            eventType: "Transaction",
            timestamp,
            appName: `kafka-cluster-${clusterName}`,
            name: "KafkaCluster/Health",
            duration: 0.05,
            
            // Transaction attributes
            "response.status": 200,
            "request.method": "INTERNAL",
            "host.displayName": clusterName,
            
            // Kafka cluster attributes
            "kafka.cluster.name": clusterName,
            "kafka.cluster.role": "cluster",
            "kafka.cluster.state": "ACTIVE",
            "kafka.cluster.brokerCount": 3,
            "kafka.cluster.topicCount": 5,
            "kafka.cluster.partitionCount": 30,
            "kafka.cluster.activeControllers": 1,
            "kafka.cluster.offlinePartitions": 0,
            
            // Service metadata
            "service.name": `kafka-cluster-${clusterName}`,
            "service.namespace": "kafka",
            "service.version": "2.8.0",
            "service.framework": "apache-kafka",
            
            // Environment
            "environment": "production",
            "deploymentMethod": "kubernetes",
            
            // Custom attributes for metrics
            "custom.bytesInPerSec": 1000000,
            "custom.bytesOutPerSec": 800000,
            "custom.messagesInPerSec": 1000
        });
        
        // Create services for each broker
        for (let i = 1; i <= 3; i++) {
            events.push({
                eventType: "Transaction",
                timestamp,
                appName: `kafka-broker-${clusterName}-${i}`,
                name: "KafkaBroker/ProcessMessage",
                duration: 0.002 + Math.random() * 0.003,
                
                // Transaction attributes
                "response.status": 200,
                "request.method": "KAFKA",
                "host.displayName": `broker-${i}.${clusterName}`,
                
                // Broker attributes
                "kafka.cluster.name": clusterName,
                "kafka.broker.id": i,
                "kafka.broker.role": "broker",
                "kafka.broker.state": "RUNNING",
                "kafka.broker.host": `broker-${i}.${clusterName}.kafka.internal`,
                "kafka.broker.port": 9092,
                
                // Broker metrics
                "kafka.broker.bytesInPerSec": 300000 + (i * 100000),
                "kafka.broker.bytesOutPerSec": 250000 + (i * 80000),
                "kafka.broker.messagesInPerSec": 300 + (i * 100),
                "kafka.broker.cpuPercent": 30 + (i * 5),
                "kafka.broker.memoryPercent": 40 + (i * 5),
                
                // Service metadata
                "service.name": `kafka-broker-${i}`,
                "service.namespace": "kafka",
                "parent.service": `kafka-cluster-${clusterName}`,
                
                // Link to cluster
                "custom.clusterService": `kafka-cluster-${clusterName}`
            });
        }
        
        // Create Span events to show relationships
        for (let i = 1; i <= 3; i++) {
            events.push({
                eventType: "Span",
                timestamp,
                appName: `kafka-cluster-${clusterName}`,
                name: `monitor-broker-${i}`,
                duration: 0.001,
                
                // Span attributes
                "span.kind": "CLIENT",
                "component": "kafka-monitoring",
                
                // Relationship
                "parent.service": `kafka-cluster-${clusterName}`,
                "target.service": `kafka-broker-${clusterName}-${i}`,
                "target.broker.id": i,
                
                // Trace context
                "trace.id": `kafka-${clusterName}-${timestamp}`,
                "span.id": `broker-check-${i}`
            });
        }
        
        // Create TransactionError events for unhealthy conditions
        if (Math.random() < 0.1) { // 10% chance of error
            events.push({
                eventType: "TransactionError",
                timestamp,
                appName: `kafka-cluster-${clusterName}`,
                "error.class": "KafkaHealthCheckError",
                "error.message": "Simulated health check warning",
                transactionName: "KafkaCluster/Health",
                
                // Error details
                "kafka.error.type": "PARTITION_OFFLINE",
                "kafka.error.severity": "WARNING",
                "kafka.error.broker": Math.floor(Math.random() * 3) + 1
            });
        }
        
        // Create Metric events for custom metrics
        events.push({
            eventType: "Metric",
            timestamp,
            appName: `kafka-cluster-${clusterName}`,
            metricName: "kafka.cluster.health.score",
            value: 95 + Math.random() * 5,
            
            // Metric metadata
            "metric.type": "gauge",
            "metric.unit": "percent",
            "service.name": `kafka-cluster-${clusterName}`
        });
        
        return events;
    }

    /**
     * Create distributed trace to link services
     */
    createDistributedTrace(clusterName) {
        const timestamp = Date.now();
        const traceId = `kafka-trace-${timestamp}`;
        const events = [];
        
        // Root span from a hypothetical producer
        events.push({
            eventType: "Span",
            timestamp,
            appName: "kafka-producer-app",
            name: "produce-message",
            duration: 0.010,
            
            "span.kind": "PRODUCER",
            "messaging.system": "kafka",
            "messaging.destination": "orders",
            "messaging.destination.kind": "topic",
            
            "trace.id": traceId,
            "span.id": "producer-root",
            "parent.id": null,
            
            // Link to Kafka cluster
            "kafka.cluster": clusterName,
            "peer.service": `kafka-cluster-${clusterName}`
        });
        
        // Broker processing span
        events.push({
            eventType: "Span", 
            timestamp: timestamp + 1,
            appName: `kafka-broker-${clusterName}-1`,
            name: "broker-process",
            duration: 0.002,
            
            "span.kind": "SERVER",
            "messaging.system": "kafka",
            "messaging.operation": "process",
            
            "trace.id": traceId,
            "span.id": "broker-span",
            "parent.id": "producer-root",
            
            "kafka.broker.id": 1,
            "kafka.partition": 0
        });
        
        // Consumer span
        events.push({
            eventType: "Span",
            timestamp: timestamp + 3,
            appName: "kafka-consumer-app",
            name: "consume-message",
            duration: 0.005,
            
            "span.kind": "CONSUMER",
            "messaging.system": "kafka",
            "messaging.source": "orders",
            
            "trace.id": traceId,
            "span.id": "consumer-span",
            "parent.id": "broker-span",
            
            "kafka.cluster": clusterName,
            "kafka.consumer.group": "order-processors"
        });
        
        return events;
    }

    /**
     * Submit events
     */
    async submitEvents(events) {
        return new Promise((resolve, reject) => {
            const data = JSON.stringify(events);
            
            const options = {
                hostname: 'insights-collector.newrelic.com',
                path: `/v1/accounts/${this.accountId}/events`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Insert-Key': this.insertKey,
                    'Content-Length': data.length
                }
            };
            
            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    resolve({
                        success: res.statusCode === 200,
                        status: res.statusCode,
                        body
                    });
                });
            });
            
            req.on('error', reject);
            req.write(data);
            req.end();
        });
    }

    /**
     * Create APM services for Kafka cluster
     */
    async createKafkaAPMServices(clusterName) {
        console.log('🌉 APM Service Bridge for Kafka');
        console.log('================================\n');
        console.log(`Cluster: ${clusterName}\n`);
        
        // Create APM events
        console.log('📊 Creating APM service events...');
        const apmEvents = this.createAPMEvents(clusterName);
        
        // Create distributed trace
        console.log('📊 Creating distributed trace...');
        const traceEvents = this.createDistributedTrace(clusterName);
        
        // Submit all events
        const allEvents = [...apmEvents, ...traceEvents];
        console.log(`\n📤 Submitting ${allEvents.length} APM events...`);
        
        const result = await this.submitEvents(allEvents);
        
        if (result.success) {
            console.log('✅ APM events submitted successfully!');
            console.log(`   Services: kafka-cluster-${clusterName}, kafka-broker-${clusterName}-[1-3]`);
            console.log(`   Distributed trace created`);
            
            console.log('\n⏳ Waiting 30 seconds for service creation...');
            await new Promise(resolve => setTimeout(resolve, 30000));
            
            await this.verifyAPMServices(clusterName);
        } else {
            console.log(`❌ Failed to submit events: ${result.status}`);
        }
    }

    /**
     * Verify APM services were created
     */
    async verifyAPMServices(clusterName) {
        console.log('\n🔍 Verifying APM services...\n');
        
        const https = require('https');
        
        const runQuery = (nrql) => {
            return new Promise((resolve, reject) => {
                const query = {
                    query: `{
                        actor {
                            account(id: ${this.accountId}) {
                                nrql(query: "${nrql.replace(/"/g, '\\\\"')}") {
                                    results
                                }
                            }
                        }
                    }`
                };
                
                const data = JSON.stringify(query);
                
                const options = {
                    hostname: 'api.newrelic.com',
                    path: '/graphql',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'API-Key': this.userKey
                    }
                };
                
                const req = https.request(options, (res) => {
                    let body = '';
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => {
                        try {
                            const response = JSON.parse(body);
                            resolve(response.data?.actor?.account?.nrql?.results || []);
                        } catch (e) {
                            reject(e);
                        }
                    });
                });
                
                req.on('error', reject);
                req.write(data);
                req.end();
            });
        };
        
        // Check Transaction events
        const txnQuery = `FROM Transaction SELECT count(*), uniques(appName) WHERE appName LIKE '%kafka%${clusterName}%' SINCE 5 minutes ago`;
        const txnResults = await runQuery(txnQuery);
        
        console.log(`📊 Transaction Events: ${txnResults[0]?.count > 0 ? '✅' : '❌'} (${txnResults[0]?.count || 0} events)`);
        if (txnResults[0]?.count > 0) {
            console.log(`   Services: ${txnResults[0]['uniques.appName']?.join(', ')}`);
        }
        
        // Check APM entities
        console.log('\n🔍 Checking APM Service Entities...');
        const entityQuery = `{
            actor {
                entitySearch(query: "domain = 'APM' AND name LIKE '%kafka%${clusterName}%'") {
                    count
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
        }`;
        
        const graphqlOptions = {
            hostname: 'api.newrelic.com',
            path: '/graphql',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'API-Key': this.userKey
            }
        };
        
        const entityResult = await new Promise((resolve, reject) => {
            const req = https.request(graphqlOptions, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(body));
                    } catch (e) {
                        reject(e);
                    }
                });
            });
            
            req.on('error', reject);
            req.write(JSON.stringify({ query: entityQuery }));
            req.end();
        });
        
        const entities = entityResult.data?.actor?.entitySearch?.results?.entities || [];
        
        if (entities.length > 0) {
            console.log(`✅ ${entities.length} APM entities found!`);
            entities.forEach(entity => {
                console.log(`   ${entity.name} (${entity.type}) - Reporting: ${entity.reporting ? 'Yes' : 'No'}`);
            });
        } else {
            console.log('❌ No APM entities found');
        }
        
        console.log('\n📋 APM Service Bridge Summary:');
        console.log('1. Created APM services to represent Kafka components');
        console.log('2. Used Transaction events with kafka.* attributes');
        console.log('3. Created distributed traces to show relationships');
        console.log('4. Check APM UI for service visibility');
        
        console.log('\n🔍 Next Steps:');
        console.log(`1. Check APM Services: https://one.newrelic.com/nr1-core/apm/services?account=${this.accountId}`);
        console.log(`2. Look for: kafka-cluster-${clusterName}`);
        console.log('3. Check Service Maps for relationships');
    }
}

// Main execution
async function main() {
    const bridge = new APMServiceBridge();
    const clusterName = process.argv[2] || 'kafka';
    
    await bridge.createKafkaAPMServices(clusterName);
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { APMServiceBridge };