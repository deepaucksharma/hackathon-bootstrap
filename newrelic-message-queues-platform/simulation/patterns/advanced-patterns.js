/**
 * Advanced Simulation Patterns for v2.0
 * 
 * Implements realistic data patterns including:
 * - Seasonal variations (daily, weekly, monthly)
 * - Business hour patterns
 * - Anomaly injection
 * - Provider-specific behaviors
 */

class AdvancedPatternGenerator {
  constructor(options = {}) {
    this.timezone = options.timezone || 'UTC';
    this.businessHours = options.businessHours || { start: 9, end: 17 };
    this.weekendReduction = options.weekendReduction || 0.3; // 30% of weekday traffic
    this.anomalyProbability = options.anomalyProbability || 0.01; // 1% chance
  }

  /**
   * Generate a value with multiple overlapping patterns
   */
  generateValue(baseValue, timestamp = Date.now(), patterns = ['business', 'seasonal']) {
    let value = baseValue;
    const date = new Date(timestamp);

    // Apply each pattern
    if (patterns.includes('business')) {
      value *= this.getBusinessHourMultiplier(date);
    }
    if (patterns.includes('seasonal')) {
      value *= this.getSeasonalMultiplier(date);
    }
    if (patterns.includes('weekly')) {
      value *= this.getWeeklyMultiplier(date);
    }
    if (patterns.includes('anomaly')) {
      value = this.injectAnomaly(value);
    }

    // Add natural variance
    value += this.getNaturalVariance(value);

    return Math.max(0, value);
  }

  /**
   * Business hour pattern - peak during work hours
   */
  getBusinessHourMultiplier(date) {
    const hour = date.getHours();
    const dayOfWeek = date.getDay();
    
    // Weekend reduction
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return this.weekendReduction;
    }

    // Business hours peak
    if (hour >= this.businessHours.start && hour <= this.businessHours.end) {
      // Bell curve during business hours
      const midpoint = (this.businessHours.start + this.businessHours.end) / 2;
      const hoursFromMidpoint = Math.abs(hour - midpoint);
      const maxHoursFromMidpoint = (this.businessHours.end - this.businessHours.start) / 2;
      return 1.5 - (0.5 * (hoursFromMidpoint / maxHoursFromMidpoint));
    }

    // Off hours
    if (hour < 6 || hour > 22) {
      return 0.1; // Night time - minimal activity
    }

    // Morning/evening transitions
    return 0.7;
  }

  /**
   * Seasonal pattern - varies by time of year
   */
  getSeasonalMultiplier(date) {
    const month = date.getMonth();
    const dayOfMonth = date.getDate();
    
    // Holiday season spike (November-December)
    if (month === 10 || month === 11) {
      // Black Friday/Cyber Monday spike
      if (month === 10 && dayOfMonth >= 24 && dayOfMonth <= 30) {
        return 2.5;
      }
      return 1.4;
    }
    
    // Summer slowdown (July-August)
    if (month === 6 || month === 7) {
      return 0.8;
    }
    
    // Spring/Fall normal
    return 1.0;
  }

  /**
   * Weekly pattern - varies by day of week
   */
  getWeeklyMultiplier(date) {
    const dayOfWeek = date.getDay();
    
    // Monday spike (catch-up from weekend)
    if (dayOfWeek === 1) return 1.3;
    
    // Mid-week steady
    if (dayOfWeek >= 2 && dayOfWeek <= 4) return 1.1;
    
    // Friday wind-down
    if (dayOfWeek === 5) return 0.9;
    
    // Weekend
    return 0.5;
  }

  /**
   * Inject anomalies based on probability
   */
  injectAnomaly(value) {
    if (Math.random() < this.anomalyProbability) {
      const anomalyType = Math.random();
      
      if (anomalyType < 0.3) {
        // Spike anomaly
        return value * (2 + Math.random() * 3); // 2-5x spike
      } else if (anomalyType < 0.6) {
        // Drop anomaly
        return value * Math.random() * 0.3; // 0-30% of normal
      } else {
        // Gradual drift
        return value * (1 + (Math.random() - 0.5) * 0.5); // ±25% drift
      }
    }
    return value;
  }

  /**
   * Natural variance to make data realistic
   */
  getNaturalVariance(value) {
    // ±5% natural variance
    return value * (Math.random() - 0.5) * 0.1;
  }

  /**
   * Provider-specific patterns
   */
  getProviderSpecificPattern(provider, metricType, baseValue, timestamp) {
    switch (provider) {
      case 'kafka':
        return this.getKafkaPattern(metricType, baseValue, timestamp);
      case 'rabbitmq':
        return this.getRabbitMQPattern(metricType, baseValue, timestamp);
      case 'sqs':
        return this.getSQSPattern(metricType, baseValue, timestamp);
      default:
        return baseValue;
    }
  }

  /**
   * Kafka-specific patterns
   */
  getKafkaPattern(metricType, baseValue, timestamp) {
    const date = new Date(timestamp);
    
    switch (metricType) {
      case 'rebalancing':
        // Kafka rebalancing typically happens during:
        // - Consumer group changes
        // - Partition reassignment
        // - Broker failures
        const hour = date.getHours();
        
        // More likely during deployment windows (2-4 AM)
        if (hour >= 2 && hour <= 4) {
          if (Math.random() < 0.1) { // 10% chance during maintenance window
            return baseValue * 10; // Rebalancing spike
          }
        }
        
        // Random rebalancing events
        if (Math.random() < 0.001) { // 0.1% chance normally
          return baseValue * 5;
        }
        
        return baseValue;
        
      case 'consumer.lag':
        // Consumer lag patterns
        // - Increases during high throughput
        // - Spikes during rebalancing
        // - Gradually decreases during low activity
        let lag = baseValue;
        
        // Business hours increase lag
        lag *= this.getBusinessHourMultiplier(date) * 1.5;
        
        // Add burst patterns
        if (Math.random() < 0.05) {
          lag *= 2 + Math.random() * 3; // 2-5x burst
        }
        
        return lag;
        
      case 'partition.skew':
        // Partition skew patterns
        // Some partitions naturally get more traffic
        const partitionBias = Math.sin(timestamp / 3600000) * 0.3 + 1; // ±30% bias
        return baseValue * partitionBias;
        
      default:
        return baseValue;
    }
  }

  /**
   * RabbitMQ-specific patterns
   */
  getRabbitMQPattern(metricType, baseValue, timestamp) {
    const date = new Date(timestamp);
    
    switch (metricType) {
      case 'queue.memory':
        // Memory usage patterns
        // - Increases with queue depth
        // - Spikes during connection storms
        let memory = baseValue;
        
        // Connection storm simulation
        if (Math.random() < 0.005) { // 0.5% chance
          memory *= 3; // 3x memory spike
        }
        
        return memory;
        
      case 'connection.churn':
        // Connection churn patterns
        // - Higher during deployments
        // - Spikes during network issues
        const hour = date.getHours();
        
        // Deployment hours
        if ((hour >= 2 && hour <= 4) || (hour >= 14 && hour <= 16)) {
          return baseValue * 2;
        }
        
        // Random network issues
        if (Math.random() < 0.002) {
          return baseValue * 10; // Major churn event
        }
        
        return baseValue;
        
      default:
        return baseValue;
    }
  }

  /**
   * AWS SQS-specific patterns
   */
  getSQSPattern(metricType, baseValue, timestamp) {
    switch (metricType) {
      case 'api.throttling':
        // SQS API throttling patterns
        // - More likely during burst traffic
        // - Follows AWS rate limits
        if (Math.random() < 0.01) { // 1% chance
          return baseValue * 5; // Throttling spike
        }
        return baseValue;
        
      case 'message.age':
        // Message age patterns
        // - Increases during processing backlogs
        // - Spikes during consumer failures
        let age = baseValue;
        
        // Simulate processing delays
        if (Math.random() < 0.02) {
          age *= 10 + Math.random() * 20; // 10-30x increase
        }
        
        return age;
        
      default:
        return baseValue;
    }
  }

  /**
   * Generate a complete time series with patterns
   */
  generateTimeSeries(config) {
    const {
      startTime = Date.now() - 86400000, // 24 hours ago
      endTime = Date.now(),
      interval = 60000, // 1 minute
      baseValue = 100,
      patterns = ['business', 'seasonal', 'weekly'],
      provider = null,
      metricType = null
    } = config;

    const series = [];
    
    for (let timestamp = startTime; timestamp <= endTime; timestamp += interval) {
      let value = this.generateValue(baseValue, timestamp, patterns);
      
      // Apply provider-specific patterns if specified
      if (provider && metricType) {
        value = this.getProviderSpecificPattern(provider, metricType, value, timestamp);
      }
      
      series.push({
        timestamp,
        value: Math.round(value * 100) / 100 // Round to 2 decimal places
      });
    }
    
    return series;
  }
}

module.exports = AdvancedPatternGenerator;