/**
 * Worker Pool Implementation
 * 
 * Provides concurrent processing capabilities for the message queue platform.
 * Based on the successful patterns from the Kafka integration analysis.
 */

const { EventEmitter } = require('events');
const { logger } = require('./utils/logger');

class WorkerPool extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      maxWorkers: options.maxWorkers || 3,
      taskTimeout: options.taskTimeout || 30000,
      retryAttempts: options.retryAttempts || 2,
      retryDelay: options.retryDelay || 1000,
      ...options
    };
    
    this.workers = [];
    this.taskQueue = [];
    this.activeTasks = new Map();
    this.isShutdown = false;
    this.stats = {
      tasksCompleted: 0,
      tasksErrored: 0,
      totalProcessingTime: 0,
      averageProcessingTime: 0,
      activeTasks: 0,
      peakConcurrency: 0
    };
    
    // Initialize workers
    this.initializeWorkers();
  }
  
  /**
   * Initialize worker threads
   */
  initializeWorkers() {
    for (let i = 0; i < this.options.maxWorkers; i++) {
      const worker = {
        id: i + 1,
        busy: false,
        currentTask: null,
        tasksProcessed: 0,
        errors: 0
      };
      
      this.workers.push(worker);
    }
    
    logger.debug(`Initialized worker pool with ${this.options.maxWorkers} workers`);
  }
  
  /**
   * Add task to the processing queue
   */
  async submitTask(taskData, processor, options = {}) {
    if (this.isShutdown) {
      throw new Error('Worker pool is shutdown');
    }
    
    const task = {
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      data: taskData,
      processor,
      options: {
        timeout: options.timeout || this.options.taskTimeout,
        retryAttempts: options.retryAttempts || this.options.retryAttempts,
        retryDelay: options.retryDelay || this.options.retryDelay,
        priority: options.priority || 'normal',
        ...options
      },
      attempts: 0,
      startTime: null,
      promise: null,
      resolve: null,
      reject: null
    };
    
    // Create promise for task completion
    task.promise = new Promise((resolve, reject) => {
      task.resolve = resolve;
      task.reject = reject;
    });
    
    // Add to queue (prioritize high priority tasks)
    if (task.options.priority === 'high') {
      this.taskQueue.unshift(task);
    } else {
      this.taskQueue.push(task);
    }
    
    // Try to assign task immediately
    this.assignTasks();
    
    return task.promise;
  }
  
  /**
   * Submit multiple tasks for batch processing
   */
  async submitBatch(tasks, processor, options = {}) {
    const promises = tasks.map(taskData => 
      this.submitTask(taskData, processor, options)
    );
    
    if (options.waitForAll) {
      return Promise.all(promises);
    } else {
      return Promise.allSettled(promises);
    }
  }
  
  /**
   * Assign tasks to available workers
   */
  assignTasks() {
    while (this.taskQueue.length > 0) {
      const availableWorker = this.workers.find(w => !w.busy);
      
      if (!availableWorker) {
        break; // No available workers
      }
      
      const task = this.taskQueue.shift();
      this.assignTaskToWorker(task, availableWorker);
    }
  }
  
  /**
   * Assign specific task to specific worker
   */
  async assignTaskToWorker(task, worker) {
    worker.busy = true;
    worker.currentTask = task;
    task.startTime = Date.now();
    task.attempts++;
    
    this.activeTasks.set(task.id, task);
    this.stats.activeTasks++;
    this.stats.peakConcurrency = Math.max(this.stats.peakConcurrency, this.stats.activeTasks);
    
    this.emit('taskStarted', { taskId: task.id, workerId: worker.id, attempt: task.attempts });
    
    try {
      // Set up timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Task timeout after ${task.options.timeout}ms`)), task.options.timeout);
      });
      
      // Execute task with timeout
      const result = await Promise.race([
        this.executeTask(task),
        timeoutPromise
      ]);
      
      // Task completed successfully
      this.handleTaskSuccess(task, worker, result);
      
    } catch (error) {
      // Task failed
      await this.handleTaskError(task, worker, error);
    }
  }
  
  /**
   * Execute the actual task
   */
  async executeTask(task) {
    try {
      return await task.processor(task.data, {
        taskId: task.id,
        attempt: task.attempts,
        startTime: task.startTime
      });
    } catch (error) {
      // Add context to error
      error.taskId = task.id;
      error.attempt = task.attempts;
      throw error;
    }
  }
  
  /**
   * Handle successful task completion
   */
  handleTaskSuccess(task, worker, result) {
    const processingTime = Date.now() - task.startTime;
    
    // Update stats
    this.stats.tasksCompleted++;
    this.stats.totalProcessingTime += processingTime;
    this.stats.averageProcessingTime = this.stats.totalProcessingTime / this.stats.tasksCompleted;
    this.stats.activeTasks--;
    
    // Update worker stats
    worker.tasksProcessed++;
    worker.busy = false;
    worker.currentTask = null;
    
    // Clean up
    this.activeTasks.delete(task.id);
    
    // Emit events
    this.emit('taskCompleted', { 
      taskId: task.id, 
      workerId: worker.id, 
      result, 
      processingTime,
      attempts: task.attempts 
    });\n    \n    // Resolve promise\n    task.resolve(result);\n    \n    // Try to assign next task\n    this.assignTasks();\n  }\n  \n  /**\n   * Handle task error with retry logic\n   */\n  async handleTaskError(task, worker, error) {\n    const processingTime = Date.now() - task.startTime;\n    \n    // Update worker stats\n    worker.errors++;\n    worker.busy = false;\n    worker.currentTask = null;\n    \n    // Clean up active task tracking\n    this.activeTasks.delete(task.id);\n    this.stats.activeTasks--;\n    \n    this.emit('taskError', { \n      taskId: task.id, \n      workerId: worker.id, \n      error: error.message, \n      attempt: task.attempts,\n      processingTime\n    });\n    \n    // Check if we should retry\n    if (task.attempts < task.options.retryAttempts) {\n      logger.debug(`Retrying task ${task.id} (attempt ${task.attempts + 1}/${task.options.retryAttempts})`);\n      \n      // Wait before retry\n      await new Promise(resolve => setTimeout(resolve, task.options.retryDelay));\n      \n      // Add back to queue for retry\n      this.taskQueue.unshift(task);\n      this.assignTasks();\n      \n    } else {\n      // No more retries, task failed\n      this.stats.tasksErrored++;\n      \n      this.emit('taskFailed', { \n        taskId: task.id, \n        error: error.message, \n        totalAttempts: task.attempts \n      });\n      \n      // Reject promise\n      task.reject(error);\n    }\n    \n    // Try to assign next task\n    this.assignTasks();\n  }\n  \n  /**\n   * Get current worker pool statistics\n   */\n  getStats() {\n    const queuedTasks = this.taskQueue.length;\n    const busyWorkers = this.workers.filter(w => w.busy).length;\n    \n    return {\n      ...this.stats,\n      queuedTasks,\n      busyWorkers,\n      availableWorkers: this.options.maxWorkers - busyWorkers,\n      totalWorkers: this.options.maxWorkers,\n      queueUtilization: queuedTasks > 0 ? Math.min(100, (queuedTasks / this.options.maxWorkers) * 100) : 0,\n      workerUtilization: (busyWorkers / this.options.maxWorkers) * 100,\n      workers: this.workers.map(w => ({\n        id: w.id,\n        busy: w.busy,\n        tasksProcessed: w.tasksProcessed,\n        errors: w.errors,\n        currentTask: w.currentTask ? w.currentTask.id : null\n      }))\n    };\n  }\n  \n  /**\n   * Wait for all active tasks to complete\n   */\n  async waitForCompletion(timeout = 30000) {\n    const startTime = Date.now();\n    \n    while (this.stats.activeTasks > 0 || this.taskQueue.length > 0) {\n      if (Date.now() - startTime > timeout) {\n        throw new Error('Timeout waiting for task completion');\n      }\n      \n      await new Promise(resolve => setTimeout(resolve, 100));\n    }\n  }\n  \n  /**\n   * Get information about active tasks\n   */\n  getActiveTasks() {\n    return Array.from(this.activeTasks.values()).map(task => ({\n      id: task.id,\n      startTime: task.startTime,\n      runningFor: Date.now() - task.startTime,\n      attempts: task.attempts,\n      priority: task.options.priority\n    }));\n  }\n  \n  /**\n   * Cancel a specific task\n   */\n  cancelTask(taskId) {\n    // Remove from queue if not started\n    const queueIndex = this.taskQueue.findIndex(task => task.id === taskId);\n    if (queueIndex !== -1) {\n      const task = this.taskQueue.splice(queueIndex, 1)[0];\n      task.reject(new Error('Task cancelled'));\n      return true;\n    }\n    \n    // If task is running, we can't really cancel it, but we can mark it\n    const activeTask = this.activeTasks.get(taskId);\n    if (activeTask) {\n      logger.warn(`Cannot cancel running task ${taskId} (no cancellation support)`);\n      return false;\n    }\n    \n    return false;\n  }\n  \n  /**\n   * Shutdown worker pool gracefully\n   */\n  async shutdown(timeout = 30000) {\n    logger.info('Shutting down worker pool...');\n    this.isShutdown = true;\n    \n    try {\n      // Wait for active tasks to complete\n      await this.waitForCompletion(timeout);\n      logger.info('All tasks completed successfully');\n    } catch (error) {\n      logger.warn(`Shutdown timeout: ${this.stats.activeTasks} tasks still active`);\n      \n      // Cancel remaining tasks\n      for (const task of this.activeTasks.values()) {\n        task.reject(new Error('Worker pool shutdown'));\n      }\n      \n      for (const task of this.taskQueue) {\n        task.reject(new Error('Worker pool shutdown'));\n      }\n    }\n    \n    // Clear state\n    this.activeTasks.clear();\n    this.taskQueue.length = 0;\n    this.workers.forEach(w => {\n      w.busy = false;\n      w.currentTask = null;\n    });\n    \n    this.emit('shutdown');\n    logger.info('Worker pool shutdown complete');\n  }\n}\n\n/**\n * Specialized worker pool for entity processing\n */\nclass EntityWorkerPool extends WorkerPool {\n  constructor(options = {}) {\n    super({\n      maxWorkers: options.maxWorkers || 5,\n      taskTimeout: options.taskTimeout || 20000,\n      ...options\n    });\n    \n    this.entityStats = {\n      brokers: { processed: 0, errors: 0 },\n      topics: { processed: 0, errors: 0 },\n      clusters: { processed: 0, errors: 0 },\n      consumerGroups: { processed: 0, errors: 0 }\n    };\n  }\n  \n  /**\n   * Process entities by type in parallel\n   */\n  async processEntities(entities, processors) {\n    const results = {\n      success: [],\n      errors: []\n    };\n    \n    const tasks = entities.map(entity => ({\n      entity,\n      processor: processors[entity.entityType] || processors.default\n    }));\n    \n    const promises = tasks.map(async ({ entity, processor }) => {\n      try {\n        const result = await this.submitTask(entity, processor, {\n          priority: entity.critical ? 'high' : 'normal'\n        });\n        \n        results.success.push({ entity, result });\n        this.updateEntityStats(entity.entityType, 'processed');\n        \n        return { entity, result, success: true };\n      } catch (error) {\n        results.errors.push({ entity, error });\n        this.updateEntityStats(entity.entityType, 'errors');\n        \n        return { entity, error, success: false };\n      }\n    });\n    \n    await Promise.allSettled(promises);\n    return results;\n  }\n  \n  /**\n   * Update entity-specific statistics\n   */\n  updateEntityStats(entityType, metric) {\n    const type = this.getEntityTypeKey(entityType);\n    if (this.entityStats[type]) {\n      this.entityStats[type][metric]++;\n    }\n  }\n  \n  /**\n   * Map entity type to stats key\n   */\n  getEntityTypeKey(entityType) {\n    const typeMap = {\n      'MESSAGE_QUEUE_BROKER': 'brokers',\n      'MESSAGE_QUEUE_TOPIC': 'topics',\n      'MESSAGE_QUEUE_CLUSTER': 'clusters',\n      'MESSAGE_QUEUE_CONSUMER_GROUP': 'consumerGroups'\n    };\n    \n    return typeMap[entityType] || 'unknown';\n  }\n  \n  /**\n   * Get entity processing statistics\n   */\n  getEntityStats() {\n    return {\n      ...super.getStats(),\n      entityBreakdown: this.entityStats\n    };\n  }\n}\n\nmodule.exports = { WorkerPool, EntityWorkerPool };"