/**
 * Relationship Manager
 * 
 * Manages entity relationships in the message queue topology
 */

import { injectable, inject } from 'inversify';
import { TYPES } from '../config/types.js';
import { Logger } from '../../shared/utils/logger.js';
import { ConfigurationService } from '../config/configuration-service.js';
import { EntityRelationship, RelationshipType } from '../../shared/types/common.js';
import { SynthesizedEntity } from '../../synthesizers/entity-synthesizer.js';

export interface RelationshipGraph {
  nodes: Map<string, RelationshipNode>;
  edges: Map<string, RelationshipEdge[]>;
}

export interface RelationshipNode {
  entityGuid: string;
  entityType: string;
  entityName: string;
  metadata: Record<string, any>;
}

export interface RelationshipEdge {
  type: RelationshipType;
  source: string;
  target: string;
  attributes?: Record<string, any>;
}

export interface RelationshipStats {
  totalNodes: number;
  totalEdges: number;
  nodesByType: Record<string, number>;
  edgesByType: Record<string, number>;
  orphanedNodes: number;
  cyclicRelationships: number;
}

@injectable()
export class RelationshipManager {
  private graph: RelationshipGraph;
  private reverseIndex: Map<string, Set<string>>; // target -> sources

  constructor(
    @inject(TYPES.Logger) private readonly logger: Logger,
    @inject(TYPES.ConfigurationService) private readonly config: ConfigurationService
  ) {
    this.logger = new Logger('RelationshipManager');
    this.graph = {
      nodes: new Map(),
      edges: new Map()
    };
    this.reverseIndex = new Map();
  }

  /**
   * Build relationship graph from entities
   */
  buildGraph(entities: SynthesizedEntity[]): void {
    this.clearGraph();
    
    // Add all nodes first
    entities.forEach(entity => {
      this.addNode({
        entityGuid: entity.entityGuid,
        entityType: entity.entityType,
        entityName: entity.entityName,
        metadata: {
          clusterName: entity.clusterName,
          provider: entity.provider,
          ...entity.metadata
        }
      });
    });
    
    // Add edges from relationships
    entities.forEach(entity => {
      if (entity.relationships) {
        entity.relationships.forEach(rel => {
          this.addEdge(rel);
        });
      }
    });
    
    // Infer additional relationships
    this.inferRelationships(entities);
    
    this.logger.info(`Built relationship graph with ${this.graph.nodes.size} nodes and ${this.countTotalEdges()} edges`);
  }

  /**
   * Add a node to the graph
   */
  private addNode(node: RelationshipNode): void {
    this.graph.nodes.set(node.entityGuid, node);
  }

  /**
   * Add an edge to the graph
   */
  private addEdge(edge: EntityRelationship): void {
    // Add to forward index
    if (!this.graph.edges.has(edge.source)) {
      this.graph.edges.set(edge.source, []);
    }
    this.graph.edges.get(edge.source)!.push(edge);
    
    // Add to reverse index
    if (!this.reverseIndex.has(edge.target)) {
      this.reverseIndex.set(edge.target, new Set());
    }
    this.reverseIndex.get(edge.target)!.add(edge.source);
  }

  /**
   * Infer relationships based on entity types and naming patterns
   */
  private inferRelationships(entities: SynthesizedEntity[]): void {
    const clustersByName = new Map<string, SynthesizedEntity>();
    const brokersByCluster = new Map<string, SynthesizedEntity[]>();
    const topicsByCluster = new Map<string, SynthesizedEntity[]>();
    const consumersByCluster = new Map<string, SynthesizedEntity[]>();
    
    // Group entities
    entities.forEach(entity => {
      switch (entity.entityType) {
        case 'MESSAGE_QUEUE_CLUSTER':
          clustersByName.set(entity.clusterName, entity);
          break;
        case 'MESSAGE_QUEUE_BROKER':
          if (!brokersByCluster.has(entity.clusterName)) {
            brokersByCluster.set(entity.clusterName, []);
          }
          brokersByCluster.get(entity.clusterName)!.push(entity);
          break;
        case 'MESSAGE_QUEUE_TOPIC':
          if (!topicsByCluster.has(entity.clusterName)) {
            topicsByCluster.set(entity.clusterName, []);
          }
          topicsByCluster.get(entity.clusterName)!.push(entity);
          break;
        case 'MESSAGE_QUEUE_CONSUMER_GROUP':
          if (!consumersByCluster.has(entity.clusterName)) {
            consumersByCluster.set(entity.clusterName, []);
          }
          consumersByCluster.get(entity.clusterName)!.push(entity);
          break;
      }
    });
    
    // Infer broker -> cluster relationships
    brokersByCluster.forEach((brokers, clusterName) => {
      const cluster = clustersByName.get(clusterName);
      if (cluster) {
        brokers.forEach(broker => {
          this.addEdge({
            type: RelationshipType.CONTAINED_IN,
            source: broker.entityGuid,
            target: cluster.entityGuid
          });
        });
      }
    });
    
    // Infer topic -> cluster relationships
    topicsByCluster.forEach((topics, clusterName) => {
      const cluster = clustersByName.get(clusterName);
      if (cluster) {
        topics.forEach(topic => {
          this.addEdge({
            type: RelationshipType.CONTAINED_IN,
            source: topic.entityGuid,
            target: cluster.entityGuid
          });
        });
      }
    });
    
    // Infer consumer group -> cluster relationships
    consumersByCluster.forEach((consumers, clusterName) => {
      const cluster = clustersByName.get(clusterName);
      if (cluster) {
        consumers.forEach(consumer => {
          this.addEdge({
            type: RelationshipType.CONTAINED_IN,
            source: consumer.entityGuid,
            target: cluster.entityGuid
          });
        });
      }
    });
    
    // Infer consumer -> topic relationships based on metadata
    entities.filter(e => e.entityType === 'MESSAGE_QUEUE_CONSUMER_GROUP').forEach(consumer => {
      const topics = consumer.metadata?.topics as string[] || [];
      topics.forEach(topicName => {
        const topic = entities.find(e => 
          e.entityType === 'MESSAGE_QUEUE_TOPIC' && 
          e.topicName === topicName &&
          e.clusterName === consumer.clusterName
        );
        if (topic) {
          this.addEdge({
            type: RelationshipType.CONSUMES_FROM,
            source: consumer.entityGuid,
            target: topic.entityGuid
          });
        }
      });
    });
  }

  /**
   * Get all relationships for an entity
   */
  getRelationships(entityGuid: string): EntityRelationship[] {
    const outgoing = this.graph.edges.get(entityGuid) || [];
    const incoming: EntityRelationship[] = [];
    
    // Find incoming relationships
    this.reverseIndex.forEach((sources, target) => {
      if (target === entityGuid) {
        sources.forEach(source => {
          const edges = this.graph.edges.get(source) || [];
          edges.filter(e => e.target === entityGuid).forEach(edge => {
            incoming.push(edge);
          });
        });
      }
    });
    
    return [...outgoing, ...incoming];
  }

  /**
   * Get entities related to a given entity
   */
  getRelatedEntities(entityGuid: string, relationshipType?: RelationshipType): RelationshipNode[] {
    const relationships = this.getRelationships(entityGuid);
    const relatedGuids = new Set<string>();
    
    relationships.forEach(rel => {
      if (!relationshipType || rel.type === relationshipType) {
        if (rel.source === entityGuid) {
          relatedGuids.add(rel.target);
        } else {
          relatedGuids.add(rel.source);
        }
      }
    });
    
    return Array.from(relatedGuids)
      .map(guid => this.graph.nodes.get(guid))
      .filter(node => node !== undefined) as RelationshipNode[];
  }

  /**
   * Find orphaned nodes (nodes with no relationships)
   */
  findOrphanedNodes(): RelationshipNode[] {
    const orphaned: RelationshipNode[] = [];
    
    this.graph.nodes.forEach((node, guid) => {
      const hasOutgoing = this.graph.edges.has(guid);
      const hasIncoming = this.reverseIndex.has(guid);
      
      if (!hasOutgoing && !hasIncoming) {
        orphaned.push(node);
      }
    });
    
    return orphaned;
  }

  /**
   * Detect cyclic relationships
   */
  detectCycles(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];
    
    const dfs = (node: string): boolean => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);
      
      const edges = this.graph.edges.get(node) || [];
      for (const edge of edges) {
        if (!visited.has(edge.target)) {
          if (dfs(edge.target)) {
            return true;
          }
        } else if (recursionStack.has(edge.target)) {
          // Found a cycle
          const cycleStart = path.indexOf(edge.target);
          cycles.push(path.slice(cycleStart));
          return true;
        }
      }
      
      path.pop();
      recursionStack.delete(node);
      return false;
    };
    
    this.graph.nodes.forEach((node, guid) => {
      if (!visited.has(guid)) {
        dfs(guid);
      }
    });
    
    return cycles;
  }

  /**
   * Get relationship statistics
   */
  getStats(): RelationshipStats {
    const nodesByType: Record<string, number> = {};
    const edgesByType: Record<string, number> = {};
    
    // Count nodes by type
    this.graph.nodes.forEach(node => {
      nodesByType[node.entityType] = (nodesByType[node.entityType] || 0) + 1;
    });
    
    // Count edges by type
    this.graph.edges.forEach(edges => {
      edges.forEach(edge => {
        const typeStr = RelationshipType[edge.type];
        edgesByType[typeStr] = (edgesByType[typeStr] || 0) + 1;
      });
    });
    
    return {
      totalNodes: this.graph.nodes.size,
      totalEdges: this.countTotalEdges(),
      nodesByType,
      edgesByType,
      orphanedNodes: this.findOrphanedNodes().length,
      cyclicRelationships: this.detectCycles().length
    };
  }

  /**
   * Export graph as JSON for visualization
   */
  exportGraph(): any {
    const nodes = Array.from(this.graph.nodes.values());
    const edges: any[] = [];
    
    this.graph.edges.forEach(edgeList => {
      edgeList.forEach(edge => {
        edges.push({
          source: edge.source,
          target: edge.target,
          type: RelationshipType[edge.type],
          attributes: edge.attributes
        });
      });
    });
    
    return { nodes, edges };
  }

  /**
   * Clear the graph
   */
  private clearGraph(): void {
    this.graph.nodes.clear();
    this.graph.edges.clear();
    this.reverseIndex.clear();
  }

  /**
   * Count total edges
   */
  private countTotalEdges(): number {
    let count = 0;
    this.graph.edges.forEach(edges => {
      count += edges.length;
    });
    return count;
  }
}