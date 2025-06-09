/**
 * Infrastructure Entity Simulator
 * 
 * Wrapper for DataSimulator that safely handles infrastructure entities
 * that don't have the same methods as simulated entities.
 */

class InfraEntitySimulator {
  /**
   * Update topic metrics for infrastructure entities
   */
  static updateTopicMetrics(topic) {
    const topicName = topic.topicName || topic.topic || topic.name || 'default';
    
    // Calculate realistic metrics
    const baseLoad = this.getTopicLoad(topicName);
    const businessMultiplier = this.getBusinessHourMultiplier();
    const variation = 1 + ((Math.random() - 0.5) * 0.4); // ±20% variation
    
    const throughputIn = Math.max(0, Math.round(baseLoad.throughputIn * businessMultiplier * variation));
    const throughputOut = Math.max(0, Math.round(baseLoad.throughputOut * businessMultiplier * variation));
    
    // Consumer lag based on throughput imbalance
    const lagAccumulation = Math.max(0, throughputIn - throughputOut);
    const existingLag = topic['topic.consumer.lag'] || 0;
    const newLag = Math.max(0, existingLag + lagAccumulation - (throughputOut * 0.1));
    
    // Update properties directly
    topic['topic.messagesInPerSecond'] = throughputIn;
    topic['topic.messagesOutPerSecond'] = throughputOut;
    topic['topic.bytesInPerSecond'] = throughputIn * 1024; // Approximate bytes
    topic['topic.bytesOutPerSecond'] = throughputOut * 1024;
    topic['topic.consumer.lag'] = Math.round(newLag);
    topic['topic.error.rate'] = 0.1 + (Math.random() < 0.05 ? Math.random() * 5 : 0); // 5% chance of error spike
    
    return topic;
  }

  /**
   * Update broker metrics for infrastructure entities
   */
  static updateBrokerMetrics(broker) {
    const isController = broker.brokerId === '0' || broker.brokerId === 0;
    const baseLoad = this.getBrokerLoad(isController);
    const variation = (Math.random() - 0.5) * 20; // ±10% variation
    
    const cpuUsage = Math.max(5, Math.min(95, baseLoad.cpu + variation));
    const memoryUsage = Math.max(10, Math.min(90, baseLoad.memory + variation));
    const networkThroughput = Math.max(0, baseLoad.network + (variation * 1000000));
    
    // Update properties directly
    broker['broker.cpu.usage'] = Number(cpuUsage.toFixed(1));
    broker['broker.memory.usage'] = Number(memoryUsage.toFixed(1));
    broker['broker.networkThroughput'] = Math.round(networkThroughput);
    broker['broker.requestLatency'] = Math.max(1, baseLoad.latency + (Math.random() * 10));
    
    // Inject anomalies occasionally (5% chance)
    if (Math.random() < 0.05) {
      broker['broker.cpu.usage'] = Math.min(100, broker['broker.cpu.usage'] + 20);
      broker['broker.memory.usage'] = Math.min(100, broker['broker.memory.usage'] + 15);
    }
    
    return broker;
  }

  /**
   * Get topic load patterns
   */
  static getTopicLoad(topicName) {
    const lowerName = (topicName || 'default').toLowerCase();
    
    if (lowerName.includes('events') || lowerName.includes('logs')) {
      return { throughputIn: 5000, throughputOut: 4800 };
    }
    
    if (lowerName.includes('analytics') || lowerName.includes('metrics')) {
      return { throughputIn: 2000, throughputOut: 1950 };
    }
    
    return { throughputIn: 500, throughputOut: 490 };
  }

  /**
   * Get broker load patterns
   */
  static getBrokerLoad(isController) {
    const baseLoad = {
      cpu: 45,
      memory: 60,
      network: 50000000, // 50MB/s
      latency: 15
    };

    if (isController) {
      baseLoad.cpu += 10;
      baseLoad.memory += 5;
      baseLoad.latency += 5;
    }

    return baseLoad;
  }

  /**
   * Get business hour multiplier
   */
  static getBusinessHourMultiplier(date = new Date()) {
    const hour = date.getHours();
    const dayOfWeek = date.getDay();
    
    // Weekend reduction
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return 0.3;
    }
    
    // Business hours pattern
    if (hour >= 9 && hour <= 17) {
      if ((hour >= 10 && hour <= 11) || (hour >= 14 && hour <= 15)) {
        return 1.3;
      }
      return 1.0;
    }
    
    // Evening hours
    if (hour >= 18 && hour <= 22) {
      return 0.6;
    }
    
    // Night hours
    return 0.2;
  }
}

module.exports = InfraEntitySimulator;