/**
 * Dashboard Builder
 * 
 * Creates sophisticated New Relic dashboards for MESSAGE_QUEUE_* entities
 * with responsive design, custom widgets, and performance optimization.
 */

const https = require('https');

class DashboardBuilder {
  constructor(config = {}) {
    this.config = {
      apiKey: config.apiKey || process.env.NEW_RELIC_USER_API_KEY,
      accountId: config.accountId || process.env.NEW_RELIC_ACCOUNT_ID,
      nerdGraphUrl: config.nerdGraphUrl || 'https://api.newrelic.com/graphql',
      region: config.region || 'US',
      defaultRefreshRate: config.defaultRefreshRate || 60,
      defaultTimeRange: config.defaultTimeRange || 'SINCE 1 hour ago',
      ...config
    };

    // Initialize helper classes (some are defined at bottom of file)
    this.responsiveDesign = new ResponsiveDesign();
    this.variableManager = new VariableManager();
    
    // Widget builder (inline for now)
    this.widgetBuilder = {
      createWidget: (config) => this.createWidget(config)
    };
  }

  /**
   * Build dashboard configuration (alias for createDashboard)
   */
  buildDashboard(dashboardConfig) {
    return this.createDashboardConfig(dashboardConfig);
  }

  /**
   * Create dashboard configuration without deploying
   */
  createDashboardConfig(dashboardConfig) {
    const dashboard = {
      name: dashboardConfig.name,
      description: dashboardConfig.description || '',
      permissions: dashboardConfig.permissions || 'PUBLIC_READ_WRITE',
      variables: dashboardConfig.variables || [],
      pages: dashboardConfig.pages || []
    };

    return dashboard;
  }

  /**
   * Create a complete dashboard from template
   */
  async createDashboard(dashboardConfig) {
    if (!this.config.apiKey) {
      throw new Error('New Relic User API key is required for dashboard creation');
    }

    const dashboard = {
      name: dashboardConfig.name,
      description: dashboardConfig.description || '',
      permissions: dashboardConfig.permissions || 'PUBLIC_READ_WRITE',
      variables: this.variableManager.createVariables(dashboardConfig.variables || []),
      pages: []
    };

    // Create pages based on configuration
    for (const pageConfig of dashboardConfig.pages || []) {
      const page = await this.createPage(pageConfig);
      dashboard.pages.push(page);
    }

    // Apply responsive design
    dashboard.pages = this.responsiveDesign.applyResponsiveLayout(dashboard.pages);

    // Create dashboard via NerdGraph
    const mutation = this.buildCreateDashboardMutation(dashboard);
    const result = await this.executeNerdGraphQuery(mutation);

    if (result.errors) {
      throw new Error(`Dashboard creation failed: ${JSON.stringify(result.errors)}`);
    }

    const createdDashboard = result.data.dashboardCreate;
    console.log(`Created dashboard: ${createdDashboard.name} (${createdDashboard.guid})`);
    
    return createdDashboard;
  }

  /**
   * Create a dashboard page
   */
  async createPage(pageConfig) {
    const page = {
      name: pageConfig.name,
      description: pageConfig.description || '',
      widgets: []
    };

    // Create widgets for the page
    for (const widgetConfig of pageConfig.widgets || []) {
      const widget = await this.widgetBuilder.createWidget(widgetConfig);
      page.widgets.push(widget);
    }

    return page;
  }

  /**
   * Create overview dashboard
   */
  async createOverviewDashboard(config = {}) {
    const dashboardConfig = {
      name: config.name || 'Message Queues Overview',
      description: 'Comprehensive overview of message queue infrastructure across all providers',
      permissions: 'PUBLIC_READ_WRITE',
      variables: [
        { name: 'account', type: 'ACCOUNT', title: 'Account' },
        { name: 'provider', type: 'ENUM', title: 'Provider', 
          possibleValues: ['kafka', 'rabbitmq', 'sqs', 'azure-servicebus'] },
        { name: 'environment', type: 'ENUM', title: 'Environment',
          possibleValues: ['production', 'staging', 'development'] },
        { name: 'timeRange', type: 'TIMERANGE', title: 'Time Range' }
      ],
      pages: [
        {
          name: 'Infrastructure Overview',
          widgets: [
            // Top KPI row
            { type: 'billboard', title: 'Total Clusters', position: { row: 1, column: 1, width: 3, height: 3 },
              nrql: 'FROM MESSAGE_QUEUE_CLUSTER_SAMPLE SELECT uniqueCount(entity.guid) WHERE provider = {{provider}} SINCE {{timeRange}}' },
            { type: 'billboard', title: 'Healthy Clusters', position: { row: 1, column: 4, width: 3, height: 3 },
              nrql: 'FROM MESSAGE_QUEUE_CLUSTER_SAMPLE SELECT percentage(uniqueCount(entity.guid), WHERE cluster.health.score >= 80) WHERE provider = {{provider}} SINCE {{timeRange}}' },
            { type: 'billboard', title: 'Total Throughput', position: { row: 1, column: 7, width: 3, height: 3 },
              nrql: 'FROM MESSAGE_QUEUE_CLUSTER_SAMPLE SELECT sum(cluster.throughput.total) WHERE provider = {{provider}} SINCE {{timeRange}}' },
            { type: 'billboard', title: 'Error Rate', position: { row: 1, column: 10, width: 3, height: 3 },
              nrql: 'FROM MESSAGE_QUEUE_CLUSTER_SAMPLE SELECT average(cluster.error.rate) WHERE provider = {{provider}} SINCE {{timeRange}}' },

            // Charts row
            { type: 'line', title: 'Cluster Health Trends', position: { row: 4, column: 1, width: 6, height: 4 },
              nrql: 'FROM MESSAGE_QUEUE_CLUSTER_SAMPLE SELECT average(cluster.health.score) WHERE provider = {{provider}} TIMESERIES SINCE {{timeRange}} FACET clusterName' },
            { type: 'area', title: 'Throughput by Provider', position: { row: 4, column: 7, width: 6, height: 4 },
              nrql: 'FROM MESSAGE_QUEUE_CLUSTER_SAMPLE SELECT sum(cluster.throughput.total) WHERE provider = {{provider}} TIMESERIES SINCE {{timeRange}} FACET provider' },

            // Infrastructure table
            { type: 'table', title: 'Cluster Status', position: { row: 8, column: 1, width: 12, height: 4 },
              nrql: 'FROM MESSAGE_QUEUE_CLUSTER_SAMPLE SELECT clusterName, latest(cluster.health.score) as Health, latest(cluster.throughput.total) as Throughput, latest(cluster.availability) as Availability WHERE provider = {{provider}} SINCE {{timeRange}} FACET clusterName' }
          ]
        },
        {
          name: 'Performance Analysis',
          widgets: [
            // Broker performance
            { type: 'line', title: 'Broker CPU Usage', position: { row: 1, column: 1, width: 6, height: 4 },
              nrql: 'FROM MESSAGE_QUEUE_BROKER_SAMPLE SELECT average(broker.cpu.usage) WHERE provider = {{provider}} TIMESERIES SINCE {{timeRange}} FACET hostname' },
            { type: 'line', title: 'Broker Memory Usage', position: { row: 1, column: 7, width: 6, height: 4 },
              nrql: 'FROM MESSAGE_QUEUE_BROKER_SAMPLE SELECT average(broker.memory.usage) WHERE provider = {{provider}} TIMESERIES SINCE {{timeRange}} FACET hostname' },

            // Topic performance
            { type: 'area', title: 'Topic Throughput', position: { row: 5, column: 1, width: 8, height: 4 },
              nrql: 'FROM MESSAGE_QUEUE_TOPIC_SAMPLE SELECT sum(topic.throughput.in) as Inbound, sum(topic.throughput.out) as Outbound WHERE provider = {{provider}} TIMESERIES SINCE {{timeRange}}' },
            { type: 'line', title: 'Consumer Lag', position: { row: 5, column: 9, width: 4, height: 4 },
              nrql: 'FROM MESSAGE_QUEUE_TOPIC_SAMPLE SELECT max(topic.consumer.lag) WHERE provider = {{provider}} TIMESERIES SINCE {{timeRange}} FACET topic' },

            // Queue performance (if applicable)
            { type: 'line', title: 'Queue Depth', position: { row: 9, column: 1, width: 6, height: 4 },
              nrql: 'FROM MESSAGE_QUEUE_QUEUE_SAMPLE SELECT average(queue.depth) WHERE provider = {{provider}} TIMESERIES SINCE {{timeRange}} FACET queueName' },
            { type: 'histogram', title: 'Processing Time Distribution', position: { row: 9, column: 7, width: 6, height: 4 },
              nrql: 'FROM MESSAGE_QUEUE_QUEUE_SAMPLE SELECT histogram(queue.processing.time, 50, 20) WHERE provider = {{provider}} SINCE {{timeRange}}' }
          ]
        }
      ]
    };

    return this.createDashboard(dashboardConfig);
  }

  /**
   * Create cluster-specific dashboard
   */
  async createClusterDashboard(clusterName, config = {}) {
    const dashboardConfig = {
      name: config.name || `Cluster: ${clusterName}`,
      description: `Detailed monitoring for ${clusterName} cluster`,
      permissions: 'PUBLIC_READ_WRITE',
      variables: [
        { name: 'clusterName', type: 'STRING', title: 'Cluster Name', defaultValue: clusterName },
        { name: 'timeRange', type: 'TIMERANGE', title: 'Time Range' }
      ],
      pages: [
        {
          name: 'Cluster Health',
          widgets: [
            // Health KPIs
            { type: 'billboard', title: 'Health Score', position: { row: 1, column: 1, width: 3, height: 3 },
              nrql: `FROM MESSAGE_QUEUE_CLUSTER_SAMPLE SELECT latest(cluster.health.score) WHERE clusterName = '${clusterName}' SINCE {{timeRange}}`,
              thresholds: [{ alertSeverity: 'CRITICAL', value: 60 }, { alertSeverity: 'WARNING', value: 80 }] },
            { type: 'billboard', title: 'Availability', position: { row: 1, column: 4, width: 3, height: 3 },
              nrql: `FROM MESSAGE_QUEUE_CLUSTER_SAMPLE SELECT latest(cluster.availability) WHERE clusterName = '${clusterName}' SINCE {{timeRange}}` },
            { type: 'billboard', title: 'Error Rate', position: { row: 1, column: 7, width: 3, height: 3 },
              nrql: `FROM MESSAGE_QUEUE_CLUSTER_SAMPLE SELECT latest(cluster.error.rate) WHERE clusterName = '${clusterName}' SINCE {{timeRange}}` },
            { type: 'billboard', title: 'Throughput', position: { row: 1, column: 10, width: 3, height: 3 },
              nrql: `FROM MESSAGE_QUEUE_CLUSTER_SAMPLE SELECT latest(cluster.throughput.total) WHERE clusterName = '${clusterName}' SINCE {{timeRange}}` },

            // Trend charts
            { type: 'line', title: 'Health Trends', position: { row: 4, column: 1, width: 12, height: 4 },
              nrql: `FROM MESSAGE_QUEUE_CLUSTER_SAMPLE SELECT cluster.health.score, cluster.availability, cluster.error.rate WHERE clusterName = '${clusterName}' TIMESERIES SINCE {{timeRange}}` }
          ]
        },
        {
          name: 'Broker Details',
          widgets: [
            // Broker status table
            { type: 'table', title: 'Broker Status', position: { row: 1, column: 1, width: 12, height: 6 },
              nrql: `FROM MESSAGE_QUEUE_BROKER_SAMPLE SELECT hostname, latest(broker.cpu.usage) as CPU, latest(broker.memory.usage) as Memory, latest(broker.request.latency) as Latency, latest(status) as Status WHERE clusterName = '${clusterName}' SINCE {{timeRange}} FACET hostname` },

            // Broker performance
            { type: 'line', title: 'CPU Usage by Broker', position: { row: 7, column: 1, width: 6, height: 4 },
              nrql: `FROM MESSAGE_QUEUE_BROKER_SAMPLE SELECT average(broker.cpu.usage) WHERE clusterName = '${clusterName}' TIMESERIES SINCE {{timeRange}} FACET hostname` },
            { type: 'line', title: 'Memory Usage by Broker', position: { row: 7, column: 7, width: 6, height: 4 },
              nrql: `FROM MESSAGE_QUEUE_BROKER_SAMPLE SELECT average(broker.memory.usage) WHERE clusterName = '${clusterName}' TIMESERIES SINCE {{timeRange}} FACET hostname` }
          ]
        },
        {
          name: 'Topic Analysis',
          widgets: [
            // Topic performance table
            { type: 'table', title: 'Topic Performance', position: { row: 1, column: 1, width: 12, height: 6 },
              nrql: `FROM MESSAGE_QUEUE_TOPIC_SAMPLE SELECT topic, latest(topic.throughput.in) as 'Inbound Rate', latest(topic.throughput.out) as 'Outbound Rate', latest(topic.consumer.lag) as 'Consumer Lag', latest(topic.error.rate) as 'Error Rate' WHERE clusterName = '${clusterName}' SINCE {{timeRange}} FACET topic` },

            // Topic trends
            { type: 'area', title: 'Topic Throughput Trends', position: { row: 7, column: 1, width: 8, height: 4 },
              nrql: `FROM MESSAGE_QUEUE_TOPIC_SAMPLE SELECT sum(topic.throughput.in) as Inbound, sum(topic.throughput.out) as Outbound WHERE clusterName = '${clusterName}' TIMESERIES SINCE {{timeRange}}` },
            { type: 'line', title: 'Consumer Lag by Topic', position: { row: 7, column: 9, width: 4, height: 4 },
              nrql: `FROM MESSAGE_QUEUE_TOPIC_SAMPLE SELECT max(topic.consumer.lag) WHERE clusterName = '${clusterName}' TIMESERIES SINCE {{timeRange}} FACET topic LIMIT 10` }
          ]
        }
      ]
    };

    return this.createDashboard(dashboardConfig);
  }

  /**
   * Build NerdGraph mutation for dashboard creation
   */
  buildCreateDashboardMutation(dashboard) {
    return `
      mutation {
        dashboardCreate(
          accountId: ${this.config.accountId}
          dashboard: {
            name: "${dashboard.name}"
            description: "${dashboard.description}"
            permissions: ${dashboard.permissions}
            variables: ${JSON.stringify(dashboard.variables)}
            pages: ${JSON.stringify(dashboard.pages).replace(/"/g, '\\"')}
          }
        ) {
          guid
          name
          permalink
          createdAt
          updatedAt
          errors {
            description
            type
          }
        }
      }
    `;
  }

  /**
   * Execute NerdGraph query
   */
  async executeNerdGraphQuery(query) {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({ query });
      const urlObj = new URL(this.config.nerdGraphUrl);
      
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'API-Key': this.config.apiKey,
          'User-Agent': 'newrelic-message-queues-platform/1.0.0'
        }
      };

      const req = https.request(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          try {
            const result = JSON.parse(responseData);
            resolve(result);
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.setTimeout(30000);
      req.write(payload);
      req.end();
    });
  }

  /**
   * Update existing dashboard
   */
  async updateDashboard(dashboardGuid, updates) {
    const mutation = `
      mutation {
        dashboardUpdate(
          guid: "${dashboardGuid}"
          dashboard: ${JSON.stringify(updates).replace(/"/g, '\\"')}
        ) {
          guid
          name
          updatedAt
          errors {
            description
            type
          }
        }
      }
    `;

    const result = await this.executeNerdGraphQuery(mutation);
    
    if (result.errors) {
      throw new Error(`Dashboard update failed: ${JSON.stringify(result.errors)}`);
    }

    return result.data.dashboardUpdate;
  }

  /**
   * Delete dashboard
   */
  async deleteDashboard(dashboardGuid) {
    const mutation = `
      mutation {
        dashboardDelete(guid: "${dashboardGuid}") {
          status
          errors {
            description
            type
          }
        }
      }
    `;

    const result = await this.executeNerdGraphQuery(mutation);
    
    if (result.errors) {
      throw new Error(`Dashboard deletion failed: ${JSON.stringify(result.errors)}`);
    }

    return result.data.dashboardDelete;
  }

  /**
   * Export dashboard configuration
   */
  async exportDashboard(dashboardGuid) {
    const query = `
      query {
        actor {
          entity(guid: "${dashboardGuid}") {
            ... on DashboardEntity {
              name
              description
              permissions
              variables {
                name
                type
                title
                defaultValue
                possibleValues
              }
              pages {
                name
                description
                widgets {
                  id
                  title
                  visualization {
                    id
                  }
                  layout {
                    column
                    row
                    width
                    height
                  }
                  configuration
                }
              }
            }
          }
        }
      }
    `;

    const result = await this.executeNerdGraphQuery(query);
    
    if (result.errors) {
      throw new Error(`Dashboard export failed: ${JSON.stringify(result.errors)}`);
    }

    return result.data.actor.entity;
  }

  /**
   * Create widget (delegated to WidgetBuilder)
   */
  createWidget(widgetConfig) {
    const widgetBuilder = new WidgetBuilder(this.config);
    return widgetBuilder.createWidget(widgetConfig);
  }
}

/**
 * Widget Builder
 * 
 * Creates different types of dashboard widgets
 */
class WidgetBuilder {
  constructor(config) {
    this.config = config;
  }

  /**
   * Create widget based on configuration
   */
  createWidget(widgetConfig) {
    // Handle both new format and legacy format
    const widget = {
      title: widgetConfig.title,
      layout: {
        column: widgetConfig.column || widgetConfig.position?.column || 1,
        row: widgetConfig.row || widgetConfig.position?.row || 1,
        width: widgetConfig.width || widgetConfig.position?.width || 6,
        height: widgetConfig.height || widgetConfig.position?.height || 3
      },
      visualization: { 
        id: this.getVisualizationId(widgetConfig.visualization || widgetConfig.type || 'billboard') 
      },
      configuration: this.buildWidgetConfiguration(widgetConfig)
    };

    return widget;
  }

  /**
   * Get visualization ID for widget type
   */
  getVisualizationId(type) {
    const visualizationMap = {
      billboard: 'viz.billboard',
      line: 'viz.line',
      area: 'viz.area',
      bar: 'viz.bar',
      pie: 'viz.pie',
      table: 'viz.table',
      histogram: 'viz.histogram',
      heatmap: 'viz.heatmap',
      markdown: 'viz.markdown'
    };

    return visualizationMap[type] || 'viz.billboard';
  }

  /**
   * Build widget configuration
   */
  buildWidgetConfiguration(widgetConfig) {
    const config = {
      dataFormatters: [],
      nrqlQueries: [
        {
          accountId: this.config.accountId,
          query: widgetConfig.nrql
        }
      ]
    };

    // Add type-specific configuration
    if (widgetConfig.type === 'billboard') {
      config.thresholds = widgetConfig.thresholds || [];
    }

    if (widgetConfig.type === 'table') {
      config.dataFormatters = widgetConfig.formatters || [];
    }

    return config;
  }
}

/**
 * Template Engine
 * 
 * Manages dashboard templates
 */
class TemplateEngine {
  constructor() {
    this.templates = new Map();
    this.initializeTemplates();
  }

  /**
   * Initialize built-in templates
   */
  initializeTemplates() {
    // Add built-in templates
    this.templates.set('overview', this.getOverviewTemplate());
    this.templates.set('cluster', this.getClusterTemplate());
    this.templates.set('performance', this.getPerformanceTemplate());
    this.templates.set('operations', this.getOperationsTemplate());
  }

  /**
   * Get overview template
   */
  getOverviewTemplate() {
    return {
      name: 'Message Queues Overview',
      description: 'High-level overview of message queue infrastructure',
      variables: ['account', 'provider', 'environment', 'timeRange'],
      pages: ['Infrastructure Overview', 'Performance Analysis', 'Health Summary']
    };
  }

  /**
   * Get cluster template
   */
  getClusterTemplate() {
    return {
      name: 'Cluster Deep Dive',
      description: 'Detailed analysis of a specific cluster',
      variables: ['clusterName', 'timeRange'],
      pages: ['Cluster Health', 'Broker Details', 'Topic Analysis', 'Consumer Groups']
    };
  }

  /**
   * Get performance template
   */
  getPerformanceTemplate() {
    return {
      name: 'Performance Optimization',
      description: 'Performance metrics and optimization insights',
      variables: ['account', 'provider', 'timeRange'],
      pages: ['Throughput Analysis', 'Latency Metrics', 'Resource Utilization', 'Bottleneck Detection']
    };
  }

  /**
   * Get operations template
   */
  getOperationsTemplate() {
    return {
      name: 'Operations Dashboard',
      description: 'Operational metrics and alerting',
      variables: ['account', 'environment', 'timeRange'],
      pages: ['System Health', 'Alert Status', 'Capacity Planning', 'SLA Tracking']
    };
  }
}

/**
 * Variable Manager
 * 
 * Manages dashboard variables
 */
class VariableManager {
  /**
   * Create dashboard variables
   */
  createVariables(variableConfigs) {
    return variableConfigs.map(config => this.createVariable(config));
  }

  /**
   * Create individual variable
   */
  createVariable(config) {
    const variable = {
      name: config.name,
      type: config.type,
      title: config.title || config.name
    };

    if (config.defaultValue) {
      variable.defaultValue = config.defaultValue;
    }

    if (config.possibleValues) {
      variable.possibleValues = config.possibleValues;
    }

    if (config.isMultiSelection) {
      variable.isMultiSelection = config.isMultiSelection;
    }

    return variable;
  }
}

/**
 * Responsive Design
 * 
 * Applies responsive design patterns
 */
class ResponsiveDesign {
  /**
   * Apply responsive layout to dashboard pages
   */
  applyResponsiveLayout(pages) {
    return pages.map(page => ({
      ...page,
      widgets: this.optimizeWidgetLayout(page.widgets)
    }));
  }

  /**
   * Optimize widget layout for responsive design
   */
  optimizeWidgetLayout(widgets) {
    return widgets.map(widget => {
      // Ensure minimum widget sizes
      if (widget.layout.width < 3) widget.layout.width = 3;
      if (widget.layout.height < 3) widget.layout.height = 3;

      // Add responsive classes
      widget.layout.responsive = this.getResponsiveClasses(widget);

      return widget;
    });
  }

  /**
   * Get responsive classes for widget
   */
  getResponsiveClasses(widget) {
    return {
      mobile: widget.layout.width > 6 ? 'full-width' : 'half-width',
      tablet: widget.layout.width > 8 ? 'full-width' : 'auto',
      desktop: 'auto'
    };
  }
}

module.exports = DashboardBuilder;