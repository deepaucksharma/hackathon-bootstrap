/**
 * Dashboard Orchestrator
 * 
 * Orchestrates the complete dashboard creation workflow.
 * Generic orchestration logic independent of content domain.
 */

class DashboardOrchestrator {
  constructor(config = {}) {
    this.config = config;
    this.logger = config.logger || console;
  }

  /**
   * Orchestrate dashboard creation workflow
   */
  async orchestrateDashboardCreation({
    contentProvider,
    templateName,
    variables = {},
    options = {}
  }) {
    const workflow = {
      steps: [],
      metadata: {
        startTime: new Date(),
        templateName,
        variables,
        options
      }
    };

    try {
      // Step 1: Validate inputs
      workflow.steps.push(await this.validateInputs({
        contentProvider,
        templateName,
        variables
      }));

      // Step 2: Prepare template
      workflow.steps.push(await this.prepareTemplate({
        contentProvider,
        templateName,
        variables
      }));

      // Step 3: Process widgets
      workflow.steps.push(await this.processWidgets({
        template: workflow.steps[1].result.template,
        contentProvider,
        variables
      }));

      // Step 4: Optimize layout
      workflow.steps.push(await this.optimizeLayout({
        widgets: workflow.steps[2].result.widgets,
        template: workflow.steps[1].result.template,
        options
      }));

      // Step 5: Finalize dashboard structure
      workflow.steps.push(await this.finalizeDashboard({
        template: workflow.steps[1].result.template,
        layout: workflow.steps[3].result.layout,
        variables,
        options
      }));

      workflow.metadata.endTime = new Date();
      workflow.metadata.duration = workflow.metadata.endTime - workflow.metadata.startTime;
      workflow.metadata.success = true;

      this.logger.log(`✅ Dashboard orchestration completed in ${workflow.metadata.duration}ms`);
      
      return {
        dashboard: workflow.steps[4].result.dashboard,
        workflow,
        metadata: workflow.metadata
      };

    } catch (error) {
      workflow.metadata.endTime = new Date();
      workflow.metadata.error = error.message;
      workflow.metadata.success = false;

      this.logger.error(`❌ Dashboard orchestration failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate orchestration inputs
   */
  async validateInputs({ contentProvider, templateName, variables }) {
    const step = {
      name: 'validate-inputs',
      startTime: new Date()
    };

    try {
      // Validate content provider
      if (!contentProvider || typeof contentProvider.getTemplate !== 'function') {
        throw new Error('Invalid content provider: must implement getTemplate() method');
      }

      // Validate template exists
      const template = contentProvider.getTemplate(templateName);
      if (!template) {
        throw new Error(`Template '${templateName}' not found in content provider`);
      }

      // Validate template structure
      const validation = contentProvider.validateTemplate ? 
        contentProvider.validateTemplate(template) : 
        { valid: true };
        
      if (!validation.valid) {
        throw new Error(`Template validation failed: ${validation.errors?.join(', ')}`);
      }

      step.endTime = new Date();
      step.success = true;
      step.result = { template, validation };
      
      return step;

    } catch (error) {
      step.endTime = new Date();
      step.success = false;
      step.error = error.message;
      throw error;
    }
  }

  /**
   * Prepare template for processing
   */
  async prepareTemplate({ contentProvider, templateName, variables }) {
    const step = {
      name: 'prepare-template',
      startTime: new Date()
    };

    try {
      const template = contentProvider.getTemplate(templateName);
      
      // Process template variables
      const processedTemplate = this.processTemplateVariables(template, variables);
      
      // Add metadata
      processedTemplate.metadata = {
        contentProvider: contentProvider.getMetadata(),
        processedAt: new Date(),
        variables
      };

      step.endTime = new Date();
      step.success = true;
      step.result = { template: processedTemplate };
      
      return step;

    } catch (error) {
      step.endTime = new Date();
      step.success = false;
      step.error = error.message;
      throw error;
    }
  }

  /**
   * Process widgets from template
   */
  async processWidgets({ template, contentProvider, variables }) {
    const step = {
      name: 'process-widgets',
      startTime: new Date()
    };

    try {
      const widgets = [];
      let widgetIndex = 0;

      for (const section of template.sections || []) {
        for (const widgetDef of section.widgets || []) {
          try {
            const widget = await this.processWidget({
              widgetDef,
              contentProvider,
              variables,
              section: section.title,
              index: widgetIndex++
            });
            
            if (widget) {
              widgets.push(widget);
            }
          } catch (widgetError) {
            this.logger.warn(`⚠️  Skipping widget '${widgetDef.title}': ${widgetError.message}`);
          }
        }
      }

      step.endTime = new Date();
      step.success = true;
      step.result = { widgets, widgetCount: widgets.length };
      
      return step;

    } catch (error) {
      step.endTime = new Date();
      step.success = false;
      step.error = error.message;
      throw error;
    }
  }

  /**
   * Process individual widget
   */
  async processWidget({ widgetDef, contentProvider, variables, section, index }) {
    // Get visualization configuration from content provider
    const vizConfig = contentProvider.getVisualizationConfig(widgetDef.type);
    
    return {
      id: this.generateWidgetId(index),
      title: widgetDef.title,
      type: widgetDef.type,
      section,
      layout: {
        column: widgetDef.position?.column || 1,
        row: widgetDef.position?.row || 1,
        width: widgetDef.position?.width || 6,
        height: widgetDef.position?.height || 3
      },
      configuration: {
        ...vizConfig,
        ...(widgetDef.thresholds && { thresholds: widgetDef.thresholds }),
        ...(widgetDef.query && { query: widgetDef.query })
      }
    };
  }

  /**
   * Optimize widget layout
   */
  async optimizeLayout({ widgets, template, options }) {
    const step = {
      name: 'optimize-layout',
      startTime: new Date()
    };

    try {
      // Basic layout optimization logic
      const optimizedWidgets = widgets.map(widget => ({
        ...widget,
        layout: this.optimizeWidgetLayout(widget.layout, options)
      }));

      const layout = {
        widgets: optimizedWidgets,
        groupBy: template.groupBy || 'section',
        optimization: {
          applied: true,
          strategy: options.layoutPreference || 'balanced'
        }
      };

      step.endTime = new Date();
      step.success = true;
      step.result = { layout };
      
      return step;

    } catch (error) {
      step.endTime = new Date();
      step.success = false;
      step.error = error.message;
      throw error;
    }
  }

  /**
   * Finalize dashboard structure
   */
  async finalizeDashboard({ template, layout, variables, options }) {
    const step = {
      name: 'finalize-dashboard',
      startTime: new Date()
    };

    try {
      const dashboard = {
        name: options.name || template.name,
        description: options.description || template.description,
        permissions: options.permissions || 'PUBLIC_READ_WRITE',
        variables: this.extractDashboardVariables(template, variables),
        pages: this.createDashboardPages(layout, template)
      };

      step.endTime = new Date();
      step.success = true;
      step.result = { dashboard };
      
      return step;

    } catch (error) {
      step.endTime = new Date();
      step.success = false;
      step.error = error.message;
      throw error;
    }
  }

  // Helper methods

  processTemplateVariables(template, variables) {
    // Basic variable substitution - can be enhanced
    return JSON.parse(JSON.stringify(template).replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      return variables[varName] || match;
    }));
  }

  optimizeWidgetLayout(layout, options) {
    // Ensure minimum sizes
    return {
      ...layout,
      width: Math.max(layout.width || 6, 3),
      height: Math.max(layout.height || 3, 3)
    };
  }

  extractDashboardVariables(template, variables) {
    const dashboardVariables = [
      { name: 'timeRange', type: 'TIMERANGE', title: 'Time Range' }
    ];
    
    if (template.variables) {
      dashboardVariables.push(...template.variables);
    }
    
    return dashboardVariables;
  }

  createDashboardPages(layout, template) {
    const widgetsBySection = this.groupWidgetsBySection(layout.widgets);
    
    return Object.entries(widgetsBySection).map(([sectionName, widgets]) => ({
      name: sectionName,
      description: `${sectionName} metrics and insights`,
      widgets: widgets.map(widget => ({
        title: widget.title,
        visualization: { id: this.mapVisualizationType(widget.type) },
        layout: widget.layout,
        configuration: widget.configuration
      }))
    }));
  }

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

  mapVisualizationType(type) {
    const typeMap = {
      billboard: 'viz.billboard',
      line: 'viz.line',
      area: 'viz.area',
      bar: 'viz.bar',
      pie: 'viz.pie',
      table: 'viz.table',
      histogram: 'viz.histogram'
    };
    return typeMap[type] || 'viz.line';
  }

  generateWidgetId(index) {
    return `widget-${Date.now()}-${index}`;
  }
}

module.exports = DashboardOrchestrator;