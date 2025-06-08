/**
 * Mock for MessageQueueBroker
 */

const mockGuid = () => Buffer.from(Math.random().toString()).toString('base64');

class MessageQueueBroker {
  static ENTITY_TYPE = 'MESSAGE_QUEUE_BROKER';

  constructor(config = {}) {
    this.guid = mockGuid();
    this.entityType = MessageQueueBroker.ENTITY_TYPE;
    this.brokerId = config.brokerId;
    this.host = config.host;
    this.port = config.port;
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
      brokerId: this.brokerId,
      host: this.host
    };
  }
}

module.exports = MessageQueueBroker;