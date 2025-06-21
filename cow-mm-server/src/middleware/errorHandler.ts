import { Request, Response, NextFunction } from 'express';
import { ErrorResponseDto, ERROR_CODES } from '../models';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

export function errorHandler(
  error: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.error('Error:', error);

  const statusCode = error.statusCode || 500;
  const errorCode = error.code || ERROR_CODES.INTERNAL_SERVER_ERROR;

  const errorResponse: ErrorResponseDto = {
    success: false,
    error: {
      code: errorCode,
      message: error.message || 'Internal server error',
      details: error.details
    },
    timestamp: new Date().toISOString()
  };

  res.status(statusCode).json(errorResponse);
}

export function createAppError(message: string, statusCode: number = 500, code?: string, details?: any): AppError {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
}