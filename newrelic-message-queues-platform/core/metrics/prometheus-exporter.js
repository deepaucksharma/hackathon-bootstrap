/**
 * Prometheus Metrics Exporter
 * 
 * Exports platform metrics in Prometheus format for integration
 * with Prometheus/Grafana monitoring stack.
 */

class PrometheusExporter {
  constructor() {
    this.metrics = new Map();
    this.lastExport = Date.now();
  }

  /**
   * Register a metric
   */
  registerMetric(name, type, help, labels = []) {
    this.metrics.set(name, {
      type,
      help,
      labels,
      values: new Map()
    });
  }

  /**
   * Set metric value
   */
  setMetric(name, value, labels = {}) {
    const metric = this.metrics.get(name);
    if (!metric) {
      throw new Error(`Metric ${name} not registered`);
    }
    
    const labelKey = this._createLabelKey(labels);
    metric.values.set(labelKey, { value, labels, timestamp: Date.now() });
  }

  /**
   * Increment counter metric
   */
  incrementCounter(name, labels = {}, value = 1) {
    const metric = this.metrics.get(name);
    if (!metric) {
      throw new Error(`Metric ${name} not registered`);
    }
    
    const labelKey = this._createLabelKey(labels);
    const current = metric.values.get(labelKey) || { value: 0, labels, timestamp: Date.now() };
    current.value += value;
    current.timestamp = Date.now();
    metric.values.set(labelKey, current);
  }

  /**
   * Create label key for metric storage
   */
  _createLabelKey(labels) {
    return Object.keys(labels)
      .sort()
      .map(key => `${key}="${labels[key]}"`)
      .join(',');
  }

  /**
   * Format labels for Prometheus output
   */
  _formatLabels(labels) {
    const labelPairs = Object.keys(labels).map(key => `${key}="${labels[key]}"`);
    return labelPairs.length > 0 ? `{${labelPairs.join(',')}}` : '';
  }

  /**
   * Export metrics in Prometheus text format
   */
  export() {
    const output = [];
    const timestamp = Date.now();
    
    for (const [name, metric] of this.metrics) {
      // Add help comment
      output.push(`# HELP ${name} ${metric.help}`);
      output.push(`# TYPE ${name} ${metric.type}`);
      
      // Add metric values
      for (const [labelKey, data] of metric.values) {
        const labels = this._formatLabels(data.labels);
        output.push(`${name}${labels} ${data.value} ${data.timestamp}`);
      }
      
      output.push(''); // Empty line between metrics
    }
    
    this.lastExport = timestamp;
    return output.join('\n');
  }

  /**
   * Initialize platform metrics
   */
  initializePlatformMetrics() {
    // Platform status metrics
    this.registerMetric(
      'platform_running',
      'gauge',
      'Platform running status (1=running, 0=stopped)',
      ['mode', 'provider']
    );
    
    this.registerMetric(
      'platform_uptime_seconds',
      'counter',
      'Platform uptime in seconds',
      ['mode']
    );
    
    this.registerMetric(
      'platform_cycles_total',
      'counter',
      'Total number of platform cycles executed',
      ['mode']
    );
    
    this.registerMetric(
      'platform_cycle_duration_seconds',
      'histogram',
      'Platform cycle duration in seconds',
      ['mode']
    );
    
    // Entity metrics
    this.registerMetric(
      'entities_total',
      'gauge',
      'Total number of entities by type',
      ['entity_type', 'provider']
    );
    
    this.registerMetric(
      'entities_created_total',
      'counter',
      'Total number of entities created',
      ['entity_type', 'provider']
    );
    
    // Streaming metrics
    this.registerMetric(
      'streaming_events_sent_total',
      'counter',
      'Total events sent to New Relic',
      ['type']
    );
    
    this.registerMetric(
      'streaming_events_failed_total',
      'counter',
      'Total events that failed to send',
      ['type', 'error_code']
    );
    
    this.registerMetric(
      'streaming_queue_size',
      'gauge',
      'Current streaming queue size',
      ['type']
    );
    
    this.registerMetric(
      'streaming_circuit_breaker_state',
      'gauge',
      'Circuit breaker state (0=closed, 1=open, 2=half-open)',
      ['component']
    );
    
    // Health check metrics
    this.registerMetric(
      'health_check_status',
      'gauge',
      'Health check status (1=healthy, 0=unhealthy)',
      ['check_name', 'critical']
    );
    
    this.registerMetric(
      'health_check_duration_seconds',
      'histogram',
      'Health check duration in seconds',
      ['check_name']
    );
    
    // Message queue specific metrics
    this.registerMetric(
      'message_queue_cluster_health_score',
      'gauge',
      'Message queue cluster health score',
      ['cluster_name', 'provider']
    );
    
    this.registerMetric(
      'message_queue_broker_cpu_usage',
      'gauge',
      'Message queue broker CPU usage percentage',
      ['cluster_name', 'broker_id', 'provider']
    );
    
    this.registerMetric(
      'message_queue_topic_messages_per_second',
      'gauge',
      'Messages per second for topics',
      ['cluster_name', 'topic_name', 'provider', 'direction']
    );
    
    this.registerMetric(
      'message_queue_consumer_group_lag',
      'gauge',
      'Consumer group lag in messages',
      ['cluster_name', 'consumer_group_id', 'provider']
    );
    
    // Infrastructure collection metrics
    this.registerMetric(
      'infrastructure_collection_duration_seconds',
      'histogram',
      'Infrastructure data collection duration',
      ['provider', 'component']
    );
    
    this.registerMetric(
      'infrastructure_collection_errors_total',
      'counter',
      'Infrastructure data collection errors',
      ['provider', 'component', 'error_type']
    );
  }

  /**
   * Update metrics from platform stats
   */
  updateFromPlatformStats(platform) {
    const stats = platform.getStats ? platform.getStats() : {};
    const startTime = process.hrtime.bigint();
    
    // Platform metrics
    this.setMetric('platform_running', platform.running ? 1 : 0, {
      mode: platform.mode || 'unknown',
      provider: platform.options?.provider || 'unknown'
    });
    
    this.setMetric('platform_uptime_seconds', process.uptime(), {
      mode: platform.mode || 'unknown'
    });
    
    // Streaming metrics
    if (stats.streaming) {
      this.setMetric('streaming_events_sent_total', stats.streaming.eventsSent || 0, { type: 'events' });
      this.setMetric('streaming_events_sent_total', stats.streaming.metricsSent || 0, { type: 'metrics' });
      this.setMetric('streaming_events_failed_total', stats.streaming.errors || 0, { type: 'all', error_code: 'unknown' });
      
      // Circuit breaker state
      const cbState = stats.streaming.circuitBreakerState || 'CLOSED';
      const stateValue = cbState === 'CLOSED' ? 0 : cbState === 'OPEN' ? 1 : 2;
      this.setMetric('streaming_circuit_breaker_state', stateValue, { component: 'streaming' });
    }
    
    // Entity metrics
    if (stats.topology) {
      this.setMetric('entities_total', stats.topology.clusters || 0, {
        entity_type: 'MESSAGE_QUEUE_CLUSTER',
        provider: platform.options?.provider || 'unknown'
      });
      
      this.setMetric('entities_total', stats.topology.brokers || 0, {
        entity_type: 'MESSAGE_QUEUE_BROKER',
        provider: platform.options?.provider || 'unknown'
      });
      
      this.setMetric('entities_total', stats.topology.topics || 0, {
        entity_type: 'MESSAGE_QUEUE_TOPIC',
        provider: platform.options?.provider || 'unknown'
      });
      
      this.setMetric('entities_total', stats.topology.consumerGroups || 0, {
        entity_type: 'MESSAGE_QUEUE_CONSUMER_GROUP',
        provider: platform.options?.provider || 'unknown'
      });
    }
    
    // Error recovery metrics
    if (stats.errorRecovery) {
      const health = stats.errorRecovery.systemHealth || {};
      this.setMetric('health_check_status', health.healthy ? 1 : 0, {
        check_name: 'system',
        critical: 'true'
      });
    }
  }

  /**
   * Update health check metrics
   */
  updateHealthMetrics(healthResults) {
    if (!healthResults || !healthResults.checks) return;
    
    healthResults.checks.forEach(check => {
      this.setMetric('health_check_status', check.healthy ? 1 : 0, {
        check_name: check.name,
        critical: this._isCriticalCheck(check.name) ? 'true' : 'false'
      });
      
      if (check.duration) {
        this.setMetric('health_check_duration_seconds', check.duration / 1000, {
          check_name: check.name
        });
      }
    });
  }

  /**
   * Check if health check is critical
   */
  _isCriticalCheck(checkName) {
    const criticalChecks = ['config', 'secrets', 'platform', 'streaming'];
    return criticalChecks.includes(checkName);
  }

  /**
   * Get registry statistics
   */
  getStats() {
    return {
      totalMetrics: this.metrics.size,
      totalValues: Array.from(this.metrics.values()).reduce((sum, metric) => sum + metric.values.size, 0),
      lastExport: this.lastExport
    };
  }

  /**
   * Clear all metric values (useful for testing)
   */
  clear() {
    for (const metric of this.metrics.values()) {
      metric.values.clear();
    }
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.metrics.clear();
    this.initializePlatformMetrics();
  }
}

// Singleton instance
let prometheusExporter = null;

/**
 * Get singleton Prometheus exporter
 */
function getPrometheusExporter() {
  if (!prometheusExporter) {
    prometheusExporter = new PrometheusExporter();
    prometheusExporter.initializePlatformMetrics();
  }
  return prometheusExporter;
}

module.exports = {
  PrometheusExporter,
  getPrometheusExporter
};