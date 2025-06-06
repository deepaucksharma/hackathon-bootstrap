#!/usr/bin/env node

/**
 * Implementation Gap Analyzer
 * 
 * Analyzes the current implementation to identify gaps based on
 * the patterns discovered from reference accounts
 */

const fs = require('fs');
const path = require('path');

class ImplementationGapAnalyzer {
  constructor() {
    this.gaps = {
      critical: [],
      high: [],
      medium: [],
      low: []
    };
    
    this.fixes = {
      immediate: [],
      shortTerm: [],
      longTerm: []
    };
    
    // Known working patterns from reference accounts
    this.referencePatterns = {
      account1: {
        id: '1',
        score: 72.2,
        uiVisible: true,
        keyFeatures: [
          'Has providerExternalId field',
          'Uses proper AWS account ID format',
          'Entity.type properly set',
          'Dimensional metrics enabled'
        ]
      },
      account3026020: {
        id: '3026020',
        score: 86.7,
        uiVisible: true,
        keyFeatures: [
          'Complete AWS field mapping',
          'Proper entity synthesis',
          'All MSK event types present'
        ]
      },
      account3630072: {
        id: '3630072',
        score: 98.9,
        uiVisible: false,
        issues: [
          'Missing providerExternalId',
          'Using NR account ID instead of AWS format',
          'Mock AWS data'
        ]
      }
    };
  }

  analyzeSourceCode() {
    console.log('🔍 Analyzing Source Code Implementation...\n');
    
    const files = {
      'src/msk/config.go': this.analyzeConfigFile,
      'src/msk/simple_transformer.go': this.analyzeSimpleTransformer,
      'src/msk/dimensional_transformer.go': this.analyzeDimensionalTransformer,
      'src/msk/shim.go': this.analyzeShim,
      'minikube-consolidated/monitoring/04-daemonset-bundle.yaml': this.analyzeKubernetesConfig
    };
    
    for (const [filePath, analyzer] of Object.entries(files)) {
      if (fs.existsSync(filePath)) {
        console.log(`\n📄 Analyzing ${filePath}...`);
        const content = fs.readFileSync(filePath, 'utf8');
        analyzer.call(this, content, filePath);
      } else {
        console.log(`⚠️  File not found: ${filePath}`);
      }
    }
  }

  analyzeConfigFile(content, filePath) {
    // Check AWS Account ID format
    if (content.includes('123456789012')) {
      console.log('✅ Using proper AWS account ID format');
    } else if (content.includes('3630072')) {
      this.addGap('critical', 'Config still using NR account ID (3630072)', filePath);
    }
    
    // Check for generateClusterARN implementation
    if (!content.includes('generateClusterARN')) {
      this.addGap('high', 'Missing generateClusterARN function', filePath);
    }
    
    // Check for MSK_USE_DIMENSIONAL
    if (!content.includes('MSK_USE_DIMENSIONAL')) {
      this.addGap('medium', 'Missing dimensional metrics configuration', filePath);
    }
  }

  analyzeSimpleTransformer(content, filePath) {
    // Critical fields for UI visibility
    const criticalFields = [
      'providerExternalId',
      'awsAccountId',
      'awsRegion',
      'instrumentation.provider',
      'providerAccountId'
    ];
    
    let missingFields = [];
    for (const field of criticalFields) {
      if (!content.includes(`"${field}"`)) {
        missingFields.push(field);
      }
    }
    
    if (missingFields.length > 0) {
      this.addGap('critical', 
        `Missing critical AWS fields in simple transformer: ${missingFields.join(', ')}`,
        filePath
      );
    }
    
    // Check for entity.type setting
    if (!content.includes('entity.type')) {
      this.addGap('high', 'Not setting entity.type in samples', filePath);
    }
    
    // Check for both MSK and standard Kafka samples
    if (!content.includes('AwsMskBrokerSample') || !content.includes('KafkaBrokerSample')) {
      this.addGap('medium', 'Not creating both MSK and Kafka samples', filePath);
    }
  }

  analyzeDimensionalTransformer(content, filePath) {
    // Check attribute builders
    const builders = [
      'buildBrokerAttributes',
      'buildClusterAttributes',
      'buildTopicAttributes'
    ];
    
    for (const builder of builders) {
      if (content.includes(builder)) {
        // Check if builder includes critical fields
        const builderMatch = content.match(new RegExp(`${builder}[^}]+}`, 's'));
        if (builderMatch) {
          const builderContent = builderMatch[0];
          
          if (!builderContent.includes('providerExternalId')) {
            this.addGap('critical', 
              `${builder} missing providerExternalId field`,
              filePath
            );
          }
          
          if (!builderContent.includes('instrumentation.provider')) {
            this.addGap('high',
              `${builder} missing instrumentation.provider field`,
              filePath
            );
          }
        }
      }
    }
    
    // Check for proper entity type constants
    if (!content.includes('AWS_KAFKA_BROKER') || 
        !content.includes('AWS_KAFKA_CLUSTER') || 
        !content.includes('AWS_KAFKA_TOPIC')) {
      this.addGap('high', 'Missing proper AWS entity type constants', filePath);
    }
  }

  analyzeShim(content, filePath) {
    // Check for dimensional transformer initialization
    if (!content.includes('NewDimensionalTransformer')) {
      this.addGap('high', 'MSK shim not initializing dimensional transformer', filePath);
    }
    
    // Check for proper flush implementation
    if (!content.includes('dimensionalTransformer.Flush')) {
      this.addGap('medium', 'Missing dimensional transformer flush', filePath);
    }
  }

  analyzeKubernetesConfig(content, filePath) {
    // Check AWS configuration
    if (content.includes('AWS_ACCOUNT_ID: "3630072"')) {
      this.addGap('critical', 'Kubernetes config using NR account ID', filePath);
    }
    
    if (!content.includes('MSK_USE_DIMENSIONAL: "true"')) {
      this.addGap('high', 'Dimensional metrics not enabled in Kubernetes', filePath);
    }
    
    if (!content.includes('NEW_RELIC_API_KEY')) {
      this.addGap('medium', 'API key not configured for dimensional metrics', filePath);
    }
  }

  analyzeDataFlow() {
    console.log('\n\n🔄 Analyzing Data Flow Patterns...\n');
    
    // Based on our understanding of working accounts
    const dataFlowChecks = [
      {
        name: 'Event to Dimensional Transformation',
        check: () => {
          // Check if TransformSample is properly implemented
          return this.checkFilePattern(
            'src/msk/dimensional_transformer.go',
            /TransformSample.*AwsMskBrokerSample/s
          );
        }
      },
      {
        name: 'Metric Batching',
        check: () => {
          return this.checkFilePattern(
            'src/msk/dimensional_transformer.go',
            /BatchCollector.*AddMetric/s
          );
        }
      },
      {
        name: 'AWS Field Propagation',
        check: () => {
          return this.checkFilePattern(
            'src/msk/simple_transformer.go',
            /awsMskSample\["providerExternalId"\]/
          );
        }
      }
    ];
    
    dataFlowChecks.forEach(check => {
      if (!check.check()) {
        this.addGap('high', `Data flow issue: ${check.name}`, 'Data Flow Analysis');
      } else {
        console.log(`✅ ${check.name}`);
      }
    });
  }

  checkFilePattern(filePath, pattern) {
    if (!fs.existsSync(filePath)) return false;
    const content = fs.readFileSync(filePath, 'utf8');
    return pattern.test(content);
  }

  compareWithReference() {
    console.log('\n\n📊 Comparing with Reference Accounts...\n');
    
    console.log('Known Working Patterns:');
    console.log('- Account 1 (72.2%, UI Visible): Has providerExternalId, proper AWS ID');
    console.log('- Account 3026020 (86.7%, UI Visible): Complete AWS fields, good entity synthesis');
    console.log('\nOur Account (3630072, 98.9%, NOT UI Visible):');
    console.log('- Missing: providerExternalId');
    console.log('- Issue: Using NR account ID instead of AWS format');
    console.log('- Issue: Mock AWS data\n');
    
    // Key differences that cause UI invisibility
    this.addGap('critical', 
      'PRIMARY ISSUE: Missing providerExternalId field that exists in all working accounts',
      'Account Comparison'
    );
    
    this.addGap('critical',
      'SECONDARY ISSUE: Using New Relic account ID (3630072) instead of AWS format (123456789012)',
      'Account Comparison'
    );
  }

  generateImplementationPlan() {
    console.log('\n\n🛠️  Implementation Plan\n');
    console.log('=' * 60);
    
    // Immediate fixes (< 1 hour)
    this.fixes.immediate = [
      {
        priority: 'CRITICAL',
        task: 'Add providerExternalId to all attribute builders',
        files: [
          'src/msk/simple_transformer.go - Line ~42',
          'src/msk/dimensional_transformer.go - buildBrokerAttributes, buildClusterAttributes, buildTopicAttributes'
        ],
        code: 'attribute.Attribute{Key: "providerExternalId", Value: s.config.AWSAccountID}'
      },
      {
        priority: 'CRITICAL', 
        task: 'Update AWS account ID to proper format',
        files: [
          'src/msk/config.go - Line ~31',
          'minikube-consolidated/monitoring/04-daemonset-bundle.yaml - Line ~35'
        ],
        code: 'awsAccountID = "123456789012" // NOT "3630072"'
      },
      {
        priority: 'HIGH',
        task: 'Enable dimensional metrics',
        files: [
          'minikube-consolidated/monitoring/04-daemonset-bundle.yaml'
        ],
        code: 'MSK_USE_DIMENSIONAL: "true"'
      }
    ];
    
    // Short-term fixes (< 1 day)
    this.fixes.shortTerm = [
      {
        priority: 'HIGH',
        task: 'Ensure entity.type is set correctly',
        description: 'Set to AWS_KAFKA_BROKER, AWS_KAFKA_CLUSTER, or AWS_KAFKA_TOPIC'
      },
      {
        priority: 'MEDIUM',
        task: 'Add instrumentation.provider = "aws" to all samples',
        description: 'Required for AWS provider detection'
      }
    ];
    
    // Print implementation plan
    console.log('\n📋 IMMEDIATE ACTIONS (Do Now):');
    this.fixes.immediate.forEach((fix, i) => {
      console.log(`\n${i + 1}. [${fix.priority}] ${fix.task}`);
      console.log(`   Files: ${fix.files.join(', ')}`);
      if (fix.code) {
        console.log(`   Code: ${fix.code}`);
      }
    });
    
    console.log('\n\n📋 SHORT-TERM ACTIONS (Within 24 hours):');
    this.fixes.shortTerm.forEach((fix, i) => {
      console.log(`\n${i + 1}. [${fix.priority}] ${fix.task}`);
      console.log(`   ${fix.description}`);
    });
  }

  addGap(severity, description, location) {
    this.gaps[severity].push({ description, location });
  }

  generateReport() {
    console.log('\n\n📊 Gap Analysis Summary\n');
    console.log('=' * 60);
    
    let totalGaps = 0;
    for (const [severity, gaps] of Object.entries(this.gaps)) {
      if (gaps.length > 0) {
        console.log(`\n${severity.toUpperCase()} (${gaps.length}):`);
        gaps.forEach(gap => {
          console.log(`  - ${gap.description}`);
          console.log(`    Location: ${gap.location}`);
        });
        totalGaps += gaps.length;
      }
    }
    
    console.log(`\n\nTotal Gaps Found: ${totalGaps}`);
    
    // Success criteria
    console.log('\n\n✅ Success Criteria:');
    console.log('After implementing fixes, verify:');
    console.log('1. providerExternalId field present in all samples');
    console.log('2. AWS account ID is 12 digits (not NR account ID)');
    console.log('3. Dimensional metrics are flowing');
    console.log('4. Data appears in Message Queues UI within 5-10 minutes');
    
    // Save report
    const report = {
      timestamp: new Date().toISOString(),
      gaps: this.gaps,
      fixes: this.fixes,
      totalGaps,
      criticalGaps: this.gaps.critical.length
    };
    
    fs.writeFileSync(
      `implementation-gaps-${Date.now()}.json`,
      JSON.stringify(report, null, 2)
    );
  }

  run() {
    console.log('🔍 Implementation Gap Analyzer');
    console.log('=' * 60);
    console.log('Analyzing current implementation against reference accounts...\n');
    
    this.analyzeSourceCode();
    this.analyzeDataFlow();
    this.compareWithReference();
    this.generateImplementationPlan();
    this.generateReport();
    
    console.log('\n\n✅ Analysis complete!');
  }
}

// Run analyzer
const analyzer = new ImplementationGapAnalyzer();
analyzer.run();