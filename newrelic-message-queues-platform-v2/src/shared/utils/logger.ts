/**
 * Simple Logger Utility
 */

export class Logger {
  private context: string;
  private debugEnabled: boolean;

  constructor(context: string) {
    this.context = context;
    this.debugEnabled = process.env.DEBUG?.includes(context.toLowerCase()) || false;
  }

  info(message: string, ...args: any[]): void {
    console.log(`[${this.getTimestamp()}] [INFO] [${this.context}] ${message}`, ...args);
  }

  debug(message: string, ...args: any[]): void {
    if (this.debugEnabled) {
      console.log(`[${this.getTimestamp()}] [DEBUG] [${this.context}] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    console.warn(`[${this.getTimestamp()}] [WARN] [${this.context}] ${message}`, ...args);
  }

  error(message: string, error?: any): void {
    console.error(`[${this.getTimestamp()}] [ERROR] [${this.context}] ${message}`);
    if (error) {
      console.error(error);
    }
  }

  fatal(message: string, error?: any): void {
    console.error(`[${this.getTimestamp()}] [FATAL] [${this.context}] ${message}`);
    if (error) {
      console.error(error);
    }
  }

  timer(label: string, metadata?: any): { complete: () => void; fail: () => void } {
    const start = Date.now();
    if (metadata) {
      this.debug(`${label} started`, metadata);
    }
    return {
      complete: () => {
        const duration = Date.now() - start;
        this.debug(`${label} completed in ${duration}ms`);
      },
      fail: () => {
        const duration = Date.now() - start;
        this.debug(`${label} failed after ${duration}ms`);
      }
    };
  }

  private getTimestamp(): string {
    return new Date().toISOString();
  }
}