// backend/src/routes/subjectRoutes.js
// FIXED - CamelCase compatible

const express = require('express');
const router = express.Router();
const subjectController = require('../controllers/subjectController');
const { authenticate, authorize } = require('../middleware/auth');

// Public routes
router.get('/', subjectController.getSubjects);
router.get('/:id', subjectController.getSubjectById);

// Protected routes
router.get('/student/subjects', authenticate, authorize('student'), subjectController.getStudentSubjects);
router.get('/teacher/subjects', authenticate, authorize('teacher'), subjectController.getTeacherSubjects);

// Admin only routes
router.post('/', authenticate, authorize('superadmin', 'subadmin'), subjectController.createSubject);
router.put('/:id', authenticate, authorize('superadmin', 'subadmin'), subjectController.updateSubject);
router.delete('/:id', authenticate, authorize('superadmin', 'subadmin'), subjectController.deleteSubject);

module.exports = router;