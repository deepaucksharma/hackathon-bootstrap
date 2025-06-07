/**
 * Configuration module for verification system
 */

// Color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

// Verification thresholds
const thresholds = {
    dataFreshness: {
        critical: 5,  // minutes
        warning: 10   // minutes
    },
    metricCompleteness: {
        critical: 95, // percentage
        warning: 80   // percentage
    },
    entityGuid: {
        critical: 90, // percentage
        warning: 70   // percentage
    }
};

// Provider configurations
const providers = {
    awsMsk: {
        name: 'AWS MSK',
        entityTypes: ['AWS_KAFKA_CLUSTER', 'AWS_KAFKA_BROKER', 'AWS_KAFKA_TOPIC'],
        sampleTypes: ['AwsMskClusterSample', 'AwsMskBrokerSample', 'AwsMskTopicSample'],
        requiredFields: ['provider', 'awsAccountId', 'awsRegion', 'instrumentation.provider', 'entityName'],
        accountIdField: 'awsAccountId'
    },
    confluent: {
        name: 'Confluent Cloud',
        entityTypes: ['CONFLUENT_CLOUD_KAFKA_CLUSTER', 'CONFLUENT_CLOUD_KAFKA_TOPIC'],
        sampleTypes: ['ConfluentCloudClusterSample', 'ConfluentCloudTopicSample'],
        requiredFields: ['tags.account', 'tags.kafka_env_id', 'id', 'timestamp'],
        accountIdField: 'tags.account'
    }
};

// API configuration
const api = {
    hostname: 'api.newrelic.com',
    path: '/graphql',
    timeout: 30000 // 30 seconds
};

module.exports = {
    colors,
    thresholds,
    providers,
    api
};