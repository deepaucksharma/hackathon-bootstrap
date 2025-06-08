/**
 * Base Discovery Service
 * 
 * Abstract base class for infrastructure discovery providers.
 * Defines the interface and common functionality for discovering
 * message queue infrastructure across different environments.
 */

const EventEmitter = require('events');

class BaseDiscoveryService extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      refreshInterval: 30000, // 30 seconds default
      timeout: 10000,         // 10 seconds timeout
      retryAttempts: 3,
      retryDelay: 1000,
      ...config
    };
    
    this.isRunning = false;
    this.lastDiscovery = null;
    this.refreshTimer = null;
    this.discoveredResources = new Map();
  }

  /**
   * Start the discovery service
   */
  async start() {
    if (this.isRunning) {
      throw new Error('Discovery service is already running');
    }

    this.isRunning = true;
    this.emit('started', { provider: this.constructor.name });

    // Initial discovery
    await this.discover();

    // Setup periodic refresh
    if (this.config.refreshInterval > 0) {
      this.refreshTimer = setInterval(() => {
        this.discover().catch(err => {
          this.emit('error', err);
        });
      }, this.config.refreshInterval);
    }
  }

  /**
   * Stop the discovery service
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    await this.cleanup();
    this.emit('stopped', { provider: this.constructor.name });
  }

  /**
   * Perform discovery with retry logic
   */
  async discover() {
    let lastError;
    
    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        this.emit('discovery:start', { 
          provider: this.constructor.name,
          attempt 
        });

        const resources = await this._discoverWithTimeout();
        
        // Process discovered resources
        const processed = await this.processDiscoveredResources(resources);
        
        // Track changes
        const changes = this.detectChanges(processed);
        
        // Update internal state
        this.updateDiscoveredResources(processed);
        
        this.lastDiscovery = new Date();
        
        this.emit('discovery:complete', {
          provider: this.constructor.name,
          resourceCount: processed.length,
          changes,
          timestamp: this.lastDiscovery
        });

        return processed;
        
      } catch (error) {
        lastError = error;
        
        this.emit('discovery:error', {
          provider: this.constructor.name,
          attempt,
          error: error.message
        });

        if (attempt < this.config.retryAttempts) {
          await this._delay(this.config.retryDelay * attempt);
        }
      }
    }

    throw new Error(`Discovery failed after ${this.config.retryAttempts} attempts: ${lastError.message}`);
  }

  /**
   * Discover with timeout
   */
  async _discoverWithTimeout() {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Discovery timeout')), this.config.timeout);
    });

    const discoveryPromise = this.discoverResources();
    
    return Promise.race([discoveryPromise, timeoutPromise]);
  }

  /**
   * Process discovered resources
   */
  async processDiscoveredResources(resources) {
    const processed = [];
    
    for (const resource of resources) {
      try {
        const normalized = await this.normalizeResource(resource);
        if (this.isMessageQueueResource(normalized)) {
          processed.push(normalized);
        }
      } catch (error) {
        this.emit('resource:error', {
          resource,
          error: error.message
        });
      }
    }
    
    return processed;
  }

  /**
   * Detect changes in discovered resources
   */
  detectChanges(resources) {
    const changes = {
      added: [],
      removed: [],
      modified: []
    };

    const currentIds = new Set(resources.map(r => r.id));
    const previousIds = new Set(this.discoveredResources.keys());

    // Find added resources
    for (const resource of resources) {
      if (!previousIds.has(resource.id)) {
        changes.added.push(resource);
      } else {
        // Check for modifications
        const previous = this.discoveredResources.get(resource.id);
        if (this.hasResourceChanged(previous, resource)) {
          changes.modified.push({
            previous,
            current: resource
          });
        }
      }
    }

    // Find removed resources
    for (const id of previousIds) {
      if (!currentIds.has(id)) {
        changes.removed.push(this.discoveredResources.get(id));
      }
    }

    return changes;
  }

  /**
   * Update discovered resources
   */
  updateDiscoveredResources(resources) {
    // Clear removed resources
    const currentIds = new Set(resources.map(r => r.id));
    for (const id of this.discoveredResources.keys()) {
      if (!currentIds.has(id)) {
        this.discoveredResources.delete(id);
      }
    }

    // Update or add resources
    for (const resource of resources) {
      this.discoveredResources.set(resource.id, resource);
    }
  }

  /**
   * Check if resource has changed
   */
  hasResourceChanged(previous, current) {
    // Compare relevant fields
    return JSON.stringify({
      type: previous.type,
      metadata: previous.metadata,
      config: previous.config,
      status: previous.status
    }) !== JSON.stringify({
      type: current.type,
      metadata: current.metadata,
      config: current.config,
      status: current.status
    });
  }

  /**
   * Get all discovered resources
   */
  getDiscoveredResources() {
    return Array.from(this.discoveredResources.values());
  }

  /**
   * Get discovered resources by type
   */
  getResourcesByType(type) {
    return this.getDiscoveredResources().filter(r => r.type === type);
  }

  /**
   * Get a specific resource by ID
   */
  getResourceById(id) {
    return this.discoveredResources.get(id);
  }

  /**
   * Utility delay function
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Abstract methods to be implemented by subclasses

  /**
   * Discover resources in the infrastructure
   * @abstract
   */
  async discoverResources() {
    throw new Error('discoverResources() must be implemented by subclass');
  }

  /**
   * Normalize discovered resource to standard format
   * @abstract
   */
  async normalizeResource(resource) {
    throw new Error('normalizeResource() must be implemented by subclass');
  }

  /**
   * Check if resource is a message queue system
   * @abstract
   */
  isMessageQueueResource(resource) {
    throw new Error('isMessageQueueResource() must be implemented by subclass');
  }

  /**
   * Cleanup any resources
   * @abstract
   */
  async cleanup() {
    // Override in subclass if needed
  }
}

module.exports = BaseDiscoveryService;