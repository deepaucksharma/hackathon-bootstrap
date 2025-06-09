/**
 * Worker Pool Module
 * 
 * Generic worker pool implementation for concurrent task execution.
 * Includes specialized pools for data collection and simulation.
 */

const { 
  WorkerPool, 
  DataCollectionPool, 
  SimulationPool 
} = require('./worker-pool');

module.exports = {
  WorkerPool,
  DataCollectionPool,
  SimulationPool
};