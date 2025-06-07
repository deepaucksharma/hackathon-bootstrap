/**
 * Dashboard Framework Core
 * 
 * Generic, reusable framework for building New Relic dashboards from any content domain.
 * Separates framework logic from domain-specific content.
 */

const DashboardOrchestrator = require('./orchestrator');
const NerdGraphClient = require('../utils/nerdgraph-client');
const LayoutEngine = require('./layout-engine');
const TemplateProcessor = require('./template-processor');
const QueryBuilder = require('./query-builder');

/**
 * Main Dashboard Framework Class
 * 
 * Provides a generic interface for building dashboards from content providers.
 */
class DashboardFramework {
  constructor(config = {}) {
    this.config = {
      apiKey: config.apiKey || process.env.NEW_RELIC_USER_API_KEY,
      accountId: config.accountId || process.env.NEW_RELIC_ACCOUNT_ID,
      nerdGraphUrl: config.nerdGraphUrl || 'https://api.newrelic.com/graphql',
      ...config
    };

    // Initialize core components
    this.nerdGraphClient = new NerdGraphClient(this.config);
    this.orchestrator = new DashboardOrchestrator(this.config);
    this.layoutEngine = new LayoutEngine(this.config.layoutOptions || {});
    this.templateProcessor = new TemplateProcessor();
    this.queryBuilder = new QueryBuilder();

    // Content provider (injected)
    this.contentProvider = null;
  }

  /**
   * Set the content provider for domain-specific logic
   */
  setContentProvider(contentProvider) {
    if (!this.implementsInterface(contentProvider, 'IContentProvider')) {
      throw new Error('Content provider must implement IContentProvider interface');
    }
    this.contentProvider = contentProvider;
    return this;
  }

  /**
   * Build dashboard from template and variables
   */
  async buildDashboard(templateName, variables = {}, options = {}) {
    if (!this.contentProvider) {
      throw new Error('Content provider must be set before building dashboards');
    }

    try {
      console.log(`🏗️  Building dashboard from template: ${templateName}`);

      // 1. Get template from content provider
      const template = this.contentProvider.getTemplate(templateName);
      if (!template) {
        throw new Error(`Template '${templateName}' not found in content provider`);
      }

      // 2. Process template with variables
      const processedTemplate = this.templateProcessor.processTemplate(template, variables);

      // 3. Build widgets from template sections
      const widgets = await this.buildWidgetsFromTemplate(processedTemplate, variables);

      // 4. Optimize layout
      const optimizedLayout = this.layoutEngine.optimizeLayout(widgets, {
        layoutPreference: options.layoutPreference || 'balanced',
        groupBy: template.groupBy || 'section'
      });

      // 5. Build dashboard structure
      const dashboard = this.buildDashboardStructure({
        name: options.name || template.name,
        description: options.description || template.description,
        template: processedTemplate,
        layout: optimizedLayout,
        variables: this.extractVariables(processedTemplate),
        options
      });

      // 6. Validate dashboard
      const validation = this.validateDashboard(dashboard);
      if (!validation.valid) {
        throw new Error(`Dashboard validation failed: ${validation.errors.join(', ')}`);
      }

      console.log(`✅ Dashboard built successfully: ${widgets.length} widgets, ${dashboard.pages.length} pages`);
      
      return {
        dashboard,
        metadata: {
          template: templateName,
          widgetCount: widgets.length,
          pageCount: dashboard.pages.length,
          generatedAt: new Date().toISOString(),
          contentProvider: this.contentProvider.getMetadata()
        }
      };

    } catch (error) {
      console.error('❌ Dashboard build failed:', error.message);
      throw error;
    }
  }

  /**
   * Deploy dashboard to New Relic
   */
  async deployDashboard(dashboardResult, options = {}) {
    try {
      console.log(`🚀 Deploying dashboard: ${dashboardResult.dashboard.name}`);

      const result = await this.nerdGraphClient.createDashboard(
        dashboardResult.dashboard,
        options
      );

      console.log(`✅ Dashboard deployed: ${result.name} (${result.guid})`);
      console.log(`🔗 URL: ${result.permalink}`);

      return {
        ...result,
        metadata: dashboardResult.metadata
      };

    } catch (error) {
      console.error('❌ Dashboard deployment failed:', error.message);
      throw error;
    }
  }

  /**
   * Build and deploy in one operation
   */
  async buildAndDeploy(templateName, variables = {}, options = {}) {
    const buildResult = await this.buildDashboard(templateName, variables, options);
    const deployResult = await this.deployDashboard(buildResult, options);
    
    return {
      ...deployResult,
      buildMetadata: buildResult.metadata
    };
  }

  /**
   * List available templates from content provider
   */
  getAvailableTemplates() {
    if (!this.contentProvider) {
      throw new Error('Content provider must be set');
    }
    return this.contentProvider.getTemplates();
  }

  /**
   * Get template details
   */
  getTemplateDetails(templateName) {
    if (!this.contentProvider) {
      throw new Error('Content provider must be set');
    }
    return this.contentProvider.getTemplate(templateName);
  }

  /**
   * Preview dashboard (generate without deploying)
   */
  async previewDashboard(templateName, variables = {}, options = {}) {
    const result = await this.buildDashboard(templateName, variables, options);
    
    // Generate preview HTML
    const previewHtml = this.generatePreviewHtml(result.dashboard);
    
    return {
      ...result,
      preview: previewHtml
    };
  }

  // Private methods

  /**
   * Build widgets from processed template
   */
  async buildWidgetsFromTemplate(template, variables) {
    const widgets = [];

    for (const section of template.sections || []) {
      for (const widgetDef of section.widgets || []) {
        try {
          const widget = await this.buildWidget(widgetDef, variables, section.title);
          if (widget) {
            widgets.push(widget);
          }
        } catch (error) {
          console.warn(`⚠️  Skipping widget '${widgetDef.title}': ${error.message}`);
        }
      }
    }

    return widgets;
  }

  /**
   * Build individual widget
   */
  async buildWidget(widgetDef, variables, sectionTitle) {
    // Build NRQL query
    const nrqlQuery = this.queryBuilder.buildFromDefinition(widgetDef.query, variables);

    // Get visualization configuration
    const vizConfig = this.contentProvider.getVisualizationConfig(widgetDef.type);

    return {
      id: this.generateWidgetId(),
      title: widgetDef.title,
      type: widgetDef.type,
      section: sectionTitle,
      visualization: {
        id: this.mapVisualizationType(widgetDef.type)
      },
      layout: {
        column: widgetDef.position?.column || 1,
        row: widgetDef.position?.row || 1,
        width: widgetDef.position?.width || 6,
        height: widgetDef.position?.height || 3
      },
      configuration: {
        nrqlQueries: [{
          accountId: parseInt(this.config.accountId),
          query: nrqlQuery
        }],
        ...vizConfig,
        ...(widgetDef.thresholds && { thresholds: widgetDef.thresholds })
      }
    };
  }

  /**
   * Build dashboard structure
   */
  buildDashboardStructure({ name, description, template, layout, variables, options }) {
    // Group widgets by section for pages
    const pageGroups = this.groupWidgetsBySection(layout.widgets);

    const pages = Object.entries(pageGroups).map(([sectionName, widgets]) => ({
      name: sectionName,
      description: `${sectionName} metrics and insights`,
      widgets: widgets.map(widget => ({
        title: widget.title,
        visualization: widget.visualization,
        layout: widget.layout,
        configuration: widget.configuration
      }))
    }));

    return {
      name,
      description: description || `Generated dashboard for ${template.entityType || 'metrics'}`,
      permissions: options.permissions || 'PUBLIC_READ_WRITE',
      variables: variables || [],
      pages: pages.length > 0 ? pages : [{
        name: 'Main',
        description: 'Main dashboard page',
        widgets: layout.widgets.map(widget => ({
          title: widget.title,
          visualization: widget.visualization,
          layout: widget.layout,
          configuration: widget.configuration
        }))
      }]
    };
  }

  /**
   * Extract variables from template
   */
  extractVariables(template) {
    const variables = [];
    
    // Add common variables
    variables.push(
      { name: 'timeRange', type: 'TIMERANGE', title: 'Time Range' }
    );

    // Add template-specific variables
    if (template.variables) {
      variables.push(...template.variables);
    }

    // Add entity-specific variables based on entity type
    if (template.entityType) {
      const entityVars = this.contentProvider.getEntityVariables(template.entityType);
      if (entityVars) {
        variables.push(...entityVars);
      }
    }

    return variables;
  }

  /**
   * Group widgets by section for multi-page dashboards
   */
  groupWidgetsBySection(widgets) {
    const groups = {};
    
    widgets.forEach(widget => {
      const section = widget.section || 'Main';
      if (!groups[section]) {
        groups[section] = [];
      }
      groups[section].push(widget);
    });

    return groups;
  }

  /**
   * Validate dashboard structure
   */
  validateDashboard(dashboard) {
    const errors = [];

    // Basic structure validation
    if (!dashboard.name) {
      errors.push('Dashboard name is required');
    }

    if (!dashboard.pages || dashboard.pages.length === 0) {
      errors.push('Dashboard must have at least one page');
    }

    // Validate pages and widgets
    dashboard.pages.forEach((page, pageIndex) => {
      if (!page.widgets || page.widgets.length === 0) {
        errors.push(`Page ${pageIndex + 1} has no widgets`);
      }

      page.widgets.forEach((widget, widgetIndex) => {
        if (!widget.title) {
          errors.push(`Widget ${widgetIndex + 1} on page ${pageIndex + 1} has no title`);
        }

        if (!widget.configuration || !widget.configuration.nrqlQueries) {
          errors.push(`Widget ${widgetIndex + 1} on page ${pageIndex + 1} has no NRQL queries`);
        }
      });
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Generate preview HTML
   */
  generatePreviewHtml(dashboard) {
    const pages = dashboard.pages.map(page => {
      const widgets = page.widgets.map(widget => `
        <div class="widget" style="
          grid-column: span ${widget.layout.width || 6}; 
          grid-row: span ${widget.layout.height || 3};
          border: 1px solid #ddd; 
          padding: 10px; 
          background: #f9f9f9;
        ">
          <h4>${widget.title}</h4>
          <div class="viz-type">${widget.visualization.id}</div>
          <pre style="font-size: 10px; overflow: hidden;">${
            widget.configuration.nrqlQueries[0]?.query || 'No query'
          }</pre>
        </div>
      `).join('');

      return `
        <div class="page">
          <h3>${page.name}</h3>
          <div class="dashboard-grid" style="
            display: grid; 
            grid-template-columns: repeat(12, 1fr); 
            gap: 10px; 
            margin: 20px 0;
          ">
            ${widgets}
          </div>
        </div>
      `;
    }).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${dashboard.name} - Preview</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
          .dashboard { background: white; padding: 20px; border-radius: 8px; }
          .page { margin-bottom: 30px; }
          .widget h4 { margin: 0 0 10px 0; color: #333; }
          .viz-type { font-size: 12px; color: #666; margin-bottom: 5px; }
          pre { margin: 0; white-space: pre-wrap; }
        </style>
      </head>
      <body>
        <div class="dashboard">
          <h1>${dashboard.name}</h1>
          <p>${dashboard.description}</p>
          ${pages}
        </div>
      </body>
      </html>
    `;
  }

  // Utility methods

  /**
   * Check if object implements interface
   */
  implementsInterface(obj, interfaceName) {
    const interfaces = {
      'IContentProvider': ['getTemplates', 'getTemplate', 'getVisualizationConfig', 'getMetadata']
    };

    const requiredMethods = interfaces[interfaceName];
    if (!requiredMethods) return false;

    return requiredMethods.every(method => typeof obj[method] === 'function');
  }

  /**
   * Generate unique widget ID
   */
  generateWidgetId() {
    return `widget-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Map widget type to New Relic visualization ID
   */
  mapVisualizationType(type) {
    const typeMap = {
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

    return typeMap[type] || 'viz.line';
  }
}

module.exports = DashboardFramework;