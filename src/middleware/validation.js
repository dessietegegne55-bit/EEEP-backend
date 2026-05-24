// backend/src/middleware/validation.js

const { validationResult } = require('express-validator');
const { createError } = require('./errorHandler');

const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => error.msg);
    return next(createError(errorMessages.join(', '), 400));
  }

  next();
};

module.exports = validate;