/**
 * Data Model Extractor
 * 
 * Utility to extract and display the actual data model being streamed
 * from platform.js during runtime.
 */

const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

class DataModelExtractor {
  constructor(options = {}) {
    this.options = {
      outputFormat: 'console', // 'console', 'json', 'file'
      outputPath: './data-model-output.json',
      includeMetadata: true,
      prettyPrint: true,
      ...options
    };
    
    this.extractedData = {
      metadata: {},
      entities: [],
      events: [],
      metrics: [],
      relationships: []
    };
  }

  /**
   * Extract data from platform during streaming
   */
  extractFromStreaming(entities, mode = 'unknown') {
    console.log(chalk.blue('\n📊 Extracting Data Model from Platform Stream'));
    console.log(chalk.gray(`Mode: ${mode} | Entities: ${entities.length}`));
    
    this.extractedData.metadata = {
      extractedAt: new Date().toISOString(),
      mode: mode,
      entityCount: entities.length,
      platformVersion: '1.0.0'
    };

    // Extract entity data
    entities.forEach((entity, index) => {
      this.extractEntity(entity, index);
    });

    // Display extracted model (only if show data model is enabled)
    if (this.options.outputFormat === 'console') {
      this.displayDataModel();
    }
    
    // Save to file if requested
    if (this.options.outputFormat === 'file' && this.options.outputPath) {
      this.saveToFile();
    }
    
    return this.extractedData;
  }

  /**
   * Extract data from a single entity
   */
  extractEntity(entity, index) {
    if (!entity || typeof entity.toEventPayload !== 'function') {
      console.warn(chalk.yellow(`⚠️  Entity ${index} is not a valid entity instance`));
      return;
    }

    // Extract event payload (what gets streamed)
    const eventPayload = entity.toEventPayload();
    
    // Extract entity metadata 
    const entityMetadata = {
      guid: entity.guid,
      name: entity.name,
      type: entity.entityType,
      provider: entity.provider,
      domain: entity.domain,
      createdAt: entity.createdAt,
      lastSeenAt: entity.lastSeenAt
    };

    // Extract golden metrics
    const goldenMetrics = entity.goldenMetrics.map(metric => ({
      name: metric.name,
      value: metric.value,
      unit: metric.unit,
      type: metric.type,
      description: metric.description
    }));

    // Extract relationships
    const relationships = entity.relationships.map(rel => ({
      type: rel.type,
      targetGuid: rel.targetGuid,
      attributes: rel.attributes || {}
    }));

    // Store extracted data
    this.extractedData.entities.push(entityMetadata);
    this.extractedData.events.push(eventPayload);
    this.extractedData.metrics.push(...goldenMetrics);
    this.extractedData.relationships.push(...relationships);
  }

  /**
   * Display the extracted data model in console
   */
  displayDataModel() {
    console.log(chalk.blue('\n🔍 Extracted Data Model Structure:'));
    
    // Group entities by type
    const entitiesByType = this.groupEntitiesByType();
    
    // Display entity types and counts
    console.log(chalk.cyan('\n📋 Entity Types:'));
    Object.entries(entitiesByType).forEach(([type, entities]) => {
      console.log(chalk.white(`  ${type}: ${entities.length} entities`));
    });

    // Display sample event structure for each type
    console.log(chalk.cyan('\n📨 Sample Event Structures:'));
    Object.entries(entitiesByType).forEach(([type, entities]) => {
      if (entities.length > 0) {
        console.log(chalk.yellow(`\n  ${type}:`));
        const sampleEvent = this.extractedData.events.find(e => e['entity.type'] === type);
        if (sampleEvent) {
          this.displayEventStructure(sampleEvent, '    ');
        }
      }
    });

    // Display golden metrics by entity type
    console.log(chalk.cyan('\n📊 Golden Metrics by Entity Type:'));
    Object.entries(entitiesByType).forEach(([type, entities]) => {
      if (entities.length > 0) {
        console.log(chalk.yellow(`\n  ${type}:`));
        const sampleEntity = entities[0];
        const entityMetrics = this.extractedData.metrics.filter(m => 
          this.extractedData.events.some(e => 
            e['entity.guid'] === sampleEntity.guid && e[m.name] !== undefined
          )
        );
        
        entityMetrics.forEach(metric => {
          console.log(chalk.gray(`    ${metric.name}: ${metric.value} ${metric.unit || ''}`));
        });
      }
    });

    // Display relationships summary
    if (this.extractedData.relationships.length > 0) {
      console.log(chalk.cyan('\n🔗 Relationships:'));
      const relationshipTypes = [...new Set(this.extractedData.relationships.map(r => r.type))];
      relationshipTypes.forEach(type => {
        const count = this.extractedData.relationships.filter(r => r.type === type).length;
        console.log(chalk.gray(`  ${type}: ${count} relationships`));
      });
    }

    // Save to file if requested
    if (this.options.outputFormat === 'file') {
      this.saveToFile();
    }
  }

  /**
   * Display event structure with proper formatting
   */
  displayEventStructure(event, indent = '') {
    // Core identification fields
    const coreFields = ['eventType', 'timestamp', 'entity.guid', 'entity.name', 'entity.type'];
    
    console.log(chalk.gray(`${indent}{`));
    
    // Show core fields first
    coreFields.forEach(field => {
      if (event[field] !== undefined) {
        const value = typeof event[field] === 'string' ? `"${event[field]}"` : event[field];
        console.log(chalk.gray(`${indent}  ${field}: ${value},`));
      }
    });

    // Show metadata fields
    const metadataFields = ['provider', 'accountId', 'environment', 'clusterName'];
    metadataFields.forEach(field => {
      if (event[field] !== undefined) {
        const value = typeof event[field] === 'string' ? `"${event[field]}"` : event[field];
        console.log(chalk.gray(`${indent}  ${field}: ${value},`));
      }
    });

    // Show golden metrics (numeric fields)
    const goldenMetrics = Object.keys(event).filter(key => 
      typeof event[key] === 'number' && 
      !coreFields.includes(key) && 
      !metadataFields.includes(key) &&
      !key.startsWith('tag.')
    );

    if (goldenMetrics.length > 0) {
      console.log(chalk.gray(`${indent}  // Golden Metrics`));
      goldenMetrics.slice(0, 5).forEach(metric => { // Show first 5 metrics
        console.log(chalk.gray(`${indent}  ${metric}: ${event[metric]},`));
      });
      if (goldenMetrics.length > 5) {
        console.log(chalk.gray(`${indent}  // ... ${goldenMetrics.length - 5} more metrics`));
      }
    }

    // Show tags
    const tags = Object.keys(event).filter(key => key.startsWith('tag.'));
    if (tags.length > 0) {
      console.log(chalk.gray(`${indent}  // Tags`));
      tags.slice(0, 3).forEach(tag => { // Show first 3 tags
        const value = typeof event[tag] === 'string' ? `"${event[tag]}"` : event[tag];
        console.log(chalk.gray(`${indent}  ${tag}: ${value},`));
      });
      if (tags.length > 3) {
        console.log(chalk.gray(`${indent}  // ... ${tags.length - 3} more tags`));
      }
    }

    console.log(chalk.gray(`${indent}}`));
  }

  /**
   * Group entities by type for analysis
   */
  groupEntitiesByType() {
    const grouped = {};
    this.extractedData.entities.forEach(entity => {
      if (!grouped[entity.type]) {
        grouped[entity.type] = [];
      }
      grouped[entity.type].push(entity);
    });
    return grouped;
  }

  /**
   * Save extracted data to file
   */
  saveToFile() {
    try {
      const outputPath = path.resolve(this.options.outputPath);
      const data = this.options.prettyPrint ? 
        JSON.stringify(this.extractedData, null, 2) : 
        JSON.stringify(this.extractedData);
      
      fs.writeFileSync(outputPath, data);
      console.log(chalk.green(`\n💾 Data model saved to: ${outputPath}`));
    } catch (error) {
      console.error(chalk.red('Failed to save data model:'), error.message);
    }
  }

  /**
   * Get summary statistics
   */
  getSummary() {
    const entitiesByType = this.groupEntitiesByType();
    const uniqueMetrics = [...new Set(this.extractedData.metrics.map(m => m.name))];
    const relationshipTypes = [...new Set(this.extractedData.relationships.map(r => r.type))];

    return {
      totalEntities: this.extractedData.entities.length,
      entityTypes: Object.keys(entitiesByType),
      entitiesByType: Object.fromEntries(
        Object.entries(entitiesByType).map(([type, entities]) => [type, entities.length])
      ),
      totalEvents: this.extractedData.events.length,
      uniqueMetrics: uniqueMetrics.length,
      totalRelationships: this.extractedData.relationships.length,
      relationshipTypes: relationshipTypes,
      extractedAt: this.extractedData.metadata.extractedAt
    };
  }

  /**
   * Generate comprehensive transformation pipeline documentation
   */
  generateTransformationPipelineDoc(sourceData = null) {
    const summary = this.getSummary();
    const entitiesByType = this.groupEntitiesByType();
    const timestamp = new Date().toISOString();
    const mode = this.extractedData.metadata.mode;
    
    let markdown = `# 🔄 Data Transformation Pipeline - Live Documentation\n\n`;
    markdown += `> **Generated on:** ${timestamp}  \n`;
    markdown += `> **Platform Mode:** ${mode.toUpperCase()}  \n`;
    markdown += `> **Entities Processed:** ${summary.totalEntities}  \n`;
    markdown += `> **Event Types:** ${summary.entityTypes.join(', ')}\n\n`;
    
    markdown += `---\n\n`;
    
    // Executive Summary
    markdown += `## 📊 Execution Summary\n\n`;
    markdown += `| Metric | Value |\n`;
    markdown += `|--------|-------|\n`;
    markdown += `| **Total Entities** | ${summary.totalEntities} |\n`;
    markdown += `| **Event Types** | ${summary.entityTypes.length} |\n`;
    markdown += `| **Total Events Streamed** | ${summary.totalEvents} |\n`;
    markdown += `| **Unique Golden Metrics** | ${summary.uniqueMetrics} |\n`;
    markdown += `| **Entity Relationships** | ${summary.totalRelationships} |\n`;
    markdown += `| **Platform Mode** | ${mode.toUpperCase()} |\n`;
    markdown += `| **Generation Time** | ${timestamp} |\n\n`;

    // Data Flow Diagram
    markdown += `## 🏗️ Data Flow (This Execution)\n\n`;
    markdown += `\`\`\`mermaid\n`;
    markdown += `graph TD\n`;
    
    if (mode === 'infrastructure') {
      markdown += `    A[NRDB Query] --> B[Raw Kafka Samples]\n`;
      markdown += `    B --> C[Data Validation]\n`;
      markdown += `    C --> D[Metric Transformation]\n`;
      markdown += `    D --> E[GUID Generation]\n`;
      markdown += `    E --> F[Relationship Building]\n`;
      markdown += `    F --> G[MESSAGE_QUEUE Events]\n`;
    } else if (mode === 'simulation') {
      markdown += `    A[Entity Factory] --> B[Synthetic Data Generation]\n`;
      markdown += `    B --> C[Realistic Pattern Application]\n`;
      markdown += `    C --> D[GUID Generation]\n`;
      markdown += `    D --> E[Relationship Building]\n`;
      markdown += `    E --> F[MESSAGE_QUEUE Events]\n`;
    } else {
      markdown += `    A[NRDB Query] --> B[Real Data]\n`;
      markdown += `    C[Entity Factory] --> D[Synthetic Data]\n`;
      markdown += `    B --> E[Data Merge]\n`;
      markdown += `    D --> E\n`;
      markdown += `    E --> F[Transformation]\n`;
      markdown += `    F --> G[MESSAGE_QUEUE Events]\n`;
    }
    markdown += `\`\`\`\n\n`;

    // Source Data (if infrastructure mode)
    if (mode === 'infrastructure' && sourceData) {
      markdown += `## 📥 Source Data (Raw NRDB Samples)\n\n`;
      markdown += this.generateSourceDataSection(sourceData);
    }

    // Entity Breakdown
    markdown += `## 📨 Generated MESSAGE_QUEUE Events\n\n`;
    Object.entries(entitiesByType).forEach(([type, entities]) => {
      if (entities.length > 0) {
        markdown += `### ${type} (${entities.length} entities)\n\n`;
        
        // Sample event
        const sampleEvent = this.extractedData.events.find(e => e['entity.type'] === type);
        if (sampleEvent) {
          markdown += `<details>\n`;
          markdown += `<summary><strong>🔍 Click to expand sample ${type} event</strong></summary>\n\n`;
          markdown += `\`\`\`json\n`;
          markdown += JSON.stringify(this.cleanEventForDisplay(sampleEvent), null, 2);
          markdown += `\n\`\`\`\n\n`;
          markdown += `</details>\n\n`;
        }

        // Golden metrics for this type
        const entityGuid = entities[0].guid;
        const entityMetrics = this.extractedData.events
          .find(e => e['entity.guid'] === entityGuid);
        
        if (entityMetrics) {
          const goldenMetrics = this.extractGoldenMetrics(entityMetrics);
          if (goldenMetrics.length > 0) {
            markdown += `**Golden Metrics:**\n`;
            goldenMetrics.forEach(metric => {
              markdown += `- \`${metric.name}\`: ${metric.value} ${metric.unit || ''}\n`;
            });
            markdown += `\n`;
          }
        }
      }
    });

    // Relationships
    if (summary.totalRelationships > 0) {
      markdown += `## 🔗 Entity Relationships\n\n`;
      const relationshipTypes = [...new Set(this.extractedData.relationships.map(r => r.type))];
      relationshipTypes.forEach(type => {
        const count = this.extractedData.relationships.filter(r => r.type === type).length;
        markdown += `- **${type}**: ${count} relationships\n`;
      });
      markdown += `\n`;

      // Relationship diagram
      markdown += `### Relationship Hierarchy\n\n`;
      markdown += `\`\`\`\n`;
      if (entitiesByType.MESSAGE_QUEUE_CLUSTER) {
        markdown += `MESSAGE_QUEUE_CLUSTER\n`;
        if (entitiesByType.MESSAGE_QUEUE_BROKER) {
          markdown += `├── CONTAINS → MESSAGE_QUEUE_BROKER (${entitiesByType.MESSAGE_QUEUE_BROKER.length})\n`;
        }
        if (entitiesByType.MESSAGE_QUEUE_TOPIC) {
          markdown += `├── CONTAINS → MESSAGE_QUEUE_TOPIC (${entitiesByType.MESSAGE_QUEUE_TOPIC.length})\n`;
        }
        if (entitiesByType.MESSAGE_QUEUE_CONSUMER) {
          markdown += `└── CONTAINS → MESSAGE_QUEUE_CONSUMER (${entitiesByType.MESSAGE_QUEUE_CONSUMER.length})\n`;
        }
      }
      markdown += `\`\`\`\n\n`;
    }

    // Platform Configuration
    markdown += `## ⚙️ Platform Configuration\n\n`;
    markdown += `\`\`\`yaml\n`;
    markdown += `mode: ${mode}\n`;
    markdown += `timestamp: ${timestamp}\n`;
    markdown += `entities_generated: ${summary.totalEntities}\n`;
    markdown += `events_streamed: ${summary.totalEvents}\n`;
    markdown += `relationships_built: ${summary.totalRelationships}\n`;
    if (this.extractedData.metadata.platformVersion) {
      markdown += `platform_version: ${this.extractedData.metadata.platformVersion}\n`;
    }
    markdown += `\`\`\`\n\n`;

    // Next Steps
    markdown += `## 🚀 Next Steps\n\n`;
    markdown += `1. **View in New Relic**: Check Entity Explorer for new MESSAGE_QUEUE_* entities\n`;
    markdown += `2. **Monitor Golden Metrics**: Set up alerts on key performance indicators\n`;
    markdown += `3. **Build Dashboards**: Use golden metrics for visualization\n`;
    markdown += `4. **Explore Relationships**: Navigate entity hierarchy in service maps\n\n`;

    // Footer
    markdown += `---\n\n`;
    markdown += `*This document was automatically generated by the New Relic Message Queues Platform*  \n`;
    markdown += `*Platform Mode: ${mode.toUpperCase()} | Generated: ${timestamp}*\n`;

    return markdown;
  }

  /**
   * Generate source data section for infrastructure mode
   */
  generateSourceDataSection(sourceData) {
    let section = `### Raw NRDB Sample Types\n\n`;
    
    if (sourceData.brokerSamples && sourceData.brokerSamples.length > 0) {
      section += `#### KafkaBrokerSample (${sourceData.brokerSamples.length} samples)\n\n`;
      section += `<details>\n`;
      section += `<summary><strong>📊 Sample KafkaBrokerSample structure</strong></summary>\n\n`;
      section += `\`\`\`json\n`;
      section += JSON.stringify(this.sanitizeSourceSample(sourceData.brokerSamples[0]), null, 2);
      section += `\n\`\`\`\n\n`;
      section += `</details>\n\n`;
    }

    if (sourceData.topicSamples && sourceData.topicSamples.length > 0) {
      section += `#### KafkaTopicSample (${sourceData.topicSamples.length} samples)\n\n`;
      section += `<details>\n`;
      section += `<summary><strong>📊 Sample KafkaTopicSample structure</strong></summary>\n\n`;
      section += `\`\`\`json\n`;
      section += JSON.stringify(this.sanitizeSourceSample(sourceData.topicSamples[0]), null, 2);
      section += `\n\`\`\`\n\n`;
      section += `</details>\n\n`;
    }

    if (sourceData.consumerSamples && sourceData.consumerSamples.length > 0) {
      section += `#### KafkaConsumerSample (${sourceData.consumerSamples.length} samples)\n\n`;
      section += `<details>\n`;
      section += `<summary><strong>📊 Sample KafkaConsumerSample structure</strong></summary>\n\n`;
      section += `\`\`\`json\n`;
      section += JSON.stringify(this.sanitizeSourceSample(sourceData.consumerSamples[0]), null, 2);
      section += `\n\`\`\`\n\n`;
      section += `</details>\n\n`;
    }

    return section;
  }

  /**
   * Clean event for display (remove noise, highlight important fields)
   */
  cleanEventForDisplay(event) {
    const cleaned = { ...event };
    
    // Highlight important fields first
    const importantFields = [
      'eventType', 'timestamp', 'entity.guid', 'entity.name', 'entity.type',
      'provider', 'accountId', 'environment', 'clusterName'
    ];
    
    const reordered = {};
    importantFields.forEach(field => {
      if (cleaned[field] !== undefined) {
        reordered[field] = cleaned[field];
        delete cleaned[field];
      }
    });
    
    // Add golden metrics
    Object.keys(cleaned).forEach(key => {
      if (typeof cleaned[key] === 'number' && !key.startsWith('tag.')) {
        reordered[key] = cleaned[key];
        delete cleaned[key];
      }
    });
    
    // Add remaining fields
    Object.assign(reordered, cleaned);
    
    return reordered;
  }

  /**
   * Extract golden metrics from event
   */
  extractGoldenMetrics(event) {
    const metrics = [];
    Object.keys(event).forEach(key => {
      if (typeof event[key] === 'number' && 
          !['timestamp', 'accountId'].includes(key) &&
          !key.startsWith('tag.')) {
        metrics.push({
          name: key,
          value: event[key],
          unit: this.getMetricUnit(key)
        });
      }
    });
    return metrics;
  }

  /**
   * Get unit for metric
   */
  getMetricUnit(metricName) {
    const unitMap = {
      'throughputPerSecond': 'messages/sec',
      'diskUsagePercent': '%',
      'networkBytesInPerSecond': 'bytes/sec',
      'networkBytesOutPerSecond': 'bytes/sec',
      'errorRate': '%',
      'lagTotal': 'messages',
      'lagMax': 'messages',
      'commitRate': 'commits/sec',
      'rebalanceRate': 'rebalances/hour',
      'partitionCount': 'count',
      'brokerCount': 'count',
      'topicCount': 'count',
      'memberCount': 'count'
    };
    return unitMap[metricName] || '';
  }

  /**
   * Sanitize source sample for display
   */
  sanitizeSourceSample(sample) {
    const sanitized = { ...sample };
    
    // Remove sensitive or noisy fields
    const fieldsToRemove = [
      'integrationName', 'integrationVersion', 'agentVersion',
      'kernelVersion', 'linuxDistribution', 'hostname'
    ];
    
    fieldsToRemove.forEach(field => delete sanitized[field]);
    
    // Truncate to reasonable size
    const keys = Object.keys(sanitized);
    if (keys.length > 25) {
      const truncated = {};
      keys.slice(0, 25).forEach(key => {
        truncated[key] = sanitized[key];
      });
      truncated['...'] = `${keys.length - 25} more fields`;
      return truncated;
    }
    
    return sanitized;
  }

  /**
   * Generate markdown documentation (legacy method for compatibility)
   */
  generateMarkdownDocs() {
    return this.generateTransformationPipelineDoc();
  }
}

module.exports = DataModelExtractor;