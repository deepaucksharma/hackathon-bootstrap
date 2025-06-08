/**
 * Entity Importer
 * 
 * Imports existing entity definitions from github.com/newrelic/entity-definitions
 * and converts them to the platform's entity format.
 */

const https = require('https');
const yaml = require('js-yaml');
const EntityFactory = require('./entity-factory');

class EntityImporter {
  constructor(config = {}) {
    this.config = {
      githubRepo: config.githubRepo || 'newrelic/entity-definitions',
      branch: config.branch || 'main',
      rawContentUrl: config.rawContentUrl || 'https://raw.githubusercontent.com',
      entityTypes: config.entityTypes || [],
      ...config
    };

    this.entityFactory = new EntityFactory();
    this.importedEntities = new Map();
  }

  /**
   * Import entity definitions from GitHub repository
   */
  async importFromGitHub(entityTypes = []) {
    const typesToImport = entityTypes.length > 0 ? entityTypes : this.config.entityTypes;
    
    if (typesToImport.length === 0) {
      throw new Error('No entity types specified for import');
    }

    console.log(`📥 Importing entity definitions for: ${typesToImport.join(', ')}`);
    
    const results = {
      successful: [],
      failed: [],
      entities: []
    };

    for (const entityType of typesToImport) {
      try {
        const entityDef = await this.fetchEntityDefinition(entityType);
        const converted = await this.convertEntityDefinition(entityDef, entityType);
        
        this.importedEntities.set(entityType, converted);
        results.successful.push(entityType);
        results.entities.push(converted);
        
        console.log(`  ✅ Imported ${entityType}`);
      } catch (error) {
        results.failed.push({ entityType, error: error.message });
        console.error(`  ❌ Failed to import ${entityType}: ${error.message}`);
      }
    }

    return results;
  }

  /**
   * Fetch entity definition from GitHub
   */
  async fetchEntityDefinition(entityType) {
    // Map entity types to likely file paths
    const pathMappings = {
      'AWSKAFKACLUSTER': 'entity-types/infra-awskafkacluster/definition.yml',
      'AWSKAFKABROKER': 'entity-types/infra-awskafkabroker/definition.yml',
      'AWSKAFKATOPIC': 'entity-types/infra-awskafkatopic/definition.yml',
      'KAFKACLUSTER': 'entity-types/apm-kafkacluster/definition.yml',
      'KAFKABROKER': 'entity-types/apm-kafkabroker/definition.yml',
      'KAFKATOPIC': 'entity-types/apm-kafkatopic/definition.yml',
      'RABBITMQCLUSTER': 'entity-types/apm-rabbitmqcluster/definition.yml',
      'RABBITMQQUEUE': 'entity-types/apm-rabbitmqqueue/definition.yml',
      'SQSQUEUE': 'entity-types/infra-awssqsqueue/definition.yml'
    };

    const filePath = pathMappings[entityType.toUpperCase()] || 
                    `entity-types/${entityType.toLowerCase()}/definition.yml`;
    
    const url = `${this.config.rawContentUrl}/${this.config.githubRepo}/${this.config.branch}/${filePath}`;
    
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: Unable to fetch ${entityType} from ${url}`));
          return;
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = yaml.load(data);
            resolve(parsed);
          } catch (error) {
            reject(new Error(`Failed to parse YAML for ${entityType}: ${error.message}`));
          }
        });
      }).on('error', reject);
    });
  }

  /**
   * Convert entity definition to platform format
   */
  async convertEntityDefinition(definition, originalType) {
    // Extract basic information
    const domain = definition.domain || 'INFRA';
    const type = definition.type || originalType;
    
    // Map to MESSAGE_QUEUE_* entity type
    const mappedType = this.mapToMessageQueueType(type);
    
    // Extract synthesis rules
    const synthesis = this.extractSynthesisRules(definition);
    
    // Extract golden metrics
    const goldenMetrics = this.extractGoldenMetrics(definition);
    
    // Extract relationships
    const relationships = this.extractRelationships(definition);
    
    // Build converted entity definition
    const converted = {
      originalType: type,
      mappedType,
      domain,
      displayName: definition.name || definition.displayName || type,
      description: definition.description,
      synthesis,
      goldenMetrics,
      relationships,
      dashboards: definition.dashboards || [],
      tags: this.extractTags(definition),
      metadata: {
        imported: true,
        importedAt: new Date().toISOString(),
        source: `${this.config.githubRepo}/${originalType}`
      }
    };

    return converted;
  }

  /**
   * Map original entity type to MESSAGE_QUEUE_* type
   */
  mapToMessageQueueType(originalType) {
    const mappings = {
      'AWSKAFKACLUSTER': 'MESSAGE_QUEUE_CLUSTER',
      'AWSKAFKABROKER': 'MESSAGE_QUEUE_BROKER',
      'AWSKAFKATOPIC': 'MESSAGE_QUEUE_TOPIC',
      'KAFKACLUSTER': 'MESSAGE_QUEUE_CLUSTER',
      'KAFKABROKER': 'MESSAGE_QUEUE_BROKER',
      'KAFKATOPIC': 'MESSAGE_QUEUE_TOPIC',
      'RABBITMQCLUSTER': 'MESSAGE_QUEUE_CLUSTER',
      'RABBITMQQUEUE': 'MESSAGE_QUEUE_QUEUE',
      'RABBITMQNODE': 'MESSAGE_QUEUE_BROKER',
      'SQSQUEUE': 'MESSAGE_QUEUE_QUEUE',
      'AZURESERVICEBUSQUEUE': 'MESSAGE_QUEUE_QUEUE',
      'AZURESERVICEBUSTOPIC': 'MESSAGE_QUEUE_TOPIC',
      'GOOGLEPUBSUBTOPIC': 'MESSAGE_QUEUE_TOPIC',
      'GOOGLEPUBSUBSUBSCRIPTION': 'MESSAGE_QUEUE_QUEUE'
    };

    return mappings[originalType.toUpperCase()] || 'MESSAGE_QUEUE_ENTITY';
  }

  /**
   * Extract synthesis rules from definition
   */
  extractSynthesisRules(definition) {
    const synthesis = definition.synthesis || {};
    
    return {
      name: synthesis.name || definition.name,
      identifier: synthesis.identifier || synthesis.primaryIdentifier || 'entity.name',
      conditions: synthesis.conditions || synthesis.rules || [],
      tags: synthesis.tags || {},
      encodeIdentifierInGUID: synthesis.encodeIdentifierInGUID !== false
    };
  }

  /**
   * Extract golden metrics from definition
   */
  extractGoldenMetrics(definition) {
    const goldenMetrics = definition.goldenMetrics || definition.goldensignals || {};
    const metrics = [];

    // Featured metrics
    if (goldenMetrics.featured) {
      goldenMetrics.featured.forEach(metric => {
        metrics.push({
          name: metric.name,
          title: metric.title,
          unit: metric.unit || this.inferUnit(metric.name),
          query: metric.query,
          displayAsValue: metric.displayAsValue !== false
        });
      });
    }

    // Golden signals (if no featured metrics)
    if (metrics.length === 0 && goldenMetrics.metrics) {
      Object.entries(goldenMetrics.metrics).forEach(([name, metric]) => {
        metrics.push({
          name,
          title: metric.title || name,
          unit: metric.unit || this.inferUnit(name),
          query: metric.queries?.[0]?.select || metric.query,
          displayAsValue: true
        });
      });
    }

    return metrics;
  }

  /**
   * Extract relationships from definition
   */
  extractRelationships(definition) {
    const relationships = [];
    
    if (definition.relationships) {
      definition.relationships.forEach(rel => {
        relationships.push({
          name: rel.type || rel.name,
          target: {
            type: rel.target?.type || rel.targetType,
            condition: rel.target?.condition || rel.condition
          },
          inverse: rel.inverse
        });
      });
    }

    return relationships;
  }

  /**
   * Extract tags from definition
   */
  extractTags(definition) {
    const tags = {};
    
    // Extract from synthesis rules
    if (definition.synthesis?.tags) {
      Object.entries(definition.synthesis.tags).forEach(([key, config]) => {
        if (config === true || config.persist === true) {
          tags[key] = true;
        }
      });
    }

    // Extract from tag definitions
    if (definition.tags) {
      definition.tags.forEach(tag => {
        tags[tag.key] = true;
      });
    }

    return tags;
  }

  /**
   * Infer unit from metric name
   */
  inferUnit(metricName) {
    const name = metricName.toLowerCase();
    
    if (name.includes('bytes')) return 'bytes';
    if (name.includes('percent') || name.includes('percentage')) return 'percentage';
    if (name.includes('count')) return 'count';
    if (name.includes('rate')) return 'rate';
    if (name.includes('time') || name.includes('latency') || name.includes('duration')) return 'ms';
    if (name.includes('cpu')) return 'percentage';
    if (name.includes('memory')) return 'bytes';
    if (name.includes('throughput')) return 'bytes/sec';
    
    return 'count';
  }

  /**
   * Create entity instance from imported definition
   */
  createEntityFromImported(importedDef, config = {}) {
    const entityConfig = {
      ...config,
      entityType: importedDef.mappedType,
      name: config.name || importedDef.displayName,
      provider: this.inferProvider(importedDef.originalType),
      metadata: {
        ...config.metadata,
        importedFrom: importedDef.originalType,
        importedAt: importedDef.metadata.importedAt
      }
    };

    // Create entity based on mapped type
    switch (importedDef.mappedType) {
      case 'MESSAGE_QUEUE_CLUSTER':
        return this.entityFactory.createCluster(entityConfig);
        
      case 'MESSAGE_QUEUE_BROKER':
        return this.entityFactory.createBroker(entityConfig);
        
      case 'MESSAGE_QUEUE_TOPIC':
        return this.entityFactory.createTopic(entityConfig);
        
      case 'MESSAGE_QUEUE_QUEUE':
        return this.entityFactory.createQueue(entityConfig);
        
      default:
        throw new Error(`Unsupported entity type: ${importedDef.mappedType}`);
    }
  }

  /**
   * Infer provider from entity type
   */
  inferProvider(entityType) {
    const type = entityType.toUpperCase();
    
    if (type.includes('AWS') || type.includes('MSK')) return 'kafka';
    if (type.includes('KAFKA')) return 'kafka';
    if (type.includes('RABBITMQ')) return 'rabbitmq';
    if (type.includes('SQS')) return 'sqs';
    if (type.includes('AZURE')) return 'azure-servicebus';
    if (type.includes('GOOGLE') || type.includes('PUBSUB')) return 'google-pubsub';
    
    return 'generic';
  }

  /**
   * List available entity types in repository
   */
  async listAvailableEntityTypes() {
    // This would require GitHub API access to list directory contents
    // For now, return known message queue related entity types
    return [
      'AWSKAFKACLUSTER',
      'AWSKAFKABROKER', 
      'AWSKAFKATOPIC',
      'KAFKACLUSTER',
      'KAFKABROKER',
      'KAFKATOPIC',
      'RABBITMQCLUSTER',
      'RABBITMQQUEUE',
      'RABBITMQNODE',
      'SQSQUEUE',
      'AZURESERVICEBUSQUEUE',
      'AZURESERVICEBUSTOPIC',
      'GOOGLEPUBSUBTOPIC',
      'GOOGLEPUBSUBSUBSCRIPTION'
    ];
  }

  /**
   * Get imported entity definition
   */
  getImportedEntity(entityType) {
    return this.importedEntities.get(entityType);
  }

  /**
   * Get all imported entities
   */
  getAllImportedEntities() {
    return Array.from(this.importedEntities.values());
  }

  /**
   * Clear imported entities
   */
  clearImportedEntities() {
    this.importedEntities.clear();
  }

  /**
   * Export imported definitions to file
   */
  async exportToFile(filepath) {
    const fs = require('fs').promises;
    const data = {
      timestamp: new Date().toISOString(),
      source: this.config.githubRepo,
      entities: Array.from(this.importedEntities.entries()).map(([type, def]) => ({
        type,
        definition: def
      }))
    };

    await fs.writeFile(filepath, JSON.stringify(data, null, 2));
    return filepath;
  }
}

module.exports = EntityImporter;