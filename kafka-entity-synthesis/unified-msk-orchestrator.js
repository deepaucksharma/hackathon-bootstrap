#!/usr/bin/env node

/**
 * Unified MSK Orchestrator
 * Combines all tools to create, verify, and maintain MSK entities in New Relic UI
 */

const { UICompatibleMSKPayloads } = require('./ui-compatible-payload-solution');
const { EntityRelationshipBuilder } = require('./entity-relationship-builder');
const { ContinuousMetricStreamer } = require('./continuous-metric-streamer');
const { EntityVerifier } = require('./entity-verifier');
const { MSKEntityVisualizer } = require('./msk-entity-visualizer');
const { AdvancedUIPayloadRunner } = require('./advanced-ui-payload-runner');

const fs = require('fs');
const path = require('path');
const readline = require('readline');

class UnifiedMSKOrchestrator {
    constructor() {
        this.config = null;
        this.tools = {};
        this.activeClusters = new Map();
        this.sessionId = Date.now();
        this.logDir = `orchestrator-session-${this.sessionId}`;
    }

    async initialize() {
        console.log('🎼 Unified MSK Orchestrator');
        console.log('===========================\n');

        // Load configuration
        this.config = await this.loadConfig();
        if (!this.config) {
            console.error('❌ Failed to load configuration');
            process.exit(1);
        }

        // Create session directory
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir);
        }

        // Initialize tools
        this.initializeTools();

        console.log('✅ Orchestrator initialized');
        console.log(`📁 Session directory: ${this.logDir}\n`);
    }

    async loadConfig() {
        // Try multiple config sources
        const config = {
            accountId: process.env.NEW_RELIC_ACCOUNT_ID,
            apiKey: process.env.NEW_RELIC_API_KEY,
            userKey: process.env.NEW_RELIC_USER_KEY
        };

        if (!config.accountId || !config.apiKey) {
            // Try loading from config.json
            const configPath = path.join(__dirname, 'config.json');
            if (fs.existsSync(configPath)) {
                const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                config.accountId = config.accountId || fileConfig.newrelic?.accountId;
                config.apiKey = config.apiKey || fileConfig.newrelic?.apiKey;
            }
        }

        if (!config.accountId || !config.apiKey) {
            console.log('📝 Configuration required');
            return await this.promptForConfig();
        }

        return config;
    }

    async promptForConfig() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const question = (query) => new Promise((resolve) => rl.question(query, resolve));

        const accountId = await question('New Relic Account ID: ');
        const apiKey = await question('New Relic API Key: ');

        rl.close();

        return { accountId, apiKey };
    }

    initializeTools() {
        this.tools = {
            payloadGenerator: new UICompatibleMSKPayloads(this.config),
            relationshipBuilder: new EntityRelationshipBuilder(this.config),
            metricStreamer: new ContinuousMetricStreamer(this.config),
            verifier: new EntityVerifier(this.config),
            visualizer: new MSKEntityVisualizer(this.config),
            advancedRunner: new AdvancedUIPayloadRunner()
        };

        // Initialize advanced runner
        this.tools.advancedRunner.accountId = this.config.accountId;
        this.tools.advancedRunner.apiKey = this.config.apiKey;
        this.tools.advancedRunner.apiUrl = `https://insights-collector.newrelic.com/v1/accounts/${this.config.accountId}/events`;
    }

    /**
     * Main orchestration flow
     */
    async orchestrate(options = {}) {
        const {
            clusterName = `orchestrated-msk-${Date.now()}`,
            strategy = 'complete', // 'simple', 'complete', 'advanced'
            streaming = true,
            verify = true,
            visualize = true
        } = options;

        console.log('🚀 Starting MSK Entity Orchestration');
        console.log('====================================\n');
        console.log(`Strategy: ${strategy}`);
        console.log(`Cluster: ${clusterName}\n`);

        const orchestrationResult = {
            clusterName,
            strategy,
            steps: [],
            success: false,
            entities: {}
        };

        try {
            // Step 1: Create entities based on strategy
            console.log('📊 Step 1: Creating MSK entities...');
            let creationResult;

            switch (strategy) {
                case 'simple':
                    creationResult = await this.createSimpleEntities(clusterName);
                    break;
                case 'complete':
                    creationResult = await this.createCompleteHierarchy(clusterName);
                    break;
                case 'advanced':
                    creationResult = await this.runAdvancedStrategies(clusterName);
                    break;
                default:
                    creationResult = await this.createSimpleEntities(clusterName);
            }

            orchestrationResult.steps.push({
                name: 'Entity Creation',
                status: creationResult.success ? 'success' : 'failed',
                details: creationResult
            });

            if (!creationResult.success) {
                throw new Error('Entity creation failed');
            }

            // Step 2: Start metric streaming
            if (streaming) {
                console.log('\n📊 Step 2: Starting metric streaming...');
                const streamResult = await this.startMetricStreaming(clusterName);
                orchestrationResult.steps.push({
                    name: 'Metric Streaming',
                    status: 'started',
                    details: streamResult
                });
            }

            // Wait for entity synthesis
            console.log('\n⏳ Waiting for entity synthesis (30 seconds)...');
            await new Promise(resolve => setTimeout(resolve, 30000));

            // Step 3: Verify entities
            if (verify) {
                console.log('\n📊 Step 3: Verifying entities...');
                const verificationResult = await this.verifyEntities(clusterName);
                orchestrationResult.steps.push({
                    name: 'Entity Verification',
                    status: verificationResult.success ? 'success' : 'failed',
                    details: verificationResult
                });

                orchestrationResult.entities = verificationResult.entities;
            }

            // Step 4: Visualize hierarchy
            if (visualize && orchestrationResult.entities.clusters?.length > 0) {
                console.log('\n📊 Step 4: Visualizing entity hierarchy...');
                const visualizationResult = await this.visualizeHierarchy(clusterName);
                orchestrationResult.steps.push({
                    name: 'Visualization',
                    status: 'completed',
                    details: visualizationResult
                });
            }

            orchestrationResult.success = true;

            // Save orchestration result
            this.saveOrchestrationResult(orchestrationResult);

            // Store active cluster
            this.activeClusters.set(clusterName, {
                created: Date.now(),
                strategy,
                streaming,
                ...orchestrationResult
            });

        } catch (error) {
            console.error('\n❌ Orchestration failed:', error.message);
            orchestrationResult.error = error.message;
        }

        return orchestrationResult;
    }

    async createSimpleEntities(clusterName) {
        try {
            const events = this.tools.payloadGenerator.createMSKPayloads(clusterName, 3, 5);
            const success = await this.tools.payloadGenerator.submitEvents(events);
            
            return {
                success,
                eventCount: events.length,
                clusterName
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async createCompleteHierarchy(clusterName) {
        try {
            const result = await this.tools.relationshipBuilder.buildMSKHierarchy({
                clusterName,
                brokerCount: 3,
                topicsPerBroker: 3,
                partitionsPerTopic: 3,
                consumerGroups: 2,
                producerApplications: 2,
                consumerApplications: 2
            });

            return {
                success: true,
                ...result
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async runAdvancedStrategies(baseClusterName) {
        const results = {
            success: false,
            strategies: [],
            successfulStrategies: []
        };

        for (const strategy of this.tools.advancedRunner.strategies) {
            const clusterName = `${baseClusterName}-${strategy}`;
            console.log(`\n🎯 Trying strategy: ${strategy}`);

            try {
                let strategyResult;
                
                switch (strategy) {
                    case 'standard-samples':
                        strategyResult = await this.tools.advancedRunner.standardSamplesStrategy(clusterName);
                        break;
                    case 'metric-events':
                        strategyResult = await this.tools.advancedRunner.metricEventsStrategy(clusterName);
                        break;
                    case 'entity-synthesis':
                        strategyResult = await this.tools.advancedRunner.entitySynthesisStrategy(clusterName);
                        break;
                    case 'infrastructure-events':
                        strategyResult = await this.tools.advancedRunner.infrastructureEventsStrategy(clusterName);
                        break;
                    case 'combined-approach':
                        strategyResult = await this.tools.advancedRunner.combinedApproachStrategy(clusterName);
                        break;
                }

                if (strategyResult) {
                    results.strategies.push({ strategy, clusterName, success: true });
                    results.successfulStrategies.push(strategy);
                }
            } catch (error) {
                results.strategies.push({ 
                    strategy, 
                    clusterName, 
                    success: false, 
                    error: error.message 
                });
            }
        }

        results.success = results.successfulStrategies.length > 0;
        return results;
    }

    async startMetricStreaming(clusterName) {
        return this.tools.metricStreamer.startStreaming({
            clusterName,
            brokerCount: 3,
            topicCount: 5,
            updateInterval: 60000
        });
    }

    async verifyEntities(clusterName) {
        const verificationResult = await this.tools.verifier.verifyCluster(clusterName);
        
        return {
            success: verificationResult.summary.isFullyOperational,
            hasEvents: verificationResult.summary.hasEvents,
            hasEntity: verificationResult.summary.hasEntity,
            entities: {
                clusters: verificationResult.checks.entitySearch?.entities?.filter(e => e.type === 'AWSMSKCLUSTER') || [],
                brokers: verificationResult.checks.entitySearch?.entities?.filter(e => e.type === 'AWSMSKBROKER') || [],
                topics: verificationResult.checks.entitySearch?.entities?.filter(e => e.type === 'AWSMSKTOPIC') || []
            },
            recommendations: verificationResult.summary.recommendations
        };
    }

    async visualizeHierarchy(clusterNamePattern) {
        const hierarchy = await this.tools.visualizer.visualizeHierarchy(clusterNamePattern);
        return {
            clusterCount: hierarchy.size,
            visualized: true
        };
    }

    saveOrchestrationResult(result) {
        const filename = path.join(this.logDir, `orchestration-${result.clusterName}.json`);
        fs.writeFileSync(filename, JSON.stringify(result, null, 2));
        console.log(`\n💾 Results saved to: ${filename}`);
    }

    /**
     * Interactive CLI mode
     */
    async interactiveMode() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const question = (query) => new Promise((resolve) => rl.question(query, resolve));

        console.log('\n🎮 Interactive Mode');
        console.log('==================\n');
        console.log('Commands:');
        console.log('  create <strategy>    - Create MSK entities (simple/complete/advanced)');
        console.log('  verify <cluster>     - Verify a cluster\'s entities');
        console.log('  visualize [pattern]  - Visualize entity hierarchy');
        console.log('  stream <cluster>     - Start/stop metric streaming');
        console.log('  status              - Show active clusters');
        console.log('  auto                - Run automatic orchestration');
        console.log('  help                - Show this help');
        console.log('  exit                - Exit the orchestrator\n');

        const processCommand = async () => {
            const input = await question('orchestrator> ');
            const [command, ...args] = input.trim().split(' ');

            switch (command) {
                case 'create':
                    const strategy = args[0] || 'simple';
                    const clusterName = args[1] || `interactive-msk-${Date.now()}`;
                    console.log(`\nCreating cluster with ${strategy} strategy...`);
                    const createResult = await this.orchestrate({
                        clusterName,
                        strategy,
                        streaming: true,
                        verify: true,
                        visualize: true
                    });
                    console.log('\nResult:', createResult.success ? '✅ Success' : '❌ Failed');
                    break;

                case 'verify':
                    if (args.length === 0) {
                        console.log('Usage: verify <cluster-name>');
                    } else {
                        const verifyResult = await this.verifyEntities(args[0]);
                        console.log('\nVerification Result:');
                        console.log(`  Has Events: ${verifyResult.hasEvents ? '✅' : '❌'}`);
                        console.log(`  Has Entity: ${verifyResult.hasEntity ? '✅' : '❌'}`);
                        console.log(`  Operational: ${verifyResult.success ? '✅' : '❌'}`);
                    }
                    break;

                case 'visualize':
                    await this.visualizeHierarchy(args[0] || null);
                    break;

                case 'stream':
                    if (args.length === 0) {
                        console.log('Usage: stream <cluster-name>');
                    } else {
                        const streamResult = await this.startMetricStreaming(args[0]);
                        console.log(`Streaming ${streamResult.status} for ${streamResult.clusterName}`);
                    }
                    break;

                case 'status':
                    console.log('\n📊 Active Clusters:');
                    if (this.activeClusters.size === 0) {
                        console.log('  No active clusters');
                    } else {
                        for (const [name, data] of this.activeClusters) {
                            const age = Math.floor((Date.now() - data.created) / 60000);
                            console.log(`  - ${name} (${data.strategy}, ${age}m old)`);
                        }
                    }
                    console.log(`\nStreaming Status: ${this.tools.metricStreamer.getStatus().isStreaming ? 'Active' : 'Inactive'}`);
                    break;

                case 'auto':
                    console.log('\n🤖 Running automatic orchestration...');
                    const autoResult = await this.runAutomaticOrchestration();
                    console.log(`\nCompleted: ${autoResult.successful}/${autoResult.total} successful`);
                    break;

                case 'help':
                    console.log('\nCommands:');
                    console.log('  create <strategy>    - Create MSK entities (simple/complete/advanced)');
                    console.log('  verify <cluster>     - Verify a cluster\'s entities');
                    console.log('  visualize [pattern]  - Visualize entity hierarchy');
                    console.log('  stream <cluster>     - Start/stop metric streaming');
                    console.log('  status              - Show active clusters');
                    console.log('  auto                - Run automatic orchestration');
                    console.log('  help                - Show this help');
                    console.log('  exit                - Exit the orchestrator');
                    break;

                case 'exit':
                case 'quit':
                    console.log('\n👋 Shutting down orchestrator...');
                    this.tools.metricStreamer.stopAllStreaming();
                    rl.close();
                    process.exit(0);
                    break;

                default:
                    if (command) {
                        console.log(`Unknown command: ${command}. Type 'help' for available commands.`);
                    }
            }

            // Continue prompt
            processCommand();
        };

        processCommand();
    }

    async runAutomaticOrchestration() {
        const strategies = ['simple', 'complete', 'advanced'];
        const results = {
            total: strategies.length,
            successful: 0,
            failed: 0,
            clusters: []
        };

        for (const strategy of strategies) {
            console.log(`\n🎯 Running ${strategy} strategy...`);
            const clusterName = `auto-${strategy}-${Date.now()}`;
            
            const result = await this.orchestrate({
                clusterName,
                strategy,
                streaming: true,
                verify: true,
                visualize: false
            });

            if (result.success) {
                results.successful++;
                results.clusters.push(clusterName);
                console.log(`✅ ${strategy} completed successfully`);
            } else {
                results.failed++;
                console.log(`❌ ${strategy} failed`);
            }

            // Wait between strategies
            if (strategies.indexOf(strategy) < strategies.length - 1) {
                console.log('\n⏳ Waiting 30 seconds before next strategy...');
                await new Promise(resolve => setTimeout(resolve, 30000));
            }
        }

        return results;
    }
}

// Main execution
if (require.main === module) {
    async function main() {
        const orchestrator = new UnifiedMSKOrchestrator();
        await orchestrator.initialize();

        const args = process.argv.slice(2);
        
        if (args.includes('--auto')) {
            // Run automatic orchestration
            console.log('🤖 Running automatic orchestration...\n');
            const result = await orchestrator.runAutomaticOrchestration();
            console.log('\n✅ Automatic orchestration complete');
            console.log(`   Successful: ${result.successful}/${result.total}`);
            console.log(`   Clusters: ${result.clusters.join(', ')}`);
        } else if (args.includes('--interactive')) {
            // Interactive mode
            await orchestrator.interactiveMode();
        } else {
            // Single orchestration run
            const strategy = args[0] || 'complete';
            const clusterName = args[1] || `orchestrated-msk-${Date.now()}`;
            
            const result = await orchestrator.orchestrate({
                clusterName,
                strategy,
                streaming: true,
                verify: true,
                visualize: true
            });

            console.log('\n📊 Orchestration Summary:');
            console.log(`   Success: ${result.success ? '✅' : '❌'}`);
            console.log(`   Cluster: ${result.clusterName}`);
            console.log(`   Strategy: ${result.strategy}`);
            
            if (result.success) {
                console.log('\n🎯 Next Steps:');
                console.log('1. Check Entity Explorer:');
                console.log(`   https://one.newrelic.com/redirect/entity/${orchestrator.config.accountId}`);
                console.log('2. Check Message Queues UI:');
                console.log('   https://one.newrelic.com/nr1-core/message-queues');
                console.log('3. Run continuous verification:');
                console.log(`   node entity-verifier.js ${result.clusterName} --continuous`);
            }
        }
    }

    main().catch(console.error);
}

module.exports = { UnifiedMSKOrchestrator };