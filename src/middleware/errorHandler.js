import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';

export const errorHandler = (err, req, res, next) => {
  let error = err;

  // Handle Zod validation errors
  if (err.name === 'ZodError') {
    const formattedErrors = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    error = new ApiError(400, 'Validation failed', formattedErrors);
  }

  // Handle Mongoose ValidationError
  else if (err.name === 'ValidationError') {
    const formattedErrors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    error = new ApiError(400, 'Database validation error', formattedErrors);
  }

  // Handle Mongoose duplicate key error (E11000)
  else if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    error = new ApiError(409, `A record with this ${field} already exists`);
  }

  // Handle JWT errors
  else if (err.name === 'JsonWebTokenError') {
    error = new ApiError(401, 'Invalid authentication token');
  } else if (err.name === 'TokenExpiredError') {
    error = new ApiError(401, 'Authentication token has expired');
  }

  // Default to 500 if not an ApiError
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error';

  const response = {
    success: false,
    message,
    errors: error.errors || [],
    ...(env.NODE_ENV === 'development' && { stack: err.stack }),
  };

  res.status(statusCode).json(response);
};
