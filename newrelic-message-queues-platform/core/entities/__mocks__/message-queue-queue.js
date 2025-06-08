/**
 * Mock for MessageQueueQueue
 */

const mockGuid = () => Buffer.from(Math.random().toString()).toString('base64');

class MessageQueueQueue {
  static ENTITY_TYPE = 'MESSAGE_QUEUE_QUEUE';

  constructor(config = {}) {
    this.guid = mockGuid();
    this.entityType = MessageQueueQueue.ENTITY_TYPE;
    this.name = config.name;
    this.vhost = config.vhost;
    this.durable = config.durable;
    this.autoDelete = config.autoDelete;
    this.parentGuid = config.parentGuid;
    this.parentType = config.parentType;
    this.provider = config.provider || 'rabbitmq';
    this.metadata = {};
    this.relationships = [];
  }

  setParent(parentGuid, parentType) {
    this.parentGuid = parentGuid;
    this.parentType = parentType;
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
      vhost: this.vhost
    };
  }
}

module.exports = MessageQueueQueue;