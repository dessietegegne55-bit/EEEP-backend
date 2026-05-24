// backend/src/routes/feedbackRoutes.js
const express = require('express');
const router = express.Router();
const feedbackController = require('../controllers/feedbackController');
const { authenticate, authorize } = require('../middleware/auth');

// Student routes
router.post('/submit', authenticate, authorize('student'), feedbackController.submitFeedback);

// Admin routes
router.get('/all', authenticate, authorize('superadmin', 'subadmin'), feedbackController.getAllFeedback);
router.delete('/:id', authenticate, authorize('superadmin', 'subadmin'), feedbackController.deleteFeedback);

module.exports = router;