// backend/src/middleware/auth.js

const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { createError } = require('./errorHandler');

// Token expiry time
const tokenExpiry = 7 * 24 * 60 * 60; // 7 days in seconds
const sessionTimeout = 10 * 60 * 1000; // 10 minutes

const authenticate = async (req, res, next) => {
  try {
    // Get token from cookie or Authorization header
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      throw createError('Authentication required', 401);
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');

    // Find user
    const user = await User.findByPk(decoded.id);

    if (!user) {
      throw createError('User not found', 401);
    }

    // Check user status
    const validStatuses = ['active', 'approved'];
    const blockedStatuses = ['pending', 'rejected', 'suspended', 'banned'];

    if (blockedStatuses.includes(user.status)) {
      let message = 'Account not active';
      if (user.status === 'pending') message = 'Your account is pending approval';
      if (user.status === 'rejected') message = 'Your account has been rejected';
      if (user.status === 'suspended') message = 'Your account has been suspended';
      if (user.status === 'banned') message = 'Your account has been banned';
      throw createError(message, 403);
    }

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      next(createError('Invalid token', 401));
    } else if (error.name === 'TokenExpiredError') {
      next(createError('Token expired. Please login again.', 401));
    } else {
      next(error);
    }
  }
};

// Generate token
const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: tokenExpiry }
  );
};

// Refresh token middleware
const refreshToken = async (req, res, next) => {
  try {
    const oldToken = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');

    if (!oldToken) {
      throw createError('No token provided', 401);
    }

    const decoded = jwt.decode(oldToken);
    if (!decoded || !decoded.id) {
      throw createError('Invalid token', 401);
    }

    const user = await User.findByPk(decoded.id);
    if (!user) {
      throw createError('User not found', 401);
    }

    // Check if user is still active
    if (user.status !== 'active' && user.status !== 'approved') {
      throw createError('Account not active', 403);
    }

    // Generate new token
    const newToken = generateToken(user);

    req.user = user;
    req.token = newToken;
    next();
  } catch (error) {
    next(error);
  }
};

// Logout handler
const logout = (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  });
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  });

  res.json({
    success: true,
    message: 'Logged out successfully'
  });
};

// Role-based authorization
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(createError('Authentication required', 401));
    }
    if (!roles.includes(req.user.role)) {
      return next(createError('Insufficient permissions', 403));
    }
    next();
  };
};

// Admin authorization (superadmin or subadmin)
const authorizeAdmin = (req, res, next) => {
  if (!req.user) {
    return next(createError('Authentication required', 401));
  }
  if (!['superadmin', 'subadmin'].includes(req.user.role)) {
    return next(createError('Admin access required', 403));
  }
  next();
};

// Super admin only
const authorizeSuperAdmin = (req, res, next) => {
  if (!req.user) {
    return next(createError('Authentication required', 401));
  }
  if (req.user.role !== 'superadmin') {
    return next(createError('Superadmin access required', 403));
  }
  next();
};

// Check ownership middleware
const checkOwnership = (model, idField = 'id') => {
  return async (req, res, next) => {
    try {
      const resource = await model.findByPk(req.params[idField]);
      if (!resource) {
        return next(createError('Resource not found', 404));
      }
      if (['superadmin', 'subadmin'].includes(req.user.role)) {
        req.resource = resource;
        return next();
      }
      if (resource.userId !== req.user.id && resource.createdBy !== req.user.id) {
        return next(createError('Access denied', 403));
      }
      req.resource = resource;
      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = {
  authenticate,
  generateToken,
  refreshToken,
  logout,
  authorize,
  authorizeAdmin,
  authorizeSuperAdmin,
  checkOwnership,
  tokenExpiry,
  sessionTimeout
};