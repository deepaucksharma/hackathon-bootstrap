/**
 * Dynamic Templates via NerdGraph
 * No static files - all templates are discovered dynamically
 */

module.exports = {
  /**
   * Get available templates based on discovered data
   */
  async getTemplates(discovery) {
    const templates = {};

    // Kafka template if Kafka event types found
    if (discovery.eventTypes.some(e => e.includes('Kafka'))) {
      templates.kafka = {
        name: 'Kafka Monitoring',
        description: 'Comprehensive Kafka monitoring dashboard',
        features: ['Broker health', 'Topic metrics', 'Consumer lag'],
        config: {
          domain: 'kafka',
          intelligent: true
        }
      };
    }

    // System template if system metrics found
    if (discovery.eventTypes.includes('SystemSample')) {
      templates.system = {
        name: 'System Health',
        description: 'Infrastructure and system monitoring',
        features: ['CPU usage', 'Memory', 'Disk I/O', 'Network'],
        config: {
          domain: 'infrastructure',
          intelligent: true
        }
      };
    }

    // APM template if Transaction events found
    if (discovery.eventTypes.includes('Transaction')) {
      templates.apm = {
        name: 'Application Performance',
        description: 'Application performance monitoring',
        features: ['Response time', 'Error rate', 'Throughput'],
        config: {
          domain: 'apm',
          intelligent: true
        }
      };
    }

    // Custom template always available
    templates.custom = {
      name: 'Custom Dashboard',
      description: 'Build a custom dashboard from discovered metrics',
      features: ['Auto-discovery', 'Intelligent layout', 'All metrics'],
      config: {
        intelligent: true
      }
    };

    return templates;
  }
};