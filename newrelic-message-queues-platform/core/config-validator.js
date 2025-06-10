/**
 * Configuration Validator
 * 
 * Validates platform configuration and provides helpful error messages
 */

const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

class ConfigValidator {
  constructor() {
    this.rules = [
      // Required credentials
      {
        key: 'accountId',
        required: true,
        type: 'string',
        validate: (value) => /^\d+$/.test(value),
        message: 'New Relic Account ID is required and must be numeric',
        help: 'Get your Account ID from https://one.newrelic.com > Account Settings'
      },
      {
        key: 'apiKey',
        required: function(config) {
          // API key required unless ingest key is provided and mode is not infrastructure
          return config.mode === 'infrastructure' || !config.ingestKey;
        },
        type: 'string',
        validate: (value) => value && value.startsWith('NRAK-'),
        message: 'New Relic User API Key is required for infrastructure mode',
        help: 'Generate a User API key at https://one.newrelic.com/api-keys'
      },
      {
        key: 'ingestKey',
        required: function(config) {
          // Ingest key required for simulation mode if no API key
          return ['simulation', 'hybrid'].includes(config.mode) && !config.apiKey;
        },
        type: 'string',
        validate: (value) => value && value.length > 10,
        message: 'New Relic Ingest Key is required for simulation mode',
        help: 'Generate an Ingest Key at https://one.newrelic.com/api-keys'
      },
      
      // Mode validation
      {
        key: 'mode',
        required: false,
        type: 'string',
        validate: (value) => ['simulation', 'infrastructure', 'hybrid'].includes(value),
        message: 'Mode must be one of: simulation, infrastructure, hybrid',
        help: 'Infrastructure mode requires nri-kafka data, simulation generates test data'
      },
      
      // Provider validation
      {
        key: 'provider',
        required: false,
        type: 'string',
        validate: (value) => ['kafka', 'rabbitmq', 'sqs', 'azure-servicebus', 'google-pubsub'].includes(value),
        message: 'Provider must be one of: kafka, rabbitmq, sqs, azure-servicebus, google-pubsub',
        help: 'Choose the message queue provider to simulate'
      },
      
      // Numeric validations
      {
        key: 'interval',
        required: false,
        type: 'number',
        validate: (value) => value >= 10 && value <= 3600,
        message: 'Interval must be between 10 and 3600 seconds',
        help: 'Recommended: 30-60 seconds for production, 10-30 for testing'
      }
    ];
    
    this.warnings = [
      {
        key: 'topology',
        check: (config) => config.mode === 'simulation' && !config.topology,
        message: 'No topology configured',
        help: 'Simulation will use default topology'
      },
      {
        key: 'environment',
        check: (config) => !process.env.NODE_ENV,
        message: 'Optional: NODE_ENV - Environment (development, production)',
        help: ''
      }
    ];
    
    this.info = [
      {
        key: 'nri-kafka-setup',
        check: (config) => config.mode === 'infrastructure',
        message: 'Ensure nri-kafka is installed on your Kafka hosts',
        help: 'See infrastructure/README.md for setup instructions'
      },
      {
        key: 'docker-setup',
        check: (config) => config.mode !== 'simulation',
        message: 'Docker Compose setup available for local testing',
        help: 'Run: cd infrastructure && docker-compose up -d'
      },
      {
        key: 'provider-kafka',
        check: (config) => config.provider === 'kafka',
        message: 'Kafka provider selected',
        help: 'Ensure JMX is enabled on Kafka brokers for metrics collection'
      },
      {
        key: 'provider-rabbitmq',
        check: (config) => config.provider === 'rabbitmq',
        message: 'RabbitMQ provider selected',
        help: 'Queue-based message broker with exchange routing'
      },
      {
        key: 'provider-sqs',
        check: (config) => config.provider === 'sqs',
        message: 'AWS SQS provider selected',
        help: 'Managed queue service from AWS'
      },
      {
        key: 'provider-azure',
        check: (config) => config.provider === 'azure-servicebus',
        message: 'Azure Service Bus provider selected',
        help: 'Enterprise messaging service from Azure'
      },
      {
        key: 'provider-pubsub',
        check: (config) => config.provider === 'google-pubsub',
        message: 'Google Pub/Sub provider selected',
        help: 'Scalable messaging service from Google Cloud'
      }
    ];
  }
  
  validate(config) {
    const result = {
      valid: true,
      errors: [],
      warnings: [],
      info: [],
      config: config
    };
    
    // Check required fields and validation rules
    for (const rule of this.rules) {
      const value = config[rule.key];
      const isRequired = typeof rule.required === 'function' ? rule.required(config) : rule.required;
      
      // Check if required field is missing
      if (isRequired && (value === undefined || value === null || value === '')) {
        result.errors.push({
          key: rule.key,
          message: rule.message,
          help: rule.help
        });
        result.valid = false;
        continue;
      }
      
      // Skip validation if field is not provided and not required
      if (!value && !isRequired) {
        continue;
      }
      
      // Type checking
      if (value && rule.type && typeof value !== rule.type) {
        result.errors.push({
          key: rule.key,
          message: `${rule.key} must be of type ${rule.type}`,
          help: rule.help
        });
        result.valid = false;
        continue;
      }
      
      // Custom validation
      if (value && rule.validate && !rule.validate(value)) {
        result.errors.push({
          key: rule.key,
          message: rule.message,
          help: rule.help
        });
        result.valid = false;
      }
    }
    
    // Check warnings
    for (const warning of this.warnings) {
      if (warning.check(config)) {
        result.warnings.push({
          key: warning.key,
          message: warning.message,
          help: warning.help
        });
      }
    }
    
    // Check info messages
    for (const info of this.info) {
      if (info.check(config)) {
        result.info.push({
          key: info.key,
          message: info.message,
          help: info.help
        });
      }
    }
    
    return result;
  }
  
  printReport(result) {
    console.log(chalk.bold.cyan('\n📋 Configuration Validation Report\n'));
    
    // Print errors
    if (result.errors.length > 0) {
      console.log(chalk.red.bold('❌ Errors (must be fixed):'));
      console.log('');
      result.errors.forEach((error, index) => {
        console.log(chalk.red(`${index + 1}. ${error.message}`));
        if (error.help) {
          console.log(chalk.gray(`   Help: ${error.help}`));
        }
        console.log('');
      });
    }
    
    // Print warnings
    if (result.warnings.length > 0) {
      console.log(chalk.yellow.bold('⚠️  Warnings (' + result.warnings.length + '):'));
      console.log('');
      result.warnings.forEach((warning, index) => {
        console.log(chalk.yellow(`${index + 1}. ${warning.message}`));
        if (warning.help) {
          console.log(chalk.gray(`   Help: ${warning.help}`));
        }
        console.log('');
      });
    }
    
    // Print info
    if (result.info.length > 0) {
      console.log(chalk.blue.bold('ℹ️  Information (' + result.info.length + '):'));
      console.log('');
      result.info.forEach((info, index) => {
        console.log(chalk.blue(`${index + 1}. ${info.message}`));
        if (info.help) {
          console.log(chalk.gray(`   Help: ${info.help}`));
        }
        console.log('');
      });
    }
    
    // Print final status
    if (result.valid) {
      console.log(chalk.green.bold('✅ Configuration is valid!'));
    } else {
      console.log(chalk.red.bold('❌ Configuration validation failed!'));
      console.log(chalk.gray('Please fix the errors above before continuing.'));
    }
    
    console.log('');
  }
  
  /**
   * Check file dependencies based on mode
   */
  checkDependencies(config) {
    const checks = [];
    
    // Check for package.json
    const packagePath = path.join(process.cwd(), 'package.json');
    if (!fs.existsSync(packagePath)) {
      checks.push({
        type: 'error',
        message: 'package.json not found',
        help: 'Run npm init or ensure you are in the correct directory'
      });
    }
    
    // Check for infrastructure mode dependencies
    if (config.mode === 'infrastructure') {
      const infrastructurePath = path.join(process.cwd(), 'infrastructure');
      if (!fs.existsSync(infrastructurePath)) {
        checks.push({
          type: 'warning',
          message: 'infrastructure directory not found',
          help: 'Infrastructure mode requires infrastructure components'
        });
      }
    }
    
    // Check for docker-compose if using local testing
    if (config.mode !== 'simulation') {
      const dockerComposePath = path.join(process.cwd(), 'infrastructure', 'docker-compose.yml');
      if (fs.existsSync(dockerComposePath)) {
        checks.push({
          type: 'info',
          message: 'Docker Compose setup available for local testing',
          help: 'Run: cd infrastructure && docker-compose up -d'
        });
      }
    }
    
    return checks;
  }
  
  /**
   * Generate .env template with helpful comments
   */
  generateEnvTemplate() {
    return `# New Relic Message Queues Platform Configuration
# Copy this file to .env and fill in your credentials

# Required: Your New Relic Account ID
# Get this from: https://one.newrelic.com > Account Settings
NEW_RELIC_ACCOUNT_ID=your_account_id_here

# Required for infrastructure mode: User API Key (starts with NRAK-)
# Generate at: https://one.newrelic.com/api-keys
NEW_RELIC_USER_API_KEY=your_user_api_key_here

# Required for simulation mode: Ingest Key
# Generate at: https://one.newrelic.com/api-keys  
NEW_RELIC_INGEST_KEY=your_ingest_key_here

# Optional: Environment identifier
NODE_ENV=development

# Optional: Debug logging (uncomment to enable)
# DEBUG=platform:*,transform:*

# Platform Configuration
# MODE=infrastructure  # infrastructure | simulation | hybrid
# PROVIDER=kafka       # kafka (more providers coming)
# INTERVAL=60          # Collection interval in seconds
`;
  }
  
  /**
   * Save .env template to file
   */
  saveEnvTemplate(filepath = '.env.example') {
    const template = this.generateEnvTemplate();
    fs.writeFileSync(filepath, template);
    console.log(chalk.green(`✓ Created ${filepath} with configuration template`));
    console.log(chalk.gray(`Copy it to .env and fill in your credentials`));
  }
}

module.exports = ConfigValidator;