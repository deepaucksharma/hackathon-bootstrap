/**
 * Secrets Manager
 * 
 * Provides secure handling of sensitive configuration data with support for
 * multiple backends (environment variables, files, external services)
 */

const fs = require('fs').promises;
const crypto = require('crypto');
const path = require('path');
const { logger } = require('../utils/logger');

class SecretsManager {
  constructor(options = {}) {
    this.backend = options.backend || 'env'; // env, file, vault, aws-secrets
    this.encryptionKey = options.encryptionKey || process.env.SECRETS_ENCRYPTION_KEY;
    this.secretsPath = options.secretsPath || path.join(process.cwd(), '.secrets');
    this.cache = new Map();
    this.ttl = options.ttl || 300000; // 5 minutes cache TTL
  }

  /**
   * Get a secret value
   */
  async getSecret(key, options = {}) {
    // Check cache first
    const cached = this._getCached(key);
    if (cached && !options.forceRefresh) {
      return cached;
    }

    let value;
    
    switch (this.backend) {
      case 'env':
        value = await this._getFromEnv(key);
        break;
      case 'file':
        value = await this._getFromFile(key);
        break;
      case 'vault':
        value = await this._getFromVault(key, options);
        break;
      case 'aws-secrets':
        value = await this._getFromAWSSecrets(key, options);
        break;
      default:
        throw new Error(`Unknown secrets backend: ${this.backend}`);
    }

    // Decrypt if encrypted
    if (value && this.encryptionKey && value.startsWith('ENC:')) {
      value = this._decrypt(value.substring(4));
    }

    // Cache the value
    if (value) {
      this._cache(key, value);
    }

    return value;
  }

  /**
   * Set a secret value
   */
  async setSecret(key, value, options = {}) {
    // Encrypt if encryption key is available
    if (this.encryptionKey && !options.skipEncryption) {
      value = 'ENC:' + this._encrypt(value);
    }

    switch (this.backend) {
      case 'env':
        process.env[key] = value;
        break;
      case 'file':
        await this._setInFile(key, value);
        break;
      case 'vault':
        await this._setInVault(key, value, options);
        break;
      case 'aws-secrets':
        await this._setInAWSSecrets(key, value, options);
        break;
    }

    // Update cache
    this._cache(key, value);
  }

  /**
   * Get multiple secrets
   */
  async getSecrets(keys) {
    const results = {};
    
    await Promise.all(
      keys.map(async (key) => {
        try {
          results[key] = await this.getSecret(key);
        } catch (error) {
          logger.warn(`Failed to get secret ${key}: ${error.message}`);
        }
      })
    );
    
    return results;
  }

  /**
   * Load New Relic configuration
   */
  async getNewRelicConfig() {
    const keys = [
      'NEW_RELIC_ACCOUNT_ID',
      'NEW_RELIC_API_KEY',
      'NEW_RELIC_INGEST_KEY',
      'NEW_RELIC_REGION'
    ];
    
    const secrets = await this.getSecrets(keys);
    
    // Validate required secrets
    const required = ['NEW_RELIC_ACCOUNT_ID', 'NEW_RELIC_API_KEY', 'NEW_RELIC_INGEST_KEY'];
    for (const key of required) {
      if (!secrets[key]) {
        throw new Error(`Required secret ${key} not found`);
      }
    }
    
    return {
      accountId: secrets.NEW_RELIC_ACCOUNT_ID,
      apiKey: secrets.NEW_RELIC_API_KEY,
      ingestKey: secrets.NEW_RELIC_INGEST_KEY,
      region: secrets.NEW_RELIC_REGION || 'us'
    };
  }

  /**
   * Rotate encryption key
   */
  async rotateEncryptionKey(newKey) {
    if (!this.encryptionKey) {
      throw new Error('No current encryption key set');
    }

    // Get all current secrets
    const allSecrets = new Map();
    
    // Decrypt with old key
    for (const [key, cacheEntry] of this.cache.entries()) {
      const decrypted = cacheEntry.value.startsWith('ENC:') 
        ? this._decrypt(cacheEntry.value.substring(4))
        : cacheEntry.value;
      allSecrets.set(key, decrypted);
    }

    // Update encryption key
    const oldKey = this.encryptionKey;
    this.encryptionKey = newKey;

    // Re-encrypt with new key
    for (const [key, value] of allSecrets.entries()) {
      await this.setSecret(key, value);
    }

    logger.info('Encryption key rotated successfully');
  }

  // Private methods

  _getCached(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.value;
  }

  _cache(key, value) {
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  async _getFromEnv(key) {
    return process.env[key];
  }

  async _getFromFile(key) {
    try {
      const filePath = path.join(this.secretsPath, `${key}.secret`);
      const content = await fs.readFile(filePath, 'utf8');
      return content.trim();
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async _setInFile(key, value) {
    await fs.mkdir(this.secretsPath, { recursive: true });
    const filePath = path.join(this.secretsPath, `${key}.secret`);
    await fs.writeFile(filePath, value, { mode: 0o600 });
  }

  async _getFromVault(key, options) {
    // Placeholder for HashiCorp Vault integration
    throw new Error('Vault backend not implemented yet');
  }

  async _setInVault(key, value, options) {
    // Placeholder for HashiCorp Vault integration
    throw new Error('Vault backend not implemented yet');
  }

  async _getFromAWSSecrets(key, options) {
    // Placeholder for AWS Secrets Manager integration
    throw new Error('AWS Secrets Manager backend not implemented yet');
  }

  async _setInAWSSecrets(key, value, options) {
    // Placeholder for AWS Secrets Manager integration
    throw new Error('AWS Secrets Manager backend not implemented yet');
  }

  _encrypt(text) {
    const algorithm = 'aes-256-gcm';
    const iv = crypto.randomBytes(16);
    const salt = crypto.randomBytes(64);
    const key = crypto.pbkdf2Sync(this.encryptionKey, salt, 2145, 32, 'sha512');
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(text, 'utf8'),
      cipher.final()
    ]);
    
    const tag = cipher.getAuthTag();
    
    return Buffer.concat([salt, iv, tag, encrypted]).toString('base64');
  }

  _decrypt(encryptedText) {
    const algorithm = 'aes-256-gcm';
    const data = Buffer.from(encryptedText, 'base64');
    
    const salt = data.slice(0, 64);
    const iv = data.slice(64, 80);
    const tag = data.slice(80, 96);
    const encrypted = data.slice(96);
    
    const key = crypto.pbkdf2Sync(this.encryptionKey, salt, 2145, 32, 'sha512');
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(tag);
    
    return decipher.update(encrypted) + decipher.final('utf8');
  }

  /**
   * Clear all cached secrets
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      backend: this.backend,
      hasEncryption: !!this.encryptionKey
    };
  }
}

// Singleton instance
let instance;

/**
 * Get or create secrets manager instance
 */
function getSecretsManager(options) {
  if (!instance) {
    instance = new SecretsManager(options);
  }
  return instance;
}

module.exports = {
  SecretsManager,
  getSecretsManager
};