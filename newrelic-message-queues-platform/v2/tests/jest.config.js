/**
 * Jest Configuration for v2 Platform Tests
 */

module.exports = {
  displayName: 'V2 Platform Tests',
  testEnvironment: 'node',
  rootDir: '../..',
  testMatch: [
    '<rootDir>/v2/tests/**/*.test.js'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/fixtures/',
    '/helpers/'
  ],
  coverageDirectory: '<rootDir>/v2/tests/coverage',
  collectCoverageFrom: [
    'v2/**/*.js',
    '!v2/tests/**',
    '!v2/examples/**',
    '!v2/showcase.js'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  setupFilesAfterEnv: ['<rootDir>/v2/tests/setup.js'],
  testTimeout: 30000,
  verbose: true,
  bail: false,
  clearMocks: true,
  restoreMocks: true,
  // Performance optimization
  maxWorkers: '50%',
  // Custom reporters
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: '<rootDir>/v2/tests/reports',
      outputName: 'junit.xml',
      classNameTemplate: '{classname}',
      titleTemplate: '{title}',
      ancestorSeparator: ' › ',
      usePathForSuiteName: true
    }]
  ],
  // Global test settings
  globals: {
    __DEV__: false,
    __TEST__: true
  }
};