/**
 * Test Utilities for v2 Platform Tests
 * Provides common helper functions and mock builders
 */

const { EventEmitter } = require('events');

class MockEventEmitter extends EventEmitter {
  constructor() {
    super();
    this.emittedEvents = [];
  }

  emit(event, ...args) {
    this.emittedEvents.push({ event, args, timestamp: Date.now() });
    return super.emit(event, ...args);
  }

  getEmittedEvents(eventName) {
    return this.emittedEvents.filter(e => e.event === eventName);
  }

  clearEmittedEvents() {
    this.emittedEvents = [];
  }
}

/**
 * Creates a mock mode controller
 */
function createMockModeController(initialMode = 'simulation') {
  const controller = new MockEventEmitter();
  controller.currentMode = initialMode;
  controller.modeConfig = {
    simulation: { enabled: true },
    infrastructure: { enabled: false },
    hybrid: { enabled: false }
  };
  
  controller.getMode = jest.fn(() => controller.currentMode);
  controller.setMode = jest.fn((mode) => {
    const oldMode = controller.currentMode;
    controller.currentMode = mode;
    controller.emit('modeChanged', { from: oldMode, to: mode });
    return Promise.resolve();
  });
  controller.validateMode = jest.fn(() => true);
  controller.isInfrastructureEnabled = jest.fn(() => 
    controller.currentMode === 'infrastructure' || controller.currentMode === 'hybrid'
  );
  controller.isSimulationEnabled = jest.fn(() => 
    controller.currentMode === 'simulation' || controller.currentMode === 'hybrid'
  );
  
  return controller;
}

/**
 * Creates a mock infrastructure discovery service
 */
function createMockDiscoveryService() {
  const service = new MockEventEmitter();
  service.discoveries = new Map();
  
  service.discover = jest.fn(async () => {
    const mockResources = [
      { id: 'kafka-1', type: 'kafka', metadata: { version: '2.8.0' } },
      { id: 'rabbitmq-1', type: 'rabbitmq', metadata: { version: '3.9.0' } }
    ];
    service.discoveries.set('mock', mockResources);
    service.emit('resourcesDiscovered', { provider: 'mock', resources: mockResources });
    return mockResources;
  });
  
  service.getDiscoveredResources = jest.fn(() => 
    Array.from(service.discoveries.values()).flat()
  );
  
  service.startDiscovery = jest.fn();
  service.stopDiscovery = jest.fn();
  
  return service;
}

/**
 * Creates a mock SHIM adapter
 */
function createMockShimAdapter() {
  const adapter = {
    transform: jest.fn(async (resource) => ({
      entityType: 'MESSAGE_QUEUE_CLUSTER',
      guid: `MQC_${resource.id}`,
      name: resource.id,
      provider: resource.type,
      metrics: {
        'mq.cluster.health': 100,
        'mq.cluster.throughput': Math.random() * 1000
      }
    })),
    validate: jest.fn(() => true),
    getMetrics: jest.fn(() => ['mq.cluster.health', 'mq.cluster.throughput'])
  };
  
  return adapter;
}

/**
 * Creates mock streaming data
 */
function createMockStreamData(count = 10) {
  const data = [];
  const baseTime = Date.now();
  
  for (let i = 0; i < count; i++) {
    data.push({
      eventType: 'MessageQueueCluster',
      timestamp: baseTime + (i * 1000),
      guid: `MQC_test_${i}`,
      metrics: {
        'mq.cluster.health': 95 + Math.random() * 5,
        'mq.cluster.throughput': 500 + Math.random() * 500,
        'mq.cluster.lag': Math.random() * 100
      }
    });
  }
  
  return data;
}

/**
 * Performance measurement helper
 */
class PerformanceTracker {
  constructor() {
    this.measurements = new Map();
  }

  start(label) {
    this.measurements.set(label, {
      start: process.hrtime.bigint(),
      end: null,
      duration: null
    });
  }

  end(label) {
    const measurement = this.measurements.get(label);
    if (!measurement) throw new Error(`No measurement started for ${label}`);
    
    measurement.end = process.hrtime.bigint();
    measurement.duration = Number(measurement.end - measurement.start) / 1e6; // Convert to ms
    return measurement.duration;
  }

  getDuration(label) {
    const measurement = this.measurements.get(label);
    return measurement ? measurement.duration : null;
  }

  getAllMeasurements() {
    const results = {};
    this.measurements.forEach((value, key) => {
      if (value.duration !== null) {
        results[key] = value.duration;
      }
    });
    return results;
  }

  reset() {
    this.measurements.clear();
  }
}

/**
 * Async test helper with timeout
 */
async function withTimeout(promise, timeoutMs = 5000) {
  const timeout = new Promise((_, reject) => 
    setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
  );
  
  return Promise.race([promise, timeout]);
}

/**
 * Wait for condition with polling
 */
async function waitForCondition(conditionFn, options = {}) {
  const { timeout = 5000, interval = 100, message = 'Condition not met' } = options;
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await conditionFn()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error(`${message} (timeout: ${timeout}ms)`);
}

/**
 * Mock configuration for tests
 */
function createMockConfig(overrides = {}) {
  return {
    accountId: '12345',
    apiKey: 'test-api-key',
    region: 'US',
    mode: 'simulation',
    streaming: {
      batchSize: 100,
      flushInterval: 1000
    },
    infrastructure: {
      discoveryInterval: 30000,
      providers: ['docker', 'kubernetes']
    },
    ...overrides
  };
}

module.exports = {
  MockEventEmitter,
  createMockModeController,
  createMockDiscoveryService,
  createMockShimAdapter,
  createMockStreamData,
  PerformanceTracker,
  withTimeout,
  waitForCondition,
  createMockConfig
};