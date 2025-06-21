const logger = require('../utils/logger');

/**
 * Authentication middleware for Chainlink Functions integration
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const authenticateChainlinkDON = (req, res, next) => {
  try {
    const authHeader = req.get('Authorization');
    const authToken = req.body.authToken;
    
    // Extract token from header or body
    let token = null;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (authToken) {
      token = authToken;
    }
    
    if (!token) {
      logger.security('Missing authentication token', {
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      
      return res.status(401).json({
        success: false,
        error: 'Authentication token required'
      });
    }

    // TODO: Implement proper Chainlink DON authentication
    // For now, using a simple token validation
    // In production, this should verify:
    // 1. Token signature from Chainlink DON
    // 2. Token expiration
    // 3. Request origin validation
    // 4. Rate limiting per DON node
    
    const validTokens = [
      'chainlink-don-token',
      process.env.CHAINLINK_DON_TOKEN
    ].filter(Boolean);
    
    if (!validTokens.includes(token)) {
      logger.security('Invalid authentication token', {
        path: req.path,
        ip: req.ip,
        tokenPreview: token.substring(0, 10) + '...'
      });
      
      return res.status(401).json({
        success: false,
        error: 'Invalid authentication token'
      });
    }

    // Add authentication info to request
    req.auth = {
      type: 'chainlink-don',
      token: token,
      authenticated: true,
      timestamp: new Date().toISOString()
    };

    logger.info('Chainlink DON authenticated', {
      path: req.path,
      ip: req.ip
    });

    next();

  } catch (error) {
    logger.error('Authentication error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  }
};

/**
 * API key authentication middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const authenticateApiKey = (req, res, next) => {
  try {
    const apiKey = req.get('X-API-Key') || req.query.apiKey;
    
    if (!apiKey) {
      logger.security('Missing API key', {
        path: req.path,
        ip: req.ip
      });
      
      return res.status(401).json({
        success: false,
        error: 'API key required'
      });
    }

    // TODO: Implement proper API key validation
    // In production, this should:
    // 1. Validate API key format
    // 2. Check key against database
    // 3. Verify key permissions
    // 4. Check rate limits for the key
    // 5. Log usage statistics
    
    const validApiKeys = [
      process.env.API_KEY,
      'dev-api-key-12345'
    ].filter(Boolean);
    
    if (!validApiKeys.includes(apiKey)) {
      logger.security('Invalid API key', {
        path: req.path,
        ip: req.ip,
        apiKeyPreview: apiKey.substring(0, 8) + '...'
      });
      
      return res.status(401).json({
        success: false,
        error: 'Invalid API key'
      });
    }

    req.auth = {
      type: 'api-key',
      apiKey: apiKey,
      authenticated: true,
      timestamp: new Date().toISOString()
    };

    next();

  } catch (error) {
    logger.error('API key authentication error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  }
};

/**
 * Optional authentication middleware (allows both authenticated and unauthenticated requests)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const optionalAuth = (req, res, next) => {
  const authHeader = req.get('Authorization');
  const apiKey = req.get('X-API-Key');
  const authToken = req.body?.authToken;
  
  // If no authentication provided, continue without auth
  if (!authHeader && !apiKey && !authToken) {
    req.auth = {
      type: 'none',
      authenticated: false
    };
    return next();
  }

  // If authentication is provided, validate it
  if (authHeader || authToken) {
    return authenticateChainlinkDON(req, res, next);
  }
  
  if (apiKey) {
    return authenticateApiKey(req, res, next);
  }
  
  next();
};

/**
 * Role-based authorization middleware
 * @param {Array} allowedRoles - Array of allowed roles
 * @returns {Function} Express middleware function
 */
const authorizeRoles = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.auth || !req.auth.authenticated) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // TODO: Implement role-based authorization
    // For now, all authenticated requests are allowed
    // In production, this should:
    // 1. Extract user role from token/API key
    // 2. Check if user role is in allowedRoles
    // 3. Log authorization decisions
    
    const userRole = req.auth.role || 'user';
    
    if (allowedRoles.length > 0 && !allowedRoles.includes(userRole)) {
      logger.security('Authorization failed', {
        path: req.path,
        ip: req.ip,
        userRole,
        allowedRoles
      });
      
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }

    next();
  };
};

/**
 * IP whitelist middleware
 * @param {Array} allowedIPs - Array of allowed IP addresses
 * @returns {Function} Express middleware function
 */
const ipWhitelist = (allowedIPs = []) => {
  return (req, res, next) => {
    if (allowedIPs.length === 0) {
      return next(); // No IP restriction
    }

    const clientIP = req.ip || req.connection.remoteAddress;
    
    if (!allowedIPs.includes(clientIP)) {
      logger.security('IP not whitelisted', {
        path: req.path,
        clientIP,
        allowedIPs
      });
      
      return res.status(403).json({
        success: false,
        error: 'IP address not allowed'
      });
    }

    next();
  };
};

/**
 * Request signature validation middleware (for webhook security)
 * @param {string} secretKey - Secret key for signature validation
 * @returns {Function} Express middleware function
 */
const validateSignature = (secretKey) => {
  return (req, res, next) => {
    try {
      const signature = req.get('X-Signature') || req.get('X-Hub-Signature-256');
      
      if (!signature) {
        logger.security('Missing request signature', {
          path: req.path,
          ip: req.ip
        });
        
        return res.status(401).json({
          success: false,
          error: 'Request signature required'
        });
      }

      // TODO: Implement HMAC signature validation
      // This should validate that the request body was signed with the secret key
      
      logger.info('Request signature validated', {
        path: req.path,
        ip: req.ip
      });

      next();

    } catch (error) {
      logger.error('Signature validation error:', error);
      
      res.status(500).json({
        success: false,
        error: 'Signature validation failed'
      });
    }
  };
};

module.exports = {
  authenticateChainlinkDON,
  authenticateApiKey,
  optionalAuth,
  authorizeRoles,
  ipWhitelist,
  validateSignature
};
