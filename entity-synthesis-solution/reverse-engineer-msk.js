#!/usr/bin/env node

/**
 * Reverse Engineering Tool for AWS MSK Entity Synthesis
 * 
 * This tool helps us understand:
 * 1. What exact format CloudWatch Metric Streams uses
 * 2. How entity synthesis rules work
 * 3. What transformations happen between metrics and entities
 */

const https = require('https');
const fs = require('fs');

// Load environment
if (fs.existsSync('.env')) {
  require('dotenv').config();
}

console.log(`
================================================================
🔬 AWS MSK Entity Synthesis Reverse Engineering
================================================================

Goal: Understand how to make our metrics appear in the Message 
      Queues UI by mimicking AWS CloudWatch Metric Streams
================================================================
`);

// Key insights from research
const insights = {
  "CloudWatch Metric Streams Format": {
    description: "AWS sends metrics via CloudWatch Metric Streams with specific formatting",
    example: {
      eventType: "Metric",
      metricName: "aws.kafka.BytesInPerSec.Average",
      value: 1234.5,
      timestamp: Date.now(),
      attributes: {
        "metricStreamName": "NewRelic-Metric-Stream",
        "collector.name": "cloudwatch-metric-streams",
        "instrumentation.provider": "aws"
      },
      dimensions: {
        "aws.Namespace": "AWS/Kafka",
        "aws.AccountId": "123456789012",
        "aws.Region": "us-east-1",
        "aws.kafka.ClusterName": "my-msk-cluster",
        "aws.kafka.BrokerID": "1"
      }
    }
  },

  "Entity Synthesis Rules": {
    description: "How New Relic creates entities from metrics",
    rules: [
      "1. Collector name 'cloudwatch-metric-streams' triggers AWS entity synthesis",
      "2. Dimensions with 'aws.' prefix are recognized as AWS dimensions",
      "3. aws.Namespace determines the service type (AWS/Kafka → MSK)",
      "4. Entity type is inferred from namespace + dimensions",
      "5. No explicit 'provider' field needed - it's inferred"
    ]
  },

  "Working Entity Structure": {
    description: "What a properly synthesized AWS MSK entity looks like",
    entity: {
      type: "AWS_KAFKA_BROKER",
      guid: "MTIzNDU2Nzg5MDEyfElORlJBfE5BfDEyMzQ1Njc4OQ==",
      name: "my-msk-cluster-broker-1",
      domain: "INFRA",
      reporting: true,
      tags: {
        "aws.accountId": ["123456789012"],
        "aws.region": ["us-east-1"],
        "aws.kafka.clusterName": ["my-msk-cluster"],
        "aws.kafka.brokerId": ["1"],
        "instrumentation.provider": ["aws"]
      }
    }
  },

  "Key Differences": {
    description: "Why our current approach doesn't work",
    issues: [
      {
        current: "Using custom event types (AwsMskBrokerSample)",
        required: "Use Metric event type with dimensions"
      },
      {
        current: "Setting 'provider' field manually",
        required: "Let entity framework infer from collector.name"
      },
      {
        current: "Using provider.* attributes",
        required: "Use aws.* dimensions"
      },
      {
        current: "collector.name = 'nri-kafka'",
        required: "collector.name = 'cloudwatch-metric-streams'"
      }
    ]
  }
};

// Print insights
Object.entries(insights).forEach(([title, data]) => {
  console.log(`\n📌 ${title}`);
  console.log(`   ${data.description}\n`);
  
  if (data.example) {
    console.log('   Example:');
    console.log(JSON.stringify(data.example, null, 4).split('\n').map(line => '   ' + line).join('\n'));
  }
  
  if (data.rules) {
    console.log('   Rules:');
    data.rules.forEach(rule => console.log(`   ${rule}`));
  }
  
  if (data.entity) {
    console.log('   Entity Structure:');
    console.log(JSON.stringify(data.entity, null, 4).split('\n').map(line => '   ' + line).join('\n'));
  }
  
  if (data.issues) {
    console.log('   Issues:');
    data.issues.forEach(issue => {
      console.log(`   ❌ Current: ${issue.current}`);
      console.log(`   ✅ Required: ${issue.required}\n`);
    });
  }
});

// Generate implementation plan
console.log(`
================================================================
🛠️  IMPLEMENTATION PLAN
================================================================

OPTION 1: Full CloudWatch Mimicry (Recommended)
------------------------------------------------
1. Switch from event samples to dimensional metrics
2. Use Metric event type exclusively
3. Set collector.name = "cloudwatch-metric-streams"
4. Use aws.* prefixed dimensions
5. Include aws.Namespace = "AWS/Kafka"

OPTION 2: Hybrid Approach
------------------------------------------------
1. Keep event samples for backward compatibility
2. ADD dimensional metrics with CloudWatch format
3. Test which approach triggers entity synthesis

OPTION 3: Raw Protocol Manipulation
------------------------------------------------
1. Bypass SDK completely
2. Generate exact JSON matching CloudWatch format
3. Send directly to infrastructure agent

================================================================
🧪 TESTING APPROACH
================================================================

1. Create test integration that sends both formats
2. Monitor entity creation in real-time
3. Check Entity Explorer for new entities
4. Verify Message Queues UI visibility

Key Test Points:
- Does collector.name affect entity synthesis?
- Are aws.* dimensions required?
- Can we mix event samples with metrics?
- What's the minimum set of fields needed?

================================================================
`);

// Save analysis
const analysisFile = `msk-reverse-engineering-${Date.now()}.json`;
fs.writeFileSync(analysisFile, JSON.stringify({
  timestamp: new Date().toISOString(),
  insights,
  implementation_options: [
    "Full CloudWatch Mimicry",
    "Hybrid Approach", 
    "Raw Protocol Manipulation"
  ],
  next_steps: [
    "Implement dimensional metrics transformer",
    "Test with collector.name variations",
    "Monitor entity synthesis results"
  ]
}, null, 2));

console.log(`📁 Analysis saved to: ${analysisFile}\n`);