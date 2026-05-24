// backend/src/routes/index.js

const express = require('express');
const router = express.Router();

// Import all route files
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const examRoutes = require('./examRoutes');
const materialRoutes = require('./materialRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const subjectRoutes = require('./subjectRoutes');
const notificationRoutes = require('./notificationRoutes');
const adminRoutes = require('./adminRoutes');
const teacherRoutes = require('./teacherRoutes');
const schoolRoutes = require('./schoolRoutes');
const studentRoutes = require('./studentRoutes'); // ✅ ADD THIS

// Register routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/exams', examRoutes);
router.use('/materials', materialRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/subjects', subjectRoutes);
router.use('/notifications', notificationRoutes);
router.use('/admin', adminRoutes);
router.use('/teacher', teacherRoutes);
router.use('/school', schoolRoutes);
router.use('/student', studentRoutes); // ✅ ADD THIS

module.exports = router;