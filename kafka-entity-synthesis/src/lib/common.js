/**
 * Common utilities shared across scripts
 */

const fs = require('fs');
const path = require('path');

/**
 * Load environment variables from .env file and process.env
 */
function loadEnv() {
  // Try to load from .env file
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const [key, ...valueParts] = trimmedLine.split('=');
        if (key && valueParts.length > 0) {
          process.env[key.trim()] = valueParts.join('=').trim();
        }
      }
    });
  }

  // Create environment object with validation
  const env = {
    NEW_RELIC_LICENSE_KEY: process.env.NEW_RELIC_LICENSE_KEY || process.env.IKEY,
    NEW_RELIC_USER_KEY: process.env.NEW_RELIC_USER_KEY || process.env.UKEY,
    NEW_RELIC_ACCOUNT_ID: process.env.NEW_RELIC_ACCOUNT_ID || process.env.ACC,
    AWS_ACCOUNT_ID: process.env.AWS_ACCOUNT_ID,
    AWS_REGION: process.env.AWS_REGION,
    CLUSTER_PREFIX: process.env.CLUSTER_PREFIX
  };

  // Validate required fields
  const required = ['NEW_RELIC_LICENSE_KEY', 'NEW_RELIC_ACCOUNT_ID'];
  const missing = required.filter(key => !env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing.join(', '));
    console.error('Please set them in .env file or environment');
    process.exit(1);
  }

  return env;
}

/**
 * Parse command line arguments
 */
function parseArgs(argv, schema = {}) {
  const args = {};
  
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].substring(2);
      const config = schema[key];
      
      if (!config) {
        console.warn(`Unknown argument: --${key}`);
        continue;
      }
      
      if (config.type === 'boolean') {
        args[key] = true;
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        const value = argv[i + 1];
        args[key] = config.type === 'number' ? parseInt(value) : value;
        i++;
      }
    }
  }
  
  // Apply defaults
  Object.entries(schema).forEach(([key, config]) => {
    if (args[key] === undefined && config.default !== undefined) {
      args[key] = config.default;
    }
  });
  
  return args;
}

/**
 * Generate entity GUID
 */
function generateGUID(entityType, entityName, accountId) {
  const identifier = `${entityType}:${entityName}`;
  const hash = hashCode(identifier);
  return Buffer.from(`${accountId}|INFRA|NA|${Math.abs(hash)}`).toString('base64');
}

/**
 * Simple hash function
 */
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash;
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString();
}

/**
 * Sleep for milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create results directory if it doesn't exist
 */
function ensureResultsDir() {
  const resultsDir = path.join(process.cwd(), 'results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  return resultsDir;
}

/**
 * Save JSON results with timestamp
 */
function saveResults(data, prefix = 'results') {
  const resultsDir = ensureResultsDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = path.join(resultsDir, `${prefix}-${timestamp}.json`);
  
  fs.writeFileSync(filename, JSON.stringify(data, null, 2));
  return filename;
}

module.exports = {
  loadEnv,
  parseArgs,
  generateGUID,
  hashCode,
  formatTimestamp,
  sleep,
  ensureResultsDir,
  saveResults
};