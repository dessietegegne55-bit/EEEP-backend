// backend/src/routes/liveSessionRoutes.js
// COMPLETE FIXED

const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const liveSessionController = require('../controllers/liveSessionController');

// ===========================================
// TEACHER ROUTES
// ===========================================
router.post('/', authenticate, authorize('teacher'), liveSessionController.createSession);
router.get('/teacher', authenticate, authorize('teacher'), liveSessionController.getTeacherSessions);
router.put('/:sessionId/start', authenticate, authorize('teacher'), liveSessionController.startSession);
router.put('/:sessionId/end', authenticate, authorize('teacher'), liveSessionController.endSession);
router.put('/:sessionId/cancel', authenticate, authorize('teacher'), liveSessionController.cancelSession);
router.delete('/:sessionId', authenticate, authorize('teacher'), liveSessionController.deleteSession);

// ===========================================
// STUDENT ROUTES
// ===========================================
// Get all available sessions (scheduled + live) for student
router.get('/student/available', authenticate, authorize('student'), liveSessionController.getStudentSessions);
// Get only ongoing/live sessions
router.get('/student/ongoing', authenticate, authorize('student'), liveSessionController.getOngoingSessions);
// Get student's joined sessions history
router.get('/student/joined', authenticate, authorize('student'), liveSessionController.getMyJoinedSessions);
// Join/register for a session
router.post('/:sessionId/join', authenticate, authorize('student'), liveSessionController.joinSession);
// Leave a session
router.post('/:sessionId/leave', authenticate, authorize('student'), liveSessionController.leaveSession);

module.exports = router;