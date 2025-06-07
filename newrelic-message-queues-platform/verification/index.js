/**
 * Verification Module Index
 * 
 * Exports all verification components for easy import and usage
 */

const DashboardVerifier = require('./engines/dashboard-verifier');
const VerificationRunner = require('./runners/verification-runner');
const VerificationTestFramework = require('./testing/test-framework');

module.exports = {
  // Main verification components
  DashboardVerifier,
  VerificationRunner,
  VerificationTestFramework,
  
  // Convenience factory methods
  createVerifier: (config) => new DashboardVerifier(config),
  createRunner: (config) => new VerificationRunner(config),
  createTestFramework: (config) => new VerificationTestFramework(config),
  
  // Quick verification methods
  async verifyDashboard(dashboardGuid, config = {}) {
    const runner = new VerificationRunner(config);
    return await runner.verifyDashboard(dashboardGuid, config.options || {});
  },
  
  async verifyDashboards(dashboardGuids, config = {}) {
    const runner = new VerificationRunner(config);
    return await runner.verifyDashboards(dashboardGuids, config.options || {});
  },
  
  async runTests(config = {}) {
    const testFramework = new VerificationTestFramework(config);
    return await testFramework.runAllTests();
  },
  
  // Constants
  DEFAULT_CONFIG: {
    performanceThresholds: {
      widgetLoadTime: 3000,
      dashboardLoadTime: 5000,
      queryResponseTime: 2000,
      errorRate: 0.05
    },
    batchSize: 5,
    parallelExecutions: 3,
    retryAttempts: 2,
    reportFormats: ['json', 'html']
  },
  
  VERIFICATION_CATEGORIES: {
    STRUCTURE: 'structure',
    WIDGETS: 'widgets',
    QUERIES: 'queries',
    PERFORMANCE: 'performance',
    MOBILE: 'mobile',
    LOAD: 'load',
    ACCESSIBILITY: 'accessibility'
  },
  
  SCORE_THRESHOLDS: {
    EXCELLENT: 90,
    GOOD: 80,
    FAIR: 70,
    POOR: 60,
    FAILING: 0
  }
};