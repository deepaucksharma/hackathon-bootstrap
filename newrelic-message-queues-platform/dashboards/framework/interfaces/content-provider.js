/**
 * Content Provider Interface
 * 
 * Defines the contract for domain-specific content providers.
 * Implementations provide templates, entity schemas, and domain knowledge.
 */

/**
 * Base Content Provider Interface
 * 
 * All content providers must implement these methods to work with the dashboard framework.
 */
class IContentProvider {
  /**
   * Get all available templates
   * @returns {Object} Map of template names to template definitions
   */
  getTemplates() {
    throw new Error('getTemplates() must be implemented by content provider');
  }

  /**
   * Get specific template by name
   * @param {string} templateName - Name of the template
   * @returns {Object} Template definition
   */
  getTemplate(templateName) {
    throw new Error('getTemplate() must be implemented by content provider');
  }

  /**
   * Get visualization configuration for widget type
   * @param {string} widgetType - Type of widget (billboard, line, etc.)
   * @returns {Object} Visualization-specific configuration
   */
  getVisualizationConfig(widgetType) {
    throw new Error('getVisualizationConfig() must be implemented by content provider');
  }

  /**
   * Get entity variables for dashboard filtering
   * @param {string} entityType - Type of entity
   * @returns {Array} Array of variable definitions
   */
  getEntityVariables(entityType) {
    throw new Error('getEntityVariables() must be implemented by content provider');
  }

  /**
   * Get provider metadata
   * @returns {Object} Metadata about this content provider
   */
  getMetadata() {
    throw new Error('getMetadata() must be implemented by content provider');
  }

  /**
   * Get entity schemas (optional)
   * @returns {Object} Map of entity types to schemas
   */
  getEntitySchemas() {
    return {};
  }

  /**
   * Get widget definitions (optional)
   * @returns {Object} Map of widget types to definitions
   */
  getWidgetDefinitions() {
    return {};
  }

  /**
   * Validate template (optional)
   * @param {Object} template - Template to validate
   * @returns {Object} Validation result
   */
  validateTemplate(template) {
    return { valid: true, errors: [] };
  }
}

/**
 * Abstract Content Provider Base Class
 * 
 * Provides common functionality for content providers.
 */
class BaseContentProvider extends IContentProvider {
  constructor(config = {}) {
    super();
    this.config = config;
    this.templates = new Map();
    this.entitySchemas = new Map();
    this.widgetDefinitions = new Map();
    this.visualizationConfigs = new Map();
    
    this.initializeDefaults();
  }

  /**
   * Initialize default configurations
   */
  initializeDefaults() {
    // Default visualization configurations
    this.visualizationConfigs.set('billboard', {
      thresholds: []
    });

    this.visualizationConfigs.set('line', {
      legend: { enabled: true },
      yAxisLeft: { zero: true }
    });

    this.visualizationConfigs.set('area', {
      legend: { enabled: true },
      yAxisLeft: { zero: true },
      facet: { showOtherSeries: false }
    });

    this.visualizationConfigs.set('table', {
      facet: { showOtherSeries: false }
    });

    this.visualizationConfigs.set('pie', {
      facet: { showOtherSeries: false },
      legend: { enabled: true }
    });

    this.visualizationConfigs.set('bar', {
      legend: { enabled: true }
    });
  }

  /**
   * Register a template
   */
  registerTemplate(name, template) {
    this.templates.set(name, template);
  }

  /**
   * Register an entity schema
   */
  registerEntitySchema(entityType, schema) {
    this.entitySchemas.set(entityType, schema);
  }

  /**
   * Register a widget definition
   */
  registerWidgetDefinition(type, definition) {
    this.widgetDefinitions.set(type, definition);
  }

  /**
   * Register visualization configuration
   */
  registerVisualizationConfig(type, config) {
    this.visualizationConfigs.set(type, config);
  }

  // Interface implementations

  getTemplates() {
    return Object.fromEntries(this.templates);
  }

  getTemplate(templateName) {
    return this.templates.get(templateName);
  }

  getVisualizationConfig(widgetType) {
    return this.visualizationConfigs.get(widgetType) || {};
  }

  getEntitySchemas() {
    return Object.fromEntries(this.entitySchemas);
  }

  getWidgetDefinitions() {
    return Object.fromEntries(this.widgetDefinitions);
  }

  /**
   * Helper method to build template
   */
  buildTemplate({
    name,
    description,
    entityType,
    variables = [],
    sections = [],
    groupBy = 'section',
    tags = []
  }) {
    return {
      name,
      description,
      entityType,
      variables,
      sections,
      groupBy,
      tags,
      version: '1.0',
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Helper method to build widget definition
   */
  buildWidget({
    type,
    title,
    query,
    position = {},
    thresholds = [],
    formatters = []
  }) {
    return {
      type,
      title,
      query,
      position: {
        column: position.column || 1,
        row: position.row || 1,
        width: position.width || 6,
        height: position.height || 3,
        ...position
      },
      ...(thresholds.length > 0 && { thresholds }),
      ...(formatters.length > 0 && { formatters })
    };
  }

  /**
   * Helper method to build query definition
   */
  buildQuery({
    from,
    select,
    where = [],
    facet = null,
    since = '{{timeRange}}',
    timeseries = false,
    limit = null
  }) {
    return {
      from,
      select,
      where,
      ...(facet && { facet }),
      since,
      ...(timeseries && { timeseries }),
      ...(limit && { limit })
    };
  }

  /**
   * Validate template structure
   */
  validateTemplate(template) {
    const errors = [];

    if (!template.name) {
      errors.push('Template name is required');
    }

    if (!template.sections || template.sections.length === 0) {
      errors.push('Template must have at least one section');
    }

    if (template.sections) {
      template.sections.forEach((section, sectionIndex) => {
        if (!section.title) {
          errors.push(`Section ${sectionIndex + 1} must have a title`);
        }

        if (!section.widgets || section.widgets.length === 0) {
          errors.push(`Section "${section.title}" must have at least one widget`);
        }

        if (section.widgets) {
          section.widgets.forEach((widget, widgetIndex) => {
            if (!widget.type) {
              errors.push(`Widget ${widgetIndex + 1} in section "${section.title}" must have a type`);
            }

            if (!widget.title) {
              errors.push(`Widget ${widgetIndex + 1} in section "${section.title}" must have a title`);
            }

            if (!widget.query) {
              errors.push(`Widget "${widget.title}" must have a query definition`);
            }
          });
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = {
  IContentProvider,
  BaseContentProvider
};