/**
 * Dashboard Generator with Core Functional Flows
 * 
 * Implements missing flows from v2:
 * - Cluster aggregation and entity creation
 * - Relationship management
 * - Error recovery with circuit breaker
 * - Health monitoring
 * - Dashboard verification
 */

const https = require('https');
const { standardMessageQueueDashboard, applyFilters } = require('../templates/standard-message-queue-dashboard');

class DashboardGenerator {
  constructor(config) {
    this.config = config;
    this.apiKey = config.userApiKey || config.apiKey;
    this.accountId = config.accountId;
    this.region = config.region || 'US';
    
    // Circuit breaker for API calls
    this.circuitBreaker = new CircuitBreaker({
      threshold: 3,
      timeout: 30000,
      resetTimeout: 60000
    });
    
    // Health monitoring
    this.health = {
      status: 'initializing',
      lastSuccess: null,
      errors: 0,
      dashboardsCreated: 0
    };
    
    this.logger = console;
  }
  
  /**
   * Generate dashboard with complete flow
   */
  async generateDashboard(options = {}) {
    const startTime = Date.now();
    
    try {
      // Step 1: Validate configuration
      this.validateConfiguration();
      
      // Step 2: Collect entity data for context
      const entityContext = await this.collectEntityContext();
      
      // Step 3: Apply filters and customizations
      const customizedDashboard = this.customizeDashboard(entityContext, options);
      
      // Step 4: Verify dashboard before creation
      const validationResult = await this.verifyDashboard(customizedDashboard);
      if (!validationResult.valid) {
        throw new Error(`Dashboard validation failed: ${validationResult.errors.join(', ')}`);
      }
      
      // Step 5: Create dashboard with circuit breaker
      const dashboard = await this.circuitBreaker.execute(
        () => this.createDashboardInNewRelic(customizedDashboard)
      );
      
      // Step 6: Update health status
      this.updateHealth('success', Date.now() - startTime);
      
      // Step 7: Generate verification report
      const report = await this.generateVerificationReport(dashboard);
      
      return {
        success: true,
        dashboard,
        report,
        duration: Date.now() - startTime
      };
      
    } catch (error) {
      this.updateHealth('error', Date.now() - startTime, error);
      
      // Implement error recovery
      return this.handleError(error, options);
    }
  }
  
  /**
   * Collect entity context for dashboard customization
   */
  async collectEntityContext() {
    try {
      // Query for existing entities to understand the topology
      const clusters = await this.queryEntities('MESSAGE_QUEUE_CLUSTER');
      const brokers = await this.queryEntities('MESSAGE_QUEUE_BROKER');
      const topics = await this.queryEntities('MESSAGE_QUEUE_TOPIC');
      
      // Aggregate cluster metrics (missing in v2)
      const clusterAggregates = this.aggregateClusterMetrics(brokers);
      
      // Build relationships (missing in v2)
      const relationships = this.buildEntityRelationships({
        clusters,
        brokers,
        topics
      });
      
      return {
        clusters: clusters.length,
        brokers: brokers.length,
        topics: topics.length,
        clusterNames: [...new Set(brokers.map(b => b.clusterName))],
        environments: [...new Set(brokers.map(b => b.environment || 'production'))],
        clusterAggregates,
        relationships
      };
    } catch (error) {
      this.logger.warn('Failed to collect entity context, using defaults', error);
      return {
        clusters: 1,
        brokers: 3,
        topics: 10,
        clusterNames: ['default-cluster'],
        environments: ['production']
      };
    }
  }
  
  /**
   * Aggregate cluster metrics from brokers (missing in v2)
   */
  aggregateClusterMetrics(brokers) {
    const clusterMap = new Map();
    
    brokers.forEach(broker => {
      const clusterName = broker.clusterName;
      if (!clusterMap.has(clusterName)) {
        clusterMap.set(clusterName, {
          brokerCount: 0,
          totalCpu: 0,
          totalMemory: 0,
          totalThroughput: 0,
          totalPartitions: 0
        });
      }
      
      const cluster = clusterMap.get(clusterName);
      cluster.brokerCount++;
      cluster.totalCpu += broker['broker.cpu.usage'] || 0;
      cluster.totalMemory += broker['broker.memory.usage'] || 0;
      cluster.totalThroughput += broker['broker.network.throughput'] || 0;
      cluster.totalPartitions += broker.partitionCount || 0;
    });
    
    // Convert to cluster entities
    const clusterEntities = [];
    clusterMap.forEach((metrics, clusterName) => {
      clusterEntities.push({
        entityType: 'MESSAGE_QUEUE_CLUSTER',
        clusterName,
        brokerCount: metrics.brokerCount,
        'cluster.cpu.average': metrics.totalCpu / metrics.brokerCount,
        'cluster.memory.average': metrics.totalMemory / metrics.brokerCount,
        'cluster.throughput.total': metrics.totalThroughput,
        'cluster.partitions.total': metrics.totalPartitions,
        'cluster.health.score': this.calculateHealthScore(metrics)
      });
    });
    
    return clusterEntities;
  }
  
  /**
   * Build entity relationships (missing in v2)
   */
  buildEntityRelationships(entities) {
    const relationships = [];
    
    // Cluster -> Broker relationships
    entities.brokers.forEach(broker => {
      relationships.push({
        source: this.generateEntityGuid('MESSAGE_QUEUE_CLUSTER', broker.clusterName),
        target: this.generateEntityGuid('MESSAGE_QUEUE_BROKER', broker.brokerId, broker.clusterName),
        type: 'CONTAINS'
      });
    });
    
    // Cluster -> Topic relationships
    entities.topics.forEach(topic => {
      relationships.push({
        source: this.generateEntityGuid('MESSAGE_QUEUE_CLUSTER', topic.clusterName),
        target: this.generateEntityGuid('MESSAGE_QUEUE_TOPIC', topic.topicName, topic.clusterName),
        type: 'CONTAINS'
      });
    });
    
    return relationships;
  }
  
  /**
   * Customize dashboard based on entity context
   */
  customizeDashboard(context, options) {
    const dashboard = JSON.parse(JSON.stringify(standardMessageQueueDashboard));
    
    // Update dashboard name and description
    dashboard.name = options.name || `Message Queues - ${context.clusterNames.join(', ')}`;
    dashboard.description = options.description || 
      `Monitoring ${context.brokers} brokers across ${context.clusters} clusters with ${context.topics} topics`;
    
    // Apply filters if specified
    if (options.filters) {
      return applyFilters(dashboard, options.filters);
    }
    
    // Add cluster-specific customizations
    if (context.clusterNames.length === 1) {
      // Single cluster mode - optimize queries
      dashboard.pages.forEach(page => {
        page.widgets.forEach(widget => {
          if (widget.configuration.nrqlQueries) {
            widget.configuration.nrqlQueries.forEach(query => {
              query.query = query.query.replace(
                /WHERE/g,
                `WHERE clusterName = '${context.clusterNames[0]}' AND`
              );
            });
          }
        });
      });
    }
    
    return dashboard;
  }
  
  /**
   * Verify dashboard before creation (missing in v2)
   */
  async verifyDashboard(dashboard) {
    const errors = [];
    const warnings = [];
    
    // Check dashboard structure
    if (!dashboard.name) errors.push('Dashboard name is required');
    if (!dashboard.pages || dashboard.pages.length === 0) errors.push('Dashboard must have at least one page');
    
    // Check widget limits (300 per dashboard)
    const totalWidgets = dashboard.pages.reduce((sum, page) => sum + page.widgets.length, 0);
    if (totalWidgets > 300) errors.push(`Too many widgets: ${totalWidgets} (max 300)`);
    
    // Validate NRQL queries
    dashboard.pages.forEach((page, pageIdx) => {
      page.widgets.forEach((widget, widgetIdx) => {
        if (widget.configuration.nrqlQueries) {
          widget.configuration.nrqlQueries.forEach((q, queryIdx) => {
            if (!q.query) {
              errors.push(`Missing query in page ${pageIdx}, widget ${widgetIdx}, query ${queryIdx}`);
            } else {
              // Basic NRQL validation
              if (!q.query.includes('SELECT')) errors.push('NRQL query must contain SELECT');
              if (!q.query.includes('FROM')) errors.push('NRQL query must contain FROM');
            }
          });
        }
      });
    });
    
    // Check for performance issues
    const timeseriesCount = totalWidgets.toString().match(/TIMESERIES/g)?.length || 0;
    if (timeseriesCount > 50) warnings.push('High number of timeseries widgets may impact performance');
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  /**
   * Create dashboard in New Relic using NerdGraph
   */
  async createDashboardInNewRelic(dashboard) {
    const mutation = `
      mutation CreateDashboard($accountId: Int!, $dashboard: DashboardInput!) {
        dashboardCreate(accountId: $accountId, dashboard: $dashboard) {
          entityResult {
            guid
            name
            permalink
          }
          errors {
            type
            description
          }
        }
      }
    `;
    
    const variables = {
      accountId: parseInt(this.accountId),
      dashboard: this.transformDashboardForAPI(dashboard)
    };
    
    const response = await this.executeNerdGraphQuery(mutation, variables);
    
    if (response.errors || response.data?.dashboardCreate?.errors?.length > 0) {
      throw new Error(`Dashboard creation failed: ${JSON.stringify(response.errors || response.data.dashboardCreate.errors)}`);
    }
    
    return response.data.dashboardCreate.entityResult;
  }
  
  /**
   * Transform dashboard to NerdGraph API format
   */
  transformDashboardForAPI(dashboard) {
    return {
      name: dashboard.name,
      description: dashboard.description,
      permissions: dashboard.permissions,
      pages: dashboard.pages.map(page => ({
        name: page.name,
        description: page.description,
        widgets: page.widgets.map(widget => ({
          title: widget.title,
          layout: {
            row: widget.row,
            column: widget.column,
            width: widget.width,
            height: widget.height
          },
          configuration: this.transformWidgetConfiguration(widget.configuration)
        }))
      })),
      variables: dashboard.variables
    };
  }
  
  /**
   * Transform widget configuration for API
   */
  transformWidgetConfiguration(config) {
    const transformed = { ...config };
    
    // Ensure proper structure for different widget types
    switch (config.type) {
      case 'billboard':
      case 'line':
      case 'area':
      case 'bar':
      case 'pie':
      case 'table':
      case 'histogram':
        transformed.nrqlQueries = config.nrqlQueries.map(q => ({
          accountId: parseInt(this.accountId),
          query: q.query
        }));
        break;
      case 'markdown':
        // Markdown widgets don't need transformation
        break;
    }
    
    return transformed;
  }
  
  /**
   * Execute NerdGraph query
   */
  async executeNerdGraphQuery(query, variables) {
    const endpoint = this.region === 'EU' 
      ? 'api.eu.newrelic.com'
      : 'api.newrelic.com';
    
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({ query, variables });
      
      const options = {
        hostname: endpoint,
        port: 443,
        path: '/graphql',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'API-Key': this.apiKey,
          'Content-Length': Buffer.byteLength(postData)
        }
      };
      
      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (res.statusCode !== 200) {
              reject(new Error(`API error: ${res.statusCode} - ${data}`));
            } else {
              resolve(response);
            }
          } catch (error) {
            reject(error);
          }
        });
      });
      
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }
  
  /**
   * Query entities from New Relic
   */
  async queryEntities(entityType) {
    const query = `
      {
        actor {
          entitySearch(query: "type = '${entityType}'") {
            results {
              entities {
                guid
                name
                tags {
                  key
                  values
                }
                ... on GenericInfrastructureEntity {
                  alertSeverity
                }
              }
            }
          }
        }
      }
    `;
    
    try {
      const response = await this.executeNerdGraphQuery(query);
      return response.data?.actor?.entitySearch?.results?.entities || [];
    } catch (error) {
      this.logger.warn(`Failed to query ${entityType} entities:`, error);
      return [];
    }
  }
  
  /**
   * Generate entity GUID (matching v1 format)
   */
  generateEntityGuid(entityType, ...identifiers) {
    const crypto = require('crypto');
    const compositeKey = identifiers.filter(Boolean).join(':');
    const hash = crypto.createHash('sha256')
      .update(compositeKey)
      .digest('hex')
      .substring(0, 32);
    return `${this.accountId}|INFRA|${entityType}|${hash}`;
  }
  
  /**
   * Calculate health score for cluster
   */
  calculateHealthScore(metrics) {
    let score = 100;
    
    // Deduct points for high resource usage
    if (metrics.totalCpu / metrics.brokerCount > 80) score -= 20;
    if (metrics.totalMemory / metrics.brokerCount > 80) score -= 20;
    
    // Deduct points for low broker count
    if (metrics.brokerCount < 3) score -= 10;
    
    return Math.max(0, score);
  }
  
  /**
   * Generate verification report
   */
  async generateVerificationReport(dashboard) {
    const report = {
      timestamp: new Date().toISOString(),
      dashboard: {
        guid: dashboard.guid,
        name: dashboard.name,
        url: dashboard.permalink
      },
      verification: {
        queriesValidated: true,
        widgetCount: 0,
        pageCount: 0,
        estimatedLoadTime: 0
      },
      recommendations: []
    };
    
    // Count widgets and pages
    const dashboardData = await this.fetchDashboard(dashboard.guid);
    if (dashboardData) {
      report.verification.pageCount = dashboardData.pages?.length || 0;
      report.verification.widgetCount = dashboardData.pages?.reduce(
        (sum, page) => sum + (page.widgets?.length || 0), 0
      ) || 0;
      
      // Estimate load time based on widget count
      report.verification.estimatedLoadTime = Math.ceil(report.verification.widgetCount * 0.5);
      
      // Add recommendations
      if (report.verification.widgetCount > 100) {
        report.recommendations.push('Consider splitting into multiple dashboards for better performance');
      }
      if (report.verification.estimatedLoadTime > 30) {
        report.recommendations.push('Dashboard may be slow to load, consider optimizing queries');
      }
    }
    
    return report;
  }
  
  /**
   * Fetch dashboard details
   */
  async fetchDashboard(guid) {
    const query = `
      {
        actor {
          entity(guid: "${guid}") {
            ... on DashboardEntity {
              pages {
                name
                widgets {
                  title
                }
              }
            }
          }
        }
      }
    `;
    
    try {
      const response = await this.executeNerdGraphQuery(query);
      return response.data?.actor?.entity;
    } catch (error) {
      this.logger.warn('Failed to fetch dashboard details:', error);
      return null;
    }
  }
  
  /**
   * Update health status
   */
  updateHealth(status, duration, error = null) {
    this.health.status = status;
    
    if (status === 'success') {
      this.health.lastSuccess = new Date().toISOString();
      this.health.dashboardsCreated++;
    } else if (status === 'error') {
      this.health.errors++;
      this.health.lastError = {
        timestamp: new Date().toISOString(),
        message: error?.message || 'Unknown error',
        duration
      };
    }
  }
  
  /**
   * Get health status
   */
  getHealth() {
    return {
      ...this.health,
      circuitBreaker: {
        state: this.circuitBreaker.state,
        failures: this.circuitBreaker.failures
      }
    };
  }
  
  /**
   * Handle errors with recovery strategy
   */
  async handleError(error, options) {
    this.logger.error('Dashboard generation failed:', error);
    
    // Implement recovery strategies
    if (error.message.includes('rate limit')) {
      // Wait and retry
      await this.delay(60000);
      return this.generateDashboard(options);
    } else if (error.message.includes('timeout')) {
      // Retry with increased timeout
      this.circuitBreaker.timeout *= 2;
      return this.generateDashboard(options);
    }
    
    // Return error result
    return {
      success: false,
      error: error.message,
      recovery: 'Manual intervention required'
    };
  }
  
  /**
   * Validate configuration
   */
  validateConfiguration() {
    const required = ['accountId', 'apiKey'];
    const missing = required.filter(key => !this.config[key]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required configuration: ${missing.join(', ')}`);
    }
    
    // Validate account ID format
    if (!/^\d+$/.test(this.config.accountId)) {
      throw new Error('Account ID must be numeric');
    }
    
    // Validate API key format
    if (!this.config.apiKey.startsWith('NRAK-')) {
      throw new Error('API key must start with NRAK-');
    }
  }
  
  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Circuit Breaker implementation (missing in v2)
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.threshold = options.threshold || 5;
    this.timeout = options.timeout || 30000;
    this.resetTimeout = options.resetTimeout || 60000;
    
    this.state = 'CLOSED';
    this.failures = 0;
    this.lastFailTime = null;
    this.successCount = 0;
  }
  
  async execute(operation) {
    if (this.state === 'OPEN') {
      const now = Date.now();
      if (now - this.lastFailTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }
    
    try {
      const result = await Promise.race([
        operation(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Operation timeout')), this.timeout)
        )
      ]);
      
      this.onSuccess();
      return result;
      
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  onSuccess() {
    this.failures = 0;
    
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= 3) {
        this.state = 'CLOSED';
      }
    }
  }
  
  onFailure() {
    this.failures++;
    this.lastFailTime = Date.now();
    
    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
    }
  }
}

module.exports = DashboardGenerator;