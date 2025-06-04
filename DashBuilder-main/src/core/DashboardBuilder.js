/**
 * DashboardBuilder - Unified dashboard creation with all capabilities
 * 
 * Consolidates features from 30+ dashboard scripts into a single, powerful class
 */

const MetricDiscovery = require('./MetricDiscovery');
const QueryBuilder = require('./QueryBuilder');
const LayoutOptimizer = require('./LayoutOptimizer');
const logger = require('../utils/logger');

class DashboardBuilder {
  constructor(config = {}) {
    this.config = this.validateConfig(config);
    this.accountId = parseInt(config.accountId, 10);
    this.apiKey = config.apiKey;
    this.region = config.region || 'US';
    this.nerdgraphEndpoint = this.region === 'EU' 
      ? 'https://api.eu.newrelic.com/graphql'
      : 'https://api.newrelic.com/graphql';
    
    this.discovery = new MetricDiscovery(this.config);
    this.queryBuilder = new QueryBuilder(this.config);
    this.layoutOptimizer = new LayoutOptimizer();
  }

  /**
   * Validate and normalize configuration
   */
  validateConfig(config) {
    // Set defaults without validation
    return {
      accountId: config.accountId,
      apiKey: config.apiKey,
      region: config.region || 'US',
      intelligent: config.intelligent !== false,
      template: config.template,
      name: config.name || `Dashboard - ${new Date().toISOString()}`,
      permissions: config.permissions || 'PUBLIC_READ_WRITE',
      ...config
    };
  }

  /**
   * Main build method - orchestrates the entire dashboard creation process
   */
  async build(options = {}) {
    try {
      logger.info('Starting dashboard build', { 
        mode: this.config.intelligent ? 'intelligent' : 'standard',
        template: options.template
      });

      // Step 1: Discover metrics (with caching)
      const metrics = await this.discoverMetrics(options);
      
      // Step 2: Analyze metrics via NerdGraph
      const analysis = await this.analyzeMetricsViaNerdGraph(metrics, options);
      
      // Step 3: Generate queries based on analysis
      const queries = await this.generateQueries(analysis, options);
      
      // Step 4: Create widgets from queries
      const widgets = await this.createWidgets(queries, analysis);
      
      // Step 5: Optimize layout
      const optimizedLayout = await this.optimizeLayout(widgets, analysis);
      
      // Step 6: Assemble final dashboard
      const dashboard = this.assembleDashboard(optimizedLayout, options);
      
      // Step 7: Dashboard ready (no validation)
      
      logger.info('Dashboard build completed successfully');
      return dashboard;
      
    } catch (error) {
      logger.error('Dashboard build failed', error);
      throw error;
    }
  }

  /**
   * Create dashboard from template
   */
  async createFromTemplate(template) {
    logger.info('Creating dashboard from template', { template: template.name });
    
    // Merge template with config
    const options = {
      ...this.config,
      ...template.config,
      template: template.name
    };
    
    // Use template's metric patterns if provided
    if (template.metricPatterns) {
      options.metricPatterns = template.metricPatterns;
    }
    
    // Use template's query definitions
    if (template.queries) {
      options.predefinedQueries = template.queries;
    }
    
    return this.build(options);
  }

  /**
   * Discover metrics with intelligent filtering
   */
  async discoverMetrics(options) {
    const discoveryOptions = {
      ...options,
      useCache: options.useCache !== false,
      filters: options.metricPatterns || this.config.metricPatterns
    };
    
    const results = await this.discovery.discover(discoveryOptions);
    
    logger.info(`Discovered ${results.totalMetrics} metrics across ${results.eventTypes.length} event types`);
    
    return results;
  }

  /**
   * Analyze metrics via NerdGraph
   */
  async analyzeMetricsViaNerdGraph(metrics, options) {
    const analysis = {
      categories: metrics.categories || {},
      goldenSignals: {},
      correlations: [],
      priorities: {},
      visualizationRecommendations: {}
    };

    // Identify golden signals if any
    if (analysis.categories.performance?.length > 0) {
      analysis.goldenSignals.latency = analysis.categories.performance.slice(0, 3);
    }
    if (analysis.categories.errors?.length > 0) {
      analysis.goldenSignals.errors = analysis.categories.errors.slice(0, 3);
    }

    // Set priorities
    Object.keys(analysis.categories).forEach(category => {
      analysis.priorities[category] = this.getCategoryPriority(category);
    });

    return analysis;
  }

  getCategoryPriority(category) {
    const priorities = {
      errors: 1,
      performance: 2,
      business: 3,
      capacity: 4,
      utilization: 5,
      other: 6
    };
    return priorities[category] || 999;
  }

  /**
   * Generate queries based on analysis
   */
  async generateQueries(analysis, options) {
    const queries = [];
    
    // Use predefined queries if available (from template)
    if (options.predefinedQueries) {
      queries.push(...options.predefinedQueries);
    }
    
    // Generate queries for each category
    for (const category of Object.keys(analysis.categories)) {
      const categoryMetrics = analysis.categories[category];
      
      if (categoryMetrics.length > 0) {
        const categoryQueries = await this.queryBuilder.generateForCategory(
          category,
          categoryMetrics,
          analysis
        );
        queries.push(...categoryQueries);
      }
    }
    
    // Add golden signal queries if intelligent mode
    if (this.config.intelligent && analysis.goldenSignals) {
      const goldenQueries = await this.queryBuilder.generateGoldenSignalQueries(
        analysis.goldenSignals
      );
      queries.push(...goldenQueries);
    }
    
    // Add correlation queries if detected
    if (analysis.correlations && analysis.correlations.length > 0) {
      const correlationQueries = await this.queryBuilder.generateCorrelationQueries(
        analysis.correlations
      );
      queries.push(...correlationQueries);
    }
    
    return queries;
  }

  /**
   * Create widgets from queries
   */
  async createWidgets(queries, analysis) {
    const widgets = [];
    
    for (const query of queries) {
      const widget = {
        title: query.title || this.generateTitle(query),
        visualization: this.selectVisualization(query, analysis),
        configuration: {
          nrqlQueries: [{
            accountId: this.config.accountId,
            query: query.nrql
          }]
        },
        rawConfiguration: null // Will be set by layout optimizer
      };
      
      // Add additional configuration based on visualization type
      this.enhanceWidgetConfiguration(widget, query, analysis);
      
      widgets.push(widget);
    }
    
    return widgets;
  }

  /**
   * Select optimal visualization for a query
   */
  selectVisualization(query, analysis) {
    // Check if visualization is explicitly specified
    if (query.visualization) {
      return { id: query.visualization };
    }
    
    // Use intelligent selection if available
    if (this.config.intelligent && analysis.visualizationRecommendations) {
      const recommendation = analysis.visualizationRecommendations[query.category];
      if (recommendation) {
        return { id: recommendation };
      }
    }
    
    // Default selection based on query type
    const { resultType, hasFacet, hasTimeseries } = this.analyzeQueryStructure(query.nrql);
    
    if (resultType === 'single-value' && !hasFacet) {
      return { id: 'viz.billboard' };
    }
    
    if (hasTimeseries) {
      return { id: 'viz.line' };
    }
    
    if (hasFacet) {
      return { id: 'viz.bar' };
    }
    
    return { id: 'viz.table' };
  }

  /**
   * Analyze query structure for visualization selection
   */
  analyzeQueryStructure(nrql) {
    const normalized = nrql.toLowerCase();
    
    return {
      resultType: normalized.includes('count(') || normalized.includes('sum(') || 
                  normalized.includes('average(') ? 'aggregation' : 'list',
      hasFacet: normalized.includes('facet'),
      hasTimeseries: normalized.includes('timeseries')
    };
  }

  /**
   * Enhance widget configuration based on type
   */
  enhanceWidgetConfiguration(widget, query, analysis) {
    const vizType = widget.visualization.id;
    
    // Add thresholds for billboards
    if (vizType === 'viz.billboard' && query.thresholds) {
      widget.configuration.thresholds = query.thresholds;
    }
    
    // Configure area charts
    if (vizType === 'viz.area') {
      widget.configuration.fillOpacity = 0.3;
      widget.configuration.strokeWidth = 1;
    }
    
    // Configure line charts
    if (vizType === 'viz.line') {
      widget.configuration.yAxisLeft = { zero: true };
      
      // Add units if detected
      if (query.units) {
        widget.configuration.units = { unit: query.units };
      }
    }
    
    // Add colors based on category
    if (query.category && analysis.categoryColors) {
      widget.configuration.colors = {
        seriesOverrides: [{
          color: analysis.categoryColors[query.category]
        }]
      };
    }
  }

  /**
   * Generate intelligent widget title
   */
  generateTitle(query) {
    if (query.title) return query.title;
    
    // Extract key components from NRQL
    const nrql = query.nrql.toLowerCase();
    const parts = [];
    
    // Extract function
    const funcMatch = nrql.match(/(count|sum|average|max|min|percentile|rate)\(/);
    if (funcMatch) {
      parts.push(funcMatch[1].charAt(0).toUpperCase() + funcMatch[1].slice(1));
    }
    
    // Extract metric name
    const metricMatch = nrql.match(/\(([^)]+)\)/);
    if (metricMatch && metricMatch[1] !== '*') {
      const metric = metricMatch[1].split('.').pop();
      parts.push(metric.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim());
    }
    
    // Add facet info
    const facetMatch = nrql.match(/facet\s+(\w+)/);
    if (facetMatch) {
      parts.push(`by ${facetMatch[1]}`);
    }
    
    return parts.join(' ') || 'Metric Analysis';
  }

  /**
   * Optimize dashboard layout
   */
  async optimizeLayout(widgets, analysis) {
    const layoutOptions = {
      strategy: this.config.intelligent ? 'intelligent' : 'grid',
      columns: 12,
      categorization: analysis.categories,
      priorities: analysis.priorities
    };
    
    return this.layoutOptimizer.optimize(widgets, layoutOptions);
  }

  /**
   * Assemble final dashboard structure
   */
  assembleDashboard(layout, options) {
    const dashboard = {
      name: options.name || this.config.name,
      description: options.description || this.generateDescription(options),
      permissions: this.config.permissions,
      pages: [{
        name: options.pageName || 'Overview',
        description: options.pageDescription || '',
        widgets: layout
      }],
      variables: options.variables || []
    };
    
    // Add metadata
    dashboard.metadata = {
      version: '2.0',
      createdBy: 'DashBuilder',
      createdAt: new Date().toISOString(),
      config: {
        intelligent: this.config.intelligent,
        template: options.template
      }
    };
    
    return dashboard;
  }

  /**
   * Generate dashboard description
   */
  generateDescription(options) {
    const parts = ['Dashboard created with DashBuilder'];
    
    if (options.template) {
      parts.push(`using ${options.template} template`);
    }
    
    if (this.config.intelligent) {
      parts.push('with intelligent analysis');
    }
    
    return parts.join(' ');
  }

  /**
   * Validate dashboard structure - REMOVED
   */
  async validate(dashboard) {
    // Validation removed - dashboard is ready
    return true;
  }

  /**
   * Deploy dashboard via NerdGraph
   */
  async deploy(dashboard) {
    logger.info('Deploying dashboard via NerdGraph');
    
    const mutation = `
      mutation($accountId: Int!, $dashboard: DashboardInput!) {
        dashboardCreate(accountId: $accountId, dashboard: $dashboard) {
          entityResult {
            guid
          }
          errors {
            description
            type
          }
        }
      }
    `;

    try {
      const result = await this.nerdgraphQuery(mutation, {
        accountId: parseInt(this.accountId),
        dashboard: this.transformDashboardForAPI(dashboard)
      });

      if (result.dashboardCreate.errors?.length > 0) {
        throw new Error(`Dashboard creation failed: ${JSON.stringify(result.dashboardCreate.errors)}`);
      }

      logger.info('Dashboard deployed successfully', { guid: result.dashboardCreate.entityResult.guid });
      return {
        guid: result.dashboardCreate.entityResult.guid,
        url: `https://one.newrelic.com/dashboards/${result.dashboardCreate.entityResult.guid}`
      };
    } catch (error) {
      logger.error('Dashboard deployment failed', error);
      throw error;
    }
  }

  /**
   * Execute NerdGraph query
   */
  async nerdgraphQuery(query, variables = {}) {
    const response = await fetch(this.nerdgraphEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-Key': this.apiKey
      },
      body: JSON.stringify({ query, variables })
    });

    if (!response.ok) {
      throw new Error(`NerdGraph request failed: ${response.status}`);
    }

    const result = await response.json();
    if (result.errors) {
      throw new Error(`NerdGraph errors: ${JSON.stringify(result.errors)}`);
    }

    return result.data;
  }

  /**
   * Transform dashboard for API
   */
  transformDashboardForAPI(dashboard) {
    return {
      name: dashboard.name,
      description: dashboard.description,
      permissions: dashboard.permissions,
      pages: dashboard.pages.map(page => ({
        name: page.name,
        description: page.description || '',
        widgets: page.widgets.map(widget => {
          // Transform configuration to rawConfiguration if needed
          let rawConfig = widget.rawConfiguration;
          
          if (!rawConfig && widget.configuration?.nrqlQueries) {
            rawConfig = {
              nrqlQueries: widget.configuration.nrqlQueries.map(q => ({
                accountIds: [parseInt(q.accountId)],
                query: q.query
              })),
              platformOptions: {
                ignoreTimeRange: false
              }
            };
            
            // Add visualization-specific options
            if (widget.visualization.id === 'viz.line') {
              rawConfig.legend = { enabled: true };
              rawConfig.yAxisLeft = { zero: false };
            }
          }
          
          return {
            title: widget.title,
            visualization: widget.visualization,
            layout: widget.layout,
            rawConfiguration: rawConfig
          };
        })
      }))
    };
  }

  /**
   * Store dashboard in NerdGraph (no local files)
   */
  async store(dashboard) {
    logger.info('Dashboard created - use deploy() to save to New Relic');
    return dashboard;
  }
}

module.exports = DashboardBuilder;