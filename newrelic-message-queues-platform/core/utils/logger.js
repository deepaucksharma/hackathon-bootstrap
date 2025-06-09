/**
 * Unified Logging Utility
 * 
 * Consolidates chalk-based logging patterns used across 48+ files.
 * Provides consistent formatting, log levels, and configuration.
 */

const chalk = require('chalk');
const { getConfigManager } = require('../config/config-manager');

class Logger {
  constructor(options = {}) {
    this.options = {
      level: options.level || 'info',
      prefix: options.prefix || '',
      timestamp: options.timestamp !== false,
      colors: options.colors !== false,
      ...options
    };
    
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
      trace: 4
    };
    
    this.colorMap = {
      error: chalk.red,
      warn: chalk.yellow,
      info: chalk.blue,
      success: chalk.green,
      debug: chalk.gray,
      trace: chalk.dim
    };
    
    this.iconMap = {
      error: '❌',
      warn: '⚠️',
      info: 'ℹ️',
      success: '✅',
      debug: '🔍',
      trace: '📍',
      progress: '⏳',
      rocket: '🚀',
      gear: '⚙️',
      chart: '📊',
      fire: '🔥',
      checkmark: '✓',
      cross: '✗'
    };
  }

  /**
   * Log error message
   */
  error(message, ...args) {
    this._log('error', message, ...args);
  }

  /**
   * Log warning message
   */
  warn(message, ...args) {
    this._log('warn', message, ...args);
  }

  /**
   * Log info message
   */
  info(message, ...args) {
    this._log('info', message, ...args);
  }

  /**
   * Log success message
   */
  success(message, ...args) {
    this._log('success', message, ...args);
  }

  /**
   * Log debug message
   */
  debug(message, ...args) {
    this._log('debug', message, ...args);
  }

  /**
   * Log trace message
   */
  trace(message, ...args) {
    this._log('trace', message, ...args);
  }

  /**
   * Log with custom color
   */
  colored(color, message, ...args) {
    if (this.options.colors && chalk[color]) {
      console.log(chalk[color](this._formatMessage(message)), ...args);
    } else {
      console.log(this._formatMessage(message), ...args);
    }
  }

  /**
   * Log section header
   */
  section(title, color = 'cyan') {
    const line = '='.repeat(title.length + 4);
    this.colored(color, `\n${line}`);
    this.colored(color, `  ${title}`);
    this.colored(color, line);
  }

  /**
   * Log subsection header
   */
  subsection(title, color = 'blue') {
    this.colored(color, `\n${title}`);
    this.colored(color, '-'.repeat(title.length));
  }

  /**
   * Log list item
   */
  listItem(message, icon = '•', indent = 2) {
    const prefix = ' '.repeat(indent) + icon;
    console.log(`${prefix} ${message}`);
  }

  /**
   * Log progress indicator
   */
  progress(message, current, total) {
    const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
    const progressBar = this._createProgressBar(current, total, 20);
    const icon = this.iconMap.progress;
    
    this.info(`${icon} ${message} ${progressBar} ${percentage}% (${current}/${total})`);
  }

  /**
   * Log key-value pairs
   */
  keyValue(data, options = {}) {
    const maxKeyLength = Math.max(...Object.keys(data).map(k => k.length));
    
    Object.entries(data).forEach(([key, value]) => {
      const paddedKey = key.padEnd(maxKeyLength);
      const color = options.keyColor || 'gray';
      const valueColor = options.valueColor || 'white';
      
      if (this.options.colors) {
        console.log(`${chalk[color](paddedKey)}: ${chalk[valueColor](value)}`);
      } else {
        console.log(`${paddedKey}: ${value}`);
      }
    });
  }

  /**
   * Log table-like data
   */
  table(headers, rows) {
    const columnWidths = headers.map((header, index) => {
      const headerLength = header.length;
      const maxRowLength = Math.max(...rows.map(row => String(row[index] || '').length));
      return Math.max(headerLength, maxRowLength) + 2;
    });

    // Header
    const headerRow = headers.map((header, index) => 
      header.padEnd(columnWidths[index])
    ).join('|');
    
    console.log(chalk.bold(headerRow));
    console.log('-'.repeat(headerRow.length));

    // Rows
    rows.forEach(row => {
      const rowStr = row.map((cell, index) => 
        String(cell || '').padEnd(columnWidths[index])
      ).join('|');
      console.log(rowStr);
    });
  }

  /**
   * Log JSON data with formatting
   */
  json(data, title = null) {
    if (title) {
      this.info(title);
    }
    console.log(JSON.stringify(data, null, 2));
  }

  /**
   * Log with icon
   */
  withIcon(icon, message, color = 'white') {
    const iconStr = this.iconMap[icon] || icon;
    this.colored(color, `${iconStr} ${message}`);
  }

  /**
   * Log platform events
   */
  platformEvent(event, details = {}) {
    const icons = {
      start: 'rocket',
      stop: 'cross',
      entity_created: 'gear',
      entity_updated: 'gear',
      metrics_sent: 'chart',
      dashboard_created: 'success',
      error: 'error',
      warning: 'warn'
    };

    const icon = icons[event] || 'info';
    const message = this._formatPlatformEvent(event, details);
    this.withIcon(icon, message);
  }

  /**
   * Log transformation events
   */
  transformation(operation, input, output, duration = null) {
    const durationStr = duration ? ` (${duration}ms)` : '';
    this.info(`🔄 ${operation}: ${input} → ${output}${durationStr}`);
  }

  /**
   * Log API operations
   */
  apiCall(method, endpoint, status, duration = null) {
    const statusIcon = status >= 200 && status < 300 ? '✅' : '❌';
    const durationStr = duration ? ` (${duration}ms)` : '';
    this.info(`${statusIcon} ${method} ${endpoint} → ${status}${durationStr}`);
  }

  /**
   * Create child logger with prefix
   */
  child(prefix) {
    return new Logger({
      ...this.options,
      prefix: this.options.prefix ? `${this.options.prefix}:${prefix}` : prefix
    });
  }

  /**
   * Enable/disable logging levels based on configuration
   */
  updateFromConfig() {
    try {
      const configManager = getConfigManager();
      
      if (configManager.isDebug()) {
        this.options.level = 'debug';
      }
      
      if (configManager.isVerbose()) {
        this.options.level = 'trace';
      }
      
    } catch (error) {
      // Config not available, use defaults
    }
  }

  // Private methods

  _log(level, message, ...args) {
    const levelNum = this.levels[level];
    const currentLevelNum = this.levels[this.options.level] || this.levels.info;
    
    if (levelNum > currentLevelNum) {
      return; // Skip if below current log level
    }
    
    const formattedMessage = this._formatMessage(message, level);
    
    if (this.options.colors && this.colorMap[level]) {
      console.log(this.colorMap[level](formattedMessage), ...args);
    } else {
      console.log(formattedMessage, ...args);
    }
  }

  _formatMessage(message, level = null) {
    let formatted = '';
    
    if (this.options.timestamp) {
      const timestamp = new Date().toISOString().substring(11, 23); // HH:mm:ss.SSS
      formatted += `[${timestamp}] `;
    }
    
    if (this.options.prefix) {
      formatted += `[${this.options.prefix}] `;
    }
    
    if (level && this.iconMap[level]) {
      formatted += `${this.iconMap[level]} `;
    }
    
    formatted += message;
    
    return formatted;
  }

  _createProgressBar(current, total, width = 20) {
    const percentage = total > 0 ? current / total : 0;
    const filled = Math.round(width * percentage);
    const empty = width - filled;
    
    return `[${'█'.repeat(filled)}${' '.repeat(empty)}]`;
  }

  _formatPlatformEvent(event, details) {
    const eventMessages = {
      start: 'Platform starting',
      stop: 'Platform stopping',
      entity_created: `Entity created: ${details.type || 'unknown'}`,
      entity_updated: `Entity updated: ${details.name || 'unknown'}`,
      metrics_sent: `Metrics sent: ${details.count || 0} events`,
      dashboard_created: `Dashboard created: ${details.name || 'unknown'}`,
      error: `Error: ${details.message || 'unknown'}`,
      warning: `Warning: ${details.message || 'unknown'}`
    };

    return eventMessages[event] || `Event: ${event}`;
  }
}

// Create default logger instance
const defaultLogger = new Logger();

// Auto-configure from environment on load
defaultLogger.updateFromConfig();

// Export both class and default instance
module.exports = {
  Logger,
  logger: defaultLogger,
  
  // Convenience methods using default logger
  error: (...args) => defaultLogger.error(...args),
  warn: (...args) => defaultLogger.warn(...args),
  info: (...args) => defaultLogger.info(...args),
  success: (...args) => defaultLogger.success(...args),
  debug: (...args) => defaultLogger.debug(...args),
  trace: (...args) => defaultLogger.trace(...args),
  
  section: (...args) => defaultLogger.section(...args),
  subsection: (...args) => defaultLogger.subsection(...args),
  progress: (...args) => defaultLogger.progress(...args),
  keyValue: (...args) => defaultLogger.keyValue(...args),
  table: (...args) => defaultLogger.table(...args),
  json: (...args) => defaultLogger.json(...args),
  withIcon: (...args) => defaultLogger.withIcon(...args),
  
  platformEvent: (...args) => defaultLogger.platformEvent(...args),
  transformation: (...args) => defaultLogger.transformation(...args),
  apiCall: (...args) => defaultLogger.apiCall(...args),
  
  child: (...args) => defaultLogger.child(...args)
};