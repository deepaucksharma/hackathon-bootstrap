/**
 * Unit Tests for Mode Controller
 * Tests mode management, validation, and transitions
 */

const ModeController = require('../../mode-controller');
const ConfigManager = require('../../config-manager');
const { modeConfigurations } = require('../fixtures/test-data');
const { waitForCondition } = require('../helpers/test-utils');

jest.mock('../../config-manager');

describe('ModeController', () => {
  let modeController;
  let mockConfigManager;

  beforeEach(() => {
    mockConfigManager = {
      getConfig: jest.fn().mockReturnValue({ mode: 'simulation' }),
      setMode: jest.fn(),
      getModeConfig: jest.fn((mode) => modeConfigurations[mode])
    };
    ConfigManager.mockImplementation(() => mockConfigManager);
    
    modeController = new ModeController();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    test('should initialize with default mode from config', () => {
      expect(modeController.getMode()).toBe('simulation');
      expect(modeController.isSimulationEnabled()).toBe(true);
      expect(modeController.isInfrastructureEnabled()).toBe(false);
    });

    test('should validate supported modes', () => {
      expect(modeController.validateMode('simulation')).toBe(true);
      expect(modeController.validateMode('infrastructure')).toBe(true);
      expect(modeController.validateMode('hybrid')).toBe(true);
      expect(modeController.validateMode('invalid')).toBe(false);
    });
  });

  describe('mode transitions', () => {
    test('should transition from simulation to infrastructure mode', async () => {
      const modeChangedHandler = jest.fn();
      modeController.on('modeChanged', modeChangedHandler);

      await modeController.setMode('infrastructure');

      expect(mockConfigManager.setMode).toHaveBeenCalledWith('infrastructure');
      expect(modeController.getMode()).toBe('infrastructure');
      expect(modeController.isInfrastructureEnabled()).toBe(true);
      expect(modeController.isSimulationEnabled()).toBe(false);
      expect(modeChangedHandler).toHaveBeenCalledWith({
        from: 'simulation',
        to: 'infrastructure',
        timestamp: expect.any(Number)
      });
    });

    test('should transition to hybrid mode', async () => {
      await modeController.setMode('hybrid');

      expect(modeController.getMode()).toBe('hybrid');
      expect(modeController.isInfrastructureEnabled()).toBe(true);
      expect(modeController.isSimulationEnabled()).toBe(true);
    });

    test('should reject invalid mode transitions', async () => {
      await expect(modeController.setMode('invalid')).rejects.toThrow('Invalid mode: invalid');
      expect(modeController.getMode()).toBe('simulation'); // Should remain unchanged
    });

    test('should handle mode transition errors gracefully', async () => {
      mockConfigManager.setMode.mockRejectedValueOnce(new Error('Config error'));
      
      await expect(modeController.setMode('infrastructure')).rejects.toThrow('Config error');
      expect(modeController.getMode()).toBe('simulation'); // Should remain unchanged
    });
  });

  describe('mode state management', () => {
    test('should track mode transition history', async () => {
      await modeController.setMode('infrastructure');
      await modeController.setMode('hybrid');
      await modeController.setMode('simulation');

      const history = modeController.getModeHistory();
      expect(history).toHaveLength(3);
      expect(history[0]).toMatchObject({ from: 'simulation', to: 'infrastructure' });
      expect(history[1]).toMatchObject({ from: 'infrastructure', to: 'hybrid' });
      expect(history[2]).toMatchObject({ from: 'hybrid', to: 'simulation' });
    });

    test('should emit beforeModeChange event', async () => {
      const beforeChangeHandler = jest.fn();
      modeController.on('beforeModeChange', beforeChangeHandler);

      await modeController.setMode('infrastructure');

      expect(beforeChangeHandler).toHaveBeenCalledWith({
        from: 'simulation',
        to: 'infrastructure'
      });
    });

    test('should support mode change cancellation', async () => {
      modeController.on('beforeModeChange', (event) => {
        if (event.to === 'infrastructure') {
          throw new Error('Mode change cancelled');
        }
      });

      await expect(modeController.setMode('infrastructure')).rejects.toThrow('Mode change cancelled');
      expect(modeController.getMode()).toBe('simulation');
    });
  });

  describe('mode capabilities', () => {
    test('should return correct capabilities for simulation mode', () => {
      const capabilities = modeController.getModeCapabilities();
      expect(capabilities).toEqual({
        simulation: true,
        infrastructure: false,
        streaming: true,
        discovery: false
      });
    });

    test('should return correct capabilities for infrastructure mode', async () => {
      await modeController.setMode('infrastructure');
      const capabilities = modeController.getModeCapabilities();
      
      expect(capabilities).toEqual({
        simulation: false,
        infrastructure: true,
        streaming: true,
        discovery: true
      });
    });

    test('should return correct capabilities for hybrid mode', async () => {
      await modeController.setMode('hybrid');
      const capabilities = modeController.getModeCapabilities();
      
      expect(capabilities).toEqual({
        simulation: true,
        infrastructure: true,
        streaming: true,
        discovery: true
      });
    });
  });

  describe('mode configuration', () => {
    test('should return mode-specific configuration', () => {
      const config = modeController.getModeConfig();
      expect(config).toEqual(modeConfigurations.simulation);
    });

    test('should update configuration when mode changes', async () => {
      await modeController.setMode('infrastructure');
      const config = modeController.getModeConfig();
      expect(config).toEqual(modeConfigurations.infrastructure);
    });

    test('should validate mode configuration', () => {
      const isValid = modeController.validateModeConfig({
        mode: 'simulation',
        simulation: { enabled: true },
        infrastructure: { enabled: false }
      });
      expect(isValid).toBe(true);

      const isInvalid = modeController.validateModeConfig({
        mode: 'invalid',
        // Missing required fields
      });
      expect(isInvalid).toBe(false);
    });
  });

  describe('concurrency and thread safety', () => {
    test('should handle concurrent mode changes safely', async () => {
      const changes = [];
      modeController.on('modeChanged', (event) => changes.push(event));

      // Attempt concurrent mode changes
      const promises = [
        modeController.setMode('infrastructure'),
        modeController.setMode('hybrid'),
        modeController.setMode('simulation')
      ];

      await Promise.allSettled(promises);

      // Should process changes sequentially
      expect(changes.length).toBeGreaterThan(0);
      expect(changes.length).toBeLessThanOrEqual(3);
      
      // Final mode should be deterministic
      const finalMode = modeController.getMode();
      expect(['simulation', 'infrastructure', 'hybrid']).toContain(finalMode);
    });

    test('should handle rapid mode switches', async () => {
      const startTime = Date.now();
      
      for (let i = 0; i < 10; i++) {
        const mode = i % 2 === 0 ? 'infrastructure' : 'simulation';
        await modeController.setMode(mode);
      }

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000); // Should complete quickly
      expect(modeController.getMode()).toBe('simulation');
    });
  });

  describe('error handling', () => {
    test('should emit error events on failures', async () => {
      const errorHandler = jest.fn();
      modeController.on('error', errorHandler);

      mockConfigManager.setMode.mockRejectedValueOnce(new Error('Test error'));
      
      await expect(modeController.setMode('infrastructure')).rejects.toThrow('Test error');
      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Test error'
      }));
    });

    test('should recover from configuration errors', async () => {
      mockConfigManager.getModeConfig.mockReturnValueOnce(null);
      
      const config = modeController.getModeConfig();
      expect(config).toEqual({}); // Should return empty config instead of crashing
    });
  });

  describe('lifecycle management', () => {
    test('should clean up resources on destroy', () => {
      const handler = jest.fn();
      modeController.on('modeChanged', handler);
      
      modeController.destroy();
      
      // Should remove all listeners
      modeController.emit('modeChanged', { from: 'a', to: 'b' });
      expect(handler).not.toHaveBeenCalled();
    });

    test('should reset to initial state', async () => {
      await modeController.setMode('infrastructure');
      await modeController.setMode('hybrid');
      
      modeController.reset();
      
      expect(modeController.getMode()).toBe('simulation');
      expect(modeController.getModeHistory()).toHaveLength(0);
    });
  });
});