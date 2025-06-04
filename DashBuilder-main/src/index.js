/**
 * DashBuilder - Streamlined New Relic Dashboard Builder
 * 
 * A unified library for discovering metrics and creating intelligent dashboards
 */

// Core components
const DashboardBuilder = require('./core/DashboardBuilder');
const MetricDiscovery = require('./core/MetricDiscovery');
const QueryBuilder = require('./core/QueryBuilder');
const LayoutOptimizer = require('./core/LayoutOptimizer');
const NerdGraphOnlyBuilder = require('./core/NerdGraphOnlyBuilder');

// Dynamic templates
const { getTemplates } = require('./templates');

// Utilities
const logger = require('./utils/logger');

/**
 * Main factory function to create a dashboard builder instance
 */
function createDashboardBuilder(config) {
  return new DashboardBuilder(config);
}

/**
 * Convenience method to discover metrics
 */
async function discoverMetrics(config) {
  const discovery = new MetricDiscovery(config);
  return discovery.discover();
}

/**
 * Quick dashboard creation from template
 */
async function createFromTemplate(templateName, config) {
  // First discover what's available
  const discovery = new MetricDiscovery(config);
  const discovered = await discovery.discover({ limit: 10 });
  
  // Get dynamic templates based on discovery
  const templates = await getTemplates(discovered);
  
  const template = templates[templateName];
  if (!template) {
    throw new Error(`Template '${templateName}' not found. Available: ${Object.keys(templates).join(', ')}`);
  }
  
  const builder = new DashboardBuilder(config);
  return builder.createFromTemplate(template);
}

module.exports = {
  // Main factory
  createDashboardBuilder,
  
  // Core classes (for advanced usage)
  DashboardBuilder,
  MetricDiscovery,
  QueryBuilder,
  LayoutOptimizer,
  
  // NerdGraph-only builder
  NerdGraphOnlyBuilder,
  
  // Convenience methods
  discoverMetrics,
  createFromTemplate,
  
  // Dynamic templates
  getTemplates,
  
  // Utilities
  utils: {
    logger
  },
  
  // Version
  version: require('../package.json').version
};