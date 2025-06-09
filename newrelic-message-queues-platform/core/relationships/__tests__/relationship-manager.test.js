const RelationshipManager = require('../relationship-manager');

describe('RelationshipManager', () => {
  let manager;
  
  // Sample entity GUIDs
  const clusterGuid = 'MESSAGE_QUEUE_CLUSTER|12345|kafka|prod-cluster';
  const broker1Guid = 'MESSAGE_QUEUE_BROKER|12345|kafka|prod-cluster|broker-1';
  const broker2Guid = 'MESSAGE_QUEUE_BROKER|12345|kafka|prod-cluster|broker-2';
  const topic1Guid = 'MESSAGE_QUEUE_TOPIC|12345|kafka|prod-cluster|events';
  const topic2Guid = 'MESSAGE_QUEUE_TOPIC|12345|kafka|prod-cluster|orders';
  const consumerGroupGuid = 'MESSAGE_QUEUE_CONSUMER_GROUP|12345|kafka|prod-cluster|analytics';

  beforeEach(() => {
    manager = new RelationshipManager();
  });

  describe('Basic Relationship Management', () => {
    it('should add a relationship between entities', () => {
      manager.addRelationship(clusterGuid, broker1Guid, 'CONTAINS');
      
      const clusterRels = manager.getRelationships(clusterGuid);
      expect(clusterRels.outgoing.CONTAINS).toHaveLength(1);
      expect(clusterRels.outgoing.CONTAINS[0].targetGuid).toBe(broker1Guid);
      
      const brokerRels = manager.getRelationships(broker1Guid);
      expect(brokerRels.incoming.CONTAINED_IN).toHaveLength(1);
      expect(brokerRels.incoming.CONTAINED_IN[0].sourceGuid).toBe(clusterGuid);
    });

    it('should handle multiple relationships of the same type', () => {
      manager.addRelationship(clusterGuid, broker1Guid, 'CONTAINS');
      manager.addRelationship(clusterGuid, broker2Guid, 'CONTAINS');
      
      const clusterRels = manager.getRelationships(clusterGuid);
      expect(clusterRels.outgoing.CONTAINS).toHaveLength(2);
    });

    it('should store relationship metadata', () => {
      const metadata = { replicationFactor: 3, isLeader: true };
      manager.addRelationship(broker1Guid, topic1Guid, 'SERVES', metadata);
      
      const brokerRels = manager.getRelationships(broker1Guid);
      expect(brokerRels.outgoing.SERVES[0].metadata).toEqual(metadata);
    });

    it('should throw error for invalid relationship type', () => {
      expect(() => {
        manager.addRelationship(clusterGuid, broker1Guid, 'INVALID_TYPE');
      }).toThrow('Invalid relationship type');
    });

    it('should throw error for missing GUIDs', () => {
      expect(() => {
        manager.addRelationship(null, broker1Guid, 'CONTAINS');
      }).toThrow('Both source and target GUIDs are required');
    });
  });

  describe('Hierarchical Relationships', () => {
    it('should build hierarchy correctly', () => {
      manager.addRelationship(clusterGuid, broker1Guid, 'CONTAINS');
      manager.addRelationship(clusterGuid, broker2Guid, 'CONTAINS');
      manager.addRelationship(clusterGuid, topic1Guid, 'CONTAINS');
      
      const clusterHierarchy = manager.getHierarchy(clusterGuid);
      expect(clusterHierarchy.level).toBe(0);
      expect(clusterHierarchy.children).toHaveLength(3);
      expect(clusterHierarchy.parent).toBeNull();
      
      const brokerHierarchy = manager.getHierarchy(broker1Guid);
      expect(brokerHierarchy.level).toBe(1);
      expect(brokerHierarchy.parent).toBe(clusterGuid);
      expect(brokerHierarchy.ancestors).toEqual([clusterGuid]);
    });

    it('should track descendants correctly', () => {
      manager.addRelationship(clusterGuid, broker1Guid, 'CONTAINS');
      manager.addRelationship(broker1Guid, topic1Guid, 'MANAGES');
      
      const clusterHierarchy = manager.getHierarchy(clusterGuid);
      expect(clusterHierarchy.descendants).toContain(broker1Guid);
      expect(clusterHierarchy.descendants).toContain(topic1Guid);
    });
  });

  describe('Consumer Group Relationships', () => {
    it('should handle consumer group relationships', () => {
      // Consumer group belongs to cluster
      manager.addRelationship(clusterGuid, consumerGroupGuid, 'CONTAINS');
      
      // Consumer group consumes from topics
      manager.addRelationship(consumerGroupGuid, topic1Guid, 'CONSUMES_FROM');
      manager.addRelationship(consumerGroupGuid, topic2Guid, 'CONSUMES_FROM');
      
      // Consumer group coordinated by broker
      manager.addRelationship(consumerGroupGuid, broker1Guid, 'COORDINATED_BY');
      
      const consumerRels = manager.getRelationships(consumerGroupGuid);
      expect(consumerRels.outgoing.CONSUMES_FROM).toHaveLength(2);
      expect(consumerRels.outgoing.COORDINATED_BY).toHaveLength(1);
      expect(consumerRels.incoming.CONTAINED_IN).toHaveLength(1);
    });
  });

  describe('Cluster Hierarchy Building', () => {
    it('should build complete cluster hierarchy', () => {
      const entities = {
        brokers: [
          { entityGuid: broker1Guid, brokerId: '1' },
          { entityGuid: broker2Guid, brokerId: '2' }
        ],
        topics: [
          { entityGuid: topic1Guid, topicName: 'events', replicationFactor: 3 },
          { entityGuid: topic2Guid, topicName: 'orders', replicationFactor: 2 }
        ],
        consumerGroups: [
          {
            entityGuid: consumerGroupGuid,
            topics: ['events', 'orders'],
            coordinator: { id: '1' }
          }
        ]
      };
      
      manager.buildClusterHierarchy(clusterGuid, entities);
      
      // Verify cluster contains all entities
      const clusterRels = manager.getRelationships(clusterGuid);
      expect(clusterRels.outgoing.CONTAINS).toHaveLength(5); // 2 brokers + 2 topics + 1 consumer group
      
      // Verify consumer group relationships
      const consumerRels = manager.getRelationships(consumerGroupGuid);
      expect(consumerRels.outgoing.CONSUMES_FROM).toHaveLength(2);
      expect(consumerRels.outgoing.COORDINATED_BY).toHaveLength(1);
      
      // Verify broker serves topics
      const brokerRels = manager.getRelationships(broker1Guid);
      expect(brokerRels.outgoing.SERVES).toHaveLength(2);
    });
  });

  describe('Relationship Queries', () => {
    beforeEach(() => {
      // Set up test relationships
      manager.addRelationship(clusterGuid, broker1Guid, 'CONTAINS');
      manager.addRelationship(clusterGuid, broker2Guid, 'CONTAINS');
      manager.addRelationship(broker1Guid, topic1Guid, 'SERVES');
      manager.addRelationship(broker2Guid, topic1Guid, 'SERVES');
      manager.addRelationship(consumerGroupGuid, topic1Guid, 'CONSUMES_FROM');
    });

    it('should get relationships by type', () => {
      const containsRels = manager.getRelationshipsByType(clusterGuid, 'CONTAINS', 'outgoing');
      expect(containsRels).toHaveLength(2);
      
      const servesRels = manager.getRelationshipsByType(topic1Guid, 'SERVED_BY', 'incoming');
      expect(servesRels).toHaveLength(2);
    });

    it('should get related entities', () => {
      const related = manager.getRelatedEntities(topic1Guid);
      
      // Should find brokers that serve it and consumer groups that consume from it
      const brokerRelations = related.filter(r => r.relationshipType === 'SERVED_BY');
      const consumerRelations = related.filter(r => r.relationshipType === 'PRODUCES_TO');
      
      expect(brokerRelations).toHaveLength(2);
      expect(consumerRelations).toHaveLength(1);
    });

    it('should traverse relationships with depth', () => {
      const related = manager.getRelatedEntities(clusterGuid, null, 2);
      
      // Should find brokers (depth 1) and topics served by brokers (depth 2)
      const entityGuids = related.map(r => r.entityGuid);
      expect(entityGuids).toContain(broker1Guid);
      expect(entityGuids).toContain(broker2Guid);
      expect(entityGuids).toContain(topic1Guid);
    });
  });

  describe('Validation', () => {
    it('should detect orphaned relationships', () => {
      manager.addRelationship(clusterGuid, 'INVALID_GUID', 'CONTAINS');
      
      const issues = manager.validateRelationships();
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe('orphaned_target');
      expect(issues[0].targetGuid).toBe('INVALID_GUID');
    });

    it('should detect circular hierarchies', () => {
      // Create circular dependency: A -> B -> C -> A
      const guidA = 'GUID_A';
      const guidB = 'GUID_B';
      const guidC = 'GUID_C';
      
      manager.addRelationship(guidA, guidB, 'CONTAINS');
      manager.addRelationship(guidB, guidC, 'CONTAINS');
      manager.addRelationship(guidC, guidA, 'CONTAINS');
      
      const issues = manager.validateRelationships();
      const circularIssues = issues.filter(i => i.type === 'circular_hierarchy');
      expect(circularIssues.length).toBeGreaterThan(0);
    });
  });

  describe('Export and Visualization', () => {
    it('should export for visualization', () => {
      manager.addRelationship(clusterGuid, broker1Guid, 'CONTAINS');
      manager.addRelationship(broker1Guid, topic1Guid, 'SERVES');
      
      const exported = manager.exportForVisualization();
      
      expect(exported.nodes).toHaveLength(3);
      expect(exported.edges).toHaveLength(2);
      
      const clusterNode = exported.nodes.find(n => n.id === clusterGuid);
      expect(clusterNode.level).toBe(0);
      expect(clusterNode.hasChildren).toBe(true);
    });
  });

  describe('Statistics', () => {
    it('should calculate statistics correctly', () => {
      manager.addRelationship(clusterGuid, broker1Guid, 'CONTAINS');
      manager.addRelationship(clusterGuid, broker2Guid, 'CONTAINS');
      manager.addRelationship(broker1Guid, topic1Guid, 'SERVES');
      manager.addRelationship(consumerGroupGuid, topic1Guid, 'CONSUMES_FROM');
      
      const stats = manager.getStats();
      
      expect(stats.totalEntities).toBe(5);
      expect(stats.totalRelationships).toBe(4);
      expect(stats.relationshipCounts.CONTAINS).toBe(2);
      expect(stats.relationshipCounts.SERVES).toBe(1);
      expect(stats.relationshipCounts.CONSUMES_FROM).toBe(1);
      expect(stats.hierarchyDepth).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Event Emission', () => {
    it('should emit events on relationship changes', (done) => {
      manager.on('relationshipAdded', (event) => {
        expect(event.sourceGuid).toBe(clusterGuid);
        expect(event.targetGuid).toBe(broker1Guid);
        expect(event.relationshipType).toBe('CONTAINS');
        done();
      });
      
      manager.addRelationship(clusterGuid, broker1Guid, 'CONTAINS');
    });

    it('should emit clear event', (done) => {
      manager.on('cleared', () => {
        done();
      });
      
      manager.clear();
    });
  });
});