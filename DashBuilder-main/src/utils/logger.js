/**
 * Logger utility for DashBuilder
 * Provides consistent logging across the application
 */

const winston = require('winston');
const chalk = require('chalk');

class Logger {
  constructor() {
    this.winston = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });

    // Add console methods for compatibility
    this.setupConsoleMethods();
  }

  setupConsoleMethods() {
    const levels = ['error', 'warn', 'info', 'debug'];
    
    levels.forEach(level => {
      this[level] = (...args) => {
        // Format the message
        const message = args[0];
        const meta = args.slice(1);
        
        // Use appropriate color
        const coloredMessage = this.colorize(level, message);
        
        // Log with winston
        this.winston[level](coloredMessage, ...meta);
      };
    });
  }

  colorize(level, message) {
    const colors = {
      error: chalk.red,
      warn: chalk.yellow,
      info: chalk.blue,
      debug: chalk.gray
    };

    const color = colors[level] || chalk.white;
    return color(message);
  }

  success(message, ...args) {
    this.info(chalk.green('✓ ' + message), ...args);
  }

  progress(message, ...args) {
    this.info(chalk.cyan('→ ' + message), ...args);
  }

  verbose(message, ...args) {
    if (process.env.VERBOSE) {
      this.debug(message, ...args);
    }
  }

  table(data) {
    console.table(data);
  }

  json(data, pretty = true) {
    if (pretty) {
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log(JSON.stringify(data));
    }
  }

  setLevel(level) {
    this.winston.level = level;
  }

  child(meta) {
    const childLogger = Object.create(this);
    childLogger.winston = this.winston.child(meta);
    return childLogger;
  }
}

// Export singleton instance
module.exports = new Logger();