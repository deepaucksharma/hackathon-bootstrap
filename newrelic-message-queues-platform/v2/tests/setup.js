/**
 * Test Setup for v2 Platform Tests
 * Global setup and configuration for all tests
 */

// Set test environment
process.env.NODE_ENV = 'test';
process.env.NEW_RELIC_ACCOUNT_ID = '12345';
process.env.NEW_RELIC_USER_API_KEY = 'test-api-key';

// Increase timeout for async operations
jest.setTimeout(30000);

// Mock console methods to reduce noise
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  // Keep warn and error for important messages
  warn: console.warn,
  error: console.error
};

// Global test helpers
global.testHelpers = {
  // Wait for async condition
  waitFor: async (condition, timeout = 5000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await condition()) return true;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Timeout waiting for condition');
  },

  // Deep clone helper
  deepClone: (obj) => JSON.parse(JSON.stringify(obj)),

  // Random ID generator
  randomId: () => Math.random().toString(36).substring(7),

  // Performance timer
  timer: () => {
    const start = process.hrtime.bigint();
    return {
      end: () => Number(process.hrtime.bigint() - start) / 1e6 // ms
    };
  }
};

// Mock timers for specific tests
global.mockTimers = () => {
  jest.useFakeTimers();
  return {
    restore: () => jest.useRealTimers(),
    advance: (ms) => jest.advanceTimersByTime(ms)
  };
};

// Cleanup after each test
afterEach(() => {
  jest.clearAllTimers();
  jest.clearAllMocks();
});

// Global error handler
process.on('unhandledRejection', (error) => {
  console.error('Unhandled Promise Rejection:', error);
  throw error;
});