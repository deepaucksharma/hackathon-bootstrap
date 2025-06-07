/**
 * Logger utility for colored console output
 */

const colors = {
  info: '\x1b[36m',    // Cyan
  success: '\x1b[32m', // Green  
  warning: '\x1b[33m', // Yellow
  error: '\x1b[31m',   // Red
  reset: '\x1b[0m'     // Reset
};

function sendColoredLog(level, message) {
  const color = colors[level] || colors.reset;
  const timestamp = new Date().toISOString();
  console.log(`${color}[${timestamp}] ${message}${colors.reset}`);
}

module.exports = {
  sendColoredLog
};