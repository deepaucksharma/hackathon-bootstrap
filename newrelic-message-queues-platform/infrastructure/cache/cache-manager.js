/**
 * Cache Manager
 * 
 * Manages caching of discovery results to reduce load on infrastructure
 * APIs and improve performance. Supports TTL, size limits, and persistence.
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class CacheManager {
  constructor(config = {}) {
    this.config = {
      maxSize: config.maxSize || 1000,        // Maximum number of entries
      maxAge: config.maxAge || 300000,        // 5 minutes default TTL
      checkPeriod: config.checkPeriod || 60000, // Check for expired entries every minute
      persistence: config.persistence || false,
      persistencePath: config.persistencePath || './cache',
      compressionThreshold: config.compressionThreshold || 1024, // Compress entries > 1KB
      ...config
    };
    
    this.cache = new Map();
    this.accessTimes = new Map();
    this.sizes = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      writes: 0
    };
    
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.config.checkPeriod);
    
    // Load persisted cache if enabled
    if (this.config.persistence) {
      this._loadPersistedCache().catch(err => {
        console.error('Failed to load persisted cache:', err);
      });
    }
  }

  /**
   * Get value from cache
   */
  async get(key) {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }
    
    // Check if expired
    if (this._isExpired(entry)) {
      this.delete(key);
      this.stats.misses++;
      return null;
    }
    
    // Update access time for LRU
    this.accessTimes.set(key, Date.now());
    this.stats.hits++;
    
    // Decompress if needed
    if (entry.compressed) {
      return this._decompress(entry.value);
    }
    
    return entry.value;
  }

  /**
   * Set value in cache
   */
  async set(key, value, options = {}) {
    const ttl = options.ttl || this.config.maxAge;
    const size = this._calculateSize(value);
    
    // Check if we need to evict entries
    if (this.cache.size >= this.config.maxSize) {
      this._evictLRU();
    }
    
    // Compress if needed
    let storedValue = value;
    let compressed = false;
    
    if (size > this.config.compressionThreshold) {
      storedValue = await this._compress(value);
      compressed = true;
    }
    
    const entry = {
      value: storedValue,
      timestamp: Date.now(),
      ttl: ttl,
      compressed: compressed
    };
    
    this.cache.set(key, entry);
    this.accessTimes.set(key, Date.now());
    this.sizes.set(key, size);
    this.stats.writes++;
    
    // Persist if enabled
    if (this.config.persistence) {
      this._persistEntry(key, entry).catch(err => {
        console.error(`Failed to persist cache entry ${key}:`, err);
      });
    }
    
    return true;
  }

  /**
   * Delete entry from cache
   */
  delete(key) {
    if (!this.cache.has(key)) {
      return false;
    }
    
    this.cache.delete(key);
    this.accessTimes.delete(key);
    this.sizes.delete(key);
    
    // Remove from persistence if enabled
    if (this.config.persistence) {
      this._removePersistedEntry(key).catch(err => {
        console.error(`Failed to remove persisted entry ${key}:`, err);
      });
    }
    
    return true;
  }

  /**
   * Check if key exists in cache
   */
  has(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (this._isExpired(entry)) {
      this.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Clear all cache entries
   */
  async clear() {
    this.cache.clear();
    this.accessTimes.clear();
    this.sizes.clear();
    
    // Clear persistence if enabled
    if (this.config.persistence) {
      await this._clearPersistedCache();
    }
  }

  /**
   * Get cache size
   */
  size() {
    return this.cache.size;
  }

  /**
   * Get total size in bytes
   */
  totalSize() {
    let total = 0;
    for (const size of this.sizes.values()) {
      total += size;
    }
    return total;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      ...this.stats,
      size: this.cache.size,
      totalSizeBytes: this.totalSize(),
      hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      writes: 0
    };
  }

  /**
   * Get all keys
   */
  keys() {
    return Array.from(this.cache.keys());
  }

  /**
   * Get entries matching pattern
   */
  async search(pattern) {
    const regex = new RegExp(pattern);
    const results = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (!this._isExpired(entry) && regex.test(key)) {
        const value = entry.compressed ? await this._decompress(entry.value) : entry.value;
        results.push({ key, value });
      }
    }
    
    return results;
  }

  /**
   * Cleanup expired entries
   */
  cleanup() {
    const now = Date.now();
    const keysToDelete = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (this._isExpired(entry, now)) {
        keysToDelete.push(key);
      }
    }
    
    for (const key of keysToDelete) {
      this.delete(key);
    }
    
    return keysToDelete.length;
  }

  /**
   * Stop the cache manager
   */
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    // Save current state if persistence is enabled
    if (this.config.persistence) {
      return this._saveFullCache();
    }
  }

  /**
   * Check if entry is expired
   */
  _isExpired(entry, now = Date.now()) {
    return now - entry.timestamp > entry.ttl;
  }

  /**
   * Evict least recently used entry
   */
  _evictLRU() {
    let oldestTime = Infinity;
    let oldestKey = null;
    
    for (const [key, time] of this.accessTimes.entries()) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  /**
   * Calculate size of value
   */
  _calculateSize(value) {
    // Rough estimate of size in bytes
    const str = JSON.stringify(value);
    return Buffer.byteLength(str, 'utf8');
  }

  /**
   * Compress value
   */
  async _compress(value) {
    const zlib = require('zlib');
    const util = require('util');
    const gzip = util.promisify(zlib.gzip);
    
    const json = JSON.stringify(value);
    const compressed = await gzip(json);
    
    return compressed.toString('base64');
  }

  /**
   * Decompress value
   */
  async _decompress(compressed) {
    const zlib = require('zlib');
    const util = require('util');
    const gunzip = util.promisify(zlib.gunzip);
    
    const buffer = Buffer.from(compressed, 'base64');
    const decompressed = await gunzip(buffer);
    
    return JSON.parse(decompressed.toString());
  }

  /**
   * Get cache file path for key
   */
  _getCacheFilePath(key) {
    const hash = crypto.createHash('md5').update(key).digest('hex');
    return path.join(this.config.persistencePath, `${hash}.json`);
  }

  /**
   * Persist cache entry
   */
  async _persistEntry(key, entry) {
    try {
      await fs.mkdir(this.config.persistencePath, { recursive: true });
      
      const filePath = this._getCacheFilePath(key);
      const data = {
        key,
        entry,
        savedAt: Date.now()
      };
      
      await fs.writeFile(filePath, JSON.stringify(data), 'utf8');
    } catch (error) {
      // Silently fail - persistence is optional
    }
  }

  /**
   * Remove persisted entry
   */
  async _removePersistedEntry(key) {
    try {
      const filePath = this._getCacheFilePath(key);
      await fs.unlink(filePath);
    } catch (error) {
      // File might not exist
    }
  }

  /**
   * Load persisted cache
   */
  async _loadPersistedCache() {
    try {
      await fs.mkdir(this.config.persistencePath, { recursive: true });
      
      const files = await fs.readdir(this.config.persistencePath);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      
      for (const file of jsonFiles) {
        try {
          const filePath = path.join(this.config.persistencePath, file);
          const content = await fs.readFile(filePath, 'utf8');
          const data = JSON.parse(content);
          
          // Check if entry is still valid
          if (!this._isExpired(data.entry)) {
            this.cache.set(data.key, data.entry);
            this.accessTimes.set(data.key, data.savedAt);
            this.sizes.set(data.key, this._calculateSize(data.entry.value));
          } else {
            // Remove expired file
            await fs.unlink(filePath);
          }
        } catch (error) {
          // Skip invalid files
        }
      }
    } catch (error) {
      // Directory might not exist
    }
  }

  /**
   * Clear persisted cache
   */
  async _clearPersistedCache() {
    try {
      const files = await fs.readdir(this.config.persistencePath);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      
      await Promise.all(
        jsonFiles.map(file =>
          fs.unlink(path.join(this.config.persistencePath, file))
        )
      );
    } catch (error) {
      // Directory might not exist
    }
  }

  /**
   * Save full cache state
   */
  async _saveFullCache() {
    if (!this.config.persistence) return;
    
    try {
      await fs.mkdir(this.config.persistencePath, { recursive: true });
      
      const state = {
        entries: Array.from(this.cache.entries()),
        accessTimes: Array.from(this.accessTimes.entries()),
        sizes: Array.from(this.sizes.entries()),
        stats: this.stats,
        savedAt: Date.now()
      };
      
      const statePath = path.join(this.config.persistencePath, '_state.json');
      await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');
    } catch (error) {
      console.error('Failed to save cache state:', error);
    }
  }
}

module.exports = CacheManager;