/**
 * Query Builder
 * 
 * Generic NRQL query generation engine.
 * Domain-agnostic query building logic that works with any entity type.
 */

class QueryBuilder {
  constructor(options = {}) {
    this.options = {
      defaultTimeRange: options.defaultTimeRange || 'SINCE 1 hour ago',
      maxLimit: options.maxLimit || 1000,
      variablePattern: options.variablePattern || /\{\{(\w+)\}\}/g,
      ...options
    };
  }

  /**
   * Build NRQL query from definition
   */
  buildFromDefinition(queryDef, variables = {}) {
    if (!queryDef) {
      throw new Error('Query definition is required');
    }

    if (typeof queryDef === 'string') {
      // Simple string query
      return this.substituteVariables(queryDef, variables);
    }

    if (typeof queryDef === 'object') {
      // Structured query definition
      return this.buildStructuredQuery(queryDef, variables);
    }

    throw new Error('Invalid query definition format');
  }

  /**
   * Build structured NRQL query
   */
  buildStructuredQuery(queryDef, variables = {}) {
    const parts = [];

    // FROM clause
    if (!queryDef.from) {
      throw new Error('FROM clause is required in query definition');
    }
    parts.push(`FROM ${this.substituteVariables(queryDef.from, variables)}`);

    // SELECT clause
    if (queryDef.select) {
      const selectClause = this.buildSelectClause(queryDef.select, variables);
      parts.unshift(`SELECT ${selectClause}`);
    } else {
      parts.unshift('SELECT *');
    }

    // WHERE clause
    if (queryDef.where) {
      const whereClause = this.buildWhereClause(queryDef.where, variables);
      if (whereClause) {
        parts.push(`WHERE ${whereClause}`);
      }
    }

    // FACET clause
    if (queryDef.facet) {
      const facetClause = this.substituteVariables(queryDef.facet, variables);
      parts.push(`FACET ${facetClause}`);
    }

    // TIMESERIES clause
    if (queryDef.timeseries) {
      if (typeof queryDef.timeseries === 'boolean' && queryDef.timeseries) {
        parts.push('TIMESERIES');
      } else if (typeof queryDef.timeseries === 'string') {
        const timeseriesClause = this.substituteVariables(queryDef.timeseries, variables);
        parts.push(`TIMESERIES ${timeseriesClause}`);
      }
    }

    // SINCE clause
    if (queryDef.since) {
      const sinceClause = this.substituteVariables(queryDef.since, variables);
      parts.push(`SINCE ${sinceClause}`);
    } else {
      parts.push(`SINCE ${this.options.defaultTimeRange}`);
    }

    // UNTIL clause
    if (queryDef.until) {
      const untilClause = this.substituteVariables(queryDef.until, variables);
      parts.push(`UNTIL ${untilClause}`);
    }

    // LIMIT clause
    if (queryDef.limit) {
      const limit = Math.min(parseInt(queryDef.limit), this.options.maxLimit);
      parts.push(`LIMIT ${limit}`);
    }

    // ORDER BY clause
    if (queryDef.orderBy) {
      const orderByClause = this.substituteVariables(queryDef.orderBy, variables);
      parts.push(`ORDER BY ${orderByClause}`);
    }

    return parts.join(' ');
  }

  /**
   * Build SELECT clause
   */
  buildSelectClause(selectDef, variables) {
    if (typeof selectDef === 'string') {
      return this.substituteVariables(selectDef, variables);
    }

    if (Array.isArray(selectDef)) {
      return selectDef
        .map(field => this.substituteVariables(field, variables))
        .join(', ');
    }

    if (typeof selectDef === 'object') {
      // Handle object-based select with functions
      const fields = [];
      
      for (const [alias, definition] of Object.entries(selectDef)) {
        if (typeof definition === 'string') {
          const field = this.substituteVariables(definition, variables);
          fields.push(`${field} as "${alias}"`);
        } else if (typeof definition === 'object') {
          const field = this.buildFunctionCall(definition, variables);
          fields.push(`${field} as "${alias}"`);
        }
      }
      
      return fields.join(', ');
    }

    return this.substituteVariables(String(selectDef), variables);
  }

  /**
   * Build WHERE clause
   */
  buildWhereClause(whereDef, variables) {
    if (!whereDef) {
      return '';
    }

    if (typeof whereDef === 'string') {
      return this.substituteVariables(whereDef, variables);
    }

    if (Array.isArray(whereDef)) {
      const conditions = whereDef
        .map(condition => this.buildWhereCondition(condition, variables))
        .filter(condition => condition); // Remove empty conditions
      
      return conditions.length > 0 ? conditions.join(' AND ') : '';
    }

    if (typeof whereDef === 'object') {
      return this.buildWhereCondition(whereDef, variables);
    }

    return '';
  }

  /**
   * Build individual WHERE condition
   */
  buildWhereCondition(condition, variables) {
    if (typeof condition === 'string') {
      return this.substituteVariables(condition, variables);
    }

    if (typeof condition === 'object') {
      const { field, operator, value, logic } = condition;
      
      if (field && operator && value !== undefined) {
        const fieldStr = this.substituteVariables(field, variables);
        const valueStr = this.formatWhereValue(value, operator, variables);
        
        return `${fieldStr} ${operator} ${valueStr}`;
      }
      
      if (logic && condition.conditions) {
        const subConditions = condition.conditions
          .map(cond => this.buildWhereCondition(cond, variables))
          .filter(cond => cond);
          
        if (subConditions.length > 0) {
          const operator = logic.toUpperCase() === 'OR' ? 'OR' : 'AND';
          return `(${subConditions.join(` ${operator} `)})`;
        }
      }
    }

    return '';
  }

  /**
   * Format value for WHERE clause
   */
  formatWhereValue(value, operator, variables) {
    const substitutedValue = this.substituteVariables(String(value), variables);
    
    // Don't quote if it's already a variable substitution or function
    if (substitutedValue.includes('(') || substitutedValue.startsWith('{{')) {
      return substitutedValue;
    }
    
    // Quote string values for certain operators
    if (['=', '!=', 'LIKE', 'NOT LIKE', 'IN', 'NOT IN'].includes(operator.toUpperCase())) {
      if (isNaN(substitutedValue) && substitutedValue !== 'true' && substitutedValue !== 'false') {
        return `'${substitutedValue}'`;
      }
    }
    
    return substitutedValue;
  }

  /**
   * Build function call for aggregations
   */
  buildFunctionCall(funcDef, variables) {
    const { function: funcName, field, parameters } = funcDef;
    
    if (!funcName) {
      throw new Error('Function name is required for function calls');
    }
    
    const fieldStr = field ? this.substituteVariables(field, variables) : '';
    
    if (parameters && Array.isArray(parameters)) {
      const paramStr = parameters
        .map(param => this.substituteVariables(String(param), variables))
        .join(', ');
      return `${funcName}(${fieldStr}${fieldStr && paramStr ? ', ' : ''}${paramStr})`;
    }
    
    return `${funcName}(${fieldStr})`;
  }

  /**
   * Substitute variables in query string
   */
  substituteVariables(queryStr, variables) {
    if (!queryStr || typeof queryStr !== 'string') {
      return queryStr;
    }

    return queryStr.replace(this.options.variablePattern, (match, varName) => {
      if (variables.hasOwnProperty(varName)) {
        return this.formatVariableValue(variables[varName]);
      }
      
      // Return original if variable not found
      return match;
    });
  }

  /**
   * Format variable value for NRQL
   */
  formatVariableValue(value) {
    if (value === null || value === undefined) {
      return 'NULL';
    }
    
    if (typeof value === 'string') {
      // Don't quote if it looks like a NRQL function or expression
      if (value.includes('(') || value.match(/^\d+\s*(minute|hour|day|week)s?\s+ago$/i)) {
        return value;
      }
      return `'${value.replace(/'/g, "''")}'`; // Escape single quotes
    }
    
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    
    if (Array.isArray(value)) {
      const formattedValues = value.map(v => this.formatVariableValue(v));
      return `(${formattedValues.join(', ')})`;
    }
    
    return `'${String(value)}'`;
  }

  /**
   * Validate query definition
   */
  validateQueryDefinition(queryDef) {
    const errors = [];
    
    if (!queryDef) {
      errors.push('Query definition is required');
      return { valid: false, errors };
    }
    
    if (typeof queryDef === 'string') {
      // Basic validation for string queries
      if (!queryDef.includes('FROM')) {
        errors.push('Query must include FROM clause');
      }
      return { valid: errors.length === 0, errors };
    }
    
    if (typeof queryDef === 'object') {
      // Validate structured query
      if (!queryDef.from) {
        errors.push('FROM clause is required');
      }
      
      if (queryDef.limit && (isNaN(queryDef.limit) || queryDef.limit <= 0)) {
        errors.push('LIMIT must be a positive number');
      }
      
      if (queryDef.limit && queryDef.limit > this.options.maxLimit) {
        errors.push(`LIMIT cannot exceed ${this.options.maxLimit}`);
      }
    }
    
    return { valid: errors.length === 0, errors };
  }

  /**
   * Extract variables from query definition
   */
  extractQueryVariables(queryDef) {
    const variables = new Set();
    
    this.findVariablesInQuery(queryDef, variables);
    
    return Array.from(variables);
  }

  /**
   * Find variables in query recursively
   */
  findVariablesInQuery(obj, variables) {
    if (typeof obj === 'string') {
      const matches = obj.match(this.options.variablePattern);
      if (matches) {
        matches.forEach(match => {
          const varName = match.replace(this.options.variablePattern, '$1');
          variables.add(varName);
        });
      }
    } else if (Array.isArray(obj)) {
      obj.forEach(item => this.findVariablesInQuery(item, variables));
    } else if (obj && typeof obj === 'object') {
      Object.values(obj).forEach(value => this.findVariablesInQuery(value, variables));
    }
  }

  /**
   * Optimize query for performance
   */
  optimizeQuery(queryDef, options = {}) {
    if (typeof queryDef === 'string') {
      return queryDef; // Can't optimize string queries easily
    }

    const optimized = { ...queryDef };

    // Add default limit if not specified
    if (!optimized.limit && options.addDefaultLimit !== false) {
      optimized.limit = options.defaultLimit || 100;
    }

    // Optimize SELECT clause
    if (optimized.select === '*' && options.optimizeSelect !== false) {
      // Could suggest specific fields instead of SELECT *
      // This would need domain knowledge from content provider
    }

    // Add time range if missing
    if (!optimized.since && !optimized.until) {
      optimized.since = this.options.defaultTimeRange;
    }

    return optimized;
  }

  /**
   * Generate query summary
   */
  getQuerySummary(queryDef) {
    const variables = this.extractQueryVariables(queryDef);
    
    let type = 'unknown';
    let entityType = '';
    let hasTimeseries = false;
    let hasFacet = false;
    
    if (typeof queryDef === 'object') {
      entityType = queryDef.from || '';
      hasTimeseries = !!queryDef.timeseries;
      hasFacet = !!queryDef.facet;
      
      if (hasTimeseries) {
        type = 'timeseries';
      } else if (hasFacet) {
        type = 'faceted';
      } else {
        type = 'simple';
      }
    }
    
    return {
      type,
      entityType,
      variableCount: variables.length,
      variables,
      hasTimeseries,
      hasFacet,
      isOptimized: !!queryDef.limit
    };
  }
}

module.exports = QueryBuilder;