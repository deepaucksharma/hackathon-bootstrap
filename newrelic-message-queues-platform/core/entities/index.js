/**
 * Entity Module Index
 * 
 * Exports all MESSAGE_QUEUE_* entity classes and factory
 */

const BaseEntity = require('./base-entity');
const MessageQueueCluster = require('./message-queue-cluster');
const MessageQueueBroker = require('./message-queue-broker');
const MessageQueueTopic = require('./message-queue-topic');
const MessageQueueQueue = require('./message-queue-queue');
const EntityFactory = require('./entity-factory');

module.exports = {
  BaseEntity,
  MessageQueueCluster,
  MessageQueueBroker,
  MessageQueueTopic,
  MessageQueueQueue,
  EntityFactory,
  
  // Convenience methods
  createFactory: () => new EntityFactory(),
  
  // Entity type constants
  ENTITY_TYPES: {
    CLUSTER: 'MESSAGE_QUEUE_CLUSTER',
    BROKER: 'MESSAGE_QUEUE_BROKER',
    TOPIC: 'MESSAGE_QUEUE_TOPIC',
    QUEUE: 'MESSAGE_QUEUE_QUEUE'
  },
  
  // Provider constants
  PROVIDERS: {
    KAFKA: 'kafka',
    RABBITMQ: 'rabbitmq',
    SQS: 'sqs',
    AZURE_SERVICE_BUS: 'azure-servicebus',
    GOOGLE_PUBSUB: 'google-pubsub'
  }
};