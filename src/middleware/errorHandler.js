// backend/src/middleware/errorHandler.js
// COMPLETE FIXED VERSION

const { logError } = require('../utils/logger');

const createError = (message, statusCode = 500) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.isOperational = true;
  return error;
};

const errorHandler = (err, req, res, next) => {
  let { statusCode = 500, message } = err;

  // Log error safely
  try {
    logError({
      message: err.message,
      stack: err.stack,
      url: req.url,
      method: req.method,
      ip: req.ip,
    });
  } catch (logError) {
    console.error('Failed to log error:', err.message);
  }

  // Don't leak error details in production
  if (process.env.NODE_ENV === 'production' && !err.isOperational) {
    message = 'Something went wrong';
  }

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
};

module.exports = {
  createError,
  errorHandler,
};