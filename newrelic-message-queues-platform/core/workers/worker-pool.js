/**
 * Generic Worker Pool Implementation
 * 
 * A reusable worker pool for concurrent task execution with:
 * - Configurable pool sizes
 * - Channel-based task distribution
 * - Graceful shutdown
 * - Error handling and recovery
 * - Performance metrics
 */

const EventEmitter = require('events');

class WorkerPool extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.name = options.name || 'WorkerPool';
    this.poolSize = options.poolSize || 5;
    this.maxQueueSize = options.maxQueueSize || 1000;
    this.taskTimeout = options.taskTimeout || 30000; // 30 seconds default
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000; // 1 second
    
    this.workers = [];
    this.taskQueue = [];
    this.activeTasks = new Map();
    this.isRunning = false;
    this.shutdownRequested = false;
    
    // Performance metrics
    this.metrics = {
      tasksProcessed: 0,
      tasksFailed: 0,
      tasksRetried: 0,
      avgProcessingTime: 0,
      totalProcessingTime: 0,
      queueHighWaterMark: 0
    };
    
    this._setupWorkers();
  }
  
  /**
   * Initialize worker threads
   */
  _setupWorkers() {
    for (let i = 0; i < this.poolSize; i++) {
      const worker = {
        id: i,
        isIdle: true,
        currentTask: null
      };
      this.workers.push(worker);
    }
  }
  
  /**
   * Start the worker pool
   */
  start() {
    if (this.isRunning) {
      return;
    }
    
    this.isRunning = true;
    this.shutdownRequested = false;
    
    // Start worker loops
    this.workers.forEach(worker => {
      this._runWorker(worker);
    });
    
    this.emit('started', { poolSize: this.poolSize });
  }
  
  /**
   * Stop the worker pool gracefully
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }
    
    this.shutdownRequested = true;
    this.emit('stopping');
    
    // Wait for all active tasks to complete
    const timeout = setTimeout(() => {
      console.warn(`[${this.name}] Forcefully stopping after timeout`);
      this._forceStop();
    }, 60000); // 60 second grace period
    
    await this._waitForCompletion();
    clearTimeout(timeout);
    
    this.isRunning = false;
    this.emit('stopped', this.metrics);
  }
  
  /**
   * Submit a task to the pool
   * @param {Function} taskFn - Async function to execute
   * @param {Object} context - Task context/metadata
   * @returns {Promise} Task result
   */
  async submit(taskFn, context = {}) {
    if (this.shutdownRequested) {
      throw new Error('Worker pool is shutting down');
    }
    
    if (this.taskQueue.length >= this.maxQueueSize) {
      throw new Error(`Task queue full (${this.maxQueueSize})`);
    }
    
    return new Promise((resolve, reject) => {
      const task = {
        id: this._generateTaskId(),
        fn: taskFn,
        context,
        resolve,
        reject,
        attempts: 0,
        createdAt: Date.now()
      };
      
      this.taskQueue.push(task);
      this.metrics.queueHighWaterMark = Math.max(
        this.metrics.queueHighWaterMark,
        this.taskQueue.length
      );
      
      this.emit('taskQueued', { 
        taskId: task.id, 
        queueLength: this.taskQueue.length 
      });
      
      // Wake up workers immediately when a task is queued
      this._notifyWorkers();
    });
  }
  
  /**
   * Submit multiple tasks as a batch
   * @param {Array} tasks - Array of {taskFn, context} objects
   * @returns {Promise<Array>} Array of results
   */
  async submitBatch(tasks) {
    const promises = tasks.map(({ taskFn, context }) => 
      this.submit(taskFn, context)
    );
    
    return Promise.allSettled(promises);
  }
  
  /**
   * Worker execution loop
   */
  async _runWorker(worker) {
    while (this.isRunning) {
      if (this.taskQueue.length === 0) {
        // No tasks available, wait a bit
        await this._sleep(100);
        continue;
      }
      
      const task = this.taskQueue.shift();
      if (!task) continue;
      
      worker.isIdle = false;
      worker.currentTask = task;
      this.activeTasks.set(task.id, { worker, task });
      
      try {
        await this._executeTask(task, worker);
      } catch (error) {
        // Error already handled in _executeTask
      } finally {
        worker.isIdle = true;
        worker.currentTask = null;
        this.activeTasks.delete(task.id);
      }
    }
  }
  
  /**
   * Execute a single task with timeout and retry logic
   */
  async _executeTask(task, worker) {
    const startTime = Date.now();
    
    try {
      this.emit('taskStarted', { 
        taskId: task.id, 
        workerId: worker.id,
        attempts: task.attempts + 1
      });
      
      // Execute with timeout
      const result = await this._executeWithTimeout(
        task.fn(),
        this.taskTimeout
      );
      
      const duration = Date.now() - startTime;
      this._updateMetrics(duration, true);
      
      this.emit('taskCompleted', {
        taskId: task.id,
        workerId: worker.id,
        duration,
        result
      });
      
      task.resolve(result);
      
    } catch (error) {
      task.attempts++;
      
      if (task.attempts < this.retryAttempts) {
        // Retry the task
        this.metrics.tasksRetried++;
        
        this.emit('taskRetrying', {
          taskId: task.id,
          attempt: task.attempts,
          error: error.message
        });
        
        await this._sleep(this.retryDelay * task.attempts);
        this.taskQueue.unshift(task); // Add back to front of queue
        
      } else {
        // Task failed after all retries
        const duration = Date.now() - startTime;
        this._updateMetrics(duration, false);
        
        this.emit('taskFailed', {
          taskId: task.id,
          workerId: worker.id,
          attempts: task.attempts,
          error: error.message,
          duration
        });
        
        task.reject(error);
      }
    }
  }
  
  /**
   * Execute function with timeout
   */
  async _executeWithTimeout(promise, timeout) {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Task timeout')), timeout);
    });
    
    return Promise.race([promise, timeoutPromise]);
  }
  
  /**
   * Update performance metrics
   */
  _updateMetrics(duration, success) {
    if (success) {
      this.metrics.tasksProcessed++;
    } else {
      this.metrics.tasksFailed++;
    }
    
    this.metrics.totalProcessingTime += duration;
    this.metrics.avgProcessingTime = 
      this.metrics.totalProcessingTime / 
      (this.metrics.tasksProcessed + this.metrics.tasksFailed);
  }
  
  /**
   * Wait for all active tasks to complete
   */
  async _waitForCompletion() {
    while (this.activeTasks.size > 0 || this.taskQueue.length > 0) {
      await this._sleep(100);
    }
  }
  
  /**
   * Force stop all workers
   */
  _forceStop() {
    // Clear the queue
    const droppedTasks = this.taskQueue.splice(0);
    
    // Reject all queued tasks
    droppedTasks.forEach(task => {
      task.reject(new Error('Worker pool forced shutdown'));
    });
    
    // Reject active tasks
    this.activeTasks.forEach(({ task }) => {
      task.reject(new Error('Worker pool forced shutdown'));
    });
    
    this.activeTasks.clear();
    this.isRunning = false;
  }
  
  /**
   * Get current pool status
   */
  getStatus() {
    const idleWorkers = this.workers.filter(w => w.isIdle).length;
    const busyWorkers = this.workers.length - idleWorkers;
    
    return {
      isRunning: this.isRunning,
      shutdownRequested: this.shutdownRequested,
      poolSize: this.poolSize,
      idleWorkers,
      busyWorkers,
      queueLength: this.taskQueue.length,
      activeTasks: this.activeTasks.size,
      metrics: { ...this.metrics }
    };
  }
  
  /**
   * Generate unique task ID
   */
  _generateTaskId() {
    return `${this.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Sleep utility
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Wake up idle workers when new tasks are available
   */
  _notifyWorkers() {
    // This is a simple implementation - in a more complex version,
    // we could use events or condition variables to wake workers
    // For now, the workers will pick up tasks on their next polling cycle
  }
}

/**
 * Specialized worker pool for data collection tasks
 */
class DataCollectionPool extends WorkerPool {
  constructor(options = {}) {
    super({
      name: 'DataCollectionPool',
      poolSize: options.poolSize || 10,
      taskTimeout: options.taskTimeout || 60000, // 1 minute for data collection
      ...options
    });
    
    this.batchSize = options.batchSize || 100;
    this.collector = options.collector; // Function to collect data
  }
  
  /**
   * Collect data for multiple items concurrently
   * @param {Array} items - Items to collect data for
   * @param {Function} collectorFn - Function to collect data for single item
   * @returns {Promise<Array>} Collected results
   */
  async collectBatch(items, collectorFn) {
    const tasks = items.map(item => ({
      taskFn: async () => collectorFn(item),
      context: { item }
    }));
    
    const results = await this.submitBatch(tasks);
    
    // Extract successful results
    return results
      .filter(result => result.status === 'fulfilled')
      .map(result => result.value);
  }
  
  /**
   * Stream data collection with batching
   * @param {AsyncIterator} itemStream - Stream of items to process
   * @param {Function} collectorFn - Function to collect data
   * @param {Function} resultHandler - Function to handle results
   */
  async streamCollect(itemStream, collectorFn, resultHandler) {
    let batch = [];
    
    for await (const item of itemStream) {
      batch.push(item);
      
      if (batch.length >= this.batchSize) {
        const results = await this.collectBatch(batch, collectorFn);
        await resultHandler(results);
        batch = [];
      }
    }
    
    // Process remaining items
    if (batch.length > 0) {
      const results = await this.collectBatch(batch, collectorFn);
      await resultHandler(results);
    }
  }
}

/**
 * Specialized worker pool for simulation tasks
 */
class SimulationPool extends WorkerPool {
  constructor(options = {}) {
    super({
      name: 'SimulationPool',
      poolSize: options.poolSize || 5,
      taskTimeout: options.taskTimeout || 10000, // 10 seconds for simulation
      ...options
    });
    
    this.generators = new Map();
  }
  
  /**
   * Register a data generator
   */
  registerGenerator(type, generatorFn) {
    this.generators.set(type, generatorFn);
  }
  
  /**
   * Generate data for multiple entities concurrently
   * @param {Array} entities - Entities to generate data for
   * @param {String} generatorType - Type of generator to use
   * @returns {Promise<Array>} Generated data
   */
  async generateBatch(entities, generatorType) {
    const generator = this.generators.get(generatorType);
    if (!generator) {
      throw new Error(`Unknown generator type: ${generatorType}`);
    }
    
    const tasks = entities.map(entity => ({
      taskFn: async () => generator(entity),
      context: { entity, generatorType }
    }));
    
    return this.submitBatch(tasks);
  }
}

module.exports = {
  WorkerPool,
  DataCollectionPool,
  SimulationPool
};