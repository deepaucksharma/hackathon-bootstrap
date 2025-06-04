/**
 * MetricDiscovery - NerdGraph-only metric discovery
 * All discovery operations use NerdGraph API exclusively
 */

const logger = require('../utils/logger');

class MetricDiscovery {
  constructor(config) {
    this.accountId = parseInt(config.accountId, 10);
    this.apiKey = config.apiKey;
    this.region = config.region || 'US';
    this.nerdgraphEndpoint = this.region === 'EU' 
      ? 'https://api.eu.newrelic.com/graphql'
      : 'https://api.newrelic.com/graphql';
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
   * Main discovery method - all via NerdGraph
   */
  async discover(options = {}) {
    logger.info('Starting NerdGraph-based metric discovery...');
    
    const results = {
      eventTypes: [],
      metrics: {},
      totalMetrics: 0,
      discoveryTime: new Date().toISOString(),
      categories: {},
      summary: {}
    };

    try {
      // Get event types via NerdGraph
      const eventTypes = await this.discoverEventTypes(options);
      logger.info(`Found ${eventTypes.length} event types`);
      
      // Get metrics for each event type
      for (const eventType of eventTypes) {
        try {
          const metrics = await this.discoverEventTypeMetrics(eventType);
          logger.info(`Event type ${eventType}: found ${metrics.length} metrics`);
          if (metrics.length > 0) {
            results.eventTypes.push(eventType);
            results.metrics[eventType] = metrics;
            results.totalMetrics += metrics.length;
            this.categorizeMetrics(eventType, metrics, results.categories);
          }
        } catch (error) {
          logger.warn(`Failed to get metrics for ${eventType}:`, error.message);
        }
      }

      // Generate summary
      results.summary = {
        totalEventTypes: results.eventTypes.length,
        totalMetrics: results.totalMetrics,
        topEventTypes: this.getTopEventTypes(results)
      };

      return results;
    } catch (error) {
      logger.error('NerdGraph discovery failed:', error);
      throw error;
    }
  }

  /**
   * Discover event types via NerdGraph
   */
  async discoverEventTypes(options) {
    const query = `
      query($accountId: Int!) {
        actor {
          account(id: $accountId) {
            nrql(query: "SHOW EVENT TYPES SINCE 1 week ago") {
              results
            }
          }
        }
      }
    `;

    const data = await this.nerdgraphQuery(query, { 
      accountId: this.accountId 
    });

    const eventTypes = data.actor.account.nrql.results
      .map(r => r.eventType)
      .filter(e => e && !e.startsWith('nr.'));

    // Filter based on options
    if (options.domain === 'kafka') {
      return eventTypes.filter(e => 
        e.includes('Kafka') || 
        e.includes('Queue') || 
        e === 'Metric'
      );
    }

    return eventTypes.slice(0, options.limit || 20);
  }

  /**
   * Discover metrics for an event type via NerdGraph
   */
  async discoverEventTypeMetrics(eventType) {
    const query = `
      query($accountId: Int!, $nrqlQuery: Nrql!) {
        actor {
          account(id: $accountId) {
            nrql(query: $nrqlQuery) {
              results
            }
          }
        }
      }
    `;

    try {
      const data = await this.nerdgraphQuery(query, {
        accountId: this.accountId,
        nrqlQuery: `SELECT keyset() FROM ${eventType} SINCE 1 hour ago LIMIT 1`
      });

      const results = data.actor.account.nrql.results;
      if (results.length > 0) {
        return results
          .filter(item => item.key && !item.key.startsWith('nr.') && item.type === 'numeric')
          .map(item => ({
            name: item.key,
            type: item.type,
            eventType
          }));
      }
    } catch (error) {
      logger.debug(`No metrics found for ${eventType}`);
    }

    return [];
  }

  /**
   * Get metric samples via NerdGraph
   */
  async getMetricSamples(eventType, metricName, limit = 10) {
    const query = `
      query($accountId: Int!, $nrqlQuery: Nrql!) {
        actor {
          account(id: $accountId) {
            nrql(query: $nrqlQuery) {
              results
            }
          }
        }
      }
    `;

    const data = await this.nerdgraphQuery(query, {
      accountId: this.accountId,
      nrqlQuery: `SELECT ${metricName} FROM ${eventType} SINCE 1 hour ago LIMIT ${limit}`
    });

    return data.actor.account.nrql.results;
  }

  /**
   * Analyze metric statistics via NerdGraph
   */
  async analyzeMetric(eventType, metricName) {
    const query = `
      query($accountId: Int!, $nrqlQuery: Nrql!) {
        actor {
          account(id: $accountId) {
            nrql(query: $nrqlQuery) {
              results
            }
          }
        }
      }
    `;

    const data = await this.nerdgraphQuery(query, {
      accountId: this.accountId,
      nrqlQuery: `
        SELECT 
          average(${metricName}) as avg,
          max(${metricName}) as max,
          min(${metricName}) as min,
          stddev(${metricName}) as stddev,
          count(${metricName}) as count
        FROM ${eventType} 
        SINCE 1 hour ago
      `
    });

    return data.actor.account.nrql.results[0] || {};
  }

  /**
   * Discover relationships via NerdGraph
   */
  async discoverRelationships(eventType) {
    const query = `
      query($accountId: Int!, $nrqlQuery: Nrql!) {
        actor {
          account(id: $accountId) {
            nrql(query: $nrqlQuery) {
              results
              metadata {
                facets
              }
            }
          }
        }
      }
    `;

    try {
      const data = await this.nerdgraphQuery(query, {
        accountId: this.accountId,
        nrqlQuery: `SELECT count(*) FROM ${eventType} FACET entity.guid, entity.name SINCE 1 hour ago LIMIT 100`
      });

      return {
        entities: data.actor.account.nrql.results,
        facets: data.actor.account.nrql.metadata.facets
      };
    } catch (error) {
      logger.debug(`No relationships found for ${eventType}`);
      return { entities: [], facets: [] };
    }
  }

  /**
   * Categorize metrics based on patterns
   */
  categorizeMetrics(eventType, metrics, categories) {
    const patterns = {
      performance: /latency|duration|time|response|throughput|rate|ops/i,
      errors: /error|fail|exception|timeout|reject/i,
      capacity: /count|total|size|queue|backlog|pending/i,
      utilization: /percent|usage|utilization|cpu|memory|disk/i,
      business: /revenue|transaction|user|session|conversion/i
    };

    for (const metric of metrics) {
      let categorized = false;
      
      for (const [category, pattern] of Object.entries(patterns)) {
        if (pattern.test(metric.name)) {
          if (!categories[category]) {
            categories[category] = [];
          }
          categories[category].push({
            eventType,
            name: metric.name,
            type: metric.type
          });
          categorized = true;
          break;
        }
      }
      
      if (!categorized) {
        if (!categories.other) {
          categories.other = [];
        }
        categories.other.push({
          eventType,
          name: metric.name,
          type: metric.type
        });
      }
    }
  }

  /**
   * Infer metric type from name
   */
  inferMetricType(metricName) {
    const name = metricName.toLowerCase();
    
    if (name.includes('count') || name.includes('total')) return 'count';
    if (name.includes('percent') || name.includes('ratio')) return 'percentage';
    if (name.includes('bytes') || name.includes('size')) return 'bytes';
    if (name.includes('time') || name.includes('duration')) return 'duration';
    if (name.includes('rate') || name.includes('persec')) return 'rate';
    
    return 'gauge';
  }

  /**
   * Get top event types by metric count
   */
  getTopEventTypes(results) {
    return Object.entries(results.metrics)
      .map(([eventType, metrics]) => ({
        eventType,
        metricCount: metrics.length
      }))
      .sort((a, b) => b.metricCount - a.metricCount)
      .slice(0, 5);
  }

  /**
   * Search for specific metrics via NerdGraph
   */
  async searchMetrics(searchTerm) {
    const query = `
      query($accountId: Int!) {
        actor {
          account(id: $accountId) {
            nrql(query: "SHOW EVENT TYPES") {
              results
            }
          }
        }
      }
    `;

    const data = await this.nerdgraphQuery(query, { 
      accountId: this.accountId 
    });

    const eventTypes = data.actor.account.nrql.results
      .map(r => r.eventType)
      .filter(e => e);

    const matchingMetrics = [];

    // Search through each event type
    for (const eventType of eventTypes) {
      const metrics = await this.discoverEventTypeMetrics(eventType);
      const matches = metrics.filter(m => 
        m.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      
      if (matches.length > 0) {
        matchingMetrics.push({
          eventType,
          metrics: matches
        });
      }
    }

    return matchingMetrics;
  }
}

module.exports = MetricDiscovery;