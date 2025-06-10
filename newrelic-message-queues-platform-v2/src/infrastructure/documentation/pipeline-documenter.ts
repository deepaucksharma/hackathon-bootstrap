/**
 * Pipeline Documenter for V2
 * 
 * Generates documentation showing the data transformation pipeline stages
 * without unnecessary percentage metrics
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Logger } from '@shared/utils/logger.js';

export interface RawDataStage {
  timestamp: number;
  samples: {
    brokers: any[];
    topics: any[];
    consumerGroups: any[];
    queues?: any[];
  };
  source: string;
}

export interface TransformedDataStage {
  timestamp: number;
  entities: any[];
  transformations: {
    fieldMappings: number;
    validations: number;
    enrichments: number;
  };
}

export interface SynthesizedDataStage {
  timestamp: number;
  entities: any[];
  relationships: any[];
  entityTypes: Record<string, number>;
}

export class PipelineDocumenter {
  private stages = {
    raw: null as RawDataStage | null,
    transformed: null as TransformedDataStage | null,
    synthesized: null as SynthesizedDataStage | null
  };

  constructor(
    private logger: Logger,
    private outputDir: string = path.join(process.cwd(), 'pipeline-reports')
  ) {
    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Capture raw data stage
   */
  captureRawData(samples: any, source: string = 'nri-kafka') {
    this.stages.raw = {
      timestamp: Date.now(),
      samples: {
        brokers: samples.brokers || [],
        topics: samples.topics || [],
        consumerGroups: samples.consumerGroups || [],
        queues: samples.queues || []
      },
      source
    };
    this.logger.debug('Captured raw data stage', { stage: 'raw', count: this.getTotalSampleCount() });
  }

  /**
   * Capture transformed data stage
   */
  captureTransformedData(entities: any[], transformations: any) {
    this.stages.transformed = {
      timestamp: Date.now(),
      entities,
      transformations: {
        fieldMappings: transformations.fieldMappings || 0,
        validations: transformations.validations || 0,
        enrichments: transformations.enrichments || 0
      }
    };
    this.logger.debug('Captured transformed data stage', { stage: 'transformed', count: entities.length });
  }

  /**
   * Capture synthesized data stage
   */
  captureSynthesizedData(entities: any[], relationships: any[]) {
    const entityTypes: Record<string, number> = {};
    entities.forEach(entity => {
      const type = entity.entityType || 'UNKNOWN';
      entityTypes[type] = (entityTypes[type] || 0) + 1;
    });

    this.stages.synthesized = {
      timestamp: Date.now(),
      entities,
      relationships,
      entityTypes
    };
    this.logger.debug('Captured synthesized data stage', { stage: 'synthesized', entities: entities.length, relationships: relationships.length });
  }

  /**
   * Generate the pipeline report
   */
  generateReport(): string {
    const timestamp = new Date().toISOString();
    const filename = `pipeline-report-${timestamp.split('T')[0]}.md`;
    const filepath = path.join(this.outputDir, filename);

    const content = this.buildReportContent(timestamp);
    
    fs.writeFileSync(filepath, content);
    
    // Also save as latest
    const latestPath = path.join(this.outputDir, 'LATEST_PIPELINE_REPORT.md');
    fs.writeFileSync(latestPath, content);

    this.logger.info('Pipeline report generated', { filepath, latestPath });
    
    return latestPath;
  }

  /**
   * Build the report content
   */
  private buildReportContent(timestamp: string): string {
    const sections: string[] = [];

    // Header
    sections.push(this.buildHeader(timestamp));

    // Executive Summary
    sections.push(this.buildExecutiveSummary());

    // Stage 1: Raw Data
    sections.push(this.buildRawDataSection());

    // Stage 2: Transformation
    sections.push(this.buildTransformationSection());

    // Stage 3: Entity Synthesis
    sections.push(this.buildSynthesisSection());

    // Data Flow Diagram
    sections.push(this.buildDataFlowDiagram());

    // Transformation Mapping
    sections.push(this.buildTransformationMapping());

    return sections.join('\n\n');
  }

  private buildHeader(timestamp: string): string {
    return `# Data Transformation Pipeline Report

**Generated**: ${timestamp}  
**Platform**: New Relic Message Queues Platform V2  
**Mode**: ${this.stages.raw?.source || 'Unknown'}

---`;
  }

  private buildExecutiveSummary(): string {
    const rawCount = this.getTotalSampleCount();
    const transformedCount = this.stages.transformed?.entities.length || 0;
    const synthesizedCount = this.stages.synthesized?.entities.length || 0;
    const relationshipCount = this.stages.synthesized?.relationships.length || 0;

    return `## Executive Summary

### Pipeline Metrics

| Stage | Input | Output | Description |
|:------|:------|:-------|:------------|
| **Collection** | - | ${rawCount} samples | Raw data from ${this.stages.raw?.source} |
| **Transformation** | ${rawCount} samples | ${transformedCount} entities | Field mapping and validation |
| **Synthesis** | ${transformedCount} entities | ${synthesizedCount} entities + ${relationshipCount} relationships | Entity creation with relationships |

### Entity Distribution

| Entity Type | Count |
|:------------|:------|
${this.buildEntityDistributionRows()}`;
  }

  private buildRawDataSection(): string {
    if (!this.stages.raw) {
      return '## Stage 1: Raw Data Collection\n\n*No raw data captured*';
    }

    const { samples } = this.stages.raw;
    
    return `## Stage 1: Raw Data Collection

### Data Source: ${this.stages.raw.source}

### Sample Counts
- Broker Samples: ${samples.brokers.length}
- Topic Samples: ${samples.topics.length}  
- Consumer Group Samples: ${samples.consumerGroups.length}
- Queue Samples: ${samples.queues?.length || 0}

### Sample Data Structure

#### Broker Sample
\`\`\`json
${JSON.stringify(samples.brokers[0] || {}, null, 2)}
\`\`\`

#### Topic Sample
\`\`\`json
${JSON.stringify(samples.topics[0] || {}, null, 2)}
\`\`\``;
  }

  private buildTransformationSection(): string {
    if (!this.stages.transformed) {
      return '## Stage 2: Data Transformation\n\n*No transformed data captured*';
    }

    const { entities, transformations } = this.stages.transformed;
    
    return `## Stage 2: Data Transformation

### Transformation Operations
- Field Mappings: ${transformations.fieldMappings}
- Validations: ${transformations.validations}
- Enrichments: ${transformations.enrichments}

### Transformed Entity Example
\`\`\`json
${JSON.stringify(entities[0] || {}, null, 2)}
\`\`\``;
  }

  private buildSynthesisSection(): string {
    if (!this.stages.synthesized) {
      return '## Stage 3: Entity Synthesis\n\n*No synthesized data captured*';
    }

    const { entities, relationships, entityTypes } = this.stages.synthesized;
    
    return `## Stage 3: Entity Synthesis

### Entity Creation
- Total Entities: ${entities.length}
- Total Relationships: ${relationships.length}

### Entity Types Created
${Object.entries(entityTypes).map(([type, count]) => `- ${type}: ${count}`).join('\n')}

### Synthesized Entity Example
\`\`\`json
${JSON.stringify(entities[0] || {}, null, 2)}
\`\`\`

### Relationship Example
\`\`\`json
${JSON.stringify(relationships[0] || {}, null, 2)}
\`\`\``;
  }

  private buildDataFlowDiagram(): string {
    return `## Data Flow Visualization

\`\`\`mermaid
graph LR
    A[Raw Data Source] --> B[Collection]
    B --> C[${this.getTotalSampleCount()} Samples]
    C --> D[Transformation]
    D --> E[${this.stages.transformed?.entities.length || 0} Transformed]
    E --> F[Entity Synthesis]
    F --> G[${this.stages.synthesized?.entities.length || 0} Entities]
    F --> H[${this.stages.synthesized?.relationships.length || 0} Relationships]
    
    style A fill:#f9f,stroke:#333,stroke-width:2px
    style G fill:#9f9,stroke:#333,stroke-width:2px
    style H fill:#9f9,stroke:#333,stroke-width:2px
\`\`\``;
  }

  private buildTransformationMapping(): string {
    return `## Transformation Mapping

### Field Mappings

| Source Field | Target Field | Transformation |
|:-------------|:-------------|:---------------|
| broker.id | brokerId | Direct mapping |
| broker.bytesInPerSecond | broker.network.in | Metric rename |
| broker.bytesOutPerSecond | broker.network.out | Metric rename |
| bytesIn + bytesOut | broker.network.throughput | Calculated field |
| topic.messagesInPerSecond | topic.throughput.in | Metric rename |
| consumer.lag | consumerGroup.lag | Aggregation |

### Entity Type Mapping

| Source Event | Target Entity Type | GUID Pattern |
|:-------------|:-------------------|:-------------|
| KafkaBrokerSample | MESSAGE_QUEUE_BROKER | {accountId}\|INFRA\|MESSAGE_QUEUE_BROKER\|{hash} |
| KafkaTopicSample | MESSAGE_QUEUE_TOPIC | {accountId}\|INFRA\|MESSAGE_QUEUE_TOPIC\|{hash} |
| KafkaConsumerSample | MESSAGE_QUEUE_CONSUMER_GROUP | {accountId}\|INFRA\|MESSAGE_QUEUE_CONSUMER_GROUP\|{hash} |`;
  }

  private getTotalSampleCount(): number {
    if (!this.stages.raw) return 0;
    const { samples } = this.stages.raw;
    return samples.brokers.length + 
           samples.topics.length + 
           samples.consumerGroups.length + 
           (samples.queues?.length || 0);
  }

  private buildEntityDistributionRows(): string {
    if (!this.stages.synthesized) return '| *No data* | 0 |';
    
    return Object.entries(this.stages.synthesized.entityTypes)
      .map(([type, count]) => `| ${type} | ${count} |`)
      .join('\n');
  }
}

export class PipelineDocumenterFactory {
  static create(logger: Logger, outputDir?: string): PipelineDocumenter {
    return new PipelineDocumenter(logger, outputDir);
  }
}