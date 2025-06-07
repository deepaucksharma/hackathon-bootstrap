#!/usr/bin/env node

/**
 * Automated Verification Suite
 * 
 * Comprehensive verification of all Kafka entity synthesis approaches
 * Checks NRDB data, entity creation, and UI visibility indicators
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

class AutomatedVerificationSuite {
    constructor() {
        loadEnv();
        
        this.accountId = process.env.ACC;
        this.userKey = process.env.UKEY;
        
        if (!this.accountId || !this.userKey) {
            console.error('❌ Missing required environment variables');
            process.exit(1);
        }
        
        this.results = {
            timestamp: new Date().toISOString(),
            clusters: {},
            summary: {
                total: 0,
                withEvents: 0,
                withEntities: 0,
                fullyVisible: 0
            }
        };
    }

    /**
     * Run NRQL query via GraphQL
     */
    async runQuery(nrql) {
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
    }

    /**
     * Run GraphQL query
     */
    async runGraphQL(query) {
        return new Promise((resolve, reject) => {
            const data = JSON.stringify({ query });
            
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
                        resolve(JSON.parse(body));
                    } catch (e) {
                        reject(e);
                    }
                });
            });
            
            req.on('error', reject);
            req.write(data);
            req.end();
        });
    }

    /**
     * Verify a single cluster
     */
    async verifyCluster(clusterName) {
        console.log(`\n🔍 Verifying: ${clusterName}`);
        console.log('='.repeat(50));
        
        const result = {
            clusterName,
            timestamp: new Date().toISOString(),
            events: {
                cluster: { count: 0, hasGuid: false, hasArn: false },
                brokers: { count: 0, uniqueCount: 0, guids: [] },
                topics: { count: 0, uniqueCount: 0, names: [] }
            },
            entities: {
                found: false,
                count: 0,
                types: [],
                reporting: false
            },
            systemSample: {
                found: false,
                count: 0,
                hasKafkaAttrs: false
            },
            uiIndicators: {
                hasRecentData: false,
                hasAllMetrics: false,
                metricsCompleteness: 0
            },
            overallStatus: 'NOT_FOUND'
        };
        
        // 1. Check cluster events
        const clusterQuery = `FROM AwsMskClusterSample SELECT count(*), latest(entityGuid), latest(provider.externalId), latest(timestamp) WHERE provider.clusterName = '${clusterName}' SINCE 1 hour ago`;
        const clusterResults = await this.runQuery(clusterQuery);
        
        if (clusterResults[0]?.count > 0) {
            result.events.cluster.count = clusterResults[0].count;
            result.events.cluster.hasGuid = !!clusterResults[0]['latest.entityGuid'];
            result.events.cluster.hasArn = !!clusterResults[0]['latest.provider.externalId'];
            
            console.log(`✅ Cluster Events: ${result.events.cluster.count}`);
            console.log(`   Has GUID: ${result.events.cluster.hasGuid ? 'Yes' : 'No'}`);
            console.log(`   Has ARN: ${result.events.cluster.hasArn ? 'Yes' : 'No'}`);
        } else {
            console.log('❌ No cluster events found');
        }
        
        // 2. Check broker events
        const brokerQuery = `FROM AwsMskBrokerSample SELECT count(*), uniques(entityGuid), uniques(provider.brokerId) WHERE provider.clusterName = '${clusterName}' SINCE 1 hour ago`;
        const brokerResults = await this.runQuery(brokerQuery);
        
        if (brokerResults[0]?.count > 0) {
            result.events.brokers.count = brokerResults[0].count;
            result.events.brokers.uniqueCount = brokerResults[0]['uniques.provider.brokerId']?.length || 0;
            result.events.brokers.guids = brokerResults[0]['uniques.entityGuid'] || [];
            
            console.log(`✅ Broker Events: ${result.events.brokers.count}`);
            console.log(`   Unique Brokers: ${result.events.brokers.uniqueCount}`);
        } else {
            console.log('❌ No broker events found');
        }
        
        // 3. Check topic events
        const topicQuery = `FROM AwsMskTopicSample SELECT count(*), uniques(provider.topic) WHERE provider.clusterName = '${clusterName}' SINCE 1 hour ago`;
        const topicResults = await this.runQuery(topicQuery);
        
        if (topicResults[0]?.count > 0) {
            result.events.topics.count = topicResults[0].count;
            result.events.topics.uniqueCount = topicResults[0]['uniques.provider.topic']?.length || 0;
            result.events.topics.names = topicResults[0]['uniques.provider.topic'] || [];
            
            console.log(`✅ Topic Events: ${result.events.topics.count}`);
            console.log(`   Topics: ${result.events.topics.names.join(', ')}`);
        } else {
            console.log('❌ No topic events found');
        }
        
        // 4. Check SystemSample injection
        const systemQuery = `FROM SystemSample SELECT count(*), latest(kafka.cluster.name), latest(kafka.cluster.brokerCount) WHERE kafka.cluster.name = '${clusterName}' SINCE 1 hour ago`;
        const systemResults = await this.runQuery(systemQuery);
        
        if (systemResults[0]?.count > 0) {
            result.systemSample.found = true;
            result.systemSample.count = systemResults[0].count;
            result.systemSample.hasKafkaAttrs = !!systemResults[0]['latest.kafka.cluster.name'];
            
            console.log(`✅ SystemSample Events: ${result.systemSample.count}`);
        }
        
        // 5. Check entity existence
        const entityQuery = `{
            actor {
                entitySearch(query: "domain = 'INFRA' AND (type = 'AWSMSKCLUSTER' OR type = 'AWSMSKBROKER' OR type = 'AWSMSKTOPIC') AND name LIKE '%${clusterName}%'") {
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
        
        const entityResult = await this.runGraphQL(entityQuery);
        const entities = entityResult.data?.actor?.entitySearch?.results?.entities || [];
        
        if (entities.length > 0) {
            result.entities.found = true;
            result.entities.count = entities.length;
            result.entities.types = [...new Set(entities.map(e => e.type))];
            result.entities.reporting = entities.some(e => e.reporting);
            
            console.log(`✅ Entities Found: ${result.entities.count}`);
            console.log(`   Types: ${result.entities.types.join(', ')}`);
            console.log(`   Reporting: ${result.entities.reporting ? 'Yes' : 'No'}`);
        } else {
            console.log('❌ No entities found');
        }
        
        // 6. Check data freshness
        const freshnessQuery = `FROM AwsMskClusterSample, AwsMskBrokerSample SELECT latest(timestamp) WHERE provider.clusterName = '${clusterName}' SINCE 10 minutes ago`;
        const freshnessResults = await this.runQuery(freshnessQuery);
        
        if (freshnessResults[0]?.['latest.timestamp']) {
            const latestTime = freshnessResults[0]['latest.timestamp'];
            const ageMinutes = (Date.now() - latestTime) / 1000 / 60;
            result.uiIndicators.hasRecentData = ageMinutes < 10;
            
            console.log(`📊 Data Freshness: ${ageMinutes.toFixed(1)} minutes old`);
        }
        
        // 7. Check metrics completeness
        const metricsQuery = `FROM AwsMskBrokerSample SELECT 
            average(provider.bytesInPerSec.Average) as bytesIn,
            average(provider.messagesInPerSec.Average) as messagesIn,
            average(provider.cpuUser.Average) as cpu
            WHERE provider.clusterName = '${clusterName}' SINCE 10 minutes ago`;
        const metricsResults = await this.runQuery(metricsQuery);
        
        if (metricsResults[0]) {
            const metrics = metricsResults[0];
            const hasMetrics = [metrics.bytesIn, metrics.messagesIn, metrics.cpu].filter(m => m !== null).length;
            result.uiIndicators.hasAllMetrics = hasMetrics === 3;
            result.uiIndicators.metricsCompleteness = (hasMetrics / 3) * 100;
            
            console.log(`📊 Metrics Completeness: ${result.uiIndicators.metricsCompleteness}%`);
        }
        
        // Determine overall status
        if (result.entities.found && result.entities.reporting) {
            result.overallStatus = 'FULLY_VISIBLE';
        } else if (result.entities.found) {
            result.overallStatus = 'ENTITY_EXISTS';
        } else if (result.events.cluster.count > 0) {
            result.overallStatus = 'EVENTS_ONLY';
        } else if (result.systemSample.found) {
            result.overallStatus = 'SYSTEM_SAMPLE_ONLY';
        }
        
        console.log(`\n📋 Overall Status: ${result.overallStatus}`);
        
        return result;
    }

    /**
     * Generate verification report
     */
    generateReport() {
        console.log('\n\n' + '='.repeat(60));
        console.log('📊 VERIFICATION REPORT SUMMARY');
        console.log('='.repeat(60));
        console.log(`Generated: ${this.results.timestamp}`);
        console.log(`Account: ${this.accountId}`);
        console.log(`\nClusters Verified: ${this.results.summary.total}`);
        console.log(`With Events: ${this.results.summary.withEvents}`);
        console.log(`With Entities: ${this.results.summary.withEntities}`);
        console.log(`Fully Visible: ${this.results.summary.fullyVisible}`);
        
        console.log('\n📋 Detailed Results:');
        console.log('-'.repeat(60));
        
        Object.values(this.results.clusters).forEach(cluster => {
            console.log(`\n${cluster.clusterName}:`);
            console.log(`  Status: ${cluster.overallStatus}`);
            console.log(`  Events: Cluster(${cluster.events.cluster.count}), Brokers(${cluster.events.brokers.count}), Topics(${cluster.events.topics.count})`);
            console.log(`  Entities: ${cluster.entities.found ? `Yes (${cluster.entities.count})` : 'No'}`);
            console.log(`  UI Ready: ${cluster.uiIndicators.hasRecentData && cluster.uiIndicators.hasAllMetrics ? 'Yes' : 'No'}`);
        });
        
        // Save report to file
        const reportPath = path.join(__dirname, `verification-report-${Date.now()}.json`);
        fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
        console.log(`\n💾 Report saved to: ${reportPath}`);
    }

    /**
     * Run verification for multiple clusters
     */
    async runVerification(clusters) {
        console.log('🚀 Automated Kafka Entity Verification Suite');
        console.log('===========================================\n');
        
        for (const clusterName of clusters) {
            const result = await this.verifyCluster(clusterName);
            this.results.clusters[clusterName] = result;
            
            // Update summary
            this.results.summary.total++;
            if (result.events.cluster.count > 0) this.results.summary.withEvents++;
            if (result.entities.found) this.results.summary.withEntities++;
            if (result.overallStatus === 'FULLY_VISIBLE') this.results.summary.fullyVisible++;
            
            // Wait between clusters
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        this.generateReport();
    }

    /**
     * Discover all known clusters
     */
    async discoverClusters() {
        console.log('🔍 Discovering Kafka clusters...\n');
        
        const queries = [
            // MSK clusters
            `FROM AwsMskClusterSample SELECT uniques(provider.clusterName) SINCE 24 hours ago`,
            // SystemSample Kafka clusters
            `FROM SystemSample SELECT uniques(kafka.cluster.name) WHERE kafka.cluster.name IS NOT NULL SINCE 24 hours ago`,
            // Any other Kafka-related events
            `FROM KafkaClusterSample, KafkaBrokerSample SELECT uniques(clusterName) SINCE 24 hours ago`
        ];
        
        const allClusters = new Set();
        
        for (const query of queries) {
            try {
                const results = await this.runQuery(query);
                if (results[0]) {
                    Object.values(results[0]).forEach(values => {
                        if (Array.isArray(values)) {
                            values.forEach(v => allClusters.add(v));
                        }
                    });
                }
            } catch (error) {
                // Ignore query errors
            }
        }
        
        const clusters = Array.from(allClusters).filter(c => c && c !== 'null');
        console.log(`Found ${clusters.length} clusters: ${clusters.join(', ')}\n`);
        
        return clusters;
    }
}

// Main execution
async function main() {
    const verifier = new AutomatedVerificationSuite();
    
    // Get clusters from command line or discover
    let clusters = process.argv.slice(2);
    
    if (clusters.length === 0) {
        console.log('No clusters specified, discovering all clusters...');
        clusters = await verifier.discoverClusters();
        
        if (clusters.length === 0) {
            console.log('❌ No clusters found in the last 24 hours');
            return;
        }
    }
    
    await verifier.runVerification(clusters);
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { AutomatedVerificationSuite };