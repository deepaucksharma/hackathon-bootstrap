/**
 * Enhanced Data Simulator
 * 
 * Advanced simulation engine with realistic anomaly patterns and business behaviors
 */

const DataSimulator = require('./data-simulator');
const AnomalyPatterns = require('../patterns/anomaly-patterns');

class EnhancedDataSimulator extends DataSimulator {
  constructor(config = {}) {
    super(config);
    
    this.anomalyPatterns = new AnomalyPatterns();
    this.businessPatterns = this.initializeBusinessPatterns();
    this.seasonalFactors = this.initializeSeasonalFactors();
    this.eventCalendar = this.initializeEventCalendar();
    
    // Enhanced configuration
    this.config = {
      ...this.config,
      enableAnomalies: config.enableAnomalies !== false,
      enableBusinessPatterns: config.enableBusinessPatterns !== false,
      enableSeasonality: config.enableSeasonality !== false,
      enableEvents: config.enableEvents !== false,
      anomalyCheckInterval: config.anomalyCheckInterval || 60000, // 1 minute
      metricsUpdateInterval: config.metricsUpdateInterval || 30000 // 30 seconds
    };
    
    // Start continuous simulation if enabled
    if (config.continuous) {
      this.startContinuousSimulation();
    }
  }

  /**
   * Initialize business patterns
   */
  initializeBusinessPatterns() {
    return {
      // Daily patterns
      daily: {
        // Business hours pattern (9 AM - 5 PM)
        businessHours: {
          schedule: [
            { hour: 0, factor: 0.2 },   // Midnight
            { hour: 6, factor: 0.4 },   // Early morning
            { hour: 9, factor: 1.0 },   // Business start
            { hour: 12, factor: 0.8 },  // Lunch dip
            { hour: 13, factor: 1.0 },  // After lunch
            { hour: 15, factor: 1.2 },  // Peak hours
            { hour: 17, factor: 0.7 },  // End of business
            { hour: 20, factor: 0.5 },  // Evening
            { hour: 22, factor: 0.3 }   // Late night
          ]
        },
        
        // 24/7 pattern with peaks
        always_on: {
          schedule: [
            { hour: 0, factor: 0.6 },
            { hour: 3, factor: 0.4 },   // Lowest point
            { hour: 6, factor: 0.7 },
            { hour: 9, factor: 1.0 },
            { hour: 12, factor: 1.1 },
            { hour: 15, factor: 1.2 },  // Peak
            { hour: 18, factor: 1.0 },
            { hour: 21, factor: 0.8 }
          ]
        },
        
        // Batch processing pattern
        batch: {
          schedule: [
            { hour: 0, factor: 2.0 },   // Midnight batch
            { hour: 2, factor: 0.1 },
            { hour: 6, factor: 1.5 },   // Morning batch
            { hour: 8, factor: 0.3 },
            { hour: 12, factor: 0.5 },
            { hour: 18, factor: 1.8 },  // Evening batch
            { hour: 20, factor: 0.2 }
          ]
        }
      },
      
      // Weekly patterns
      weekly: {
        standard: {
          monday: 1.0,
          tuesday: 1.1,
          wednesday: 1.2,
          thursday: 1.1,
          friday: 0.9,
          saturday: 0.4,
          sunday: 0.3
        },
        
        ecommerce: {
          monday: 0.9,
          tuesday: 0.8,
          wednesday: 0.9,
          thursday: 1.0,
          friday: 1.2,
          saturday: 1.5,
          sunday: 1.3
        }
      }
    };
  }

  /**
   * Initialize seasonal factors
   */
  initializeSeasonalFactors() {
    return {
      quarterly: {
        Q1: { factor: 0.9, volatility: 0.1 },
        Q2: { factor: 1.0, volatility: 0.15 },
        Q3: { factor: 0.85, volatility: 0.2 },  // Summer slowdown
        Q4: { factor: 1.25, volatility: 0.25 }  // Holiday rush
      },
      
      monthly: {
        january: 0.8,   // Post-holiday
        february: 0.85,
        march: 0.95,
        april: 1.0,
        may: 1.05,
        june: 1.0,
        july: 0.9,     // Summer
        august: 0.85,
        september: 1.1, // Back to school/work
        october: 1.15,
        november: 1.3,  // Black Friday
        december: 1.2   // Holidays
      }
    };
  }

  /**
   * Initialize event calendar
   */
  initializeEventCalendar() {
    return [
      {
        name: 'Black Friday',
        date: { month: 11, dayOfWeek: 5, weekOfMonth: 4 }, // 4th Friday of November
        impact: { throughput: 3.0, errorRate: 1.5 },
        duration: 86400000 // 24 hours
      },
      {
        name: 'Cyber Monday',
        date: { daysAfter: 'Black Friday', days: 3 },
        impact: { throughput: 2.5, errorRate: 1.3 },
        duration: 86400000
      },
      {
        name: 'System Maintenance',
        recurring: { dayOfWeek: 0, hour: 2 }, // Every Sunday at 2 AM
        impact: { availability: 0.5, throughput: 0.1 },
        duration: 7200000 // 2 hours
      },
      {
        name: 'Monthly Peak',
        recurring: { dayOfMonth: 1 }, // First of each month
        impact: { throughput: 1.8, cpuUsage: 1.5 },
        duration: 14400000 // 4 hours
      }
    ];
  }

  /**
   * Create enhanced topology with metadata
   */
  createTopology(config) {
    const topology = super.createTopology(config);
    
    // Enhance with metadata
    topology.metadata = {
      pattern: config.businessPattern || 'businessHours',
      seasonalProfile: config.seasonalProfile || 'standard',
      anomalyProfile: config.anomalyProfile || 'production',
      created: new Date().toISOString()
    };
    
    // Add topology-wide metrics
    topology.metrics = {
      totalThroughput: 0,
      averageLatency: 0,
      errorRate: 0,
      healthScore: 100
    };
    
    return topology;
  }

  /**
   * Update metrics with all patterns applied
   */
  updateMetricsWithPatterns(entity) {
    // Get base metrics
    this.updateEntityMetrics(entity);
    
    // Apply business patterns
    if (this.config.enableBusinessPatterns) {
      this.applyBusinessPattern(entity);
    }
    
    // Apply seasonal factors
    if (this.config.enableSeasonality) {
      this.applySeasonalFactors(entity);
    }
    
    // Apply event impacts
    if (this.config.enableEvents) {
      this.applyEventImpacts(entity);
    }
    
    // Add realistic noise
    this.addRealisticNoise(entity);
  }

  /**
   * Apply business pattern to entity metrics
   */
  applyBusinessPattern(entity) {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()];
    
    // Get pattern based on entity metadata or default
    const patternName = entity.metadata?.businessPattern || 'businessHours';
    const dailyPattern = this.businessPatterns.daily[patternName];
    const weeklyPattern = this.businessPatterns.weekly.standard;
    
    if (!dailyPattern || !weeklyPattern) return;
    
    // Calculate factors
    const hourlyFactor = this.interpolateHourlyFactor(dailyPattern.schedule, hour);
    const weeklyFactor = weeklyPattern[dayOfWeek] || 1.0;
    const combinedFactor = hourlyFactor * weeklyFactor;
    
    // Apply to throughput metrics
    entity.goldenMetrics?.forEach(metric => {
      if (metric.name.includes('throughput')) {
        metric.value *= combinedFactor;
      }
    });
  }

  /**
   * Apply seasonal factors
   */
  applySeasonalFactors(entity) {
    const now = new Date();
    const month = now.getMonth();
    const quarter = `Q${Math.floor(month / 3) + 1}`;
    
    const quarterlyFactor = this.seasonalFactors.quarterly[quarter];
    const monthlyFactor = this.seasonalFactors.monthly[Object.keys(this.seasonalFactors.monthly)[month]];
    
    if (!quarterlyFactor || !monthlyFactor) return;
    
    // Apply factors with volatility
    const volatility = 1 + (Math.random() - 0.5) * quarterlyFactor.volatility;
    const combinedFactor = quarterlyFactor.factor * monthlyFactor * volatility;
    
    entity.goldenMetrics?.forEach(metric => {
      if (metric.name.includes('throughput') || metric.name.includes('rate')) {
        metric.value *= combinedFactor;
      }
    });
  }

  /**
   * Apply event impacts
   */
  applyEventImpacts(entity) {
    const now = Date.now();
    
    this.eventCalendar.forEach(event => {
      if (this.isEventActive(event, now)) {
        Object.entries(event.impact).forEach(([metricType, factor]) => {
          entity.goldenMetrics?.forEach(metric => {
            if (metric.name.includes(metricType)) {
              metric.value *= factor;
            }
          });
        });
      }
    });
  }

  /**
   * Add realistic noise to metrics
   */
  addRealisticNoise(entity) {
    entity.goldenMetrics?.forEach(metric => {
      // Different noise profiles for different metric types
      let noiseLevel = 0.05; // 5% default
      
      if (metric.name.includes('latency')) {
        noiseLevel = 0.15; // Higher variance for latency
      } else if (metric.name.includes('cpu') || metric.name.includes('memory')) {
        noiseLevel = 0.08; // Medium variance for resources
      } else if (metric.name.includes('error')) {
        noiseLevel = 0.2; // High variance for errors
      }
      
      // Apply Gaussian noise
      const noise = this.gaussianNoise(0, noiseLevel);
      metric.value *= (1 + noise);
      
      // Ensure non-negative
      metric.value = Math.max(0, metric.value);
      
      // Apply bounds if specified
      if (metric.unit === 'percentage') {
        metric.value = Math.min(100, Math.max(0, metric.value));
      }
    });
  }

  /**
   * Start continuous simulation
   */
  startContinuousSimulation() {
    // Update metrics periodically
    this.metricsInterval = setInterval(() => {
      this.updateAllMetrics();
    }, this.config.metricsUpdateInterval);
    
    // Check for anomalies periodically
    if (this.config.enableAnomalies) {
      this.anomalyInterval = setInterval(() => {
        this.checkAndInjectAnomalies();
      }, this.config.anomalyCheckInterval);
    }
    
    // Update active anomalies
    this.anomalyUpdateInterval = setInterval(() => {
      this.anomalyPatterns.updateActiveAnomalies();
    }, 5000); // Every 5 seconds
  }

  /**
   * Stop continuous simulation
   */
  stopContinuousSimulation() {
    clearInterval(this.metricsInterval);
    clearInterval(this.anomalyInterval);
    clearInterval(this.anomalyUpdateInterval);
  }

  /**
   * Update all entity metrics
   */
  updateAllMetrics() {
    if (!this.currentTopology) return;
    
    // Update all entities
    [...this.currentTopology.clusters, 
     ...this.currentTopology.brokers,
     ...this.currentTopology.topics].forEach(entity => {
      this.updateMetricsWithPatterns(entity);
    });
    
    // Update topology-wide metrics
    this.updateTopologyMetrics();
  }

  /**
   * Check and inject anomalies
   */
  checkAndInjectAnomalies() {
    if (!this.currentTopology) return;
    
    const allEntities = [
      ...this.currentTopology.clusters,
      ...this.currentTopology.brokers,
      ...this.currentTopology.topics
    ];
    
    const injected = this.anomalyPatterns.checkForAnomalies(allEntities, {
      topology: this.currentTopology
    });
    
    if (injected.length > 0) {
      console.log(`Injected ${injected.length} anomalies:`, 
        injected.map(a => `${a.pattern} on ${a.entity.name}`));
    }
  }

  /**
   * Update topology-wide metrics
   */
  updateTopologyMetrics() {
    const topology = this.currentTopology;
    if (!topology) return;
    
    // Calculate aggregate metrics
    let totalThroughput = 0;
    let totalLatency = 0;
    let totalErrors = 0;
    let entityCount = 0;
    
    topology.topics.forEach(topic => {
      const throughputIn = topic.goldenMetrics.find(m => m.name === 'topic.throughput.in')?.value || 0;
      const throughputOut = topic.goldenMetrics.find(m => m.name === 'topic.throughput.out')?.value || 0;
      totalThroughput += throughputIn + throughputOut;
    });
    
    topology.brokers.forEach(broker => {
      const latency = broker.goldenMetrics.find(m => m.name === 'broker.request.latency')?.value || 0;
      totalLatency += latency;
      entityCount++;
    });
    
    topology.clusters.forEach(cluster => {
      const errorRate = cluster.goldenMetrics.find(m => m.name === 'cluster.error.rate')?.value || 0;
      totalErrors += errorRate;
    });
    
    topology.metrics.totalThroughput = totalThroughput;
    topology.metrics.averageLatency = entityCount > 0 ? totalLatency / entityCount : 0;
    topology.metrics.errorRate = topology.clusters.length > 0 ? totalErrors / topology.clusters.length : 0;
    topology.metrics.healthScore = this.calculateTopologyHealth(topology);
  }

  /**
   * Calculate overall topology health
   */
  calculateTopologyHealth(topology) {
    let healthScore = 100;
    
    // Deduct for high error rates
    if (topology.metrics.errorRate > 5) {
      healthScore -= Math.min(30, topology.metrics.errorRate * 2);
    }
    
    // Deduct for high latency
    if (topology.metrics.averageLatency > 500) {
      healthScore -= Math.min(20, (topology.metrics.averageLatency - 500) / 50);
    }
    
    // Deduct for active anomalies
    const activeAnomalies = this.anomalyPatterns.activeAnomalies.size;
    healthScore -= Math.min(30, activeAnomalies * 10);
    
    // Deduct for degraded entities
    const degradedBrokers = topology.brokers.filter(b => {
      const cpu = b.goldenMetrics.find(m => m.name === 'broker.cpu.usage')?.value || 0;
      return cpu > 90;
    }).length;
    
    healthScore -= Math.min(20, degradedBrokers * 5);
    
    return Math.max(0, Math.min(100, healthScore));
  }

  // Helper methods
  interpolateHourlyFactor(schedule, hour) {
    // Find surrounding schedule points
    let before = schedule[0];
    let after = schedule[0];
    
    for (const point of schedule) {
      if (point.hour <= hour) {
        before = point;
      }
      if (point.hour >= hour) {
        after = point;
        break;
      }
    }
    
    // Linear interpolation
    if (before.hour === after.hour) {
      return before.factor;
    }
    
    const progress = (hour - before.hour) / (after.hour - before.hour);
    return before.factor + (after.factor - before.factor) * progress;
  }

  isEventActive(event, now) {
    // Implementation for checking if an event is currently active
    // This is simplified - real implementation would handle all event types
    if (event.recurring?.dayOfWeek !== undefined) {
      const currentDay = new Date(now).getDay();
      const currentHour = new Date(now).getHours();
      return currentDay === event.recurring.dayOfWeek && 
             currentHour === event.recurring.hour;
    }
    return false;
  }

  gaussianNoise(mean, stdDev) {
    // Box-Muller transform for Gaussian distribution
    let u1 = Math.random();
    let u2 = Math.random();
    let z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z0 * stdDev;
  }
}

module.exports = EnhancedDataSimulator;