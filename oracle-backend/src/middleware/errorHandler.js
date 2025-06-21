const logger = require('../utils/logger');

/**
 * Global error handling middleware
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const errorHandler = (err, req, res, next) => {
  // Log the error
  logger.error('Unhandled error occurred', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    body: req.body,
    query: req.query
  });

  // Don't expose internal errors in production
  let message = 'Internal server error';
  let statusCode = 500;

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation error';
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid data format';
  } else if (err.name === 'UnauthorizedError') {
    statusCode = 401;
    message = 'Unauthorized';
  } else if (err.name === 'ForbiddenError') {
    statusCode = 403;
    message = 'Forbidden';
  } else if (err.name === 'NotFoundError') {
    statusCode = 404;
    message = 'Resource not found';
  } else if (err.name === 'ConflictError') {
    statusCode = 409;
    message = 'Resource conflict';
  } else if (err.name === 'TooManyRequestsError') {
    statusCode = 429;
    message = 'Too many requests';
  }

  // In development, expose more error details
  if (process.env.NODE_ENV === 'development') {
    message = err.message;
  }

  // Send error response
  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && {
      details: {
        stack: err.stack,
        name: err.name
      }
    })
  });
};

/**
 * 404 Not Found handler
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const notFoundHandler = (req, res) => {
  logger.warn('Route not found', {
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(404).json({
    success: false,
    error: 'Route not found',
    message: `Cannot ${req.method} ${req.path}`
  });
};

/**
 * Async error wrapper to catch errors in async route handlers
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Express middleware function
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Custom error classes
 */
class ValidationError extends Error {
  constructor(message, details = null) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

class ForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

class NotFoundError extends Error {
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

class ConflictError extends Error {
  constructor(message = 'Resource conflict') {
    super(message);
    this.name = 'ConflictError';
  }
}

class TooManyRequestsError extends Error {
  constructor(message = 'Too many requests') {
    super(message);
    this.name = 'TooManyRequestsError';
  }
}

class BitcoinServiceError extends Error {
  constructor(message = 'Bitcoin service error') {
    super(message);
    this.name = 'BitcoinServiceError';
  }
}

class AWSSecretsError extends Error {
  constructor(message = 'AWS Secrets Manager error') {
    super(message);
    this.name = 'AWSSecretsError';
  }
}

class PreimageError extends Error {
  constructor(message = 'Preimage generation error') {
    super(message);
    this.name = 'PreimageError';
  }
}

/**
 * Create a standardized API error response
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code
 * @param {Object} details - Additional error details
 * @returns {Object} Error response object
 */
const createErrorResponse = (message, statusCode = 500, details = null) => {
  const response = {
    success: false,
    error: message
  };

  if (details && process.env.NODE_ENV === 'development') {
    response.details = details;
  }

  return response;
};

/**
 * Handle specific AWS errors
 * @param {Error} error - AWS SDK error
 * @returns {Object} Normalized error response
 */
const handleAWSError = (error) => {
  logger.error('AWS Error:', {
    name: error.name,
    message: error.message,
    code: error.$metadata?.httpStatusCode
  });

  switch (error.name) {
    case 'ResourceNotFoundException':
      return createErrorResponse('Resource not found', 404);
    case 'AccessDeniedException':
      return createErrorResponse('Access denied', 403);
    case 'ValidationException':
      return createErrorResponse('Invalid request parameters', 400);
    case 'ThrottlingException':
      return createErrorResponse('Service temporarily unavailable', 503);
    case 'ServiceUnavailableException':
      return createErrorResponse('Service temporarily unavailable', 503);
    default:
      return createErrorResponse('External service error', 500);
  }
};

/**
 * Handle Bitcoin service errors
 * @param {Error} error - Bitcoin service error
 * @returns {Object} Normalized error response
 */
const handleBitcoinError = (error) => {
  logger.error('Bitcoin Service Error:', {
    name: error.name,
    message: error.message
  });

  if (error.message.includes('Invalid address')) {
    return createErrorResponse('Invalid Bitcoin address', 400);
  }

  if (error.message.includes('Invalid public key')) {
    return createErrorResponse('Invalid public key', 400);
  }

  if (error.message.includes('Network mismatch')) {
    return createErrorResponse('Network configuration error', 500);
  }

  return createErrorResponse('Bitcoin service error', 500);
};

/**
 * Rate limiting error handler
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const rateLimitHandler = (req, res) => {
  logger.security('Rate limit exceeded', {
    ip: req.ip,
    path: req.path,
    userAgent: req.get('User-Agent')
  });

  res.status(429).json({
    success: false,
    error: 'Too many requests, please try again later',
    retryAfter: Math.round(req.rateLimit?.resetTime / 1000) || 60
  });
};

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  TooManyRequestsError,
  BitcoinServiceError,
  AWSSecretsError,
  PreimageError,
  createErrorResponse,
  handleAWSError,
  handleBitcoinError,
  rateLimitHandler
};
