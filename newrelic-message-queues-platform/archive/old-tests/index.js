/**
 * New Relic Message Queues Platform
 * 
 * Main entry point for the platform
 */

// Core modules
const EntityFactory = require('./core/entities/entity-factory');
const EntityImporter = require('./core/entities/entity-importer');

// Simulation modules
const DataSimulator = require('./simulation/engines/data-simulator');
const NewRelicStreamer = require('./simulation/streaming/new-relic-streamer');

// Dashboard modules
const DashboardGenerator = require('./dashboards/lib/dashboard-generator');
const DashboardBuilder = require('./dashboards/builders/dashboard-builder');
const DashboardFramework = require('./dashboards/framework/core/dashboard-framework');

// Verification modules
const VerificationOrchestrator = require('./verification/lib/verification-orchestrator');
const EntityVerifier = require('./verification/lib/entity-verifier');
const DashboardVerifier = require('./verification/engines/dashboard-verifier');
const BrowserVerifier = require('./verification/lib/browser-verifier');

// Export all modules
module.exports = {
  // Core
  EntityFactory,
  EntityImporter,
  
  // Simulation
  DataSimulator,
  NewRelicStreamer,
  
  // Dashboards
  DashboardGenerator,
  DashboardBuilder,
  DashboardFramework,
  
  // Verification
  VerificationOrchestrator,
  EntityVerifier,
  DashboardVerifier,
  BrowserVerifier,
  
  // Example workflows
  runEntityProposalWorkflow: require('./examples/mode1-entity-proposal').runEntityProposalWorkflow,
  runExistingEntityWorkflow: require('./examples/mode2-existing-entities').runExistingEntityWorkflow,
  runHybridWorkflow: require('./examples/mode3-hybrid').runHybridWorkflow
};

// If run directly, show help
if (require.main === module) {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║        New Relic Message Queues Platform v1.0.0              ║
╚══════════════════════════════════════════════════════════════╝

Welcome to the New Relic Message Queues Platform!

Quick Start:
  1. Set environment variables:
     export NEW_RELIC_API_KEY="your-api-key"
     export NEW_RELIC_USER_API_KEY="your-user-api-key"
     export NEW_RELIC_ACCOUNT_ID="your-account-id"

  2. Run examples:
     node examples/mode1-entity-proposal.js
     node examples/mode2-existing-entities.js
     node examples/mode3-hybrid.js

  3. Use the CLI:
     npx mq-platform --help

Documentation:
  - Developer Guide: docs/DEVELOPER_GUIDE.md
  - API Reference: docs/API_REFERENCE.md
  - Quick Start: docs/QUICKSTART.md

Happy monitoring! 🚀
  `);
}