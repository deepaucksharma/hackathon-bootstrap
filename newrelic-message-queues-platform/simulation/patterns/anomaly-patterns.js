/**
 * Advanced Anomaly Detection Patterns
 * 
 * Sophisticated anomaly patterns for realistic production simulations
 */

class AnomalyPatterns {
  constructor() {
    this.patterns = this.initializePatterns();
    this.activeAnomalies = new Map();
  }

  /**
   * Initialize anomaly pattern definitions
   */
  initializePatterns() {
    return {
      // Cascading Failure Pattern
      cascadingFailure: {
        name: 'Cascading Failure',
        description: 'One broker failure triggers failures in dependent brokers',
        probability: 0.001,
        duration: { min: 300000, max: 900000 }, // 5-15 minutes
        severity: 'critical',
        metrics: {
          'broker.status': 'down',
          'broker.cpu.usage': 0,
          'broker.memory.usage': 0,
          'broker.network.throughput': 0,
          'cluster.health.score': -30 // Reduces cluster health
        },
        propagation: {
          probability: 0.4, // 40% chance to affect neighbor
          delay: 30000, // 30 seconds
          maxHops: 3
        }
      },

      // Consumer Lag Spike
      consumerLagSpike: {
        name: 'Consumer Lag Spike',
        description: 'Sudden increase in consumer lag due to processing issues',
        probability: 0.02,
        duration: { min: 120000, max: 600000 }, // 2-10 minutes
        severity: 'warning',
        metrics: {
          'topic.consumer.lag': { multiplier: 10, additive: 5000 },
          'topic.throughput.out': { multiplier: 0.3 },
          'topic.error.rate': 5.5
        },
        recovery: {
          type: 'gradual',
          steps: 10,
          interval: 30000
        }
      },

      // Network Partition
      networkPartition: {
        name: 'Network Partition',
        description: 'Network split causing cluster partitioning',
        probability: 0.0005,
        duration: { min: 180000, max: 600000 }, // 3-10 minutes
        severity: 'critical',
        metrics: {
          'broker.network.throughput': { multiplier: 0.1 },
          'broker.request.latency': { multiplier: 10, additive: 500 },
          'cluster.availability': -20,
          'cluster.error.rate': 15
        },
        affectedPercentage: 0.3 // Affects 30% of brokers
      },

      // Thundering Herd
      thunderingHerd: {
        name: 'Thundering Herd',
        description: 'Sudden surge in traffic overwhelming the system',
        probability: 0.01,
        duration: { min: 60000, max: 180000 }, // 1-3 minutes
        severity: 'major',
        metrics: {
          'cluster.throughput.total': { multiplier: 5 },
          'broker.cpu.usage': { multiplier: 1.8, max: 95 },
          'broker.memory.usage': { multiplier: 1.5, max: 90 },
          'broker.request.latency': { multiplier: 3 },
          'topic.error.rate': 8
        },
        rampUp: {
          duration: 15000, // 15 seconds to peak
          steps: 5
        }
      },

      // Memory Leak
      memoryLeak: {
        name: 'Memory Leak',
        description: 'Gradual memory exhaustion in broker',
        probability: 0.005,
        duration: { min: 1800000, max: 3600000 }, // 30-60 minutes
        severity: 'major',
        metrics: {
          'broker.memory.usage': {
            type: 'linear',
            startValue: 'current',
            endValue: 98,
            jitter: 2
          },
          'broker.request.latency': {
            type: 'exponential',
            base: 1.1,
            multiplier: 'elapsed_minutes'
          }
        },
        sideEffects: {
          gcPauses: {
            frequency: 60000, // Every minute
            duration: { min: 100, max: 5000 },
            impact: {
              'broker.request.latency': { additive: 1000 }
            }
          }
        }
      },

      // Disk Saturation
      diskSaturation: {
        name: 'Disk I/O Saturation',
        description: 'Disk I/O bottleneck affecting performance',
        probability: 0.008,
        duration: { min: 300000, max: 900000 }, // 5-15 minutes
        severity: 'major',
        metrics: {
          'broker.disk.usage': { min: 85, max: 98 },
          'broker.disk.io.wait': { min: 50, max: 90 },
          'broker.request.latency': { multiplier: 2.5 },
          'topic.throughput.in': { multiplier: 0.5 },
          'topic.error.rate': 3.5
        }
      },

      // Rebalancing Storm
      rebalancingStorm: {
        name: 'Rebalancing Storm',
        description: 'Excessive partition rebalancing causing instability',
        probability: 0.003,
        duration: { min: 600000, max: 1200000 }, // 10-20 minutes
        severity: 'major',
        phases: [
          {
            name: 'initial',
            duration: 0.2, // 20% of total
            metrics: {
              'cluster.rebalancing': true,
              'broker.cpu.usage': { additive: 20 },
              'topic.availability': { multiplier: 0.8 }
            }
          },
          {
            name: 'storm',
            duration: 0.6, // 60% of total
            metrics: {
              'cluster.rebalancing': true,
              'broker.cpu.usage': { random: { min: 40, max: 90 } },
              'topic.throughput.in': { random: { min: 0.3, max: 1.2 } },
              'topic.consumer.lag': { multiplier: 3 }
            }
          },
          {
            name: 'recovery',
            duration: 0.2, // 20% of total
            metrics: {
              'cluster.rebalancing': false,
              'broker.cpu.usage': { converge: 'normal', rate: 0.1 },
              'topic.consumer.lag': { converge: 'normal', rate: 0.05 }
            }
          }
        ]
      },

      // Byzantine Behavior
      byzantineBehavior: {
        name: 'Byzantine Behavior',
        description: 'Broker behaving erratically but not failing',
        probability: 0.001,
        duration: { min: 600000, max: 1800000 }, // 10-30 minutes
        severity: 'major',
        metrics: {
          'broker.status': 'degraded',
          'broker.cpu.usage': { oscillate: { min: 10, max: 90, period: 60000 } },
          'broker.request.latency': { 
            random: { min: 50, max: 2000 },
            spikes: { probability: 0.1, multiplier: 10 }
          },
          'broker.error.rate': { random: { min: 0, max: 25 } }
        }
      },

      // Poison Message
      poisonMessage: {
        name: 'Poison Message',
        description: 'Message causing repeated processing failures',
        probability: 0.005,
        duration: { min: 300000, max: 1800000 }, // 5-30 minutes
        severity: 'warning',
        targetType: 'topic',
        metrics: {
          'topic.error.rate': 35,
          'topic.retry.rate': { multiplier: 20 },
          'topic.dlq.rate': { additive: 100 },
          'topic.consumer.lag': { type: 'sawtooth', period: 60000, amplitude: 1000 }
        }
      },

      // Coordinator Failure
      coordinatorFailure: {
        name: 'Coordinator Failure',
        description: 'Cluster coordinator failure causing leadership election',
        probability: 0.002,
        duration: { min: 60000, max: 180000 }, // 1-3 minutes
        severity: 'critical',
        metrics: {
          'cluster.coordinator.status': 'electing',
          'cluster.health.score': 40,
          'cluster.availability': 70,
          'broker.request.latency': { multiplier: 5 },
          'topic.throughput.in': { multiplier: 0.2 }
        },
        recovery: {
          type: 'stepped',
          steps: [
            { at: 0.3, metrics: { 'cluster.coordinator.status': 'elected' } },
            { at: 0.5, metrics: { 'cluster.health.score': 60 } },
            { at: 0.7, metrics: { 'cluster.availability': 85 } },
            { at: 1.0, metrics: { 'cluster.health.score': 95 } }
          ]
        }
      }
    };
  }

  /**
   * Inject anomaly into entity
   */
  injectAnomaly(entity, pattern, options = {}) {
    const anomaly = this.patterns[pattern];
    if (!anomaly) {
      throw new Error(`Unknown anomaly pattern: ${pattern}`);
    }

    const anomalyId = `${entity.guid}-${pattern}-${Date.now()}`;
    const duration = this.randomBetween(anomaly.duration.min, anomaly.duration.max);
    
    const anomalyInstance = {
      id: anomalyId,
      pattern,
      entity,
      startTime: Date.now(),
      endTime: Date.now() + duration,
      duration,
      severity: anomaly.severity,
      phase: 0,
      originalMetrics: this.captureMetrics(entity)
    };

    this.activeAnomalies.set(anomalyId, anomalyInstance);
    this.applyAnomalyMetrics(entity, anomaly.metrics);

    // Schedule recovery
    setTimeout(() => {
      this.recoverFromAnomaly(anomalyId);
    }, duration);

    // Handle propagation if defined
    if (anomaly.propagation && options.topology) {
      this.propagateAnomaly(entity, anomaly, options.topology);
    }

    return anomalyInstance;
  }

  /**
   * Apply anomaly metrics to entity
   */
  applyAnomalyMetrics(entity, metricsConfig) {
    Object.entries(metricsConfig).forEach(([metricName, config]) => {
      const currentValue = this.getMetricValue(entity, metricName);
      let newValue;

      if (typeof config === 'number') {
        newValue = config;
      } else if (typeof config === 'object') {
        if (config.multiplier !== undefined) {
          newValue = currentValue * config.multiplier;
        }
        if (config.additive !== undefined) {
          newValue = (newValue || currentValue) + config.additive;
        }
        if (config.random !== undefined) {
          newValue = this.randomBetween(config.random.min, config.random.max);
        }
        if (config.oscillate !== undefined) {
          const phase = (Date.now() % config.oscillate.period) / config.oscillate.period;
          const amplitude = (config.oscillate.max - config.oscillate.min) / 2;
          const center = (config.oscillate.max + config.oscillate.min) / 2;
          newValue = center + amplitude * Math.sin(2 * Math.PI * phase);
        }
        if (config.max !== undefined) {
          newValue = Math.min(newValue, config.max);
        }
        if (config.min !== undefined) {
          newValue = Math.max(newValue, config.min);
        }
      }

      this.setMetricValue(entity, metricName, newValue);
    });
  }

  /**
   * Recover from anomaly
   */
  recoverFromAnomaly(anomalyId) {
    const anomalyInstance = this.activeAnomalies.get(anomalyId);
    if (!anomalyInstance) return;

    const { entity, originalMetrics } = anomalyInstance;
    
    // Restore original metrics
    Object.entries(originalMetrics).forEach(([metricName, value]) => {
      this.setMetricValue(entity, metricName, value);
    });

    this.activeAnomalies.delete(anomalyId);
  }

  /**
   * Propagate anomaly to related entities
   */
  propagateAnomaly(sourceEntity, anomaly, topology) {
    if (Math.random() > anomaly.propagation.probability) return;

    setTimeout(() => {
      const relatedEntities = this.findRelatedEntities(sourceEntity, topology);
      const targetEntity = relatedEntities[Math.floor(Math.random() * relatedEntities.length)];
      
      if (targetEntity) {
        this.injectAnomaly(targetEntity, anomaly.name, { 
          topology,
          propagationDepth: (anomaly.propagationDepth || 0) + 1
        });
      }
    }, anomaly.propagation.delay);
  }

  /**
   * Check for anomaly triggers
   */
  checkForAnomalies(entities, options = {}) {
    const injectedAnomalies = [];

    Object.entries(this.patterns).forEach(([patternName, pattern]) => {
      if (Math.random() < pattern.probability) {
        const eligibleEntities = entities.filter(e => 
          this.isEligibleForAnomaly(e, pattern)
        );

        if (eligibleEntities.length > 0) {
          const targetEntity = eligibleEntities[
            Math.floor(Math.random() * eligibleEntities.length)
          ];

          const anomaly = this.injectAnomaly(targetEntity, patternName, options);
          injectedAnomalies.push(anomaly);
        }
      }
    });

    return injectedAnomalies;
  }

  /**
   * Update active anomalies
   */
  updateActiveAnomalies() {
    const now = Date.now();
    
    this.activeAnomalies.forEach((anomaly, id) => {
      if (now >= anomaly.endTime) {
        this.recoverFromAnomaly(id);
      } else {
        // Update phased anomalies
        const pattern = this.patterns[anomaly.pattern];
        if (pattern.phases) {
          this.updatePhasedAnomaly(anomaly, pattern);
        }
      }
    });
  }

  // Helper methods
  captureMetrics(entity) {
    const metrics = {};
    if (entity.goldenMetrics) {
      entity.goldenMetrics.forEach(metric => {
        metrics[metric.name] = metric.value;
      });
    }
    return metrics;
  }

  getMetricValue(entity, metricName) {
    const metric = entity.goldenMetrics?.find(m => m.name === metricName);
    return metric?.value || 0;
  }

  setMetricValue(entity, metricName, value) {
    const metric = entity.goldenMetrics?.find(m => m.name === metricName);
    if (metric) {
      metric.value = value;
    }
  }

  randomBetween(min, max) {
    return Math.random() * (max - min) + min;
  }

  findRelatedEntities(entity, topology) {
    // Find entities related to the given entity
    if (entity.entityType === 'MESSAGE_QUEUE_BROKER') {
      return topology.brokers.filter(b => 
        b.clusterGuid === entity.clusterGuid && b.guid !== entity.guid
      );
    }
    return [];
  }

  isEligibleForAnomaly(entity, pattern) {
    // Check if entity is eligible for this anomaly pattern
    if (pattern.targetType && entity.entityType !== pattern.targetType) {
      return false;
    }
    
    // Don't apply multiple anomalies to same entity
    for (const [, anomaly] of this.activeAnomalies) {
      if (anomaly.entity.guid === entity.guid) {
        return false;
      }
    }
    
    return true;
  }

  updatePhasedAnomaly(anomaly, pattern) {
    const elapsed = Date.now() - anomaly.startTime;
    const progress = elapsed / anomaly.duration;
    
    let currentPhaseIndex = 0;
    let accumulatedDuration = 0;
    
    for (let i = 0; i < pattern.phases.length; i++) {
      accumulatedDuration += pattern.phases[i].duration;
      if (progress <= accumulatedDuration) {
        currentPhaseIndex = i;
        break;
      }
    }
    
    if (currentPhaseIndex !== anomaly.phase) {
      anomaly.phase = currentPhaseIndex;
      const phase = pattern.phases[currentPhaseIndex];
      this.applyAnomalyMetrics(anomaly.entity, phase.metrics);
    }
  }
}

module.exports = AnomalyPatterns;