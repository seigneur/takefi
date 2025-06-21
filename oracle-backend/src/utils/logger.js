/**
 * Simple logging utility for the Bitcoin oracle backend
 */
class Logger {
  constructor() {
    this.logLevel = process.env.LOG_LEVEL || 'info';
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };
  }

  /**
   * Check if log level should be output
   * @param {string} level - Log level to check
   * @returns {boolean} True if should log
   */
  shouldLog(level) {
    return this.levels[level] <= this.levels[this.logLevel];
  }

  /**
   * Format log message with timestamp and metadata
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} meta - Additional metadata
   * @returns {string} Formatted log message
   */
  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...meta
    };

    // In development, use pretty formatting
    if (process.env.NODE_ENV === 'development') {
      return `[${timestamp}] ${level.toUpperCase()}: ${message} ${Object.keys(meta).length > 0 ? JSON.stringify(meta, null, 2) : ''}`;
    }

    // In production, use structured JSON logging
    return JSON.stringify(logEntry);
  }

  /**
   * Log error message
   * @param {string} message - Error message
   * @param {Object|Error} meta - Error object or metadata
   */
  error(message, meta = {}) {
    if (!this.shouldLog('error')) return;

    let errorMeta = meta;
    
    // Handle Error objects
    if (meta instanceof Error) {
      errorMeta = {
        error: meta.message,
        stack: meta.stack,
        name: meta.name
      };
    }

    console.error(this.formatMessage('error', message, errorMeta));
  }

  /**
   * Log warning message
   * @param {string} message - Warning message
   * @param {Object} meta - Additional metadata
   */
  warn(message, meta = {}) {
    if (!this.shouldLog('warn')) return;
    console.warn(this.formatMessage('warn', message, meta));
  }

  /**
   * Log info message
   * @param {string} message - Info message
   * @param {Object} meta - Additional metadata
   */
  info(message, meta = {}) {
    if (!this.shouldLog('info')) return;
    console.log(this.formatMessage('info', message, meta));
  }

  /**
   * Log debug message
   * @param {string} message - Debug message
   * @param {Object} meta - Additional metadata
   */
  debug(message, meta = {}) {
    if (!this.shouldLog('debug')) return;
    console.debug(this.formatMessage('debug', message, meta));
  }

  /**
   * Log HTTP request
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {number} duration - Request duration in ms
   */
  logRequest(req, res, duration) {
    const meta = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    };

    if (res.statusCode >= 400) {
      this.warn(`HTTP ${res.statusCode}`, meta);
    } else {
      this.info(`HTTP ${res.statusCode}`, meta);
    }
  }

  /**
   * Log performance metrics
   * @param {string} operation - Operation name
   * @param {number} duration - Duration in milliseconds
   * @param {Object} meta - Additional metadata
   */
  performance(operation, duration, meta = {}) {
    this.info(`Performance: ${operation}`, {
      duration: `${duration}ms`,
      ...meta
    });
  }

  /**
   * Log security events
   * @param {string} event - Security event type
   * @param {Object} meta - Event metadata
   */
  security(event, meta = {}) {
    this.warn(`Security Event: ${event}`, {
      timestamp: new Date().toISOString(),
      ...meta
    });
  }

  /**
   * Log AWS operations
   * @param {string} operation - AWS operation name
   * @param {string} result - Operation result (success/failure)
   * @param {Object} meta - Operation metadata
   */
  aws(operation, result, meta = {}) {
    const level = result === 'success' ? 'info' : 'error';
    this[level](`AWS ${operation}: ${result}`, meta);
  }

  /**
   * Log Bitcoin operations
   * @param {string} operation - Bitcoin operation name
   * @param {Object} meta - Operation metadata
   */
  bitcoin(operation, meta = {}) {
    this.info(`Bitcoin: ${operation}`, meta);
  }
}

module.exports = new Logger();
