// backend/src/routes/dashboardRoutes.js

const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const dashboardController = require('../controllers/dashboardController');

// Student Dashboard
router.get('/student', authenticate, authorize('student'), dashboardController.getStudentDashboard);

// Teacher Dashboard
router.get('/teacher', authenticate, authorize('teacher'), dashboardController.getTeacherDashboard);

// School Dashboard
router.get('/school', authenticate, authorize('school'), dashboardController.getSchoolDashboard);

// Admin Dashboard (Super Admin & Sub Admin)
router.get('/admin', authenticate, authorize('superadmin', 'subadmin'), dashboardController.getAdminDashboard);

module.exports = router;