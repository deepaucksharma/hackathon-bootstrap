/**
 * Discovery Orchestrator
 * 
 * Manages multiple discovery providers and coordinates infrastructure
 * discovery across different environments. Provides unified interface
 * for discovering message queue systems.
 */

const EventEmitter = require('events');
const CacheManager = require('../cache/cache-manager');
const ChangeTracker = require('../tracking/change-tracker');

class DiscoveryOrchestrator extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      enableCache: config.enableCache !== false,
      cacheOptions: config.cacheOptions || {},
      enableTracking: config.enableTracking !== false,
      trackingOptions: config.trackingOptions || {},
      concurrency: config.concurrency || 3,
      discoveryTimeout: config.discoveryTimeout || 30000,
      ...config
    };
    
    this.providers = new Map();
    this.isRunning = false;
    this.discoveryResults = new Map();
    
    // Initialize cache if enabled
    if (this.config.enableCache) {
      this.cache = new CacheManager(this.config.cacheOptions);
    }
    
    // Initialize change tracker if enabled
    if (this.config.enableTracking) {
      this.changeTracker = new ChangeTracker(this.config.trackingOptions);
    }
  }

  /**
   * Register a discovery provider
   */
  registerProvider(name, provider) {
    if (this.providers.has(name)) {
      throw new Error(`Provider '${name}' is already registered`);
    }
    
    // Setup provider event forwarding
    provider.on('discovery:start', (data) => {
      this.emit('provider:discovery:start', { provider: name, ...data });
    });
    
    provider.on('discovery:complete', (data) => {
      this.emit('provider:discovery:complete', { provider: name, ...data });
    });
    
    provider.on('discovery:error', (data) => {
      this.emit('provider:discovery:error', { provider: name, ...data });
    });
    
    provider.on('resource:error', (data) => {
      this.emit('provider:resource:error', { provider: name, ...data });
    });
    
    this.providers.set(name, provider);
    this.emit('provider:registered', { name, provider: provider.constructor.name });
    
    return this;
  }

  /**
   * Unregister a discovery provider
   */
  unregisterProvider(name) {
    if (!this.providers.has(name)) {
      return false;
    }
    
    const provider = this.providers.get(name);
    provider.removeAllListeners();
    this.providers.delete(name);
    
    this.emit('provider:unregistered', { name });
    return true;
  }

  /**
   * Get registered provider
   */
  getProvider(name) {
    return this.providers.get(name);
  }

  /**
   * Get all registered providers
   */
  getProviders() {
    return Array.from(this.providers.entries()).map(([name, provider]) => ({
      name,
      type: provider.constructor.name,
      isRunning: provider.isRunning
    }));
  }

  /**
   * Start discovery orchestration
   */
  async start() {
    if (this.isRunning) {
      throw new Error('Discovery orchestrator is already running');
    }
    
    if (this.providers.size === 0) {
      throw new Error('No discovery providers registered');
    }
    
    this.isRunning = true;
    this.emit('orchestrator:started');
    
    // Start all providers
    const startPromises = [];
    for (const [name, provider] of this.providers) {
      startPromises.push(
        provider.start().catch(error => {
          this.emit('provider:start:error', { provider: name, error: error.message });
          throw error;
        })
      );
    }
    
    try {
      await Promise.all(startPromises);
      this.emit('orchestrator:ready', { providers: this.getProviders() });
    } catch (error) {
      // Stop any started providers
      await this.stop();
      throw new Error(`Failed to start all providers: ${error.message}`);
    }
  }

  /**
   * Stop discovery orchestration
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }
    
    this.isRunning = false;
    
    // Stop all providers
    const stopPromises = [];
    for (const [name, provider] of this.providers) {
      stopPromises.push(
        provider.stop().catch(error => {
          this.emit('provider:stop:error', { provider: name, error: error.message });
        })
      );
    }
    
    await Promise.all(stopPromises);
    
    // Clear cache if enabled
    if (this.cache) {
      await this.cache.clear();
    }
    
    this.emit('orchestrator:stopped');
  }

  /**
   * Discover resources across all providers
   */
  async discover(options = {}) {
    if (!this.isRunning) {
      throw new Error('Discovery orchestrator is not running');
    }
    
    const providers = options.providers || Array.from(this.providers.keys());
    const useCache = options.useCache !== false && this.config.enableCache;
    
    this.emit('discovery:start', { providers });
    
    const results = new Map();
    const errors = [];
    
    // Check cache first if enabled
    if (useCache && this.cache) {
      for (const providerName of providers) {
        const cached = await this.cache.get(`discovery:${providerName}`);
        if (cached && !this._isCacheExpired(cached)) {
          results.set(providerName, cached.data);
          this.emit('discovery:cache:hit', { provider: providerName });
        }
      }
    }
    
    // Discover from providers not in cache
    const providersToDiscover = providers.filter(p => !results.has(p));
    
    if (providersToDiscover.length > 0) {
      const discoveryResults = await this._discoverWithConcurrency(
        providersToDiscover,
        this.config.concurrency
      );
      
      // Process results
      for (const result of discoveryResults) {
        if (result.status === 'fulfilled') {
          const { provider, resources } = result.value;
          results.set(provider, resources);
          
          // Update cache if enabled
          if (useCache && this.cache) {
            await this.cache.set(`discovery:${provider}`, {
              data: resources,
              timestamp: new Date()
            });
          }
        } else {
          errors.push({
            provider: result.reason.provider,
            error: result.reason.error
          });
        }
      }
    }
    
    // Merge all results
    const allResources = this._mergeResults(results);
    
    // Track changes if enabled
    if (this.config.enableTracking && this.changeTracker) {
      const changes = await this.changeTracker.trackChanges(allResources);
      if (changes.hasChanges) {
        this.emit('discovery:changes', changes);
      }
    }
    
    // Update internal state
    this.discoveryResults = results;
    
    this.emit('discovery:complete', {
      providers: providers,
      totalResources: allResources.length,
      resourcesByProvider: Object.fromEntries(
        Array.from(results.entries()).map(([k, v]) => [k, v.length])
      ),
      errors: errors
    });
    
    return {
      resources: allResources,
      byProvider: Object.fromEntries(results),
      errors: errors
    };
  }

  /**
   * Discover with concurrency control
   */
  async _discoverWithConcurrency(providers, concurrency) {
    const results = [];
    const executing = [];
    
    for (const providerName of providers) {
      const promise = this._discoverFromProvider(providerName).then(
        resources => ({ status: 'fulfilled', value: { provider: providerName, resources } }),
        error => ({ status: 'rejected', reason: { provider: providerName, error } })
      );
      
      results.push(promise);
      
      if (providers.length >= concurrency) {
        executing.push(promise);
        
        if (executing.length >= concurrency) {
          await Promise.race(executing);
          executing.splice(executing.findIndex(p => p.settled), 1);
        }
      }
    }
    
    return Promise.all(results);
  }

  /**
   * Discover from a single provider
   */
  async _discoverFromProvider(providerName) {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Provider '${providerName}' not found`);
    }
    
    // Apply timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error('Discovery timeout')),
        this.config.discoveryTimeout
      );
    });
    
    const discoveryPromise = provider.discover();
    
    try {
      const resources = await Promise.race([discoveryPromise, timeoutPromise]);
      return resources;
    } catch (error) {
      this.emit('provider:discovery:timeout', {
        provider: providerName,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get resources by type
   */
  async getResourcesByType(type, options = {}) {
    const discoveryResult = await this.discover(options);
    return discoveryResult.resources.filter(r => r.type === type);
  }

  /**
   * Get resources by provider type
   */
  async getResourcesByProvider(providerType, options = {}) {
    const discoveryResult = await this.discover(options);
    return discoveryResult.resources.filter(r => r.provider === providerType);
  }

  /**
   * Search resources
   */
  async searchResources(query, options = {}) {
    const discoveryResult = await this.discover(options);
    const searchLower = query.toLowerCase();
    
    return discoveryResult.resources.filter(resource => {
      // Search in metadata
      if (resource.metadata) {
        const metadataStr = JSON.stringify(resource.metadata).toLowerCase();
        if (metadataStr.includes(searchLower)) {
          return true;
        }
      }
      
      // Search in type
      if (resource.type && resource.type.toLowerCase().includes(searchLower)) {
        return true;
      }
      
      // Search in ID
      if (resource.id && resource.id.toLowerCase().includes(searchLower)) {
        return true;
      }
      
      return false;
    });
  }

  /**
   * Get aggregated statistics
   */
  async getStatistics() {
    const stats = {
      providers: {},
      totals: {
        resources: 0,
        byType: {},
        byProvider: {}
      },
      lastDiscovery: null
    };
    
    for (const [name, provider] of this.providers) {
      const resources = provider.getDiscoveredResources();
      
      stats.providers[name] = {
        type: provider.constructor.name,
        isRunning: provider.isRunning,
        resourceCount: resources.length,
        lastDiscovery: provider.lastDiscovery
      };
      
      stats.totals.resources += resources.length;
      
      // Count by type
      for (const resource of resources) {
        stats.totals.byType[resource.type] = (stats.totals.byType[resource.type] || 0) + 1;
        stats.totals.byProvider[resource.provider] = (stats.totals.byProvider[resource.provider] || 0) + 1;
      }
      
      if (!stats.lastDiscovery || provider.lastDiscovery > stats.lastDiscovery) {
        stats.lastDiscovery = provider.lastDiscovery;
      }
    }
    
    return stats;
  }

  /**
   * Get change history
   */
  getChangeHistory(options = {}) {
    if (!this.changeTracker) {
      return [];
    }
    
    return this.changeTracker.getHistory(options);
  }

  /**
   * Export discovered resources
   */
  async exportResources(format = 'json') {
    const allResources = this._mergeResults(this.discoveryResults);
    
    switch (format) {
      case 'json':
        return JSON.stringify(allResources, null, 2);
        
      case 'csv':
        return this._exportAsCSV(allResources);
        
      case 'summary':
        return this._exportAsSummary(allResources);
        
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Merge results from all providers
   */
  _mergeResults(results) {
    const merged = [];
    
    for (const resources of results.values()) {
      merged.push(...resources);
    }
    
    // Remove duplicates based on ID
    const seen = new Set();
    return merged.filter(resource => {
      if (seen.has(resource.id)) {
        return false;
      }
      seen.add(resource.id);
      return true;
    });
  }

  /**
   * Check if cache is expired
   */
  _isCacheExpired(cached) {
    const maxAge = this.config.cacheOptions.maxAge || 300000; // 5 minutes default
    return Date.now() - new Date(cached.timestamp).getTime() > maxAge;
  }

  /**
   * Export as CSV
   */
  _exportAsCSV(resources) {
    const headers = ['ID', 'Type', 'Provider', 'Name', 'Namespace', 'Status', 'Created'];
    const rows = [headers];
    
    for (const resource of resources) {
      rows.push([
        resource.id,
        resource.type,
        resource.provider,
        resource.metadata?.name || '',
        resource.metadata?.namespace || '',
        resource.status?.state || resource.status?.phase || 'unknown',
        resource.metadata?.created || resource.metadata?.creationTimestamp || ''
      ]);
    }
    
    return rows.map(row => row.join(',')).join('\n');
  }

  /**
   * Export as summary
   */
  _exportAsSummary(resources) {
    const summary = {
      total: resources.length,
      byType: {},
      byProvider: {},
      byStatus: {}
    };
    
    for (const resource of resources) {
      // Count by type
      summary.byType[resource.type] = (summary.byType[resource.type] || 0) + 1;
      
      // Count by provider
      summary.byProvider[resource.provider] = (summary.byProvider[resource.provider] || 0) + 1;
      
      // Count by status
      const status = resource.status?.state || resource.status?.phase || 'unknown';
      summary.byStatus[status] = (summary.byStatus[status] || 0) + 1;
    }
    
    return summary;
  }
}

module.exports = DiscoveryOrchestrator;