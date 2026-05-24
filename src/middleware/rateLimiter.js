// backend/src/middleware/rateLimiter.js

const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 attempts per window (increased from 5)
  skipSuccessfulRequests: true,
  message: {
    success: false,
    error: {
      message: 'Too many login attempts, please try again later'
    }
  },
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    error: {
      message: 'Too many requests, please try again later'
    }
  },
});

module.exports = {
  authLimiter,
  apiLimiter,
};