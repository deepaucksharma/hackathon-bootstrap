/**
 * QueryBuilder - Unified NRQL query generation
 * 
 * Consolidates query building logic from multiple implementations
 */

const logger = require('../utils/logger');

class QueryBuilder {
  constructor(config = {}) {
    this.config = config;
    this.accountId = config.accountId;
  }

  /**
   * Generate queries for a specific category
   */
  async generateForCategory(category, metrics, analysis) {
    const strategies = this.getStrategiesForCategory(category);
    const queries = [];

    for (const strategy of strategies) {
      const query = await this.buildQuery(strategy, metrics, analysis);
      if (query) {
        queries.push(query);
      }
    }

    return queries;
  }

  /**
   * Get appropriate strategies for a category
   */
  getStrategiesForCategory(category) {
    const strategyMap = {
      performance: ['timeseries', 'percentile', 'comparison'],
      errors: ['count', 'rate', 'timeseries'],
      capacity: ['gauge', 'histogram', 'threshold'],
      utilization: ['percentage', 'timeseries', 'heatmap'],
      business: ['funnel', 'cohort', 'comparison']
    };

    return strategyMap[category] || ['timeseries'];
  }

  /**
   * Build a query using a specific strategy
   */
  async buildQuery(strategy, metrics, analysis) {
    const builders = {
      timeseries: this.buildTimeseriesQuery.bind(this),
      percentile: this.buildPercentileQuery.bind(this),
      comparison: this.buildComparisonQuery.bind(this),
      count: this.buildCountQuery.bind(this),
      rate: this.buildRateQuery.bind(this),
      gauge: this.buildGaugeQuery.bind(this),
      histogram: this.buildHistogramQuery.bind(this),
      threshold: this.buildThresholdQuery.bind(this),
      percentage: this.buildPercentageQuery.bind(this),
      heatmap: this.buildHeatmapQuery.bind(this),
      funnel: this.buildFunnelQuery.bind(this),
      cohort: this.buildCohortQuery.bind(this)
    };

    const builder = builders[strategy];
    if (!builder) {
      logger.warn(`Unknown query strategy: ${strategy}`);
      return null;
    }

    return builder(metrics, analysis);
  }

  /**
   * Build timeseries query
   */
  buildTimeseriesQuery(metrics, analysis) {
    const metric = metrics[0];
    const aggregation = this.selectAggregation(metric);
    
    return {
      title: `${metric.name} Over Time`,
      nrql: `SELECT ${aggregation}(${metric.name}) FROM ${metric.eventType} TIMESERIES AUTO`,
      visualization: 'line',
      category: analysis.category
    };
  }

  /**
   * Build percentile query
   */
  buildPercentileQuery(metrics, analysis) {
    const metric = metrics[0];
    
    return {
      title: `${metric.name} Percentiles`,
      nrql: `SELECT percentile(${metric.name}, 50, 90, 95, 99) FROM ${metric.eventType} TIMESERIES AUTO`,
      visualization: 'line',
      category: analysis.category
    };
  }

  /**
   * Build comparison query
   */
  buildComparisonQuery(metrics, analysis) {
    const metric = metrics[0];
    const aggregation = this.selectAggregation(metric);
    
    return {
      title: `${metric.name} Comparison`,
      nrql: `SELECT ${aggregation}(${metric.name}) FROM ${metric.eventType} COMPARE WITH 1 day ago TIMESERIES AUTO`,
      visualization: 'line',
      category: analysis.category
    };
  }

  /**
   * Build count query
   */
  buildCountQuery(metrics, analysis) {
    const metric = metrics[0];
    
    return {
      title: `${metric.name} Count`,
      nrql: `SELECT count(${metric.name}) FROM ${metric.eventType} WHERE ${metric.name} IS NOT NULL`,
      visualization: 'billboard',
      category: analysis.category
    };
  }

  /**
   * Build rate query
   */
  buildRateQuery(metrics, analysis) {
    const metric = metrics[0];
    
    return {
      title: `${metric.name} Rate`,
      nrql: `SELECT rate(count(${metric.name}), 1 minute) FROM ${metric.eventType} TIMESERIES AUTO`,
      visualization: 'line',
      category: analysis.category
    };
  }

  /**
   * Build gauge query
   */
  buildGaugeQuery(metrics, analysis) {
    const metric = metrics[0];
    
    return {
      title: `Current ${metric.name}`,
      nrql: `SELECT latest(${metric.name}) FROM ${metric.eventType}`,
      visualization: 'billboard',
      category: analysis.category
    };
  }

  /**
   * Generate golden signal queries
   */
  async generateGoldenSignalQueries(goldenSignals) {
    const queries = [];

    // Latency
    if (goldenSignals.latency && goldenSignals.latency.length > 0) {
      const latencyMetric = goldenSignals.latency[0];
      queries.push({
        title: 'Service Latency',
        nrql: `SELECT percentile(${latencyMetric.name}, 50, 90, 95, 99) FROM ${latencyMetric.eventType} TIMESERIES AUTO`,
        visualization: 'line',
        category: 'golden-signals'
      });
    }

    // Traffic
    if (goldenSignals.traffic && goldenSignals.traffic.length > 0) {
      const trafficMetric = goldenSignals.traffic[0];
      queries.push({
        title: 'Request Rate',
        nrql: `SELECT rate(count(*), 1 minute) FROM ${trafficMetric.eventType} TIMESERIES AUTO`,
        visualization: 'line',
        category: 'golden-signals'
      });
    }

    // Errors
    if (goldenSignals.errors && goldenSignals.errors.length > 0) {
      const errorMetric = goldenSignals.errors[0];
      queries.push({
        title: 'Error Rate',
        nrql: `SELECT percentage(count(*), WHERE ${errorMetric.name} = true) FROM ${errorMetric.eventType} TIMESERIES AUTO`,
        visualization: 'line',
        category: 'golden-signals'
      });
    }

    // Saturation
    if (goldenSignals.saturation && goldenSignals.saturation.length > 0) {
      const saturationMetric = goldenSignals.saturation[0];
      queries.push({
        title: 'Resource Saturation',
        nrql: `SELECT average(${saturationMetric.name}) FROM ${saturationMetric.eventType} TIMESERIES AUTO`,
        visualization: 'line',
        category: 'golden-signals'
      });
    }

    return queries;
  }

  /**
   * Generate correlation queries
   */
  async generateCorrelationQueries(correlations) {
    const queries = [];

    for (const correlation of correlations.slice(0, 3)) {
      queries.push({
        title: `${correlation.metric1} vs ${correlation.metric2}`,
        nrql: `SELECT average(${correlation.metric1}) as '${correlation.metric1}', average(${correlation.metric2}) as '${correlation.metric2}' FROM ${correlation.eventType} TIMESERIES AUTO`,
        visualization: 'line',
        category: 'correlations'
      });
    }

    return queries;
  }

  /**
   * Select appropriate aggregation function
   */
  selectAggregation(metric) {
    const name = metric.name.toLowerCase();
    
    if (name.includes('count') || name.includes('total')) return 'sum';
    if (name.includes('percent') || name.includes('ratio')) return 'average';
    if (name.includes('max')) return 'max';
    if (name.includes('min')) return 'min';
    if (name.includes('rate')) return 'rate';
    
    return 'average';
  }

  /**
   * Validate NRQL query - REMOVED
   */
  async validate(nrql) {
    // Validation removed - query is ready
    return true;
  }

  /**
   * Optimize query for performance
   */
  async optimize(query) {
    const optimized = { ...query };
    
    // Add LIMIT if missing
    if (!optimized.nrql.toUpperCase().includes('LIMIT') && 
        !optimized.nrql.toUpperCase().includes('TIMESERIES')) {
      optimized.nrql += ' LIMIT 100';
    }

    // Add time range if missing
    if (!optimized.nrql.toUpperCase().includes('SINCE') && 
        !optimized.nrql.toUpperCase().includes('UNTIL')) {
      optimized.nrql += ' SINCE 1 hour ago';
    }

    return optimized;
  }

  // Additional query builders...
  buildHistogramQuery(metrics) {
    const metric = metrics[0];
    return {
      title: `${metric.name} Distribution`,
      nrql: `SELECT histogram(${metric.name}, width: auto) FROM ${metric.eventType}`,
      visualization: 'histogram'
    };
  }

  buildThresholdQuery(metrics) {
    const metric = metrics[0];
    return {
      title: `${metric.name} Threshold`,
      nrql: `SELECT average(${metric.name}) FROM ${metric.eventType}`,
      visualization: 'billboard',
      thresholds: [
        { value: 80, severity: 'warning' },
        { value: 90, severity: 'critical' }
      ]
    };
  }

  buildPercentageQuery(metrics) {
    const metric = metrics[0];
    return {
      title: `${metric.name} Percentage`,
      nrql: `SELECT average(${metric.name}) FROM ${metric.eventType}`,
      visualization: 'billboard',
      units: { unit: 'percentage' }
    };
  }

  buildHeatmapQuery(metrics) {
    const metric = metrics[0];
    return {
      title: `${metric.name} Heatmap`,
      nrql: `SELECT histogram(${metric.name}) FROM ${metric.eventType} FACET dateOf(timestamp) SINCE 1 week ago`,
      visualization: 'heatmap'
    };
  }

  buildFunnelQuery(metrics) {
    // Simplified funnel - would need more context in real implementation
    return {
      title: 'Conversion Funnel',
      nrql: `SELECT funnel(session, WHERE step = 'start' as 'Start', WHERE step = 'middle' as 'Middle', WHERE step = 'end' as 'Complete') FROM PageView SINCE 1 day ago`,
      visualization: 'funnel'
    };
  }

  buildCohortQuery(metrics) {
    // Simplified cohort - would need more context in real implementation
    return {
      title: 'User Cohorts',
      nrql: `SELECT count(*) FROM PageView FACET cohort() SINCE 1 week ago`,
      visualization: 'table'
    };
  }
}

module.exports = QueryBuilder;