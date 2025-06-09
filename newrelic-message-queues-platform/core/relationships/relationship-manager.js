/**
 * Entity Relationship Manager
 * 
 * Manages relationships between MESSAGE_QUEUE_* entities with proper
 * hierarchy and bidirectional mapping.
 */

const EventEmitter = require('events');

class RelationshipManager extends EventEmitter {
  constructor() {
    super();
    
    // Store relationships by entity GUID
    this.relationships = new Map();
    
    // Store entity hierarchy
    this.hierarchy = new Map();
    
    // Relationship types
    this.relationshipTypes = {
      // Hierarchical relationships
      CONTAINS: 'CONTAINS',
      CONTAINED_IN: 'CONTAINED_IN',
      BELONGS_TO: 'BELONGS_TO',
      OWNS: 'OWNS',
      
      // Functional relationships
      PRODUCES_TO: 'PRODUCES_TO',
      CONSUMES_FROM: 'CONSUMES_FROM',
      COORDINATED_BY: 'COORDINATED_BY',
      COORDINATES: 'COORDINATES',
      REPLICATES_TO: 'REPLICATES_TO',
      REPLICATED_FROM: 'REPLICATED_FROM',
      
      // Service relationships
      SERVES: 'SERVES',
      SERVED_BY: 'SERVED_BY',
      MANAGES: 'MANAGES',
      MANAGED_BY: 'MANAGED_BY'
    };
    
    // Inverse relationship mappings
    this.inverseRelationships = {
      CONTAINS: 'CONTAINED_IN',
      CONTAINED_IN: 'CONTAINS',
      BELONGS_TO: 'OWNS',
      OWNS: 'BELONGS_TO',
      PRODUCES_TO: 'CONSUMES_FROM',
      CONSUMES_FROM: 'PRODUCES_TO',
      COORDINATED_BY: 'COORDINATES',
      COORDINATES: 'COORDINATED_BY',
      REPLICATES_TO: 'REPLICATED_FROM',
      REPLICATED_FROM: 'REPLICATES_TO',
      SERVES: 'SERVED_BY',
      SERVED_BY: 'SERVES',
      MANAGES: 'MANAGED_BY',
      MANAGED_BY: 'MANAGES'
    };
  }

  /**
   * Add a relationship between two entities
   */
  addRelationship(sourceGuid, targetGuid, relationshipType, metadata = {}) {
    if (!sourceGuid || !targetGuid) {
      throw new Error('Both source and target GUIDs are required');
    }
    
    if (!this.relationshipTypes[relationshipType]) {
      throw new Error(`Invalid relationship type: ${relationshipType}`);
    }
    
    // Initialize relationship storage if needed
    if (!this.relationships.has(sourceGuid)) {
      this.relationships.set(sourceGuid, {
        outgoing: new Map(),
        incoming: new Map()
      });
    }
    
    if (!this.relationships.has(targetGuid)) {
      this.relationships.set(targetGuid, {
        outgoing: new Map(),
        incoming: new Map()
      });
    }
    
    // Add outgoing relationship from source
    const sourceRels = this.relationships.get(sourceGuid);
    if (!sourceRels.outgoing.has(relationshipType)) {
      sourceRels.outgoing.set(relationshipType, []);
    }
    sourceRels.outgoing.get(relationshipType).push({
      targetGuid,
      metadata,
      createdAt: new Date().toISOString()
    });
    
    // Add incoming relationship to target
    const targetRels = this.relationships.get(targetGuid);
    const inverseType = this.inverseRelationships[relationshipType] || relationshipType;
    if (!targetRels.incoming.has(inverseType)) {
      targetRels.incoming.set(inverseType, []);
    }
    targetRels.incoming.get(inverseType).push({
      sourceGuid,
      metadata,
      createdAt: new Date().toISOString()
    });
    
    // Update hierarchy if it's a hierarchical relationship
    if (['CONTAINS', 'OWNS', 'MANAGES'].includes(relationshipType)) {
      this.updateHierarchy(sourceGuid, targetGuid, relationshipType);
    }
    
    // Emit event
    this.emit('relationshipAdded', {
      sourceGuid,
      targetGuid,
      relationshipType,
      metadata
    });
  }

  /**
   * Update entity hierarchy
   */
  updateHierarchy(parentGuid, childGuid, relationshipType) {
    if (!this.hierarchy.has(parentGuid)) {
      this.hierarchy.set(parentGuid, {
        parent: null,
        children: new Set(),
        level: 0
      });
    }
    
    if (!this.hierarchy.has(childGuid)) {
      this.hierarchy.set(childGuid, {
        parent: null,
        children: new Set(),
        level: 1
      });
    }
    
    const parentNode = this.hierarchy.get(parentGuid);
    const childNode = this.hierarchy.get(childGuid);
    
    parentNode.children.add(childGuid);
    childNode.parent = parentGuid;
    childNode.level = parentNode.level + 1;
  }

  /**
   * Get all relationships for an entity
   */
  getRelationships(entityGuid) {
    const rels = this.relationships.get(entityGuid);
    if (!rels) {
      return { outgoing: {}, incoming: {} };
    }
    
    // Convert Maps to objects for easier consumption
    const outgoing = {};
    const incoming = {};
    
    rels.outgoing.forEach((targets, type) => {
      outgoing[type] = targets;
    });
    
    rels.incoming.forEach((sources, type) => {
      incoming[type] = sources;
    });
    
    return { outgoing, incoming };
  }

  /**
   * Get relationships of a specific type
   */
  getRelationshipsByType(entityGuid, relationshipType, direction = 'outgoing') {
    const rels = this.relationships.get(entityGuid);
    if (!rels) {
      return [];
    }
    
    const directionRels = direction === 'outgoing' ? rels.outgoing : rels.incoming;
    return directionRels.get(relationshipType) || [];
  }

  /**
   * Get entity hierarchy
   */
  getHierarchy(entityGuid) {
    const node = this.hierarchy.get(entityGuid);
    if (!node) {
      return null;
    }
    
    const result = {
      entityGuid,
      parent: node.parent,
      children: Array.from(node.children),
      level: node.level,
      ancestors: [],
      descendants: []
    };
    
    // Get ancestors
    let current = node.parent;
    while (current) {
      result.ancestors.push(current);
      const parentNode = this.hierarchy.get(current);
      current = parentNode ? parentNode.parent : null;
    }
    
    // Get descendants recursively
    const getDescendants = (guid) => {
      const n = this.hierarchy.get(guid);
      if (!n) return [];
      
      const desc = [];
      n.children.forEach(child => {
        desc.push(child);
        desc.push(...getDescendants(child));
      });
      return desc;
    };
    
    result.descendants = getDescendants(entityGuid);
    
    return result;
  }

  /**
   * Build cluster hierarchy
   */
  buildClusterHierarchy(clusterGuid, entities) {
    // Cluster contains brokers
    entities.brokers?.forEach(broker => {
      this.addRelationship(clusterGuid, broker.entityGuid || broker.guid, 'CONTAINS', {
        entityType: 'MESSAGE_QUEUE_BROKER'
      });
    });
    
    // Cluster contains topics
    entities.topics?.forEach(topic => {
      this.addRelationship(clusterGuid, topic.entityGuid || topic.guid, 'CONTAINS', {
        entityType: 'MESSAGE_QUEUE_TOPIC'
      });
    });
    
    // Consumer groups belong to cluster
    entities.consumerGroups?.forEach(group => {
      this.addRelationship(clusterGuid, group.entityGuid, 'CONTAINS', {
        entityType: 'MESSAGE_QUEUE_CONSUMER_GROUP'
      });
      
      // Consumer groups consume from topics
      group.topics?.forEach(topicName => {
        const topic = entities.topics.find(t => 
          (t.topicName || t.topic) === topicName
        );
        if (topic) {
          this.addRelationship(
            group.entityGuid, 
            topic.entityGuid || topic.guid, 
            'CONSUMES_FROM',
            { topicName }
          );
        }
      });
      
      // Consumer group coordinated by broker
      if (group.coordinator?.id !== undefined) {
        const broker = entities.brokers.find(b => 
          b.brokerId === group.coordinator.id
        );
        if (broker) {
          this.addRelationship(
            group.entityGuid,
            broker.entityGuid || broker.guid,
            'COORDINATED_BY',
            { coordinatorRole: true }
          );
        }
      }
    });
    
    // Topics served by brokers (simplified - all brokers serve all topics)
    entities.topics?.forEach(topic => {
      entities.brokers?.forEach(broker => {
        this.addRelationship(
          broker.entityGuid || broker.guid,
          topic.entityGuid || topic.guid,
          'SERVES',
          { replicationFactor: topic.replicationFactor || 1 }
        );
      });
    });
  }

  /**
   * Get related entities
   */
  getRelatedEntities(entityGuid, relationshipType = null, maxDepth = 1) {
    const visited = new Set();
    const related = [];
    
    const traverse = (guid, depth) => {
      if (visited.has(guid) || depth > maxDepth) {
        return;
      }
      visited.add(guid);
      
      const rels = this.getRelationships(guid);
      
      // Process outgoing relationships
      Object.entries(rels.outgoing).forEach(([type, targets]) => {
        if (!relationshipType || type === relationshipType) {
          targets.forEach(target => {
            related.push({
              entityGuid: target.targetGuid,
              relationshipType: type,
              direction: 'outgoing',
              metadata: target.metadata
            });
            
            if (depth < maxDepth) {
              traverse(target.targetGuid, depth + 1);
            }
          });
        }
      });
      
      // Process incoming relationships
      Object.entries(rels.incoming).forEach(([type, sources]) => {
        if (!relationshipType || type === relationshipType) {
          sources.forEach(source => {
            related.push({
              entityGuid: source.sourceGuid,
              relationshipType: type,
              direction: 'incoming',
              metadata: source.metadata
            });
            
            if (depth < maxDepth) {
              traverse(source.sourceGuid, depth + 1);
            }
          });
        }
      });
    };
    
    traverse(entityGuid, 0);
    
    // Remove duplicates
    const unique = new Map();
    related.forEach(rel => {
      const key = `${rel.entityGuid}-${rel.relationshipType}-${rel.direction}`;
      unique.set(key, rel);
    });
    
    return Array.from(unique.values());
  }

  /**
   * Validate relationship consistency
   */
  validateRelationships() {
    const issues = [];
    
    this.relationships.forEach((rels, entityGuid) => {
      // Check for orphaned relationships
      rels.outgoing.forEach((targets, type) => {
        targets.forEach(target => {
          if (!this.relationships.has(target.targetGuid)) {
            issues.push({
              type: 'orphaned_target',
              sourceGuid: entityGuid,
              targetGuid: target.targetGuid,
              relationshipType: type
            });
          }
        });
      });
      
      // Check for circular dependencies in hierarchy
      const hierarchy = this.getHierarchy(entityGuid);
      if (hierarchy && hierarchy.ancestors.includes(entityGuid)) {
        issues.push({
          type: 'circular_hierarchy',
          entityGuid,
          ancestors: hierarchy.ancestors
        });
      }
    });
    
    return issues;
  }

  /**
   * Export relationships for visualization
   */
  exportForVisualization() {
    const nodes = [];
    const edges = [];
    
    // Create nodes
    this.relationships.forEach((rels, entityGuid) => {
      const hierarchy = this.hierarchy.get(entityGuid);
      nodes.push({
        id: entityGuid,
        level: hierarchy?.level || 0,
        hasChildren: hierarchy?.children.size > 0
      });
    });
    
    // Create edges
    this.relationships.forEach((rels, sourceGuid) => {
      rels.outgoing.forEach((targets, type) => {
        targets.forEach(target => {
          edges.push({
            source: sourceGuid,
            target: target.targetGuid,
            type,
            metadata: target.metadata
          });
        });
      });
    });
    
    return { nodes, edges };
  }

  /**
   * Clear all relationships
   */
  clear() {
    this.relationships.clear();
    this.hierarchy.clear();
    this.emit('cleared');
  }

  /**
   * Get statistics
   */
  getStats() {
    let totalRelationships = 0;
    const relationshipCounts = {};
    
    this.relationships.forEach((rels) => {
      rels.outgoing.forEach((targets, type) => {
        totalRelationships += targets.length;
        relationshipCounts[type] = (relationshipCounts[type] || 0) + targets.length;
      });
    });
    
    return {
      totalEntities: this.relationships.size,
      totalRelationships,
      relationshipCounts,
      hierarchyDepth: Math.max(...Array.from(this.hierarchy.values()).map(n => n.level), 0)
    };
  }
}

module.exports = RelationshipManager;