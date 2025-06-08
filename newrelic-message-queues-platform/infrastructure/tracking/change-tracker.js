/**
 * Change Tracker
 * 
 * Tracks changes in discovered infrastructure resources over time.
 * Provides history, change detection, and notification capabilities.
 */

const EventEmitter = require('events');
const crypto = require('crypto');

class ChangeTracker extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      maxHistorySize: config.maxHistorySize || 1000,
      historyTTL: config.historyTTL || 86400000, // 24 hours
      trackingFields: config.trackingFields || ['status', 'config', 'metadata'],
      ignoreFields: config.ignoreFields || ['raw', 'timestamps'],
      enableNotifications: config.enableNotifications !== false,
      notificationRules: config.notificationRules || [],
      ...config
    };
    
    this.currentState = new Map();
    this.history = [];
    this.changeSubscribers = new Map();
    this.stats = {
      totalChanges: 0,
      changesByType: {},
      changesByResource: {}
    };
    
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this._cleanupHistory();
    }, 3600000); // Cleanup every hour
  }

  /**
   * Track changes in resources
   */
  async trackChanges(resources) {
    const timestamp = new Date();
    const changes = {
      timestamp,
      added: [],
      removed: [],
      modified: [],
      hasChanges: false
    };
    
    // Convert resources to map for efficient lookup
    const resourceMap = new Map();
    for (const resource of resources) {
      const hash = this._generateResourceHash(resource);
      resourceMap.set(resource.id, { resource, hash });
    }
    
    // Find removed resources
    for (const [id, state] of this.currentState.entries()) {
      if (!resourceMap.has(id)) {
        changes.removed.push({
          id,
          resource: state.resource,
          timestamp
        });
        changes.hasChanges = true;
      }
    }
    
    // Find added and modified resources
    for (const [id, { resource, hash }] of resourceMap.entries()) {
      const currentState = this.currentState.get(id);
      
      if (!currentState) {
        // New resource
        changes.added.push({
          id,
          resource,
          timestamp
        });
        changes.hasChanges = true;
      } else if (currentState.hash !== hash) {
        // Modified resource
        const diff = this._calculateDiff(currentState.resource, resource);
        changes.modified.push({
          id,
          previous: currentState.resource,
          current: resource,
          diff,
          timestamp
        });
        changes.hasChanges = true;
      }
    }
    
    // Update current state
    this.currentState = resourceMap;
    
    // Record changes in history
    if (changes.hasChanges) {
      this._recordChanges(changes);
      
      // Notify subscribers
      if (this.config.enableNotifications) {
        await this._notifySubscribers(changes);
      }
      
      // Check notification rules
      await this._checkNotificationRules(changes);
    }
    
    return changes;
  }

  /**
   * Get change history
   */
  getHistory(options = {}) {
    const {
      limit = 100,
      resourceId,
      changeType,
      startTime,
      endTime
    } = options;
    
    let filtered = this.history;
    
    // Filter by resource ID
    if (resourceId) {
      filtered = filtered.filter(entry =>
        entry.changes.added.some(c => c.id === resourceId) ||
        entry.changes.removed.some(c => c.id === resourceId) ||
        entry.changes.modified.some(c => c.id === resourceId)
      );
    }
    
    // Filter by change type
    if (changeType) {
      filtered = filtered.filter(entry => {
        switch (changeType) {
          case 'added':
            return entry.changes.added.length > 0;
          case 'removed':
            return entry.changes.removed.length > 0;
          case 'modified':
            return entry.changes.modified.length > 0;
          default:
            return true;
        }
      });
    }
    
    // Filter by time range
    if (startTime) {
      filtered = filtered.filter(entry =>
        new Date(entry.timestamp) >= new Date(startTime)
      );
    }
    
    if (endTime) {
      filtered = filtered.filter(entry =>
        new Date(entry.timestamp) <= new Date(endTime)
      );
    }
    
    // Apply limit
    return filtered.slice(-limit);
  }

  /**
   * Get resource history
   */
  getResourceHistory(resourceId) {
    const history = [];
    
    for (const entry of this.history) {
      const changes = [];
      
      // Check if resource was added
      const added = entry.changes.added.find(c => c.id === resourceId);
      if (added) {
        changes.push({
          type: 'added',
          timestamp: entry.timestamp,
          resource: added.resource
        });
      }
      
      // Check if resource was modified
      const modified = entry.changes.modified.find(c => c.id === resourceId);
      if (modified) {
        changes.push({
          type: 'modified',
          timestamp: entry.timestamp,
          previous: modified.previous,
          current: modified.current,
          diff: modified.diff
        });
      }
      
      // Check if resource was removed
      const removed = entry.changes.removed.find(c => c.id === resourceId);
      if (removed) {
        changes.push({
          type: 'removed',
          timestamp: entry.timestamp,
          resource: removed.resource
        });
      }
      
      history.push(...changes);
    }
    
    return history;
  }

  /**
   * Subscribe to changes
   */
  subscribe(pattern, callback, options = {}) {
    const subscription = {
      pattern: pattern instanceof RegExp ? pattern : new RegExp(pattern),
      callback,
      options,
      id: crypto.randomBytes(16).toString('hex')
    };
    
    this.changeSubscribers.set(subscription.id, subscription);
    
    return {
      unsubscribe: () => {
        this.changeSubscribers.delete(subscription.id);
      }
    };
  }

  /**
   * Add notification rule
   */
  addNotificationRule(rule) {
    if (!rule.name || !rule.condition || !rule.action) {
      throw new Error('Notification rule must have name, condition, and action');
    }
    
    this.config.notificationRules.push({
      id: crypto.randomBytes(8).toString('hex'),
      enabled: true,
      ...rule
    });
  }

  /**
   * Remove notification rule
   */
  removeNotificationRule(ruleId) {
    const index = this.config.notificationRules.findIndex(r => r.id === ruleId);
    if (index !== -1) {
      this.config.notificationRules.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      currentResources: this.currentState.size,
      historySize: this.history.length,
      activeSubscribers: this.changeSubscribers.size,
      activeRules: this.config.notificationRules.filter(r => r.enabled).length
    };
  }

  /**
   * Reset tracker
   */
  reset() {
    this.currentState.clear();
    this.history = [];
    this.stats = {
      totalChanges: 0,
      changesByType: {},
      changesByResource: {}
    };
  }

  /**
   * Stop tracker
   */
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    this.removeAllListeners();
    this.changeSubscribers.clear();
  }

  /**
   * Generate resource hash
   */
  _generateResourceHash(resource) {
    const filtered = this._filterResource(resource);
    const str = JSON.stringify(filtered, Object.keys(filtered).sort());
    return crypto.createHash('sha256').update(str).digest('hex');
  }

  /**
   * Filter resource fields for comparison
   */
  _filterResource(resource) {
    const filtered = {};
    
    for (const [key, value] of Object.entries(resource)) {
      // Skip ignored fields
      if (this.config.ignoreFields.includes(key)) {
        continue;
      }
      
      // Only include tracked fields if specified
      if (this.config.trackingFields.length > 0 &&
          !this.config.trackingFields.includes(key)) {
        continue;
      }
      
      filtered[key] = value;
    }
    
    return filtered;
  }

  /**
   * Calculate diff between resources
   */
  _calculateDiff(previous, current) {
    const diff = {
      added: {},
      removed: {},
      modified: {}
    };
    
    const prevFiltered = this._filterResource(previous);
    const currFiltered = this._filterResource(current);
    
    // Find added and modified fields
    for (const [key, value] of Object.entries(currFiltered)) {
      if (!(key in prevFiltered)) {
        diff.added[key] = value;
      } else if (JSON.stringify(prevFiltered[key]) !== JSON.stringify(value)) {
        diff.modified[key] = {
          previous: prevFiltered[key],
          current: value
        };
      }
    }
    
    // Find removed fields
    for (const key of Object.keys(prevFiltered)) {
      if (!(key in currFiltered)) {
        diff.removed[key] = prevFiltered[key];
      }
    }
    
    return diff;
  }

  /**
   * Record changes in history
   */
  _recordChanges(changes) {
    // Add to history
    this.history.push({
      timestamp: changes.timestamp,
      changes: {
        added: changes.added,
        removed: changes.removed,
        modified: changes.modified
      }
    });
    
    // Update statistics
    this.stats.totalChanges++;
    
    const changeCount = 
      changes.added.length + 
      changes.removed.length + 
      changes.modified.length;
    
    // Count by type
    if (changes.added.length > 0) {
      this.stats.changesByType.added = (this.stats.changesByType.added || 0) + changes.added.length;
    }
    if (changes.removed.length > 0) {
      this.stats.changesByType.removed = (this.stats.changesByType.removed || 0) + changes.removed.length;
    }
    if (changes.modified.length > 0) {
      this.stats.changesByType.modified = (this.stats.changesByType.modified || 0) + changes.modified.length;
    }
    
    // Count by resource type
    const allChanges = [
      ...changes.added,
      ...changes.removed,
      ...changes.modified.map(m => ({ resource: m.current }))
    ];
    
    for (const change of allChanges) {
      const resourceType = change.resource?.type || 'unknown';
      this.stats.changesByResource[resourceType] = 
        (this.stats.changesByResource[resourceType] || 0) + 1;
    }
    
    // Trim history if needed
    if (this.history.length > this.config.maxHistorySize) {
      this.history = this.history.slice(-this.config.maxHistorySize);
    }
    
    this.emit('changes:recorded', { changes, changeCount });
  }

  /**
   * Notify subscribers of changes
   */
  async _notifySubscribers(changes) {
    const notifications = [];
    
    for (const subscriber of this.changeSubscribers.values()) {
      const matchingChanges = this._filterChangesForSubscriber(changes, subscriber);
      
      if (matchingChanges.hasChanges) {
        notifications.push(
          this._notifySubscriber(subscriber, matchingChanges)
        );
      }
    }
    
    await Promise.allSettled(notifications);
  }

  /**
   * Filter changes for subscriber
   */
  _filterChangesForSubscriber(changes, subscriber) {
    const filtered = {
      timestamp: changes.timestamp,
      added: [],
      removed: [],
      modified: [],
      hasChanges: false
    };
    
    // Filter added resources
    filtered.added = changes.added.filter(change =>
      subscriber.pattern.test(change.id) ||
      subscriber.pattern.test(JSON.stringify(change.resource))
    );
    
    // Filter removed resources
    filtered.removed = changes.removed.filter(change =>
      subscriber.pattern.test(change.id) ||
      subscriber.pattern.test(JSON.stringify(change.resource))
    );
    
    // Filter modified resources
    filtered.modified = changes.modified.filter(change =>
      subscriber.pattern.test(change.id) ||
      subscriber.pattern.test(JSON.stringify(change.current))
    );
    
    filtered.hasChanges = 
      filtered.added.length > 0 ||
      filtered.removed.length > 0 ||
      filtered.modified.length > 0;
    
    return filtered;
  }

  /**
   * Notify single subscriber
   */
  async _notifySubscriber(subscriber, changes) {
    try {
      await subscriber.callback(changes);
    } catch (error) {
      this.emit('subscriber:error', {
        subscriberId: subscriber.id,
        error: error.message
      });
    }
  }

  /**
   * Check notification rules
   */
  async _checkNotificationRules(changes) {
    for (const rule of this.config.notificationRules) {
      if (!rule.enabled) continue;
      
      try {
        const shouldNotify = await this._evaluateRule(rule, changes);
        
        if (shouldNotify) {
          await this._executeRuleAction(rule, changes);
        }
      } catch (error) {
        this.emit('rule:error', {
          ruleId: rule.id,
          ruleName: rule.name,
          error: error.message
        });
      }
    }
  }

  /**
   * Evaluate notification rule
   */
  async _evaluateRule(rule, changes) {
    if (typeof rule.condition === 'function') {
      return rule.condition(changes);
    }
    
    // Simple condition evaluation
    const { type, count, pattern } = rule.condition;
    
    let matchCount = 0;
    
    if (type === 'any' || type === 'added') {
      matchCount += changes.added.length;
    }
    if (type === 'any' || type === 'removed') {
      matchCount += changes.removed.length;
    }
    if (type === 'any' || type === 'modified') {
      matchCount += changes.modified.length;
    }
    
    if (count && matchCount < count) {
      return false;
    }
    
    if (pattern) {
      const regex = new RegExp(pattern);
      const hasMatch = 
        changes.added.some(c => regex.test(JSON.stringify(c))) ||
        changes.removed.some(c => regex.test(JSON.stringify(c))) ||
        changes.modified.some(c => regex.test(JSON.stringify(c)));
      
      if (!hasMatch) return false;
    }
    
    return true;
  }

  /**
   * Execute rule action
   */
  async _executeRuleAction(rule, changes) {
    if (typeof rule.action === 'function') {
      await rule.action(changes, rule);
    } else {
      this.emit('rule:triggered', {
        rule,
        changes
      });
    }
  }

  /**
   * Cleanup old history entries
   */
  _cleanupHistory() {
    const cutoffTime = Date.now() - this.config.historyTTL;
    
    this.history = this.history.filter(entry =>
      new Date(entry.timestamp).getTime() > cutoffTime
    );
  }
}

module.exports = ChangeTracker;