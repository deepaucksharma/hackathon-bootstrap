/**
 * Unit Tests for Platform Orchestrator
 * Tests orchestration logic, component coordination, and lifecycle management
 */

const PlatformOrchestrator = require('../../platform-orchestrator');
const ModeController = require('../../mode-controller');
const StreamingOrchestrator = require('../../streaming-orchestrator');
const { DataSimulator } = require('../../../simulation/engines/data-simulator');
const { DiscoveryOrchestrator } = require('../../../infrastructure/discovery/discovery-orchestrator');
const { ShimOrchestrator } = require('../../../shim/shim-orchestrator');
const { 
  createMockModeController, 
  createMockDiscoveryService,
  createMockShimAdapter,
  MockEventEmitter,
  waitForCondition 
} = require('../helpers/test-utils');
const { infrastructureResources } = require('../fixtures/test-data');

// Mock all dependencies
jest.mock('../../mode-controller');
jest.mock('../../streaming-orchestrator');
jest.mock('../../../simulation/engines/data-simulator');
jest.mock('../../../infrastructure/discovery/discovery-orchestrator');
jest.mock('../../../shim/shim-orchestrator');

describe('PlatformOrchestrator', () => {
  let orchestrator;
  let mockModeController;
  let mockStreamingOrchestrator;
  let mockDataSimulator;
  let mockDiscoveryOrchestrator;
  let mockShimOrchestrator;

  beforeEach(() => {
    // Setup mocks
    mockModeController = createMockModeController();
    ModeController.mockImplementation(() => mockModeController);

    mockStreamingOrchestrator = new MockEventEmitter();
    mockStreamingOrchestrator.start = jest.fn();
    mockStreamingOrchestrator.stop = jest.fn();
    mockStreamingOrchestrator.stream = jest.fn();
    mockStreamingOrchestrator.getStats = jest.fn(() => ({ 
      totalEvents: 100, 
      successfulEvents: 98 
    }));
    StreamingOrchestrator.mockImplementation(() => mockStreamingOrchestrator);

    mockDataSimulator = new MockEventEmitter();
    mockDataSimulator.start = jest.fn();
    mockDataSimulator.stop = jest.fn();
    mockDataSimulator.generateData = jest.fn(() => ({ 
      type: 'simulation', 
      data: [] 
    }));
    DataSimulator.mockImplementation(() => mockDataSimulator);

    mockDiscoveryOrchestrator = createMockDiscoveryService();
    DiscoveryOrchestrator.mockImplementation(() => mockDiscoveryOrchestrator);

    mockShimOrchestrator = new MockEventEmitter();
    mockShimOrchestrator.initialize = jest.fn();
    mockShimOrchestrator.transform = jest.fn((resources) => 
      resources.map(r => ({ 
        ...r, 
        transformed: true 
      }))
    );
    ShimOrchestrator.mockImplementation(() => mockShimOrchestrator);

    orchestrator = new PlatformOrchestrator({
      accountId: '12345',
      apiKey: 'test-key'
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    if (orchestrator) {
      orchestrator.stop();
    }
  });

  describe('initialization', () => {
    test('should initialize with all components', () => {
      expect(orchestrator.modeController).toBeDefined();
      expect(orchestrator.streamingOrchestrator).toBeDefined();
      expect(orchestrator.dataSimulator).toBeDefined();
      expect(orchestrator.discoveryOrchestrator).toBeDefined();
      expect(orchestrator.shimOrchestrator).toBeDefined();
      expect(orchestrator.state).toBe('initialized');
    });

    test('should register component event handlers', () => {
      expect(mockModeController.listenerCount('modeChanged')).toBeGreaterThan(0);
      expect(mockDiscoveryOrchestrator.listenerCount('resourcesDiscovered')).toBeGreaterThan(0);
    });

    test('should validate configuration on initialization', () => {
      expect(() => new PlatformOrchestrator({})).toThrow('Missing required configuration');
      expect(() => new PlatformOrchestrator({ accountId: '12345' })).toThrow('Missing required configuration');
    });
  });

  describe('platform lifecycle', () => {
    test('should start platform in simulation mode', async () => {
      await orchestrator.start();

      expect(orchestrator.state).toBe('running');
      expect(mockStreamingOrchestrator.start).toHaveBeenCalled();
      expect(mockDataSimulator.start).toHaveBeenCalled();
      expect(mockDiscoveryOrchestrator.startDiscovery).not.toHaveBeenCalled();
    });

    test('should start platform in infrastructure mode', async () => {
      mockModeController.getMode.mockReturnValue('infrastructure');
      mockModeController.isInfrastructureEnabled.mockReturnValue(true);
      mockModeController.isSimulationEnabled.mockReturnValue(false);

      await orchestrator.start();

      expect(orchestrator.state).toBe('running');
      expect(mockStreamingOrchestrator.start).toHaveBeenCalled();
      expect(mockDataSimulator.start).not.toHaveBeenCalled();
      expect(mockDiscoveryOrchestrator.startDiscovery).toHaveBeenCalled();
    });

    test('should start platform in hybrid mode', async () => {
      mockModeController.getMode.mockReturnValue('hybrid');
      mockModeController.isInfrastructureEnabled.mockReturnValue(true);
      mockModeController.isSimulationEnabled.mockReturnValue(true);

      await orchestrator.start();

      expect(orchestrator.state).toBe('running');
      expect(mockStreamingOrchestrator.start).toHaveBeenCalled();
      expect(mockDataSimulator.start).toHaveBeenCalled();
      expect(mockDiscoveryOrchestrator.startDiscovery).toHaveBeenCalled();
    });

    test('should stop all components gracefully', async () => {
      await orchestrator.start();
      await orchestrator.stop();

      expect(orchestrator.state).toBe('stopped');
      expect(mockStreamingOrchestrator.stop).toHaveBeenCalled();
      expect(mockDataSimulator.stop).toHaveBeenCalled();
      expect(mockDiscoveryOrchestrator.stopDiscovery).toHaveBeenCalled();
    });

    test('should handle start errors gracefully', async () => {
      mockStreamingOrchestrator.start.mockRejectedValueOnce(new Error('Stream error'));

      await expect(orchestrator.start()).rejects.toThrow('Stream error');
      expect(orchestrator.state).toBe('error');
    });
  });

  describe('mode transitions', () => {
    test('should handle mode change from simulation to infrastructure', async () => {
      await orchestrator.start();

      // Simulate mode change
      mockModeController.getMode.mockReturnValue('infrastructure');
      mockModeController.isInfrastructureEnabled.mockReturnValue(true);
      mockModeController.isSimulationEnabled.mockReturnValue(false);
      
      mockModeController.emit('modeChanged', { 
        from: 'simulation', 
        to: 'infrastructure' 
      });

      await waitForCondition(() => 
        mockDataSimulator.stop.mock.calls.length > 0 &&
        mockDiscoveryOrchestrator.startDiscovery.mock.calls.length > 0
      );

      expect(mockDataSimulator.stop).toHaveBeenCalled();
      expect(mockDiscoveryOrchestrator.startDiscovery).toHaveBeenCalled();
    });

    test('should handle mode change to hybrid', async () => {
      mockModeController.getMode.mockReturnValue('infrastructure');
      mockModeController.isInfrastructureEnabled.mockReturnValue(true);
      mockModeController.isSimulationEnabled.mockReturnValue(false);
      
      await orchestrator.start();

      // Change to hybrid mode
      mockModeController.getMode.mockReturnValue('hybrid');
      mockModeController.isInfrastructureEnabled.mockReturnValue(true);
      mockModeController.isSimulationEnabled.mockReturnValue(true);
      
      mockModeController.emit('modeChanged', { 
        from: 'infrastructure', 
        to: 'hybrid' 
      });

      await waitForCondition(() => mockDataSimulator.start.mock.calls.length > 0);

      expect(mockDataSimulator.start).toHaveBeenCalled();
      expect(mockDiscoveryOrchestrator.stopDiscovery).not.toHaveBeenCalled();
    });

    test('should emit mode transition events', async () => {
      const transitionHandler = jest.fn();
      orchestrator.on('modeTransition', transitionHandler);

      await orchestrator.start();
      
      mockModeController.emit('modeChanged', { 
        from: 'simulation', 
        to: 'infrastructure' 
      });

      await waitForCondition(() => transitionHandler.mock.calls.length > 0);

      expect(transitionHandler).toHaveBeenCalledWith({
        from: 'simulation',
        to: 'infrastructure',
        timestamp: expect.any(Number),
        components: {
          started: expect.arrayContaining(['discovery']),
          stopped: expect.arrayContaining(['simulation'])
        }
      });
    });
  });

  describe('data flow orchestration', () => {
    test('should handle simulation data flow', async () => {
      await orchestrator.start();

      const simulationData = { 
        type: 'simulation', 
        entities: [{ guid: 'MQC_test' }] 
      };
      
      mockDataSimulator.emit('dataGenerated', simulationData);

      await waitForCondition(() => mockStreamingOrchestrator.stream.mock.calls.length > 0);

      expect(mockStreamingOrchestrator.stream).toHaveBeenCalledWith(simulationData);
    });

    test('should handle infrastructure data flow', async () => {
      mockModeController.getMode.mockReturnValue('infrastructure');
      mockModeController.isInfrastructureEnabled.mockReturnValue(true);
      mockModeController.isSimulationEnabled.mockReturnValue(false);
      
      await orchestrator.start();

      // Simulate resource discovery
      mockDiscoveryOrchestrator.emit('resourcesDiscovered', {
        provider: 'docker',
        resources: infrastructureResources.docker
      });

      await waitForCondition(() => mockShimOrchestrator.transform.mock.calls.length > 0);

      expect(mockShimOrchestrator.transform).toHaveBeenCalledWith(
        infrastructureResources.docker
      );
      expect(mockStreamingOrchestrator.stream).toHaveBeenCalled();
    });

    test('should merge data in hybrid mode', async () => {
      mockModeController.getMode.mockReturnValue('hybrid');
      mockModeController.isInfrastructureEnabled.mockReturnValue(true);
      mockModeController.isSimulationEnabled.mockReturnValue(true);
      
      await orchestrator.start();

      // Generate both simulation and infrastructure data
      const simulationData = { 
        type: 'simulation', 
        entities: [{ guid: 'MQC_sim' }] 
      };
      
      mockDataSimulator.emit('dataGenerated', simulationData);
      mockDiscoveryOrchestrator.emit('resourcesDiscovered', {
        provider: 'docker',
        resources: infrastructureResources.docker
      });

      await waitForCondition(() => mockStreamingOrchestrator.stream.mock.calls.length >= 2);

      // Should stream both data types
      expect(mockStreamingOrchestrator.stream).toHaveBeenCalledTimes(2);
    });
  });

  describe('error handling and recovery', () => {
    test('should handle component failures gracefully', async () => {
      const errorHandler = jest.fn();
      orchestrator.on('error', errorHandler);

      await orchestrator.start();

      // Simulate component error
      mockDataSimulator.emit('error', new Error('Simulation failed'));

      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        component: 'dataSimulator',
        error: expect.objectContaining({ message: 'Simulation failed' })
      }));
    });

    test('should recover from streaming errors', async () => {
      await orchestrator.start();

      mockStreamingOrchestrator.stream.mockRejectedValueOnce(new Error('Stream failed'));
      
      const simulationData = { type: 'simulation', entities: [] };
      mockDataSimulator.emit('dataGenerated', simulationData);

      await waitForCondition(() => mockStreamingOrchestrator.stream.mock.calls.length > 0);

      // Should not crash the orchestrator
      expect(orchestrator.state).toBe('running');
    });

    test('should implement circuit breaker for failures', async () => {
      await orchestrator.start();

      // Simulate multiple failures
      for (let i = 0; i < 5; i++) {
        mockStreamingOrchestrator.stream.mockRejectedValueOnce(new Error('Stream failed'));
        mockDataSimulator.emit('dataGenerated', { type: 'simulation' });
      }

      await waitForCondition(() => orchestrator.circuitBreaker.isOpen());

      // Circuit should be open after multiple failures
      expect(orchestrator.circuitBreaker.isOpen()).toBe(true);
      
      // Should not attempt more streams while circuit is open
      mockDataSimulator.emit('dataGenerated', { type: 'simulation' });
      expect(mockStreamingOrchestrator.stream).toHaveBeenCalledTimes(5);
    });
  });

  describe('metrics and monitoring', () => {
    test('should collect platform metrics', async () => {
      await orchestrator.start();

      const metrics = orchestrator.getMetrics();

      expect(metrics).toMatchObject({
        state: 'running',
        mode: 'simulation',
        uptime: expect.any(Number),
        components: {
          streaming: { status: 'active', stats: expect.any(Object) },
          simulation: { status: 'active' },
          infrastructure: { status: 'inactive' }
        }
      });
    });

    test('should track data processing metrics', async () => {
      await orchestrator.start();

      // Process some data
      for (let i = 0; i < 5; i++) {
        mockDataSimulator.emit('dataGenerated', { type: 'simulation' });
      }

      await waitForCondition(() => mockStreamingOrchestrator.stream.mock.calls.length >= 5);

      const metrics = orchestrator.getMetrics();
      expect(metrics.processing).toMatchObject({
        eventsProcessed: expect.any(Number),
        eventsPerSecond: expect.any(Number),
        lastProcessedTimestamp: expect.any(Number)
      });
    });
  });

  describe('configuration updates', () => {
    test('should handle configuration updates', async () => {
      await orchestrator.start();

      orchestrator.updateConfig({
        streaming: {
          batchSize: 500,
          flushInterval: 5000
        }
      });

      expect(orchestrator.config.streaming.batchSize).toBe(500);
      expect(orchestrator.config.streaming.flushInterval).toBe(5000);
    });

    test('should propagate configuration to components', async () => {
      await orchestrator.start();

      const updateConfig = jest.spyOn(mockStreamingOrchestrator, 'updateConfig');
      mockStreamingOrchestrator.updateConfig = jest.fn();

      orchestrator.updateConfig({
        streaming: { batchSize: 500 }
      });

      expect(mockStreamingOrchestrator.updateConfig).toHaveBeenCalledWith({
        batchSize: 500
      });
    });
  });
});