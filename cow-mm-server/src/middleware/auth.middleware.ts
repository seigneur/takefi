import { Request, Response, NextFunction } from 'express';
import { createAppError } from './errorHandler';
import { ERROR_CODES } from '../models';

interface AuthenticatedRequest extends Request {
  isAuthenticated?: boolean;
  apiKeyUsed?: string;
}

/**
 * API Key based authentication middleware
 * Validates the x-api-key header against the configured API_KEY environment variable
 */
export function apiKeyAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  try {
    const apiKey = req.headers['x-api-key'] as string;
    const expectedApiKey = process.env.API_KEY;

    // Check if API key is configured
    if (!expectedApiKey) {
      console.error('API_KEY environment variable not configured');
      throw createAppError(
        'Authentication system not properly configured', 
        500, 
        ERROR_CODES.INTERNAL_SERVER_ERROR
      );
    }

    // Check if API key is provided in request
    if (!apiKey) {
      throw createAppError(
        'API key required. Include x-api-key header with your request', 
        401, 
        'API_KEY_REQUIRED'
      );
    }

    // Validate API key
    if (apiKey !== expectedApiKey) {
      console.warn(`Invalid API key attempt: ${apiKey.substring(0, 8)}...`);
      throw createAppError(
        'Invalid API key provided', 
        403, 
        'INVALID_API_KEY'
      );
    }

    // API key is valid, add to request object for logging
    req.isAuthenticated = true;
    req.apiKeyUsed = apiKey.substring(0, 8) + '...'; // Log only first 8 chars for security

    console.log(`✅ API authentication successful for key: ${req.apiKeyUsed}`);
    next();

  } catch (error: any) {
    // If it's already an AppError, pass it through
    if (error.statusCode) {
      next(error);
    } else {
      // Wrap unexpected errors
      next(createAppError(
        'Authentication failed', 
        500, 
        ERROR_CODES.INTERNAL_SERVER_ERROR, 
        error
      ));
    }
  }
}

/**
 * Origin-based authentication middleware (alternative approach)
 * Validates requests come from allowed frontend origin
 */
export function originAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  try {
    const origin = req.headers.origin;
    const referer = req.headers.referer;
    const allowedOrigin = process.env.ALLOWED_FRONTEND_ORIGIN;

    if (!allowedOrigin) {
      throw createAppError(
        'Allowed origin not configured', 
        500, 
        ERROR_CODES.INTERNAL_SERVER_ERROR
      );
    }

    // Check origin header (for CORS requests) or referer (for direct requests)
    const requestOrigin = origin || (referer ? new URL(referer).origin : null);
    
    if (requestOrigin !== allowedOrigin) {
      console.warn(`Unauthorized origin attempt: ${requestOrigin}`);
      throw createAppError(
        'Unauthorized origin. Access denied', 
        403, 
        'UNAUTHORIZED_ORIGIN'
      );
    }

    req.isAuthenticated = true;
    console.log(`✅ Origin authentication successful for: ${requestOrigin}`);
    next();

  } catch (error: any) {
    if (error.statusCode) {
      next(error);
    } else {
      next(createAppError(
        'Origin authentication failed', 
        500, 
        ERROR_CODES.INTERNAL_SERVER_ERROR, 
        error
      ));
    }
  }
}

/**
 * Combined authentication middleware
 * Checks both API key and origin for maximum security
 */
export function combinedAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  // First check API key
  apiKeyAuth(req, res, (apiError) => {
    if (apiError) {
      return next(apiError);
    }

    // If API key passed, check origin
    originAuth(req, res, (originError) => {
      if (originError) {
        return next(originError);
      }

      // Both checks passed
      console.log('✅ Combined authentication (API key + origin) successful');
      next();
    });
  });
}

/**
 * Development-only bypass middleware
 * Only use in development environment - bypasses authentication
 */
export function devBypassAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV === 'development') {
    console.log('⚠️  DEV MODE: Bypassing authentication');
    req.isAuthenticated = true;
    next();
  } else {
    // In non-dev environments, fall back to API key auth
    apiKeyAuth(req, res, next);
  }
}