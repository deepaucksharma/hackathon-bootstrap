#!/usr/bin/env node

/**
 * Real-time Entity Verification Tool
 * Checks multiple data sources to verify entity creation
 */

const axios = require('axios');
const https = require('https');

class EntityVerifier {
    constructor(config) {
        this.accountId = config.accountId;
        this.apiKey = config.apiKey;
        this.userKey = config.userKey || config.apiKey; // Some endpoints need user key
        this.nerdGraphUrl = 'https://api.newrelic.com/graphql';
        this.nrqlUrl = `https://insights-api.newrelic.com/v1/accounts/${this.accountId}/query`;
    }

    async verifyCluster(clusterName) {
        console.log(`\n🔍 Verifying cluster: ${clusterName}`);
        console.log('=' + '='.repeat(clusterName.length + 20));

        const results = {
            clusterName,
            timestamp: new Date().toISOString(),
            checks: {}
        };

        // 1. Check Sample Events
        results.checks.sampleEvents = await this.checkSampleEvents(clusterName);

        // 2. Check Metric Events
        results.checks.metricEvents = await this.checkMetricEvents(clusterName);

        // 3. Check Entity via GraphQL
        results.checks.entitySearch = await this.checkEntityViaGraphQL(clusterName);

        // 4. Check Integration Events
        results.checks.integrationEvents = await this.checkIntegrationEvents(clusterName);

        // 5. Generate summary
        results.summary = this.generateSummary(results.checks);

        return results;
    }

    async checkSampleEvents(clusterName) {
        console.log('\n📊 Checking Sample Events...');
        
        const queries = [
            {
                name: 'Cluster Samples',
                nrql: `FROM AwsMskClusterSample SELECT count(*) WHERE provider.clusterName = '${clusterName}' OR entityName = '${clusterName}' SINCE 1 hour ago`
            },
            {
                name: 'Broker Samples',
                nrql: `FROM AwsMskBrokerSample SELECT count(*) WHERE provider.clusterName = '${clusterName}' SINCE 1 hour ago`
            },
            {
                name: 'Topic Samples',
                nrql: `FROM AwsMskTopicSample SELECT count(*) WHERE provider.clusterName = '${clusterName}' SINCE 1 hour ago`
            }
        ];

        const results = {};
        
        for (const query of queries) {
            try {
                const response = await this.runNRQL(query.nrql);
                const count = response?.results?.[0]?.count || 0;
                results[query.name] = {
                    count,
                    found: count > 0,
                    query: query.nrql
                };
                console.log(`  ✅ ${query.name}: ${count} events found`);
            } catch (error) {
                results[query.name] = {
                    count: 0,
                    found: false,
                    error: error.message
                };
                console.log(`  ❌ ${query.name}: Error - ${error.message}`);
            }
        }

        return results;
    }

    async checkMetricEvents(clusterName) {
        console.log('\n📊 Checking Metric Events...');
        
        const query = `FROM Metric 
            SELECT count(*) 
            WHERE (entity.name = '${clusterName}' OR aws.kafka.ClusterName = '${clusterName}' OR aws.msk.clusterName = '${clusterName}')
            AND entity.type IN ('AWSMSKCLUSTER', 'AWSMSKBROKER', 'AWSMSKTOPIC')
            SINCE 1 hour ago`;

        try {
            const response = await this.runNRQL(query);
            const count = response?.results?.[0]?.count || 0;
            console.log(`  ✅ Metric events: ${count} found`);
            return {
                count,
                found: count > 0,
                query
            };
        } catch (error) {
            console.log(`  ❌ Metric events: Error - ${error.message}`);
            return {
                count: 0,
                found: false,
                error: error.message
            };
        }
    }

    async checkEntityViaGraphQL(clusterName) {
        console.log('\n📊 Checking Entity via GraphQL...');
        
        const query = `
        {
            actor {
                entitySearch(query: "domain IN ('INFRA') AND type IN ('AWSMSKCLUSTER', 'AWSMSKBROKER', 'AWSMSKTOPIC') AND name LIKE '%${clusterName}%'") {
                    count
                    results {
                        entities {
                            guid
                            name
                            type
                            reporting
                            tags {
                                key
                                values
                            }
                        }
                    }
                }
            }
        }`;

        try {
            const response = await this.runGraphQL(query);
            const searchResults = response?.data?.actor?.entitySearch;
            const count = searchResults?.count || 0;
            const entities = searchResults?.results?.entities || [];
            
            console.log(`  ✅ Entity search: ${count} entities found`);
            
            if (entities.length > 0) {
                entities.forEach(entity => {
                    console.log(`     - ${entity.type}: ${entity.name} (${entity.reporting ? 'reporting' : 'not reporting'})`);
                });
            }

            return {
                count,
                found: count > 0,
                entities,
                query
            };
        } catch (error) {
            console.log(`  ❌ Entity search: Error - ${error.message}`);
            return {
                count: 0,
                found: false,
                error: error.message
            };
        }
    }

    async checkIntegrationEvents(clusterName) {
        console.log('\n📊 Checking Integration Events...');
        
        const queries = [
            {
                name: 'Infrastructure Events',
                nrql: `FROM InfrastructureEvent SELECT count(*) WHERE entityName = '${clusterName}' SINCE 1 hour ago`
            },
            {
                name: 'Integration Events',
                nrql: `FROM IntegrationEvent SELECT count(*) WHERE targetEntityName = '${clusterName}' SINCE 1 hour ago`
            }
        ];

        const results = {};
        
        for (const query of queries) {
            try {
                const response = await this.runNRQL(query.nrql);
                const count = response?.results?.[0]?.count || 0;
                results[query.name] = {
                    count,
                    found: count > 0
                };
                console.log(`  ✅ ${query.name}: ${count} events found`);
            } catch (error) {
                results[query.name] = {
                    count: 0,
                    found: false,
                    error: error.message
                };
                console.log(`  ❌ ${query.name}: Error - ${error.message}`);
            }
        }

        return results;
    }

    async runNRQL(query) {
        const response = await axios.get(this.nrqlUrl, {
            params: { nrql: query },
            headers: {
                'X-Query-Key': this.apiKey,
                'Accept': 'application/json'
            }
        });

        return response.data;
    }

    async runGraphQL(query) {
        const response = await axios.post(
            this.nerdGraphUrl,
            { query },
            {
                headers: {
                    'Api-Key': this.userKey || this.apiKey,
                    'Content-Type': 'application/json'
                }
            }
        );

        return response.data;
    }

    generateSummary(checks) {
        const summary = {
            hasEvents: false,
            hasEntity: false,
            isFullyOperational: false,
            recommendations: []
        };

        // Check if we have events
        if (checks.sampleEvents?.['Cluster Samples']?.found || 
            checks.metricEvents?.found) {
            summary.hasEvents = true;
        }

        // Check if entity exists
        if (checks.entitySearch?.found) {
            summary.hasEntity = true;
        }

        // Check if fully operational
        if (summary.hasEvents && summary.hasEntity) {
            summary.isFullyOperational = true;
        }

        // Generate recommendations
        if (!summary.hasEvents) {
            summary.recommendations.push('No events found. Check if events are being submitted correctly.');
        }

        if (!summary.hasEntity) {
            summary.recommendations.push('Entity not found. Entity synthesis may not have occurred.');
            summary.recommendations.push('Try using an official integration method instead of direct Event API.');
        }

        if (summary.hasEvents && !summary.hasEntity) {
            summary.recommendations.push('Events exist but no entity. This confirms synthesis rules are missing.');
            summary.recommendations.push('Use CloudWatch Metric Streams or nri-kafka integration.');
        }

        return summary;
    }

    async continuousVerification(clusterName, intervalSeconds = 30) {
        console.log(`\n🔄 Starting continuous verification for: ${clusterName}`);
        console.log(`   Checking every ${intervalSeconds} seconds...`);
        console.log(`   Press Ctrl+C to stop\n`);

        let attemptCount = 0;

        const verify = async () => {
            attemptCount++;
            console.log(`\n\n📍 Verification Attempt #${attemptCount}`);
            console.log(`   Time: ${new Date().toLocaleTimeString()}`);
            
            const results = await this.verifyCluster(clusterName);
            
            console.log('\n📊 Summary:');
            console.log(`   Has Events: ${results.summary.hasEvents ? '✅' : '❌'}`);
            console.log(`   Has Entity: ${results.summary.hasEntity ? '✅' : '❌'}`);
            console.log(`   Fully Operational: ${results.summary.isFullyOperational ? '✅' : '❌'}`);
            
            if (results.summary.recommendations.length > 0) {
                console.log('\n💡 Recommendations:');
                results.summary.recommendations.forEach(rec => {
                    console.log(`   - ${rec}`);
                });
            }

            if (results.summary.isFullyOperational) {
                console.log('\n🎉 SUCCESS! Entity is fully operational!');
                console.log('   Check the Message Queues UI now.');
                return true;
            }

            return false;
        };

        // Initial verification
        const success = await verify();
        if (success) return;

        // Set up continuous verification
        const interval = setInterval(async () => {
            const success = await verify();
            if (success) {
                clearInterval(interval);
            }
        }, intervalSeconds * 1000);
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('Usage: node entity-verifier.js <cluster-name> [--continuous]');
        console.log('Example: node entity-verifier.js test-msk-cluster-123 --continuous');
        process.exit(1);
    }

    const clusterName = args[0];
    const continuous = args.includes('--continuous');

    // Load config (simplified for this example)
    const config = {
        accountId: process.env.NEW_RELIC_ACCOUNT_ID || 'YOUR_ACCOUNT_ID',
        apiKey: process.env.NEW_RELIC_API_KEY || 'YOUR_API_KEY',
        userKey: process.env.NEW_RELIC_USER_KEY
    };

    const verifier = new EntityVerifier(config);

    if (continuous) {
        verifier.continuousVerification(clusterName).catch(console.error);
    } else {
        verifier.verifyCluster(clusterName)
            .then(results => {
                console.log('\n\n📋 Full Results:');
                console.log(JSON.stringify(results, null, 2));
            })
            .catch(console.error);
    }
}

module.exports = { EntityVerifier };