const { validationResult } = require('express-validator');
const { schemas } = require('../utils/validation');
const logger = require('../utils/logger');

/**
 * Middleware to validate request using express-validator results
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorDetails = errors.array().map(error => ({
      field: error.path || error.param,
      message: error.msg,
      value: error.value
    }));

    logger.warn('Request validation failed', {
      path: req.path,
      method: req.method,
      errors: errorDetails,
      ip: req.ip
    });

    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errorDetails
    });
  }
  
  next();
};

/**
 * Middleware to validate request body using Joi schemas
 * @param {string} schemaName - Name of the schema to use
 * @returns {Function} Express middleware function
 */
const validateWithJoi = (schemaName) => {
  return (req, res, next) => {
    const schema = schemas[schemaName];
    
    if (!schema) {
      logger.error('Validation schema not found', { schemaName });
      return res.status(500).json({
        success: false,
        error: 'Internal validation error'
      });
    }

    const { error, value } = schema.validate(req.body, {
      abortEarly: false, // Return all validation errors
      stripUnknown: true, // Remove unknown fields
      convert: true // Convert types when possible
    });

    if (error) {
      const errorDetails = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      logger.warn('Joi validation failed', {
        path: req.path,
        method: req.method,
        schema: schemaName,
        errors: errorDetails,
        ip: req.ip
      });

      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errorDetails
      });
    }

    // Replace req.body with validated and sanitized values
    req.body = value;
    next();
  };
};

/**
 * Middleware to validate query parameters
 * @param {Object} schema - Joi schema for query parameters
 * @returns {Function} Express middleware function
 */
const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const errorDetails = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      logger.warn('Query validation failed', {
        path: req.path,
        method: req.method,
        errors: errorDetails,
        ip: req.ip
      });

      return res.status(400).json({
        success: false,
        error: 'Query validation failed',
        details: errorDetails
      });
    }

    req.query = value;
    next();
  };
};

/**
 * Middleware to validate request parameters (path params)
 * @param {Object} schema - Joi schema for parameters
 * @returns {Function} Express middleware function
 */
const validateParams = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const errorDetails = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      logger.warn('Parameter validation failed', {
        path: req.path,
        method: req.method,
        errors: errorDetails,
        ip: req.ip
      });

      return res.status(400).json({
        success: false,
        error: 'Parameter validation failed',
        details: errorDetails
      });
    }

    req.params = value;
    next();
  };
};

/**
 * Middleware to sanitize request data
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const sanitizeRequest = (req, res, next) => {
  // Sanitize common fields
  if (req.body) {
    // Trim string values
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = req.body[key].trim();
      }
    });

    // Convert string numbers to actual numbers for known numeric fields
    const numericFields = ['btcAmount', 'timelock', 'confirmations'];
    numericFields.forEach(field => {
      if (req.body[field] && typeof req.body[field] === 'string') {
        const num = parseInt(req.body[field], 10);
        if (!isNaN(num)) {
          req.body[field] = num;
        }
      }
    });
  }

  next();
};

/**
 * Middleware to validate Content-Type for POST/PUT requests
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const validateContentType = (req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.get('Content-Type');
    
    if (!contentType || !contentType.includes('application/json')) {
      logger.warn('Invalid Content-Type', {
        method: req.method,
        path: req.path,
        contentType: contentType || 'none',
        ip: req.ip
      });

      return res.status(415).json({
        success: false,
        error: 'Content-Type must be application/json'
      });
    }
  }
  
  next();
};

/**
 * Middleware to validate request size
 * @param {number} maxSize - Maximum request size in bytes
 * @returns {Function} Express middleware function
 */
const validateRequestSize = (maxSize = 1024 * 1024) => { // 1MB default
  return (req, res, next) => {
    const contentLength = parseInt(req.get('Content-Length') || '0', 10);
    
    if (contentLength > maxSize) {
      logger.warn('Request too large', {
        contentLength,
        maxSize,
        path: req.path,
        ip: req.ip
      });

      return res.status(413).json({
        success: false,
        error: 'Request entity too large'
      });
    }
    
    next();
  };
};

module.exports = {
  validateRequest,
  validateWithJoi,
  validateQuery,
  validateParams,
  sanitizeRequest,
  validateContentType,
  validateRequestSize
};
