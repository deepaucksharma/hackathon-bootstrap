/**
 * Worker Pool Implementation
 * 
 * Manages concurrent execution of tasks with configurable pool size
 * for optimal performance and resource utilization.
 */

import { Logger } from '../../shared/utils/logger';
import { injectable } from 'inversify';
import { Worker } from 'worker_threads';
import { cpus } from 'os';
import { EventEmitter } from 'events';

export interface WorkerPoolOptions {
  minWorkers?: number;
  maxWorkers?: number;
  idleTimeout?: number;
  taskTimeout?: number;
  logger?: Logger;
}

export interface WorkerTask<T = any> {
  id: string;
  fn: () => Promise<T>;
  timeout?: number;
  priority?: number;
}

export interface WorkerStats {
  activeWorkers: number;
  idleWorkers: number;
  totalWorkers: number;
  tasksCompleted: number;
  tasksFailed: number;
  tasksInQueue: number;
  averageTaskTime: number;
}

interface QueuedTask {
  task: WorkerTask;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

@injectable()
export class WorkerPool extends EventEmitter {
  private readonly logger: Logger;
  private readonly minWorkers: number;
  private readonly maxWorkers: number;
  private readonly idleTimeout: number;
  private readonly taskTimeout: number;
  
  private workers: Set<WorkerInstance> = new Set();
  private taskQueue: QueuedTask[] = [];
  private stats = {
    tasksCompleted: 0,
    tasksFailed: 0,
    totalTaskTime: 0
  };

  constructor(options: WorkerPoolOptions = {}) {
    super();
    this.logger = options.logger || new Logger('WorkerPool');
    this.minWorkers = options.minWorkers || 2;
    this.maxWorkers = options.maxWorkers || cpus().length;
    this.idleTimeout = options.idleTimeout || 30000; // 30 seconds
    this.taskTimeout = options.taskTimeout || 60000; // 60 seconds
    
    this.logger.info('Worker pool initialized', {
      minWorkers: this.minWorkers,
      maxWorkers: this.maxWorkers,
      idleTimeout: this.idleTimeout,
      taskTimeout: this.taskTimeout
    });
    
    // Initialize minimum workers
    this.initializeWorkers();
  }

  /**
   * Execute a single task
   */
  async execute<T>(fn: () => Promise<T>, options: { timeout?: number; priority?: number } = {}): Promise<T> {
    const task: WorkerTask<T> = {
      id: this.generateTaskId(),
      fn,
      timeout: options.timeout || this.taskTimeout,
      priority: options.priority || 0
    };

    return new Promise((resolve, reject) => {
      const queuedTask: QueuedTask = {
        task,
        resolve,
        reject,
        timestamp: Date.now()
      };

      // Add to queue based on priority
      if (task.priority && task.priority > 0) {
        // Find insertion point for priority queue
        const insertIndex = this.taskQueue.findIndex(qt => (qt.task.priority || 0) < task.priority!);
        if (insertIndex === -1) {
          this.taskQueue.push(queuedTask);
        } else {
          this.taskQueue.splice(insertIndex, 0, queuedTask);
        }
      } else {
        this.taskQueue.push(queuedTask);
      }

      this.emit('taskQueued', { taskId: task.id, queueLength: this.taskQueue.length });
      this.processQueue();
    });
  }

  /**
   * Execute multiple tasks in parallel
   */
  async executeAll<T>(tasks: Array<() => Promise<T>>): Promise<T[]> {
    const promises = tasks.map(fn => this.execute(fn));
    return Promise.all(promises);
  }

  /**
   * Execute tasks with map operation
   */
  async map<T, R>(items: T[], fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
    const tasks = items.map((item, index) => () => fn(item, index));
    return this.executeAll(tasks);
  }

  /**
   * Process the task queue
   */
  private async processQueue(): Promise<void> {
    if (this.taskQueue.length === 0) {
      return;
    }

    // Find available worker
    const availableWorker = this.findAvailableWorker();
    if (!availableWorker) {
      // Try to create new worker if under limit
      if (this.workers.size < this.maxWorkers) {
        this.createWorker();
      }
      return;
    }

    // Get next task from queue
    const queuedTask = this.taskQueue.shift()!;
    const startTime = Date.now();

    try {
      // Execute task in worker context (simulated for now)
      availableWorker.busy = true;
      availableWorker.lastTaskTime = startTime;
      
      this.emit('taskStarted', {
        taskId: queuedTask.task.id,
        workerId: availableWorker.id
      });

      // Execute with timeout
      const result = await this.executeWithTimeout(
        queuedTask.task.fn,
        queuedTask.task.timeout!
      );

      // Update stats
      this.stats.tasksCompleted++;
      this.stats.totalTaskTime += Date.now() - startTime;
      
      queuedTask.resolve(result);
      
      this.emit('taskCompleted', {
        taskId: queuedTask.task.id,
        workerId: availableWorker.id,
        duration: Date.now() - startTime
      });
      
    } catch (error) {
      this.stats.tasksFailed++;
      queuedTask.reject(error as Error);
      
      this.emit('taskFailed', {
        taskId: queuedTask.task.id,
        workerId: availableWorker.id,
        error: (error as Error).message
      });
      
    } finally {
      availableWorker.busy = false;
      availableWorker.idleSince = Date.now();
      
      // Process next task
      setImmediate(() => this.processQueue());
    }
  }

  /**
   * Execute function with timeout
   */
  private async executeWithTimeout<T>(fn: () => Promise<T>, timeout: number): Promise<T> {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Task timed out after ${timeout}ms`));
      }, timeout);

      try {
        const result = await fn();
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Initialize minimum number of workers
   */
  private initializeWorkers(): void {
    for (let i = 0; i < this.minWorkers; i++) {
      this.createWorker();
    }
  }

  /**
   * Create a new worker
   */
  private createWorker(): WorkerInstance {
    const worker: WorkerInstance = {
      id: this.generateWorkerId(),
      busy: false,
      idleSince: Date.now(),
      lastTaskTime: 0
    };

    this.workers.add(worker);
    
    this.logger.debug(`Created worker ${worker.id}`, {
      totalWorkers: this.workers.size
    });
    
    this.emit('workerCreated', { workerId: worker.id });
    
    // Set up idle timeout for non-minimum workers
    if (this.workers.size > this.minWorkers) {
      this.scheduleWorkerCleanup(worker);
    }
    
    return worker;
  }

  /**
   * Find an available worker
   */
  private findAvailableWorker(): WorkerInstance | null {
    for (const worker of this.workers) {
      if (!worker.busy) {
        return worker;
      }
    }
    return null;
  }

  /**
   * Schedule worker cleanup after idle timeout
   */
  private scheduleWorkerCleanup(worker: WorkerInstance): void {
    setTimeout(() => {
      if (
        !worker.busy &&
        this.workers.size > this.minWorkers &&
        Date.now() - worker.idleSince > this.idleTimeout
      ) {
        this.removeWorker(worker);
      }
    }, this.idleTimeout);
  }

  /**
   * Remove a worker from the pool
   */
  private removeWorker(worker: WorkerInstance): void {
    this.workers.delete(worker);
    
    this.logger.debug(`Removed idle worker ${worker.id}`, {
      totalWorkers: this.workers.size
    });
    
    this.emit('workerRemoved', { workerId: worker.id });
  }

  /**
   * Generate unique task ID
   */
  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique worker ID
   */
  private generateWorkerId(): string {
    return `worker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get worker pool statistics
   */
  getStats(): WorkerStats {
    const activeWorkers = Array.from(this.workers).filter(w => w.busy).length;
    const idleWorkers = this.workers.size - activeWorkers;
    const averageTaskTime = this.stats.tasksCompleted > 0
      ? this.stats.totalTaskTime / this.stats.tasksCompleted
      : 0;

    return {
      activeWorkers,
      idleWorkers,
      totalWorkers: this.workers.size,
      tasksCompleted: this.stats.tasksCompleted,
      tasksFailed: this.stats.tasksFailed,
      tasksInQueue: this.taskQueue.length,
      averageTaskTime
    };
  }

  /**
   * Shutdown the worker pool
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down worker pool');
    
    // Wait for all tasks to complete
    while (this.taskQueue.length > 0 || Array.from(this.workers).some(w => w.busy)) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Clear all workers
    this.workers.clear();
    
    this.emit('shutdown');
    this.logger.info('Worker pool shutdown complete');
  }

  /**
   * Get health status of the pool
   */
  getHealthStatus(): { healthy: boolean; issues: string[] } {
    const issues: string[] = [];
    const stats = this.getStats();
    
    // Check for overload
    if (stats.tasksInQueue > this.maxWorkers * 10) {
      issues.push(`High queue length: ${stats.tasksInQueue} tasks waiting`);
    }
    
    // Check for high failure rate
    const totalTasks = stats.tasksCompleted + stats.tasksFailed;
    if (totalTasks > 100 && stats.tasksFailed / totalTasks > 0.1) {
      issues.push(`High failure rate: ${((stats.tasksFailed / totalTasks) * 100).toFixed(1)}%`);
    }
    
    // Check if all workers are busy
    if (stats.activeWorkers === stats.totalWorkers && stats.totalWorkers === this.maxWorkers) {
      issues.push('All workers busy at maximum capacity');
    }
    
    return {
      healthy: issues.length === 0,
      issues
    };
  }
}

// Worker instance interface
interface WorkerInstance {
  id: string;
  busy: boolean;
  idleSince: number;
  lastTaskTime: number;
}

/**
 * Simple worker pool for synchronous operations
 */
@injectable()
export class SimpleWorkerPool {
  private readonly logger = new Logger('SimpleWorkerPool');
  
  /**
   * Execute functions in parallel with concurrency limit
   */
  async executeAll<T>(
    tasks: Array<() => Promise<T>>,
    concurrency: number = cpus().length
  ): Promise<T[]> {
    const results: T[] = [];
    const executing: Promise<void>[] = [];
    
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const promise = task().then(result => {
        results[i] = result;
      });
      
      executing.push(promise);
      
      if (executing.length >= concurrency) {
        await Promise.race(executing);
        executing.splice(executing.findIndex(p => p === promise), 1);
      }
    }
    
    await Promise.all(executing);
    return results;
  }
}