#!/usr/bin/env node

/**
 * GraphQL Entity Creator
 * 
 * Attempts to create entities directly via New Relic's GraphQL API
 * This is an exploratory approach to bypass the normal entity synthesis
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

class GraphQLEntityCreator {
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
     * Try various GraphQL mutations to create entities
     */
    async exploreEntityCreation(clusterName) {
        console.log('🔬 GraphQL Entity Creation Explorer');
        console.log('===================================\n');
        console.log(`Account: ${this.accountId}`);
        console.log(`Cluster: ${clusterName}\n`);
        
        // Test 1: Entity tagging mutation (might create entity)
        console.log('📊 Test 1: Entity Tagging Mutation');
        await this.tryEntityTagging(clusterName);
        
        // Test 2: Workload creation (creates synthetic entity)
        console.log('\n📊 Test 2: Workload Creation');
        await this.tryWorkloadCreation(clusterName);
        
        // Test 3: Dashboard with entity queries (might force creation)
        console.log('\n📊 Test 3: Dashboard Entity Reference');
        await this.tryDashboardCreation(clusterName);
        
        // Test 4: Alert condition on entity (might force creation)
        console.log('\n📊 Test 4: Alert Condition Creation');
        await this.tryAlertCreation(clusterName);
        
        // Test 5: Direct entity mutation (if available)
        console.log('\n📊 Test 5: Direct Entity Mutation');
        await this.tryDirectEntityMutation(clusterName);
    }

    /**
     * Test 1: Try to tag an entity (might create it)
     */
    async tryEntityTagging(clusterName) {
        const entityGuid = this.generateEntityGuid('AWSMSKCLUSTER', clusterName);
        
        const mutation = `
            mutation AddTags {
                taggingAddTagsToEntity(
                    guid: "${entityGuid}",
                    tags: [
                        { key: "team", values: ["platform"] },
                        { key: "environment", values: ["production"] },
                        { key: "kafka.version", values: ["2.8.0"] }
                    ]
                ) {
                    errors {
                        message
                        type
                    }
                }
            }
        `;
        
        try {
            const result = await this.executeGraphQL(mutation);
            if (result.data?.taggingAddTagsToEntity?.errors?.length > 0) {
                console.log('   Result: Entity not found (expected)');
                console.log('   Errors:', result.data.taggingAddTagsToEntity.errors);
            } else {
                console.log('   Result: ✅ Tags added (entity might exist!)');
            }
        } catch (error) {
            console.log('   Result: ❌ Mutation failed');
        }
    }

    /**
     * Test 2: Create a workload that references the entity
     */
    async tryWorkloadCreation(clusterName) {
        const entityGuid = this.generateEntityGuid('AWSMSKCLUSTER', clusterName);
        
        const mutation = `
            mutation CreateWorkload {
                workloadCreate(
                    accountId: ${this.accountId},
                    workload: {
                        name: "Kafka Cluster - ${clusterName}",
                        entityGuids: ["${entityGuid}"],
                        entitySearchQueries: [
                            {
                                query: "type = 'AWSMSKCLUSTER' AND name = '${clusterName}'"
                            }
                        ]
                    }
                ) {
                    guid
                    name
                    errors {
                        message
                        type
                    }
                }
            }
        `;
        
        try {
            const result = await this.executeGraphQL(mutation);
            if (result.data?.workloadCreate?.guid) {
                console.log('   Result: ✅ Workload created');
                console.log('   GUID:', result.data.workloadCreate.guid);
            } else {
                console.log('   Result: ❌ Workload creation failed');
                if (result.data?.workloadCreate?.errors) {
                    console.log('   Errors:', result.data.workloadCreate.errors);
                }
            }
        } catch (error) {
            console.log('   Result: ❌ Mutation failed');
        }
    }

    /**
     * Test 3: Create dashboard referencing the entity
     */
    async tryDashboardCreation(clusterName) {
        const dashboardJson = {
            name: `Kafka Cluster - ${clusterName}`,
            description: "Auto-generated dashboard for entity creation test",
            permissions: "PUBLIC_READ_WRITE",
            pages: [{
                name: "Overview",
                description: "",
                widgets: [{
                    visualization: { id: "viz.billboard" },
                    layout: { column: 1, row: 1, height: 3, width: 4 },
                    title: "Cluster Status",
                    rawConfiguration: {
                        nrqlQueries: [{
                            accountId: parseInt(this.accountId),
                            query: `FROM AwsMskClusterSample SELECT latest(provider.activeControllerCount.Average) WHERE provider.clusterName = '${clusterName}'`
                        }]
                    }
                }]
            }]
        };
        
        const mutation = `
            mutation CreateDashboard($dashboard: DashboardInput!) {
                dashboardCreate(
                    accountId: ${this.accountId},
                    dashboard: $dashboard
                ) {
                    entityResult {
                        guid
                        name
                    }
                    errors {
                        message
                        type
                    }
                }
            }
        `;
        
        try {
            const result = await this.executeGraphQL(mutation, { dashboard: dashboardJson });
            if (result.data?.dashboardCreate?.entityResult?.guid) {
                console.log('   Result: ✅ Dashboard created');
                console.log('   GUID:', result.data.dashboardCreate.entityResult.guid);
            } else {
                console.log('   Result: ❌ Dashboard creation failed');
            }
        } catch (error) {
            console.log('   Result: ❌ Mutation failed');
        }
    }

    /**
     * Test 4: Create alert condition on the entity
     */
    async tryAlertCreation(clusterName) {
        // First, need a policy
        const policyMutation = `
            mutation CreatePolicy {
                alertsPolicyCreate(
                    accountId: ${this.accountId},
                    policy: {
                        name: "Kafka Cluster ${clusterName} Policy",
                        incidentPreference: PER_CONDITION
                    }
                ) {
                    id
                    errors {
                        message
                    }
                }
            }
        `;
        
        try {
            const policyResult = await this.executeGraphQL(policyMutation);
            const policyId = policyResult.data?.alertsPolicyCreate?.id;
            
            if (!policyId) {
                console.log('   Result: ❌ Failed to create alert policy');
                return;
            }
            
            // Create NRQL condition
            const conditionMutation = `
                mutation CreateCondition {
                    alertsNrqlConditionStaticCreate(
                        accountId: ${this.accountId},
                        policyId: "${policyId}",
                        condition: {
                            name: "Kafka Cluster ${clusterName} Offline Partitions",
                            enabled: true,
                            nrql: {
                                query: "FROM AwsMskClusterSample SELECT latest(provider.offlinePartitionsCount.Average) WHERE provider.clusterName = '${clusterName}'"
                            },
                            terms: [{
                                threshold: 0,
                                thresholdOccurrences: ALL,
                                thresholdDuration: 300,
                                operator: ABOVE,
                                priority: CRITICAL
                            }],
                            violationTimeLimitSeconds: 86400
                        }
                    ) {
                        id
                        name
                        errors {
                            message
                        }
                    }
                }
            `;
            
            const conditionResult = await this.executeGraphQL(conditionMutation);
            if (conditionResult.data?.alertsNrqlConditionStaticCreate?.id) {
                console.log('   Result: ✅ Alert condition created');
                console.log('   ID:', conditionResult.data.alertsNrqlConditionStaticCreate.id);
            } else {
                console.log('   Result: ❌ Condition creation failed');
            }
        } catch (error) {
            console.log('   Result: ❌ Alert creation failed');
        }
    }

    /**
     * Test 5: Try direct entity mutation (exploratory)
     */
    async tryDirectEntityMutation(clusterName) {
        // Try various potential entity creation mutations
        const mutations = [
            // Attempt 1: entityCreate mutation (hypothetical)
            `mutation {
                entityCreate(
                    accountId: ${this.accountId},
                    entity: {
                        domain: "INFRA",
                        type: "AWSMSKCLUSTER",
                        name: "${clusterName}",
                        guid: "${this.generateEntityGuid('AWSMSKCLUSTER', clusterName)}"
                    }
                ) {
                    guid
                    errors { message }
                }
            }`,
            
            // Attempt 2: infrastructureEntityCreate (hypothetical)
            `mutation {
                infrastructureEntityCreate(
                    accountId: ${this.accountId},
                    entityType: "AWSMSKCLUSTER",
                    entityName: "${clusterName}",
                    tags: [
                        { key: "provider", value: "aws" },
                        { key: "service", value: "kafka" }
                    ]
                ) {
                    entity { guid name }
                    errors { message }
                }
            }`,
            
            // Attempt 3: Entity registration (hypothetical)
            `mutation {
                entityRegister(
                    entity: {
                        account: { id: ${this.accountId} },
                        domain: "INFRA",
                        type: "AWSMSKCLUSTER",
                        name: "${clusterName}",
                        reporting: true
                    }
                ) {
                    entity { guid }
                    success
                }
            }`
        ];
        
        for (let i = 0; i < mutations.length; i++) {
            console.log(`   Attempt ${i + 1}:`, );
            try {
                const result = await this.executeGraphQL(mutations[i]);
                if (result.errors) {
                    console.log('     Result: Mutation not supported');
                } else {
                    console.log('     Result: ✅ Unexpected success!');
                    console.log('     Data:', JSON.stringify(result.data, null, 2));
                }
            } catch (error) {
                console.log('     Result: Not available');
            }
        }
    }

    /**
     * Helper to generate entity GUID
     */
    generateEntityGuid(entityType, identifier) {
        const base64Id = Buffer.from(identifier).toString('base64');
        return `${this.accountId}|INFRA|${entityType}|${base64Id}`;
    }

    /**
     * Execute GraphQL query/mutation
     */
    async executeGraphQL(query, variables = {}) {
        const response = await axios.post(
            'https://api.newrelic.com/graphql',
            { 
                query,
                variables 
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'API-Key': this.userKey
                }
            }
        );
        
        return response.data;
    }

    /**
     * Check if any entities were created
     */
    async checkEntityExistence(clusterName) {
        console.log('\n🔍 Checking Entity Existence...\n');
        
        const query = `{
            actor {
                entitySearch(
                    query: "domain = 'INFRA' AND type IN ('AWSMSKCLUSTER', 'WORKLOAD', 'DASHBOARD') AND name LIKE '%${clusterName}%'"
                ) {
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
        
        try {
            const result = await this.executeGraphQL(query);
            const count = result.data?.actor?.entitySearch?.count || 0;
            
            if (count > 0) {
                console.log(`✅ Found ${count} entities related to ${clusterName}:`);
                result.data.actor.entitySearch.results.entities.forEach(entity => {
                    console.log(`   ${entity.name} (${entity.type})`);
                });
            } else {
                console.log(`❌ No entities found for ${clusterName}`);
            }
        } catch (error) {
            console.log('❌ Failed to check entities');
        }
    }
}

// Main execution
async function main() {
    const creator = new GraphQLEntityCreator();
    const clusterName = process.argv[2] || `graphql-kafka-${Date.now()}`;
    
    await creator.exploreEntityCreation(clusterName);
    await creator.checkEntityExistence(clusterName);
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { GraphQLEntityCreator };