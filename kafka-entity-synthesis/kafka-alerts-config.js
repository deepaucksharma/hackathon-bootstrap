#!/usr/bin/env node

/**
 * Kafka Alerts Configuration
 * Creates alerts based on the ingested AwsMsk*Sample events
 */

const axios = require('axios');
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

class KafkaAlertsConfig {
    constructor() {
        loadEnv();
        
        this.accountId = process.env.ACC;
        this.userKey = process.env.UKEY;
        
        if (!this.accountId || !this.userKey) {
            console.error('❌ Missing required environment variables');
            process.exit(1);
        }
    }

    /**
     * Alert configurations for Kafka monitoring
     */
    getAlertConfigs(clusterName) {
        return [
            {
                name: `Kafka Cluster ${clusterName} - Offline Partitions`,
                description: "Alert when any partitions go offline",
                nrql: `FROM AwsMskClusterSample SELECT latest(provider.offlinePartitionsCount.Average) WHERE provider.clusterName = '${clusterName}'`,
                terms: [{
                    threshold: 0,
                    thresholdOccurrences: "ALL",
                    thresholdDuration: 300,
                    operator: "ABOVE",
                    priority: "CRITICAL"
                }],
                violationTimeLimitSeconds: 86400
            },
            {
                name: `Kafka Cluster ${clusterName} - No Active Controller`,
                description: "Alert when there's no active controller",
                nrql: `FROM AwsMskClusterSample SELECT latest(provider.activeControllerCount.Average) WHERE provider.clusterName = '${clusterName}'`,
                terms: [{
                    threshold: 1,
                    thresholdOccurrences: "ALL",
                    thresholdDuration: 300,
                    operator: "BELOW",
                    priority: "CRITICAL"
                }],
                violationTimeLimitSeconds: 86400
            },
            {
                name: `Kafka Cluster ${clusterName} - High CPU Usage`,
                description: "Alert when broker CPU usage is high",
                nrql: `FROM AwsMskBrokerSample SELECT average(provider.cpuUser.Average) WHERE provider.clusterName = '${clusterName}' FACET provider.brokerId`,
                terms: [{
                    threshold: 80,
                    thresholdOccurrences: "ALL",
                    thresholdDuration: 300,
                    operator: "ABOVE",
                    priority: "WARNING"
                }, {
                    threshold: 90,
                    thresholdOccurrences: "ALL",
                    thresholdDuration: 300,
                    operator: "ABOVE",
                    priority: "CRITICAL"
                }],
                violationTimeLimitSeconds: 3600
            },
            {
                name: `Kafka Cluster ${clusterName} - High Memory Usage`,
                description: "Alert when broker memory usage is high",
                nrql: `FROM AwsMskBrokerSample SELECT average(provider.memoryUsed.Average) WHERE provider.clusterName = '${clusterName}' FACET provider.brokerId`,
                terms: [{
                    threshold: 85,
                    thresholdOccurrences: "ALL",
                    thresholdDuration: 300,
                    operator: "ABOVE",
                    priority: "WARNING"
                }, {
                    threshold: 95,
                    thresholdOccurrences: "ALL",
                    thresholdDuration: 300,
                    operator: "ABOVE",
                    priority: "CRITICAL"
                }],
                violationTimeLimitSeconds: 3600
            },
            {
                name: `Kafka Cluster ${clusterName} - Under-Replicated Partitions`,
                description: "Alert when partitions are under-replicated",
                nrql: `FROM AwsMskBrokerSample SELECT sum(provider.underReplicatedPartitions.Maximum) WHERE provider.clusterName = '${clusterName}'`,
                terms: [{
                    threshold: 0,
                    thresholdOccurrences: "ALL",
                    thresholdDuration: 600,
                    operator: "ABOVE",
                    priority: "WARNING"
                }],
                violationTimeLimitSeconds: 86400
            },
            {
                name: `Kafka Cluster ${clusterName} - High Consumer Lag`,
                description: "Alert when consumer lag is high",
                nrql: `FROM AwsMskTopicSample SELECT max(provider.sumOffsetLag.Average) WHERE provider.clusterName = '${clusterName}' FACET provider.topic`,
                terms: [{
                    threshold: 10000,
                    thresholdOccurrences: "ALL",
                    thresholdDuration: 300,
                    operator: "ABOVE",
                    priority: "WARNING"
                }, {
                    threshold: 100000,
                    thresholdOccurrences: "ALL",
                    thresholdDuration: 300,
                    operator: "ABOVE",
                    priority: "CRITICAL"
                }],
                violationTimeLimitSeconds: 3600
            },
            {
                name: `Kafka Cluster ${clusterName} - Data Freshness`,
                description: "Alert when data hasn't been received recently",
                nrql: `FROM AwsMskClusterSample SELECT count(*) WHERE provider.clusterName = '${clusterName}'`,
                terms: [{
                    threshold: 1,
                    thresholdOccurrences: "ALL",
                    thresholdDuration: 600,
                    operator: "BELOW",
                    priority: "CRITICAL"
                }],
                violationTimeLimitSeconds: 3600,
                expiration: {
                    closeViolationsOnExpiration: true,
                    expirationDuration: 1200
                }
            }
        ];
    }

    /**
     * Create alert policy
     */
    async createAlertPolicy(clusterName) {
        const mutation = `
            mutation CreatePolicy($accountId: Int!, $name: String!, $incidentPreference: IncidentPreferenceType!) {
                alertsPolicyCreate(
                    accountId: $accountId,
                    policy: {
                        name: $name,
                        incidentPreference: $incidentPreference
                    }
                ) {
                    id
                    name
                    errors {
                        message
                        type
                    }
                }
            }
        `;

        const variables = {
            accountId: parseInt(this.accountId),
            name: `Kafka Cluster ${clusterName} Monitoring`,
            incidentPreference: "PER_CONDITION_AND_TARGET"
        };

        try {
            const response = await axios.post(
                'https://api.newrelic.com/graphql',
                { query: mutation, variables },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'API-Key': this.userKey
                    }
                }
            );

            if (response.data.data?.alertsPolicyCreate?.id) {
                return response.data.data.alertsPolicyCreate.id;
            } else {
                console.error('Failed to create policy:', response.data);
                return null;
            }
        } catch (error) {
            console.error('Error creating policy:', error.message);
            return null;
        }
    }

    /**
     * Create NRQL alert condition
     */
    async createAlertCondition(policyId, config) {
        const mutation = `
            mutation CreateCondition($accountId: Int!, $policyId: ID!, $condition: AlertsNrqlConditionStaticInput!) {
                alertsNrqlConditionStaticCreate(
                    accountId: $accountId,
                    policyId: $policyId,
                    condition: $condition
                ) {
                    id
                    name
                    errors {
                        message
                        type
                    }
                }
            }
        `;

        const condition = {
            name: config.name,
            description: config.description,
            enabled: true,
            nrql: {
                query: config.nrql
            },
            terms: config.terms,
            violationTimeLimitSeconds: config.violationTimeLimitSeconds,
            signal: {
                aggregationWindow: 60,
                aggregationMethod: "EVENT_FLOW",
                aggregationDelay: 120
            }
        };

        if (config.expiration) {
            condition.expiration = config.expiration;
        }

        const variables = {
            accountId: parseInt(this.accountId),
            policyId: policyId,
            condition: condition
        };

        try {
            const response = await axios.post(
                'https://api.newrelic.com/graphql',
                { query: mutation, variables },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'API-Key': this.userKey
                    }
                }
            );

            if (response.data.data?.alertsNrqlConditionStaticCreate?.id) {
                return {
                    success: true,
                    id: response.data.data.alertsNrqlConditionStaticCreate.id,
                    name: config.name
                };
            } else {
                return {
                    success: false,
                    name: config.name,
                    error: response.data.errors || response.data.data?.alertsNrqlConditionStaticCreate?.errors
                };
            }
        } catch (error) {
            return {
                success: false,
                name: config.name,
                error: error.message
            };
        }
    }

    /**
     * Create all alerts for a cluster
     */
    async createKafkaAlerts(clusterName) {
        console.log('🚨 Kafka Alerts Configuration');
        console.log('=============================\n');
        console.log(`Cluster: ${clusterName}\n`);

        // Create policy
        console.log('📋 Creating alert policy...');
        const policyId = await this.createAlertPolicy(clusterName);
        
        if (!policyId) {
            console.error('❌ Failed to create alert policy');
            return;
        }
        
        console.log(`✅ Alert policy created: ${policyId}`);
        
        // Get alert configurations
        const alertConfigs = this.getAlertConfigs(clusterName);
        
        // Create conditions
        console.log('\n📊 Creating alert conditions...\n');
        
        const results = [];
        for (const config of alertConfigs) {
            console.log(`Creating: ${config.name}...`);
            const result = await this.createAlertCondition(policyId, config);
            results.push(result);
            
            if (result.success) {
                console.log(`✅ Created: ${result.name}`);
            } else {
                console.log(`❌ Failed: ${result.name}`);
                console.error(`   Error: ${JSON.stringify(result.error)}`);
            }
            
            // Small delay between conditions
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // Summary
        console.log('\n📊 Summary:');
        console.log(`Total Conditions: ${alertConfigs.length}`);
        console.log(`Successful: ${results.filter(r => r.success).length}`);
        console.log(`Failed: ${results.filter(r => !r.success).length}`);
        
        console.log('\n🔍 Next Steps:');
        console.log(`1. View alerts: https://one.newrelic.com/nr1-core/alerts-ai/policies?account=${this.accountId}`);
        console.log(`2. Configure notification channels`);
        console.log(`3. Ensure continuous data streaming for alerts to function`);
        
        // Save configuration
        const configFile = `kafka-alerts-${clusterName}-${Date.now()}.json`;
        fs.writeFileSync(
            path.join(__dirname, configFile),
            JSON.stringify({
                cluster: clusterName,
                policyId: policyId,
                conditions: results,
                timestamp: new Date().toISOString()
            }, null, 2)
        );
        
        console.log(`\n💾 Configuration saved to: ${configFile}`);
    }
}

// Main execution
async function main() {
    const alertManager = new KafkaAlertsConfig();
    const clusterName = process.argv[2] || 'kafka';
    
    await alertManager.createKafkaAlerts(clusterName);
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { KafkaAlertsConfig };