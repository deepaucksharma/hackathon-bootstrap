const BaseAggregator = require('./base-aggregator');

/**
 * MetricAggregator - Aggregates metrics from MESSAGE_QUEUE entities
 * 
 * Provides specific aggregation logic for message queue metrics including
 * throughput, latency, error rates, and resource utilization.
 */
class MetricAggregator extends BaseAggregator {
  constructor(config = {}) {
    super({
      ...config,
      aggregationFunctions: [
        'sum', 'avg', 'min', 'max', 'count', 
        'p50', 'p95', 'p99'
      ],
      // Metric-specific configuration
      metricPatterns: {
        throughput: /\.(bytesIn|bytesOut|messagesIn|messagesOut|Rate)$/,
        latency: /\.(latency|responseTime|processingTime)$/,
        errors: /\.(errors|failures|rejected|dropped)$/,
        utilization: /\.(cpuUsage|memoryUsage|diskUsage|Percent)$/
      },
      ...config
    });

    // Metric categories for organized aggregation
    this.metricCategories = {
      throughput: new Set(),
      latency: new Set(),
      errors: new Set(),
      utilization: new Set(),
      custom: new Set()
    };

    // Golden metrics tracking
    this.goldenMetrics = {
      rate: ['messagesPerSec', 'bytesPerSec'],
      errors: ['errorRate', 'failureRate'],
      duration: ['processingTime', 'latency'],
      saturation: ['queueDepth', 'cpuUsage', 'memoryUsage']
    };
  }

  /**
   * Extract metrics from MESSAGE_QUEUE entities
   * @param {Object} entities - Entity collections
   * @returns {Promise<Object>} Extracted metrics
   */
  async extractMetrics(entities) {
    const metrics = {};

    // Extract from clusters
    if (entities.clusters) {
      for (const cluster of entities.clusters) {
        const clusterMetrics = this.extractEntityMetrics(cluster, 'cluster');
        Object.assign(metrics, clusterMetrics);
      }
    }

    // Extract from brokers
    if (entities.brokers) {
      for (const broker of entities.brokers) {
        const brokerMetrics = this.extractEntityMetrics(broker, 'broker');
        Object.assign(metrics, brokerMetrics);
      }
    }

    // Extract from topics
    if (entities.topics) {
      for (const topic of entities.topics) {
        const topicMetrics = this.extractEntityMetrics(topic, 'topic');
        Object.assign(metrics, topicMetrics);
      }
    }

    // Extract from queues
    if (entities.queues) {
      for (const queue of entities.queues) {
        const queueMetrics = this.extractEntityMetrics(queue, 'queue');
        Object.assign(metrics, queueMetrics);
      }
    }

    // Categorize metrics
    this.categorizeMetrics(metrics);

    return metrics;
  }

  /**
   * Extract metrics from a single entity
   * @param {Object} entity - Entity instance
   * @param {string} entityType - Type of entity
   * @returns {Object} Extracted metrics
   */
  extractEntityMetrics(entity, entityType) {
    const metrics = {};
    const prefix = `${entityType}.${entity.name || entity.guid}`;

    // Extract basic metrics
    if (entity.metrics) {
      for (const [key, value] of Object.entries(entity.metrics)) {
        const metricKey = `${prefix}.${key}`;
        
        if (!metrics[metricKey]) {
          metrics[metricKey] = [];
        }

        metrics[metricKey].push({
          value: typeof value === 'number' ? value : 0,
          metadata: {
            entityType,
            entityName: entity.name,
            entityGuid: entity.guid,
            provider: entity.provider,
            timestamp: Date.now()
          }
        });
      }
    }

    // Extract golden metrics if available
    if (entity.getGoldenMetrics && typeof entity.getGoldenMetrics === 'function') {
      const goldenMetrics = entity.getGoldenMetrics();
      
      for (const [category, catMetrics] of Object.entries(goldenMetrics)) {
        for (const [key, value] of Object.entries(catMetrics)) {
          const metricKey = `${prefix}.golden.${category}.${key}`;
          
          if (!metrics[metricKey]) {
            metrics[metricKey] = [];
          }

          metrics[metricKey].push({
            value: typeof value === 'number' ? value : 0,
            metadata: {
              entityType,
              entityName: entity.name,
              entityGuid: entity.guid,
              provider: entity.provider,
              category: 'golden',
              timestamp: Date.now()
            }
          });
        }
      }
    }

    return metrics;
  }

  /**
   * Categorize metrics based on patterns
   * @param {Object} metrics - Metrics to categorize
   */
  categorizeMetrics(metrics) {
    for (const metricKey of Object.keys(metrics)) {
      let categorized = false;

      // Check each pattern
      for (const [category, pattern] of Object.entries(this.config.metricPatterns)) {
        if (pattern.test(metricKey)) {
          this.metricCategories[category].add(metricKey);
          categorized = true;
          break;
        }
      }

      // Add to custom if not categorized
      if (!categorized) {
        this.metricCategories.custom.add(metricKey);
      }
    }
  }

  /**
   * Aggregate window with category awareness
   * @param {Object} window - Window to aggregate
   * @returns {Object} Aggregated data with categories
   */
  aggregateWindow(window) {
    const baseAggregation = super.aggregateWindow(window);
    
    // Add category-based aggregations
    baseAggregation.categories = {};

    for (const [category, metricKeys] of Object.entries(this.metricCategories)) {
      baseAggregation.categories[category] = {
        metrics: {},
        summary: {}
      };

      let totalSum = 0;
      let totalCount = 0;

      for (const metricKey of metricKeys) {
        if (baseAggregation.metrics[metricKey]) {
          baseAggregation.categories[category].metrics[metricKey] = 
            baseAggregation.metrics[metricKey];
          
          // Update category summary
          totalSum += baseAggregation.metrics[metricKey].sum || 0;
          totalCount += baseAggregation.metrics[metricKey].count || 0;
        }
      }

      // Calculate category summary
      baseAggregation.categories[category].summary = {
        totalMetrics: metricKeys.size,
        totalSum,
        totalCount,
        avgValue: totalCount > 0 ? totalSum / totalCount : 0
      };
    }

    // Add golden metrics summary
    baseAggregation.goldenMetrics = this.aggregateGoldenMetrics(baseAggregation.metrics);

    return baseAggregation;
  }

  /**
   * Aggregate golden metrics specifically
   * @param {Object} metrics - All metrics
   * @returns {Object} Golden metrics summary
   */
  aggregateGoldenMetrics(metrics) {
    const golden = {
      rate: {},
      errors: {},
      duration: {},
      saturation: {}
    };

    // Find and aggregate golden metrics
    for (const [metricKey, aggregation] of Object.entries(metrics)) {
      if (metricKey.includes('.golden.')) {
        const parts = metricKey.split('.golden.');
        if (parts.length === 2) {
          const [, categoryAndMetric] = parts;
          const [category, ...metricParts] = categoryAndMetric.split('.');
          const metricName = metricParts.join('.');

          if (golden[category]) {
            golden[category][metricName] = aggregation;
          }
        }
      }
    }

    // Calculate RED metrics (Rate, Errors, Duration)
    golden.red = {
      rate: this.calculateTotalRate(golden.rate),
      errorPercent: this.calculateErrorPercent(golden.rate, golden.errors),
      avgDuration: this.calculateAvgDuration(golden.duration)
    };

    // Calculate USE metrics (Utilization, Saturation, Errors)
    golden.use = {
      utilization: this.calculateUtilization(golden.saturation),
      saturation: this.calculateSaturation(golden.saturation),
      errors: golden.red.errorPercent
    };

    return golden;
  }

  /**
   * Calculate total rate from rate metrics
   * @param {Object} rateMetrics - Rate metric aggregations
   * @returns {number} Total rate
   */
  calculateTotalRate(rateMetrics) {
    let total = 0;
    
    for (const aggregation of Object.values(rateMetrics)) {
      total += aggregation.sum || 0;
    }
    
    return total;
  }

  /**
   * Calculate error percentage
   * @param {Object} rateMetrics - Rate metric aggregations
   * @param {Object} errorMetrics - Error metric aggregations
   * @returns {number} Error percentage
   */
  calculateErrorPercent(rateMetrics, errorMetrics) {
    const totalRequests = this.calculateTotalRate(rateMetrics);
    const totalErrors = this.calculateTotalRate(errorMetrics);
    
    if (totalRequests === 0) return 0;
    
    return Math.round((totalErrors / totalRequests) * 100);
  }

  /**
   * Calculate average duration
   * @param {Object} durationMetrics - Duration metric aggregations
   * @returns {number} Average duration
   */
  calculateAvgDuration(durationMetrics) {
    let totalDuration = 0;
    let totalCount = 0;
    
    for (const aggregation of Object.values(durationMetrics)) {
      totalDuration += aggregation.sum || 0;
      totalCount += aggregation.count || 0;
    }
    
    return totalCount > 0 ? totalDuration / totalCount : 0;
  }

  /**
   * Calculate utilization percentage
   * @param {Object} saturationMetrics - Saturation metric aggregations
   * @returns {number} Utilization percentage
   */
  calculateUtilization(saturationMetrics) {
    const utilizationMetrics = Object.entries(saturationMetrics)
      .filter(([key]) => key.includes('Usage') || key.includes('Percent'))
      .map(([, agg]) => agg.avg || 0);
    
    if (utilizationMetrics.length === 0) return 0;
    
    const avgUtilization = utilizationMetrics.reduce((sum, val) => sum + val, 0) / 
                          utilizationMetrics.length;
    
    return Math.round(avgUtilization);
  }

  /**
   * Calculate saturation level
   * @param {Object} saturationMetrics - Saturation metric aggregations
   * @returns {number} Saturation level (0-100)
   */
  calculateSaturation(saturationMetrics) {
    // Check queue depth metrics
    const queueDepths = Object.entries(saturationMetrics)
      .filter(([key]) => key.includes('queueDepth') || key.includes('messages'))
      .map(([, agg]) => agg.max || 0);
    
    if (queueDepths.length === 0) return 0;
    
    // Normalize queue depth (assume 10000 messages is 100% saturated)
    const maxQueueDepth = Math.max(...queueDepths);
    const saturation = Math.min(100, (maxQueueDepth / 10000) * 100);
    
    return Math.round(saturation);
  }

  /**
   * Get metric summary by category
   * @returns {Promise<Object>} Category summary
   */
  async getMetricSummary() {
    const current = await this.getCurrentAggregations();
    const summary = {
      timestamp: Date.now(),
      categories: {}
    };

    // Summarize by category
    for (const [category, metricKeys] of Object.entries(this.metricCategories)) {
      summary.categories[category] = {
        metricCount: metricKeys.size,
        metrics: Array.from(metricKeys)
      };

      // Add category-specific insights
      if (category === 'throughput' && current.categories?.[category]) {
        summary.categories[category].totalThroughput = 
          current.categories[category].summary.totalSum;
      }

      if (category === 'errors' && current.categories?.[category]) {
        summary.categories[category].totalErrors = 
          current.categories[category].summary.totalSum;
      }
    }

    // Add golden metrics summary
    if (current.goldenMetrics) {
      summary.goldenMetrics = {
        red: current.goldenMetrics.red,
        use: current.goldenMetrics.use
      };
    }

    return summary;
  }

  /**
   * Get performance insights based on aggregated metrics
   * @returns {Promise<Object>} Performance insights
   */
  async getPerformanceInsights() {
    const current = await this.getCurrentAggregations();
    const insights = {
      timestamp: Date.now(),
      issues: [],
      recommendations: []
    };

    // Check for high error rates
    if (current.goldenMetrics?.red?.errorPercent > 5) {
      insights.issues.push({
        severity: 'high',
        type: 'error_rate',
        message: `High error rate detected: ${current.goldenMetrics.red.errorPercent}%`,
        metric: 'goldenMetrics.red.errorPercent',
        value: current.goldenMetrics.red.errorPercent
      });

      insights.recommendations.push({
        issue: 'error_rate',
        recommendation: 'Investigate error logs and consider implementing retry logic'
      });
    }

    // Check for high saturation
    if (current.goldenMetrics?.use?.saturation > 80) {
      insights.issues.push({
        severity: 'medium',
        type: 'saturation',
        message: `High saturation detected: ${current.goldenMetrics.use.saturation}%`,
        metric: 'goldenMetrics.use.saturation',
        value: current.goldenMetrics.use.saturation
      });

      insights.recommendations.push({
        issue: 'saturation',
        recommendation: 'Consider scaling consumers or increasing processing capacity'
      });
    }

    // Check for latency issues
    if (current.goldenMetrics?.red?.avgDuration > 1000) {
      insights.issues.push({
        severity: 'medium',
        type: 'latency',
        message: `High average latency: ${Math.round(current.goldenMetrics.red.avgDuration)}ms`,
        metric: 'goldenMetrics.red.avgDuration',
        value: current.goldenMetrics.red.avgDuration
      });

      insights.recommendations.push({
        issue: 'latency',
        recommendation: 'Analyze slow operations and optimize message processing'
      });
    }

    return insights;
  }
}

module.exports = MetricAggregator;