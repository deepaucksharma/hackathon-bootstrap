#!/usr/bin/env node
/**
 * Deep MSK Implementation Gap Analyzer
 * 
 * This script performs comprehensive analysis to identify implementation gaps
 * by checking metric mappings, aggregation logic, and transformation patterns
 */

const fs = require('fs');
const path = require('path');

class DeepImplementationAnalyzer {
    constructor() {
        this.findings = {
            metricMappings: [],
            aggregationGaps: [],
            transformationIssues: [],
            configurationGaps: [],
            integrationIssues: []
        };
        
        // Reference patterns from working accounts
        this.workingPatterns = {
            // From account 3026020 (86.7% health)
            requiredMetrics: {
                broker: {
                    // Throughput metrics
                    'kafka.broker.bytesIn': 'BytesInPerSec',
                    'kafka.broker.bytesOut': 'BytesOutPerSec',
                    'kafka.broker.messagesIn': 'MessagesInPerSec',
                    
                    // Performance metrics
                    'kafka.broker.requestHandlerIdlePercent': 'RequestHandlerAvgIdlePercent',
                    'kafka.broker.networkProcessorIdlePercent': 'NetworkProcessorAvgIdlePercent',
                    'kafka.broker.produceRequestsPerSec': 'ProduceRequestsPerSec',
                    'kafka.broker.fetchConsumerRequestsPerSec': 'FetchConsumerRequestsPerSec',
                    
                    // Health metrics
                    'kafka.broker.underReplicatedPartitions': 'UnderReplicatedPartitions',
                    'kafka.broker.offlinePartitionsCount': 'OfflinePartitionsCount',
                    'kafka.broker.activeControllerCount': 'ActiveControllerCount',
                    
                    // Resource metrics
                    'kafka.broker.logFlushRateAndTime': 'LogFlushRateAndTimeMs',
                    'kafka.broker.produceTotalTime': 'ProduceTotalTimeMs',
                    'kafka.broker.fetchConsumerTotalTime': 'FetchConsumerTotalTimeMs'
                },
                cluster: {
                    // Aggregated from brokers
                    'kafka.cluster.bytesIn': 'Sum of broker bytesIn',
                    'kafka.cluster.bytesOut': 'Sum of broker bytesOut',
                    'kafka.cluster.messagesIn': 'Sum of broker messagesIn',
                    'kafka.cluster.partitionCount': 'Sum of partition counts',
                    'kafka.cluster.topicCount': 'Count of unique topics',
                    'kafka.cluster.offlinePartitionsCount': 'Max of broker offline partitions',
                    'kafka.cluster.underReplicatedPartitions': 'Sum of broker under replicated',
                    'kafka.cluster.activeControllerCount': 'Sum (should be 1)',
                    'kafka.cluster.zookeeperSessionState': 'ZooKeeper connection state'
                },
                topic: {
                    'kafka.topic.bytesIn': 'Topic BytesInPerSec',
                    'kafka.topic.bytesOut': 'Topic BytesOutPerSec',
                    'kafka.topic.messagesIn': 'Topic MessagesInPerSec',
                    'kafka.topic.partitionCount': 'Partition count for topic',
                    'kafka.topic.retentionSize': 'Size retention config',
                    'kafka.topic.retentionMs': 'Time retention config'
                }
            },
            
            // Entity type mappings
            entityTypes: {
                'AWSKAFKABROKER': 'AWS_KAFKA_BROKER',
                'AWSKAFKACLUSTER': 'AWS_KAFKA_CLUSTER', 
                'AWSKAFKATOPIC': 'AWS_KAFKA_TOPIC'
            },
            
            // Aggregation methods
            aggregationMethods: {
                'Sum': ['bytesIn', 'bytesOut', 'messagesIn', 'underReplicatedPartitions'],
                'Average': ['requestHandlerIdlePercent', 'networkProcessorIdlePercent'],
                'Max': ['offlinePartitionsCount', 'activeControllerCount'],
                'Count': ['topicCount', 'partitionCount']
            }
        };
    }

    async analyze() {
        console.log("🔬 Deep MSK Implementation Analysis");
        console.log("=".repeat(80));
        
        // 1. Check metric definitions and mappings
        await this.analyzeMetricDefinitions();
        
        // 2. Check transformation logic
        await this.analyzeTransformations();
        
        // 3. Check aggregation implementation
        await this.analyzeAggregation();
        
        // 4. Check configuration handling
        await this.analyzeConfiguration();
        
        // 5. Check integration points
        await this.analyzeIntegration();
        
        // Generate comprehensive report
        this.generateReport();
    }

    async analyzeMetricDefinitions() {
        console.log("\n📊 Analyzing Metric Definitions...");
        
        const metricsDir = 'src/metrics';
        const files = ['broker_definitions.go', 'consumer_definitions.go', 'producer_definitions.go'];
        
        for (const file of files) {
            const filePath = path.join(metricsDir, file);
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                
                // Check for MSK metric name mappings
                for (const [mskName, jmxName] of Object.entries(this.workingPatterns.requiredMetrics.broker)) {
                    if (!content.includes(jmxName) && file.includes('broker')) {
                        this.findings.metricMappings.push({
                            file: filePath,
                            missing: jmxName,
                            mskName: mskName,
                            severity: 'high'
                        });
                    }
                }
                
                // Check for proper metric type definitions
                const hasSourceType = content.includes('SourceType:');
                const hasJMXAttr = content.includes('JMXAttr:');
                
                if (!hasSourceType || !hasJMXAttr) {
                    this.findings.metricMappings.push({
                        file: filePath,
                        issue: 'Missing proper metric structure (SourceType/JMXAttr)',
                        severity: 'critical'
                    });
                }
            }
        }
    }

    async analyzeTransformations() {
        console.log("\n🔄 Analyzing Transformation Logic...");
        
        const transformerFiles = [
            'src/msk/simple_transformer.go',
            'src/msk/dimensional_transformer.go',
            'src/msk/metric_mapper.go'
        ];
        
        for (const file of transformerFiles) {
            if (fs.existsSync(file)) {
                const content = fs.readFileSync(file, 'utf8');
                
                // Check for metric name transformations
                const hasKafkaPrefix = content.includes('"kafka.broker.') || 
                                      content.includes('"kafka.topic.') ||
                                      content.includes('"kafka.cluster.');
                
                if (!hasKafkaPrefix) {
                    this.findings.transformationIssues.push({
                        file: file,
                        issue: 'Missing kafka.* metric prefix transformations',
                        severity: 'critical'
                    });
                }
                
                // Check for proper dimensional metric handling
                if (file.includes('dimensional')) {
                    const hasDimensions = content.includes('broker.id') &&
                                         content.includes('topic') &&
                                         content.includes('cluster.name');
                    
                    if (!hasDimensions) {
                        this.findings.transformationIssues.push({
                            file: file,
                            issue: 'Missing required dimensions (broker.id, topic, cluster.name)',
                            severity: 'high'
                        });
                    }
                }
                
                // Check for entity type mapping
                const hasEntityType = content.includes('entity.type') && 
                                     content.includes('AWS_KAFKA');
                
                if (!hasEntityType) {
                    this.findings.transformationIssues.push({
                        file: file,
                        issue: 'Missing entity.type AWS_KAFKA_* mapping',
                        severity: 'critical'
                    });
                }
            }
        }
    }

    async analyzeAggregation() {
        console.log("\n📈 Analyzing Aggregation Logic...");
        
        const aggregatorFile = 'src/msk/aggregator.go';
        
        if (!fs.existsSync(aggregatorFile)) {
            this.findings.aggregationGaps.push({
                issue: 'Missing aggregator.go file - required for cluster-level metrics',
                severity: 'critical',
                impact: 'No cluster-level metrics will be generated'
            });
            return;
        }
        
        const content = fs.readFileSync(aggregatorFile, 'utf8');
        
        // Check for required aggregation methods
        for (const [method, metrics] of Object.entries(this.workingPatterns.aggregationMethods)) {
            if (!content.includes(method) && !content.includes(method.toLowerCase())) {
                this.findings.aggregationGaps.push({
                    method: method,
                    metrics: metrics,
                    severity: 'high',
                    impact: `Cannot aggregate ${metrics.join(', ')}`
                });
            }
        }
        
        // Check for broker to cluster aggregation
        const hasClusterAggregation = content.includes('cluster') && 
                                      content.includes('broker') &&
                                      content.includes('aggregate');
        
        if (!hasClusterAggregation) {
            this.findings.aggregationGaps.push({
                issue: 'Missing broker-to-cluster aggregation logic',
                severity: 'critical',
                impact: 'Cluster-level metrics will not be computed'
            });
        }
    }

    async analyzeConfiguration() {
        console.log("\n⚙️ Analyzing Configuration...");
        
        const configFile = 'src/msk/config.go';
        
        if (fs.existsSync(configFile)) {
            const content = fs.readFileSync(configFile, 'utf8');
            
            // Check for proper AWS configuration
            const hasRealAWSAccount = content.includes('123456789012') || 
                                     content.includes('12 digits');
            
            if (!hasRealAWSAccount) {
                this.findings.configurationGaps.push({
                    issue: 'Using New Relic account ID instead of AWS account ID',
                    severity: 'critical',
                    fix: 'Use 12-digit AWS account ID format'
                });
            }
            
            // Check for ARN generation
            const hasARNGeneration = content.includes('arn:aws:kafka');
            
            if (!hasARNGeneration) {
                this.findings.configurationGaps.push({
                    issue: 'Missing proper AWS ARN generation',
                    severity: 'high',
                    fix: 'Generate valid AWS MSK cluster ARNs'
                });
            }
        }
    }

    async analyzeIntegration() {
        console.log("\n🔗 Analyzing Integration Points...");
        
        // Check main integration file
        const kafkaFile = 'src/kafka.go';
        
        if (fs.existsSync(kafkaFile)) {
            const content = fs.readFileSync(kafkaFile, 'utf8');
            
            // Check for MSK shim integration
            const hasMSKIntegration = content.includes('msk.') || 
                                     content.includes('MSKShim') ||
                                     content.includes('mskShim');
            
            if (!hasMSKIntegration) {
                this.findings.integrationIssues.push({
                    file: kafkaFile,
                    issue: 'MSK shim not integrated into main Kafka integration',
                    severity: 'critical'
                });
            }
        }
        
        // Check for dimensional metrics support
        const hasUseDimensional = process.env.MSK_USE_DIMENSIONAL === 'true' ||
                                 process.env.NRI_KAFKA_USE_DIMENSIONAL === 'true';
        
        if (!hasUseDimensional) {
            this.findings.integrationIssues.push({
                issue: 'Dimensional metrics not enabled',
                severity: 'medium',
                fix: 'Set MSK_USE_DIMENSIONAL=true'
            });
        }
    }

    generateReport() {
        console.log("\n" + "=".repeat(80));
        console.log("📋 DEEP IMPLEMENTATION ANALYSIS REPORT");
        console.log("=".repeat(80));
        
        const allFindings = [
            ...this.findings.metricMappings.map(f => ({...f, category: 'Metric Mappings'})),
            ...this.findings.transformationIssues.map(f => ({...f, category: 'Transformations'})),
            ...this.findings.aggregationGaps.map(f => ({...f, category: 'Aggregation'})),
            ...this.findings.configurationGaps.map(f => ({...f, category: 'Configuration'})),
            ...this.findings.integrationIssues.map(f => ({...f, category: 'Integration'}))
        ];
        
        const criticalFindings = allFindings.filter(f => f.severity === 'critical');
        const highFindings = allFindings.filter(f => f.severity === 'high');
        const mediumFindings = allFindings.filter(f => f.severity === 'medium');
        
        console.log(`\n🔴 Critical Issues: ${criticalFindings.length}`);
        criticalFindings.forEach((f, i) => {
            console.log(`\n${i + 1}. [${f.category}] ${f.issue || f.missing || 'Issue'}`);
            if (f.file) console.log(`   File: ${f.file}`);
            if (f.fix) console.log(`   Fix: ${f.fix}`);
            if (f.impact) console.log(`   Impact: ${f.impact}`);
        });
        
        console.log(`\n🟠 High Priority Issues: ${highFindings.length}`);
        highFindings.forEach((f, i) => {
            console.log(`\n${i + 1}. [${f.category}] ${f.issue || f.missing || 'Issue'}`);
            if (f.file) console.log(`   File: ${f.file}`);
            if (f.mskName) console.log(`   MSK Metric: ${f.mskName}`);
        });
        
        console.log(`\n🟡 Medium Priority Issues: ${mediumFindings.length}`);
        mediumFindings.forEach((f, i) => {
            console.log(`\n${i + 1}. [${f.category}] ${f.issue || 'Issue'}`);
            if (f.fix) console.log(`   Fix: ${f.fix}`);
        });
        
        // Generate action plan
        console.log("\n" + "=".repeat(80));
        console.log("🎯 RECOMMENDED ACTION PLAN");
        console.log("=".repeat(80));
        
        if (criticalFindings.some(f => f.issue?.includes('aggregator.go'))) {
            console.log("\n1. CREATE AGGREGATOR (Critical):");
            console.log("   - Create src/msk/aggregator.go");
            console.log("   - Implement Sum, Average, Max, Count methods");
            console.log("   - Add broker-to-cluster aggregation logic");
        }
        
        if (criticalFindings.some(f => f.category === 'Metric Mappings')) {
            console.log("\n2. FIX METRIC MAPPINGS (Critical):");
            console.log("   - Update broker_definitions.go with all JMX mappings");
            console.log("   - Ensure metric names transform to kafka.* format");
        }
        
        if (criticalFindings.some(f => f.category === 'Transformations')) {
            console.log("\n3. UPDATE TRANSFORMERS (Critical):");
            console.log("   - Add kafka.broker.*, kafka.topic.*, kafka.cluster.* prefixes");
            console.log("   - Ensure entity.type is set to AWS_KAFKA_*");
        }
        
        // Save detailed report
        const reportData = {
            timestamp: new Date().toISOString(),
            summary: {
                critical: criticalFindings.length,
                high: highFindings.length,
                medium: mediumFindings.length
            },
            findings: allFindings,
            workingPatterns: this.workingPatterns
        };
        
        const filename = `implementation-gaps-${Date.now()}.json`;
        fs.writeFileSync(filename, JSON.stringify(reportData, null, 2));
        console.log(`\n📄 Detailed report saved to: ${filename}`);
    }
}

// Run the analyzer
const analyzer = new DeepImplementationAnalyzer();
analyzer.analyze().catch(console.error);