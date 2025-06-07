#!/usr/bin/env node

/**
 * Comprehensive UI Visibility Diagnostic Tool
 * Diagnoses why MSK entities are not appearing in the New Relic UI
 */

const axios = require('axios');
const fs = require('fs');

class UIVisibilityDiagnostics {
    constructor() {
        this.accountId = process.env.NEW_RELIC_ACCOUNT_ID;
        this.apiKey = process.env.NEW_RELIC_API_KEY;
        this.userKey = process.env.NEW_RELIC_USER_KEY || this.apiKey;
        
        if (!this.accountId || !this.apiKey) {
            console.error('❌ Missing credentials. Please set:');
            console.error('   NEW_RELIC_ACCOUNT_ID');
            console.error('   NEW_RELIC_API_KEY');
            process.exit(1);
        }

        this.results = {
            timestamp: new Date().toISOString(),
            accountId: this.accountId,
            diagnostics: {},
            recommendations: []
        };
    }

    async runFullDiagnostics() {
        console.log('🔍 MSK Entity UI Visibility Diagnostics');
        console.log('======================================\n');
        console.log(`Account ID: ${this.accountId}`);
        console.log(`Timestamp: ${new Date().toLocaleString()}\n`);

        // 1. Check account capabilities
        await this.checkAccountCapabilities();

        // 2. Check existing MSK entities
        await this.checkExistingMSKEntities();

        // 3. Test event submission
        await this.testEventSubmission();

        // 4. Check entity synthesis
        await this.checkEntitySynthesis();

        // 5. Verify UI queries
        await this.verifyUIQueries();

        // 6. Check integration status
        await this.checkIntegrationStatus();

        // 7. Test with working patterns
        await this.testWorkingPatterns();

        // 8. Generate recommendations
        this.generateRecommendations();

        // Save results
        this.saveResults();

        return this.results;
    }

    async checkAccountCapabilities() {
        console.log('1️⃣ Checking Account Capabilities...\n');
        
        try {
            // Check if account can query data
            const testQuery = `FROM Transaction SELECT count(*) SINCE 1 day ago LIMIT 1`;
            const response = await this.runNRQL(testQuery);
            
            this.results.diagnostics.accountCapabilities = {
                canQueryData: true,
                hasData: (response?.results?.[0]?.count || 0) > 0
            };
            
            console.log('   ✅ Account can query data');
            
            // Check GraphQL access
            const graphqlTest = await this.testGraphQL();
            this.results.diagnostics.accountCapabilities.hasGraphQLAccess = graphqlTest;
            console.log(`   ${graphqlTest ? '✅' : '❌'} GraphQL API access`);
            
        } catch (error) {
            console.log('   ❌ Error checking account capabilities:', error.message);
            this.results.diagnostics.accountCapabilities = {
                error: error.message
            };
        }
        
        console.log('');
    }

    async checkExistingMSKEntities() {
        console.log('2️⃣ Checking Existing MSK Entities...\n');
        
        // Check for any MSK entities
        const entityQuery = `{
            actor {
                entitySearch(query: "domain='INFRA' AND type IN ('AWSMSKCLUSTER', 'AWSMSKBROKER', 'AWSMSKTOPIC')") {
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
            const response = await this.runGraphQL(entityQuery);
            const entities = response?.data?.actor?.entitySearch?.results?.entities || [];
            const count = response?.data?.actor?.entitySearch?.count || 0;
            
            this.results.diagnostics.existingEntities = {
                count,
                entities: entities.map(e => ({
                    name: e.name,
                    type: e.type,
                    reporting: e.reporting
                }))
            };
            
            console.log(`   Found ${count} MSK entities`);
            
            if (count > 0) {
                console.log('   Existing entities:');
                entities.forEach(e => {
                    console.log(`     - ${e.type}: ${e.name} (${e.reporting ? 'reporting' : 'not reporting'})`);
                });
                
                // Analyze a working entity
                if (entities[0]) {
                    await this.analyzeWorkingEntity(entities[0]);
                }
            }
            
        } catch (error) {
            console.log('   ❌ Error checking entities:', error.message);
            this.results.diagnostics.existingEntities = { error: error.message };
        }
        
        console.log('');
    }

    async analyzeWorkingEntity(entity) {
        console.log(`\n   📊 Analyzing working entity: ${entity.name}`);
        
        // Check what events this entity is using
        const eventQueries = [
            `FROM AwsMskClusterSample SELECT count(*) WHERE entityGuid = '${entity.guid}' SINCE 1 day ago`,
            `FROM MessageQueueSample SELECT count(*) WHERE entity.guid = '${entity.guid}' SINCE 1 day ago`,
            `FROM InfrastructureEvent SELECT count(*) WHERE entity.guid = '${entity.guid}' SINCE 1 day ago`
        ];
        
        for (const query of eventQueries) {
            try {
                const response = await this.runNRQL(query);
                const count = response?.results?.[0]?.count || 0;
                if (count > 0) {
                    console.log(`     Found ${count} events in ${query.match(/FROM (\w+)/)[1]}`);
                }
            } catch (error) {
                // Ignore errors for individual queries
            }
        }
    }

    async testEventSubmission() {
        console.log('3️⃣ Testing Event Submission...\n');
        
        const testClusterName = `diagnostic-test-${Date.now()}`;
        const events = this.createTestEvents(testClusterName);
        
        try {
            const response = await axios.post(
                `https://insights-collector.newrelic.com/v1/accounts/${this.accountId}/events`,
                events,
                {
                    headers: {
                        'Api-Key': this.apiKey,
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            console.log('   ✅ Events submitted successfully');
            this.results.diagnostics.eventSubmission = {
                success: true,
                testClusterName,
                eventCount: events.length
            };
            
            // Wait and check if events arrived
            console.log('   ⏳ Waiting 10 seconds for events to process...');
            await new Promise(resolve => setTimeout(resolve, 10000));
            
            // Check if events are queryable
            const checkQuery = `FROM AwsMskClusterSample SELECT count(*) WHERE provider.clusterName = '${testClusterName}' SINCE 2 minutes ago`;
            const checkResponse = await this.runNRQL(checkQuery);
            const eventCount = checkResponse?.results?.[0]?.count || 0;
            
            console.log(`   ${eventCount > 0 ? '✅' : '❌'} Events are queryable (found ${eventCount})`);
            this.results.diagnostics.eventSubmission.eventsQueryable = eventCount > 0;
            
        } catch (error) {
            console.log('   ❌ Event submission failed:', error.response?.data || error.message);
            this.results.diagnostics.eventSubmission = {
                success: false,
                error: error.message
            };
        }
        
        console.log('');
    }

    createTestEvents(clusterName) {
        const timestamp = Date.now();
        const events = [];
        
        // Try multiple event formats
        
        // Format 1: Standard MSK Sample
        events.push({
            eventType: "AwsMskClusterSample",
            entityGuid: this.generateGuid('cluster', clusterName),
            entityName: clusterName,
            entityType: "AWSMSKCLUSTER",
            "entity.guid": this.generateGuid('cluster', clusterName),
            "entity.name": clusterName,
            "entity.type": "AWSMSKCLUSTER",
            domain: "INFRA",
            type: "AWSMSKCLUSTER",
            provider: "AwsMskCluster",
            "provider.clusterName": clusterName,
            "provider.activeControllerCount.Sum": 1,
            "provider.offlinePartitionsCount.Sum": 0,
            "aws.kafka.ClusterName": clusterName,
            "collector.name": "cloudwatch-metric-streams",
            timestamp
        });
        
        // Format 2: Infrastructure Event
        events.push({
            eventType: "InfrastructureEvent",
            category: "kafka",
            provider: "awsmsk",
            entityKeys: [`kafka:cluster:${clusterName}`],
            entityName: clusterName,
            entityType: "AWSMSKCLUSTER",
            entityGuid: this.generateGuid('cluster', clusterName),
            integrationName: "com.newrelic.aws.msk",
            integrationVersion: "1.0.0",
            timestamp
        });
        
        // Format 3: MessageQueueSample (even though we know it doesn't work)
        events.push({
            eventType: "MessageQueueSample",
            provider: "AwsMsk",
            "entity.name": clusterName,
            "entity.type": "AWSMSKCLUSTER",
            "entity.guid": this.generateGuid('cluster', clusterName),
            "queue.name": clusterName,
            "queue.type": "kafka",
            timestamp
        });
        
        return events;
    }

    async checkEntitySynthesis() {
        console.log('4️⃣ Checking Entity Synthesis...\n');
        
        // Check if test entity was created
        if (this.results.diagnostics.eventSubmission?.testClusterName) {
            const clusterName = this.results.diagnostics.eventSubmission.testClusterName;
            
            const entityQuery = `{
                actor {
                    entitySearch(query: "domain='INFRA' AND type='AWSMSKCLUSTER' AND name='${clusterName}'") {
                        count
                    }
                }
            }`;
            
            try {
                const response = await this.runGraphQL(entityQuery);
                const count = response?.data?.actor?.entitySearch?.count || 0;
                
                this.results.diagnostics.entitySynthesis = {
                    testEntityCreated: count > 0,
                    entityCount: count
                };
                
                console.log(`   ${count > 0 ? '✅' : '❌'} Test entity ${count > 0 ? 'was' : 'was NOT'} created`);
                
                if (count === 0) {
                    console.log('   ⚠️  Entity synthesis did not occur');
                    console.log('   This confirms that direct event submission is not creating entities');
                }
                
            } catch (error) {
                console.log('   ❌ Error checking entity synthesis:', error.message);
                this.results.diagnostics.entitySynthesis = { error: error.message };
            }
        }
        
        console.log('');
    }

    async verifyUIQueries() {
        console.log('5️⃣ Verifying UI Query Patterns...\n');
        
        // Test the exact queries the UI uses
        const uiQueries = [
            {
                name: 'Message Queue Clusters',
                query: `FROM AwsMskClusterSample SELECT uniqueCount(provider.clusterName) SINCE 1 hour ago`
            },
            {
                name: 'Entity Search Filter',
                graphql: `{
                    actor {
                        entitySearch(query: "domain IN ('INFRA') AND type='AWSMSKCLUSTER'") {
                            count
                        }
                    }
                }`
            },
            {
                name: 'Metric Stream Data',
                query: `FROM Metric SELECT uniqueCount(aws.kafka.ClusterName) WHERE metricName LIKE 'aws.kafka%' SINCE 1 hour ago`
            }
        ];
        
        this.results.diagnostics.uiQueries = {};
        
        for (const uiQuery of uiQueries) {
            try {
                if (uiQuery.query) {
                    const response = await this.runNRQL(uiQuery.query);
                    const value = Object.values(response?.results?.[0] || {})[0] || 0;
                    this.results.diagnostics.uiQueries[uiQuery.name] = value;
                    console.log(`   ${uiQuery.name}: ${value}`);
                } else if (uiQuery.graphql) {
                    const response = await this.runGraphQL(uiQuery.graphql);
                    const count = response?.data?.actor?.entitySearch?.count || 0;
                    this.results.diagnostics.uiQueries[uiQuery.name] = count;
                    console.log(`   ${uiQuery.name}: ${count}`);
                }
            } catch (error) {
                console.log(`   ❌ ${uiQuery.name}: Error - ${error.message}`);
            }
        }
        
        console.log('');
    }

    async checkIntegrationStatus() {
        console.log('6️⃣ Checking Integration Status...\n');
        
        // Check for AWS integration
        const integrationQuery = `{
            actor {
                account(id: ${this.accountId}) {
                    cloud {
                        linkedAccounts {
                            id
                            name
                            provider {
                                slug
                            }
                            integrations {
                                id
                                name
                                service {
                                    slug
                                    name
                                }
                            }
                        }
                    }
                }
            }
        }`;
        
        try {
            const response = await this.runGraphQL(integrationQuery);
            const linkedAccounts = response?.data?.actor?.account?.cloud?.linkedAccounts || [];
            
            this.results.diagnostics.integrations = {
                hasAWSIntegration: linkedAccounts.some(a => a.provider?.slug === 'aws'),
                linkedAccounts: linkedAccounts.map(a => ({
                    name: a.name,
                    provider: a.provider?.slug,
                    integrations: a.integrations?.map(i => i.service?.name) || []
                }))
            };
            
            const hasAWS = this.results.diagnostics.integrations.hasAWSIntegration;
            console.log(`   ${hasAWS ? '✅' : '❌'} AWS integration ${hasAWS ? 'found' : 'not found'}`);
            
            if (hasAWS) {
                const awsAccount = linkedAccounts.find(a => a.provider?.slug === 'aws');
                console.log(`   AWS Account: ${awsAccount.name}`);
                console.log(`   Services: ${awsAccount.integrations?.map(i => i.service?.name).join(', ') || 'None'}`);
            }
            
        } catch (error) {
            console.log('   ℹ️  Could not check integration status (may need user API key)');
            this.results.diagnostics.integrations = { error: 'Requires user API key' };
        }
        
        console.log('');
    }

    async testWorkingPatterns() {
        console.log('7️⃣ Testing Known Working Patterns...\n');
        
        const patterns = [
            {
                name: 'CloudWatch Metric Pattern',
                test: async () => {
                    const testName = `cw-pattern-${Date.now()}`;
                    const event = {
                        eventType: "Metric",
                        metricName: "aws.kafka.ActiveControllerCount",
                        "entity.guid": this.generateGuid('cluster', testName),
                        "entity.name": testName,
                        "entity.type": "AWSMSKCLUSTER",
                        "aws.kafka.ClusterName": testName,
                        "collector.name": "cloudwatch-metric-streams",
                        value: 1,
                        timestamp: Date.now()
                    };
                    return this.submitAndCheck([event], testName);
                }
            },
            {
                name: 'Infrastructure Bundle Pattern',
                test: async () => {
                    const testName = `infra-pattern-${Date.now()}`;
                    const event = {
                        eventType: "SystemSample",
                        entityKey: `${this.accountId}:kafka:${testName}`,
                        entityName: testName,
                        entityType: "AWSMSKCLUSTER",
                        "entity.guid": this.generateGuid('cluster', testName),
                        "entity.name": testName,
                        "entity.type": "AWSMSKCLUSTER",
                        hostname: testName,
                        provider: "awsmsk",
                        timestamp: Date.now()
                    };
                    return this.submitAndCheck([event], testName);
                }
            }
        ];
        
        this.results.diagnostics.workingPatterns = {};
        
        for (const pattern of patterns) {
            try {
                console.log(`   Testing ${pattern.name}...`);
                const result = await pattern.test();
                this.results.diagnostics.workingPatterns[pattern.name] = result;
                console.log(`     ${result.success ? '✅' : '❌'} ${result.message}`);
            } catch (error) {
                console.log(`     ❌ Error: ${error.message}`);
                this.results.diagnostics.workingPatterns[pattern.name] = {
                    success: false,
                    error: error.message
                };
            }
        }
        
        console.log('');
    }

    async submitAndCheck(events, identifier) {
        try {
            // Submit
            await axios.post(
                `https://insights-collector.newrelic.com/v1/accounts/${this.accountId}/events`,
                events,
                {
                    headers: {
                        'Api-Key': this.apiKey,
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            // Wait
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // Check
            const checkQuery = `FROM ${events[0].eventType} SELECT count(*) WHERE entity.name = '${identifier}' OR entityName = '${identifier}' SINCE 1 minute ago`;
            const response = await this.runNRQL(checkQuery);
            const count = response?.results?.[0]?.count || 0;
            
            return {
                success: count > 0,
                message: count > 0 ? `Event found (count: ${count})` : 'Event not found'
            };
            
        } catch (error) {
            return {
                success: false,
                message: error.message
            };
        }
    }

    generateRecommendations() {
        console.log('8️⃣ Generating Recommendations...\n');
        
        const diag = this.results.diagnostics;
        const recommendations = [];
        
        // Check if entity synthesis is working
        if (diag.entitySynthesis && !diag.entitySynthesis.testEntityCreated) {
            recommendations.push({
                priority: 'HIGH',
                issue: 'Entity synthesis not working',
                recommendation: 'Direct event submission is not creating entities. Use official AWS integration or nri-kafka.'
            });
        }
        
        // Check if AWS integration exists
        if (diag.integrations && !diag.integrations.hasAWSIntegration) {
            recommendations.push({
                priority: 'HIGH',
                issue: 'No AWS integration found',
                recommendation: 'Set up AWS CloudWatch Metric Streams integration for automatic MSK entity creation.'
            });
        }
        
        // Check if there are existing entities
        if (diag.existingEntities && diag.existingEntities.count > 0) {
            recommendations.push({
                priority: 'INFO',
                issue: 'Existing MSK entities found',
                recommendation: 'Study the existing entities to understand the working pattern.'
            });
        }
        
        // Check UI queries
        if (diag.uiQueries && Object.values(diag.uiQueries).every(v => v === 0)) {
            recommendations.push({
                priority: 'HIGH',
                issue: 'No data visible to UI queries',
                recommendation: 'The Message Queues UI queries are not finding any data. This confirms entities are required.'
            });
        }
        
        this.results.recommendations = recommendations;
        
        recommendations.forEach(rec => {
            console.log(`   [${rec.priority}] ${rec.issue}`);
            console.log(`   → ${rec.recommendation}\n`);
        });
    }

    async runNRQL(query) {
        try {
            const response = await axios.get(
                `https://insights-api.newrelic.com/v1/accounts/${this.accountId}/query`,
                {
                    params: { nrql: query },
                    headers: {
                        'X-Query-Key': this.apiKey,
                        'Accept': 'application/json'
                    }
                }
            );
            return response.data;
        } catch (error) {
            throw error;
        }
    }

    async runGraphQL(query) {
        try {
            const response = await axios.post(
                'https://api.newrelic.com/graphql',
                { query },
                {
                    headers: {
                        'Api-Key': this.userKey,
                        'Content-Type': 'application/json'
                    }
                }
            );
            return response.data;
        } catch (error) {
            throw error;
        }
    }

    async testGraphQL() {
        try {
            const testQuery = `{ actor { user { email } } }`;
            await this.runGraphQL(testQuery);
            return true;
        } catch (error) {
            return false;
        }
    }

    generateGuid(type, name) {
        const components = [this.accountId, 'INFRA', type.toUpperCase(), name];
        return Buffer.from(components.join('|'))
            .toString('base64')
            .replace(/[+/=]/g, '')
            .substring(0, 32);
    }

    saveResults() {
        const filename = `ui-visibility-diagnostic-${Date.now()}.json`;
        fs.writeFileSync(filename, JSON.stringify(this.results, null, 2));
        console.log(`\n💾 Full diagnostic results saved to: ${filename}\n`);
    }
}

// Run diagnostics
async function main() {
    const diagnostics = new UIVisibilityDiagnostics();
    const results = await diagnostics.runFullDiagnostics();
    
    console.log('📋 Summary');
    console.log('=========\n');
    
    if (results.recommendations.length === 0) {
        console.log('✅ No issues found!');
    } else {
        console.log(`Found ${results.recommendations.length} recommendations.\n`);
        
        const highPriority = results.recommendations.filter(r => r.priority === 'HIGH');
        if (highPriority.length > 0) {
            console.log('🚨 Critical Issues:');
            highPriority.forEach(rec => {
                console.log(`\n   ${rec.issue}`);
                console.log(`   Solution: ${rec.recommendation}`);
            });
        }
    }
    
    console.log('\n🔗 Relevant Links:');
    console.log(`   Entity Explorer: https://one.newrelic.com/redirect/entity/${results.accountId}`);
    console.log('   Message Queues: https://one.newrelic.com/nr1-core/message-queues');
    console.log('   AWS Integration: https://one.newrelic.com/launcher/cloud.cloud-launcher');
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { UIVisibilityDiagnostics };