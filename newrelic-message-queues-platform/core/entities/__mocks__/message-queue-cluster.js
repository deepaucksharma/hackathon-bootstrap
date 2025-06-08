/**
 * Mock for MessageQueueCluster
 */

const mockGuid = () => Buffer.from(Math.random().toString()).toString('base64');

class MessageQueueCluster {
  static ENTITY_TYPE = 'MESSAGE_QUEUE_CLUSTER';

  constructor(config = {}) {
    this.guid = mockGuid();
    this.name = config.name;
    this.entityType = MessageQueueCluster.ENTITY_TYPE;
    this.provider = config.provider;
    this.accountId = config.accountId || process.env.NEW_RELIC_ACCOUNT_ID;
    this.clusterName = config.clusterName || config.name;
    this.clusterGuid = config.clusterGuid;
    this.brokers = [];
    this.topics = [];
    this.relationships = [];
  }

  addBroker(brokerGuid) {
    this.brokers.push(brokerGuid);
  }

  addTopic(topicGuid) {
    this.topics.push(topicGuid);
  }

  setCluster(clusterGuid) {
    this.clusterGuid = clusterGuid;
  }

  validate() {
    const errors = [];
    if (!this.name) errors.push('Name is required');
    if (!this.provider) errors.push('Provider is required');
    return errors;
  }

  isHealthy() {
    return true;
  }

  toEntityMetadata() {
    return {
      guid: this.guid,
      name: this.name,
      entityType: this.entityType,
      provider: this.provider,
      accountId: this.accountId
    };
  }
}

module.exports = MessageQueueCluster;