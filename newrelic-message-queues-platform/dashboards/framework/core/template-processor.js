/**
 * Template Processor
 * 
 * Generic template processing engine that works with any template format.
 * Handles variable substitution, conditional rendering, and template validation.
 */

class TemplateProcessor {
  constructor(options = {}) {
    this.options = {
      variablePattern: options.variablePattern || /\{\{(\w+)\}\}/g,
      strictMode: options.strictMode !== false,
      allowUndefinedVariables: options.allowUndefinedVariables === true,
      ...options
    };
  }

  /**
   * Process template with variables
   */
  processTemplate(template, variables = {}) {
    if (!template) {
      throw new Error('Template is required');
    }

    // Deep clone template to avoid mutations
    const processedTemplate = JSON.parse(JSON.stringify(template));
    
    // Process variables throughout the template
    this.processVariables(processedTemplate, variables);
    
    // Process conditional sections
    this.processConditionals(processedTemplate, variables);
    
    // Add processing metadata
    processedTemplate._metadata = {
      processedAt: new Date(),
      variables: Object.keys(variables),
      processor: 'TemplateProcessor',
      version: '1.0.0'
    };
    
    return processedTemplate;
  }

  /**
   * Process variable substitutions
   */
  processVariables(obj, variables, path = []) {
    if (typeof obj === 'string') {
      return this.substituteVariables(obj, variables, path);
    }
    
    if (Array.isArray(obj)) {
      return obj.map((item, index) => 
        this.processVariables(item, variables, [...path, index])
      );
    }
    
    if (obj && typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj)) {
        obj[key] = this.processVariables(value, variables, [...path, key]);
      }
    }
    
    return obj;
  }

  /**
   * Substitute variables in string
   */
  substituteVariables(str, variables, path = []) {
    return str.replace(this.options.variablePattern, (match, varName) => {
      if (variables.hasOwnProperty(varName)) {
        return this.formatVariableValue(variables[varName], varName);
      }
      
      if (this.options.strictMode && !this.options.allowUndefinedVariables) {
        throw new Error(`Undefined variable '${varName}' at path: ${path.join('.')}`);
      }
      
      // Return original match if variable not found and strict mode is off
      return match;
    });
  }

  /**
   * Format variable value based on type
   */
  formatVariableValue(value, varName) {
    if (value === null || value === undefined) {
      return '';
    }
    
    if (typeof value === 'string') {
      return value;
    }
    
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    
    return String(value);
  }

  /**
   * Process conditional sections
   */
  processConditionals(template, variables) {
    if (!template || typeof template !== 'object') {
      return;
    }

    // Process conditional widgets
    if (template.sections) {
      template.sections = template.sections.map(section => {
        if (section.widgets) {
          section.widgets = section.widgets.filter(widget => 
            this.evaluateCondition(widget.condition, variables)
          );
        }
        return section;
      }).filter(section => 
        this.evaluateCondition(section.condition, variables) && 
        section.widgets && section.widgets.length > 0
      );
    }

    // Process conditional variables
    if (template.variables) {
      template.variables = template.variables.filter(variable => 
        this.evaluateCondition(variable.condition, variables)
      );
    }
  }

  /**
   * Evaluate conditional expression
   */
  evaluateCondition(condition, variables) {
    if (!condition) {
      return true; // No condition means always include
    }
    
    if (typeof condition === 'boolean') {
      return condition;
    }
    
    if (typeof condition === 'string') {
      return this.evaluateStringCondition(condition, variables);
    }
    
    if (typeof condition === 'object') {
      return this.evaluateObjectCondition(condition, variables);
    }
    
    return true;
  }

  /**
   * Evaluate string-based condition
   */
  evaluateStringCondition(condition, variables) {
    // Simple variable existence check
    if (condition.startsWith('!')) {
      const varName = condition.slice(1);
      return !variables[varName];
    }
    
    // Check if variable exists and is truthy
    return !!variables[condition];
  }

  /**
   * Evaluate object-based condition
   */
  evaluateObjectCondition(condition, variables) {
    const { operator, variable, value, conditions } = condition;
    
    if (conditions) {
      // Handle multiple conditions with AND/OR logic
      if (operator === 'and' || !operator) {
        return conditions.every(cond => this.evaluateCondition(cond, variables));
      } else if (operator === 'or') {
        return conditions.some(cond => this.evaluateCondition(cond, variables));
      }
    }
    
    if (!variable) {
      return true;
    }
    
    const varValue = variables[variable];
    
    switch (operator) {
      case 'equals':
      case 'eq':
        return varValue === value;
      case 'not_equals':
      case 'neq':
        return varValue !== value;
      case 'contains':
        return Array.isArray(varValue) ? varValue.includes(value) : 
               String(varValue).includes(String(value));
      case 'in':
        return Array.isArray(value) ? value.includes(varValue) : false;
      case 'exists':
        return varValue !== undefined && varValue !== null;
      case 'not_exists':
        return varValue === undefined || varValue === null;
      default:
        return !!varValue;
    }
  }

  /**
   * Validate template structure
   */
  validateTemplate(template) {
    const errors = [];
    
    if (!template) {
      errors.push('Template is required');
      return { valid: false, errors };
    }
    
    // Check required fields
    if (!template.name) {
      errors.push('Template name is required');
    }
    
    // Validate sections
    if (template.sections) {
      if (!Array.isArray(template.sections)) {
        errors.push('Template sections must be an array');
      } else {
        template.sections.forEach((section, sectionIndex) => {
          this.validateSection(section, sectionIndex, errors);
        });
      }
    }
    
    // Validate variables
    if (template.variables) {
      if (!Array.isArray(template.variables)) {
        errors.push('Template variables must be an array');
      } else {
        template.variables.forEach((variable, varIndex) => {
          this.validateVariable(variable, varIndex, errors);
        });
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate template section
   */
  validateSection(section, index, errors) {
    if (!section.title) {
      errors.push(`Section ${index + 1}: title is required`);
    }
    
    if (section.widgets) {
      if (!Array.isArray(section.widgets)) {
        errors.push(`Section ${index + 1}: widgets must be an array`);
      } else {
        section.widgets.forEach((widget, widgetIndex) => {
          this.validateWidget(widget, index, widgetIndex, errors);
        });
      }
    }
  }

  /**
   * Validate template widget
   */
  validateWidget(widget, sectionIndex, widgetIndex, errors) {
    const prefix = `Section ${sectionIndex + 1}, Widget ${widgetIndex + 1}`;
    
    if (!widget.title) {
      errors.push(`${prefix}: title is required`);
    }
    
    if (!widget.type) {
      errors.push(`${prefix}: type is required`);
    }
    
    if (!widget.query) {
      errors.push(`${prefix}: query is required`);
    }
    
    // Validate position if specified
    if (widget.position) {
      if (widget.position.width && (widget.position.width < 1 || widget.position.width > 12)) {
        errors.push(`${prefix}: width must be between 1 and 12`);
      }
      
      if (widget.position.height && widget.position.height < 1) {
        errors.push(`${prefix}: height must be at least 1`);
      }
    }
  }

  /**
   * Validate template variable
   */
  validateVariable(variable, index, errors) {
    const prefix = `Variable ${index + 1}`;
    
    if (!variable.name) {
      errors.push(`${prefix}: name is required`);
    }
    
    if (!variable.type) {
      errors.push(`${prefix}: type is required`);
    }
    
    // Validate enum variables
    if (variable.type === 'ENUM' && !variable.possibleValues) {
      errors.push(`${prefix}: possibleValues required for ENUM type`);
    }
  }

  /**
   * Extract variables from template
   */
  extractVariables(template) {
    const variables = new Set();
    
    this.findVariables(template, variables);
    
    return Array.from(variables);
  }

  /**
   * Find all variables in template recursively
   */
  findVariables(obj, variables) {
    if (typeof obj === 'string') {
      const matches = obj.match(this.options.variablePattern);
      if (matches) {
        matches.forEach(match => {
          const varName = match.replace(this.options.variablePattern, '$1');
          variables.add(varName);
        });
      }
    } else if (Array.isArray(obj)) {
      obj.forEach(item => this.findVariables(item, variables));
    } else if (obj && typeof obj === 'object') {
      Object.values(obj).forEach(value => this.findVariables(value, variables));
    }
  }

  /**
   * Generate template summary
   */
  getTemplateSummary(template) {
    const variables = this.extractVariables(template);
    
    let widgetCount = 0;
    let sectionCount = 0;
    const widgetTypes = new Set();
    
    if (template.sections) {
      sectionCount = template.sections.length;
      template.sections.forEach(section => {
        if (section.widgets) {
          widgetCount += section.widgets.length;
          section.widgets.forEach(widget => {
            if (widget.type) {
              widgetTypes.add(widget.type);
            }
          });
        }
      });
    }
    
    return {
      name: template.name,
      description: template.description,
      entityType: template.entityType,
      sectionCount,
      widgetCount,
      variableCount: variables.length,
      variables,
      widgetTypes: Array.from(widgetTypes),
      tags: template.tags || []
    };
  }
}

module.exports = TemplateProcessor;