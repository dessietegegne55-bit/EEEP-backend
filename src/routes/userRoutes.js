// backend/src/routes/userRoutes.js
// FIXED - CamelCase compatible

const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const userController = require('../controllers/userController');
const { authenticate, authorizeAdmin, authorizeSuperAdmin } = require('../middleware/auth');
const validate = require('../middleware/validation');

const updateUserValidation = [
  body('firstName').optional().notEmpty().withMessage('First name cannot be empty'),
  body('lastName').optional().notEmpty().withMessage('Last name cannot be empty'),
  body('email').optional().isEmail().withMessage('Valid email is required'),
];

const updateProfileValidation = [
  body('name').optional().notEmpty().withMessage('Name cannot be empty'),
  body('fatherName').optional().notEmpty().withMessage('Father name cannot be empty'),
  body('grandfatherName').optional().notEmpty().withMessage('Grandfather name cannot be empty'),
  body('email').optional().isEmail().withMessage('Valid email is required'),
];

// Profile update route (for authenticated users to update their own profile)
router.put('/profile', authenticate, updateProfileValidation, validate, userController.updateProfile);

router.get('/', authenticate, authorizeAdmin, userController.getUsers);
router.get('/pending', authenticate, authorizeAdmin, userController.getPendingUsers);
router.get('/export', authenticate, authorizeAdmin, userController.exportUsers);
router.get('/:id', authenticate, authorizeAdmin, userController.getUserById);
router.put('/:id', authenticate, authorizeAdmin, updateUserValidation, validate, userController.updateUser);
router.delete('/:id', authenticate, authorizeSuperAdmin, userController.deleteUser);
router.post('/:id/approve', authenticate, authorizeAdmin, userController.approveUser);
router.post('/:id/reject', authenticate, authorizeAdmin, userController.rejectUser);
router.post('/:id/suspend', authenticate, authorizeAdmin, userController.suspendUser);
router.post('/:id/reset-password', authenticate, authorizeAdmin, userController.resetUserPassword);

module.exports = router;