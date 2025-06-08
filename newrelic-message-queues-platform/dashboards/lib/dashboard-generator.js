/**
 * Dashboard Generator
 * 
 * High-level interface for generating MESSAGE_QUEUE_* dashboards using the framework
 * and content provider pattern. Simplifies dashboard creation with sensible defaults.
 */

const DashboardFramework = require('../framework/core/dashboard-framework');
const MessageQueuesContentProvider = require('../content/message-queues/message-queues-content-provider');
const DashboardBuilder = require('../builders/dashboard-builder');

class DashboardGenerator {
  constructor(config = {}) {
    this.config = {
      apiKey: config.apiKey || process.env.NEW_RELIC_USER_API_KEY,
      accountId: config.accountId || process.env.NEW_RELIC_ACCOUNT_ID,
      region: config.region || 'US',
      defaultProvider: config.defaultProvider || 'kafka',
      defaultEnvironment: config.defaultEnvironment || 'production',
      ...config
    };

    // Initialize framework with content provider
    this.framework = new DashboardFramework(this.config);
    this.contentProvider = new MessageQueuesContentProvider();
    this.framework.setContentProvider(this.contentProvider);
    
    // Direct builder for custom dashboards
    this.builder = new DashboardBuilder(this.config);
  }

  /**
   * Generate overview dashboard for all message queues
   */
  async generateOverviewDashboard(options = {}) {
    const variables = {
      provider: options.provider || this.config.defaultProvider,
      environment: options.environment || this.config.defaultEnvironment,
      accountId: options.accountId || this.config.accountId,
      timeRange: options.timeRange || 'SINCE 1 hour ago',
      ...options.variables
    };

    const dashboardOptions = {
      name: options.name || `Message Queues Overview - ${variables.environment}`,
      description: options.description || 'Comprehensive overview of message queue infrastructure',
      permissions: options.permissions || 'PUBLIC_READ_WRITE',
      layoutPreference: 'balanced',
      ...options
    };

    try {
      if (options.deploy !== false) {
        return await this.framework.buildAndDeploy('cluster-overview', variables, dashboardOptions);
      } else {
        return await this.framework.buildDashboard('cluster-overview', variables, dashboardOptions);
      }
    } catch (error) {
      console.error('Failed to generate overview dashboard:', error.message);
      throw error;
    }
  }

  /**
   * Generate cluster-specific dashboard
   */
  async generateClusterDashboard(clusterName, options = {}) {
    if (!clusterName) {
      throw new Error('Cluster name is required');
    }

    const variables = {
      clusterName,
      provider: options.provider || this.config.defaultProvider,
      accountId: options.accountId || this.config.accountId,
      timeRange: options.timeRange || 'SINCE 1 hour ago',
      ...options.variables
    };

    const dashboardOptions = {
      name: options.name || `Cluster: ${clusterName}`,
      description: options.description || `Detailed monitoring for ${clusterName} cluster`,
      permissions: options.permissions || 'PUBLIC_READ_WRITE',
      layoutPreference: 'detailed',
      ...options
    };

    try {
      if (options.deploy !== false) {
        return await this.framework.buildAndDeploy('cluster-detail', variables, dashboardOptions);
      } else {
        return await this.framework.buildDashboard('cluster-detail', variables, dashboardOptions);
      }
    } catch (error) {
      console.error(`Failed to generate cluster dashboard for ${clusterName}:`, error.message);
      throw error;
    }
  }

  /**
   * Generate topic analysis dashboard
   */
  async generateTopicDashboard(options = {}) {
    const variables = {
      provider: options.provider || this.config.defaultProvider,
      environment: options.environment || this.config.defaultEnvironment,
      accountId: options.accountId || this.config.accountId,
      topicPattern: options.topicPattern || '*',
      timeRange: options.timeRange || 'SINCE 1 hour ago',
      ...options.variables
    };

    const dashboardOptions = {
      name: options.name || `Topic Analysis - ${variables.environment}`,
      description: options.description || 'Deep dive into topic performance and consumer behavior',
      permissions: options.permissions || 'PUBLIC_READ_WRITE',
      layoutPreference: 'detailed',
      ...options
    };

    try {
      if (options.deploy !== false) {
        return await this.framework.buildAndDeploy('topic-analysis', variables, dashboardOptions);
      } else {
        return await this.framework.buildDashboard('topic-analysis', variables, dashboardOptions);
      }
    } catch (error) {
      console.error('Failed to generate topic dashboard:', error.message);
      throw error;
    }
  }

  /**
   * Generate broker health dashboard
   */
  async generateBrokerDashboard(options = {}) {
    const variables = {
      provider: options.provider || this.config.defaultProvider,
      environment: options.environment || this.config.defaultEnvironment,
      accountId: options.accountId || this.config.accountId,
      clusterName: options.clusterName,
      timeRange: options.timeRange || 'SINCE 1 hour ago',
      ...options.variables
    };

    const dashboardOptions = {
      name: options.name || `Broker Health - ${variables.environment}`,
      description: options.description || 'Broker performance and resource utilization',
      permissions: options.permissions || 'PUBLIC_READ_WRITE',
      layoutPreference: 'performance',
      ...options
    };

    try {
      if (options.deploy !== false) {
        return await this.framework.buildAndDeploy('broker-health', variables, dashboardOptions);
      } else {
        return await this.framework.buildDashboard('broker-health', variables, dashboardOptions);
      }
    } catch (error) {
      console.error('Failed to generate broker dashboard:', error.message);
      throw error;
    }
  }

  /**
   * Generate queue monitoring dashboard (for queue-based providers)
   */
  async generateQueueDashboard(options = {}) {
    const variables = {
      provider: options.provider || 'rabbitmq', // Default to RabbitMQ for queue dashboards
      environment: options.environment || this.config.defaultEnvironment,
      accountId: options.accountId || this.config.accountId,
      queuePattern: options.queuePattern || '*',
      timeRange: options.timeRange || 'SINCE 1 hour ago',
      ...options.variables
    };

    const dashboardOptions = {
      name: options.name || `Queue Monitoring - ${variables.provider}`,
      description: options.description || 'Queue depth, processing times, and consumer activity',
      permissions: options.permissions || 'PUBLIC_READ_WRITE',
      layoutPreference: 'compact',
      ...options
    };

    try {
      if (options.deploy !== false) {
        return await this.framework.buildAndDeploy('queue-monitoring', variables, dashboardOptions);
      } else {
        return await this.framework.buildDashboard('queue-monitoring', variables, dashboardOptions);
      }
    } catch (error) {
      console.error('Failed to generate queue dashboard:', error.message);
      throw error;
    }
  }

  /**
   * Generate multi-provider comparison dashboard
   */
  async generateComparisonDashboard(providers, options = {}) {
    if (!providers || providers.length < 2) {
      throw new Error('At least two providers are required for comparison');
    }

    const dashboardConfig = {
      name: options.name || `Message Queue Comparison - ${providers.join(' vs ')}`,
      description: options.description || 'Side-by-side comparison of different message queue providers',
      permissions: options.permissions || 'PUBLIC_READ_WRITE',
      variables: [
        { name: 'timeRange', type: 'TIMERANGE', title: 'Time Range' },
        { name: 'environment', type: 'ENUM', title: 'Environment', 
          possibleValues: ['production', 'staging', 'development'],
          defaultValue: options.environment || 'production' }
      ],
      pages: []
    };

    // Build comparison pages
    const comparisonPage = {
      name: 'Provider Comparison',
      widgets: []
    };

    let row = 1;
    
    // Header row - provider names
    providers.forEach((provider, index) => {
      comparisonPage.widgets.push({
        type: 'markdown',
        title: `${provider.toUpperCase()} Metrics`,
        position: { row, column: (index * 4) + 1, width: 4, height: 1 },
        markdown: `# ${provider.toUpperCase()}\n\nMetrics for ${provider} message queue infrastructure`
      });
    });

    row += 2;

    // Metrics rows
    const metrics = [
      { name: 'Total Clusters', query: 'SELECT uniqueCount(entity.guid) FROM MESSAGE_QUEUE_CLUSTER_SAMPLE WHERE provider = \'{provider}\' SINCE {{timeRange}}' },
      { name: 'Average Health Score', query: 'SELECT average(cluster.health.score) FROM MESSAGE_QUEUE_CLUSTER_SAMPLE WHERE provider = \'{provider}\' SINCE {{timeRange}}' },
      { name: 'Total Throughput', query: 'SELECT sum(cluster.throughput.total) FROM MESSAGE_QUEUE_CLUSTER_SAMPLE WHERE provider = \'{provider}\' SINCE {{timeRange}}' },
      { name: 'Error Rate', query: 'SELECT average(cluster.error.rate) FROM MESSAGE_QUEUE_CLUSTER_SAMPLE WHERE provider = \'{provider}\' SINCE {{timeRange}}' }
    ];

    metrics.forEach(metric => {
      providers.forEach((provider, index) => {
        comparisonPage.widgets.push({
          type: 'billboard',
          title: metric.name,
          position: { row, column: (index * 4) + 1, width: 4, height: 3 },
          nrql: metric.query.replace('{provider}', provider)
        });
      });
      row += 3;
    });

    // Trend comparison
    comparisonPage.widgets.push({
      type: 'line',
      title: 'Throughput Comparison',
      position: { row, column: 1, width: 12, height: 4 },
      nrql: `SELECT sum(cluster.throughput.total) FROM MESSAGE_QUEUE_CLUSTER_SAMPLE WHERE provider IN (${providers.map(p => `'${p}'`).join(',')}) AND environment = {{environment}} TIMESERIES SINCE {{timeRange}} FACET provider`
    });

    dashboardConfig.pages.push(comparisonPage);

    try {
      return await this.builder.createDashboard(dashboardConfig);
    } catch (error) {
      console.error('Failed to generate comparison dashboard:', error.message);
      throw error;
    }
  }

  /**
   * Generate custom dashboard from configuration
   */
  async generateCustomDashboard(config) {
    if (!config.name) {
      throw new Error('Dashboard name is required');
    }

    try {
      return await this.builder.createDashboard(config);
    } catch (error) {
      console.error('Failed to generate custom dashboard:', error.message);
      throw error;
    }
  }

  /**
   * Generate all standard dashboards for a provider
   */
  async generateProviderSuite(provider, environment, options = {}) {
    console.log(`🚀 Generating complete dashboard suite for ${provider} - ${environment}`);
    
    const results = {
      provider,
      environment,
      dashboards: [],
      errors: []
    };

    // Overview dashboard
    try {
      const overview = await this.generateOverviewDashboard({
        provider,
        environment,
        name: `${provider.toUpperCase()} Overview - ${environment}`,
        ...options
      });
      results.dashboards.push({ type: 'overview', ...overview });
    } catch (error) {
      results.errors.push({ type: 'overview', error: error.message });
    }

    // Broker health dashboard
    try {
      const brokers = await this.generateBrokerDashboard({
        provider,
        environment,
        name: `${provider.toUpperCase()} Brokers - ${environment}`,
        ...options
      });
      results.dashboards.push({ type: 'brokers', ...brokers });
    } catch (error) {
      results.errors.push({ type: 'brokers', error: error.message });
    }

    // Topic analysis dashboard
    try {
      const topics = await this.generateTopicDashboard({
        provider,
        environment,
        name: `${provider.toUpperCase()} Topics - ${environment}`,
        ...options
      });
      results.dashboards.push({ type: 'topics', ...topics });
    } catch (error) {
      results.errors.push({ type: 'topics', error: error.message });
    }

    // Queue monitoring (for queue-based providers)
    if (['rabbitmq', 'sqs', 'azure-servicebus'].includes(provider)) {
      try {
        const queues = await this.generateQueueDashboard({
          provider,
          environment,
          name: `${provider.toUpperCase()} Queues - ${environment}`,
          ...options
        });
        results.dashboards.push({ type: 'queues', ...queues });
      } catch (error) {
        results.errors.push({ type: 'queues', error: error.message });
      }
    }

    console.log(`✅ Generated ${results.dashboards.length} dashboards for ${provider}`);
    if (results.errors.length > 0) {
      console.warn(`⚠️  ${results.errors.length} dashboards failed to generate`);
    }

    return results;
  }

  /**
   * List available templates
   */
  getAvailableTemplates() {
    return this.framework.getAvailableTemplates();
  }

  /**
   * Get template details
   */
  getTemplateDetails(templateName) {
    return this.framework.getTemplateDetails(templateName);
  }

  /**
   * Preview dashboard without deploying
   */
  async previewDashboard(templateName, variables = {}, options = {}) {
    return await this.framework.previewDashboard(templateName, variables, options);
  }
}

module.exports = DashboardGenerator;