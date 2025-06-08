/**
 * Foundation Layer - Core transformation infrastructure for v2.0
 * 
 * This layer provides the base infrastructure for transforming
 * infrastructure data into MESSAGE_QUEUE entities.
 */

// Base classes
const BaseTransformer = require('./transformers/base/base-transformer');
const BaseAggregator = require('./aggregators/base-aggregator');

// Main transformers
const MessageQueueTransformer = require('./transformers/message-queue-transformer');

// Provider transformers
const KafkaTransformer = require('./transformers/providers/kafka-transformer');
const RabbitMQTransformer = require('./transformers/providers/rabbitmq-transformer');

// Aggregators
const MetricAggregator = require('./aggregators/metric-aggregator');

// Hook system
const HookManager = require('./hooks/hook-manager');

// Factory function to create a fully configured transformer
function createTransformer(config = {}) {
  const transformer = new MessageQueueTransformer(config);
  
  // Register default providers
  transformer.registerProvider('kafka', new KafkaTransformer(config.kafka || {}));
  transformer.registerProvider('rabbitmq', new RabbitMQTransformer(config.rabbitmq || {}));
  
  // Register default aggregator
  transformer.registerAggregator('metrics', new MetricAggregator(config.aggregator || {}));
  
  return transformer;
}

module.exports = {
  // Base classes
  BaseTransformer,
  BaseAggregator,
  
  // Main transformer
  MessageQueueTransformer,
  
  // Provider transformers
  KafkaTransformer,
  RabbitMQTransformer,
  
  // Aggregators
  MetricAggregator,
  
  // Hook system
  HookManager,
  
  // Factory
  createTransformer
};