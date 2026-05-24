// backend/src/routes/authRoutes.js
// COMPLETE FIXED - With name, fatherName, grandfatherName validation

const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validation');
const { authLimiter } = require('../middleware/rateLimiter');
const upload = require('../middleware/upload');

// ===========================================
// VALIDATION RULES
// ===========================================

// Student Registration Validation (UPDATED with name, fatherName, grandfatherName)
const registerValidation = [
  body('name').notEmpty().withMessage('Full name is required'),
  body('fatherName').notEmpty().withMessage('Father name is required'),
  body('grandfatherName').notEmpty().withMessage('Grandfather name is required'),
  body('sex').notEmpty().withMessage('Gender is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('username').notEmpty().withMessage('Username is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('idNumber').notEmpty().withMessage('ID Number is required'),
  body('gradeLevel').notEmpty().withMessage('Grade level is required'),
  body('department').notEmpty().withMessage('Department is required'),
  body('phone').optional().matches(/^[0-9+\s-]*$/).withMessage('Phone number can only contain numbers, +, spaces, and hyphens'),
];

// Login Validation
const loginValidation = [
  body('username').notEmpty().withMessage('Username or email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

// Change Password Validation
const changePasswordValidation = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.newPassword) throw new Error('Passwords do not match');
    return true;
  }),
];

// Force Password Change Validation (Unified)
const forcePasswordChangeValidation = [
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.newPassword) throw new Error('Passwords do not match');
    return true;
  }),
];

// Forgot Password Validation
const forgotPasswordValidation = [
  body('email').isEmail().withMessage('Valid email is required'),
];

// Reset Password Validation
const resetPasswordValidation = [
  body('token').notEmpty().withMessage('Token is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.newPassword) throw new Error('Passwords do not match');
    return true;
  }),
];

// ===========================================
// AUTH ROUTES
// ===========================================

// Student Registration (with ID photo upload)
router.post(
  '/register',
  upload.single('idPhoto'),
  registerValidation,
  validate,
  authController.registerStudent
);

// Login (with rate limiting)
router.post(
  '/login',
  authLimiter,
  loginValidation,
  validate,
  authController.login
);

// Logout
router.post('/logout', authController.logout);

// Refresh Token
router.post('/refresh-token', authController.refreshToken);

// Change Password (authenticated users only)
router.post(
  '/change-password',
  authenticate,
  changePasswordValidation,
  validate,
  authController.changePassword
);

// ===========================================
// UNIFIED FORCE PASSWORD CHANGE
// ===========================================
router.post(
  '/force-password-change',
  authenticate,
  forcePasswordChangeValidation,
  validate,
  authController.forcePasswordChange
);

// ===========================================
// LEGACY FORCE PASSWORD CHANGE (Backward compatibility)
// ===========================================
router.post(
  '/force-password-change-subadmin',
  authenticate,
  forcePasswordChangeValidation,
  validate,
  authController.forcePasswordChangeSubAdmin
);

router.post(
  '/force-password-change-teacher',
  authenticate,
  forcePasswordChangeValidation,
  validate,
  authController.forcePasswordChangeTeacher
);

router.post(
  '/force-password-change-school',
  authenticate,
  forcePasswordChangeValidation,
  validate,
  authController.forcePasswordChangeSchool
);

// ===========================================
// PASSWORD RESET (Forgot/Reset)
// ===========================================

// Forgot Password - sends reset email
router.post(
  '/forgot-password',
  forgotPasswordValidation,
  validate,
  authController.forgotPassword
);

// Reset Password - uses token from email
router.post(
  '/reset-password',
  resetPasswordValidation,
  validate,
  authController.resetPassword
);

// ===========================================
// CURRENT USER
// ===========================================

// Get current authenticated user info
router.get('/me', authenticate, authController.getMe);

module.exports = router;