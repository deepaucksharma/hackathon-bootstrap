/**
 * Mock for MessageQueueTopic
 */

const mockGuid = () => Buffer.from(Math.random().toString()).toString('base64');

class MessageQueueTopic {
  static ENTITY_TYPE = 'MESSAGE_QUEUE_TOPIC';

  constructor(config = {}) {
    this.guid = mockGuid();
    this.entityType = MessageQueueTopic.ENTITY_TYPE;
    this.name = config.name;
    this.partitionCount = config.partitionCount;
    this.replicationFactor = config.replicationFactor;
    this.clusterGuid = config.clusterGuid;
    this.provider = config.provider || 'kafka';
    this.relationships = [];
  }

  setCluster(clusterGuid) {
    this.clusterGuid = clusterGuid;
  }

  validate() {
    return [];
  }

  isHealthy() {
    return true;
  }

  toEntityMetadata() {
    return {
      guid: this.guid,
      entityType: this.entityType,
      name: this.name,
      partitionCount: this.partitionCount
    };
  }
}

module.exports = MessageQueueTopic;