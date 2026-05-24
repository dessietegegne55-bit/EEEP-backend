// backend/src/routes/teacherRoutes.js
// COMPLETE FIXED - No duplicate functions, messages working

const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { createError } = require('../middleware/errorHandler');
const { Exam, Subject, Material, Notification, User, Teacher, Question, Student, School } = require('../models');
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');
const NotificationService = require('../services/notificationService');

// Apply authentication and teacher authorization to all routes
router.use(authenticate);
router.use(authorize('teacher'));

// ===========================================
// HELPER FUNCTIONS
// ===========================================
const getVisibleGrades = (studentGrade) => {
  const grade = parseInt(studentGrade);
  const visible = [];
  for (let g = 9; g <= grade; g++) {
    visible.push(g);
  }
  return visible;
};

// ===========================================
// GET TEACHER COMPLETE STATISTICS
// ===========================================
const getTeacherStats = async (req, res, next) => {
  try {
    const teacher = await Teacher.findOne({
      where: { userId: req.user.id },
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'fatherName', 'grandfatherName', 'email'] }]
    });

    if (!teacher) {
      return res.status(404).json({ success: false, error: 'Teacher not found' });
    }

    const teacherSubject = teacher.specialization;
    const teacherId = req.user.id;
    const teacherName = teacher.user?.name || '';

    const [examStats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) as published,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft
      FROM "Exams"
      WHERE "createdBy" = $1 AND subject = $2
    `, { bind: [teacherId, teacherSubject] });

    const [materialStats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) as published,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft
      FROM "Materials"
      WHERE "uploadedBy" = $1 AND subject = $2
    `, { bind: [teacherId, teacherSubject] });

    const studentPerformance = await sequelize.query(`
      SELECT 
        s.id as studentId,
        s."idNumber",
        u."name",
        u."fatherName",
        u."grandfatherName",
        u.email,
        s.department,
        s."gradeLevel",
        COUNT(DISTINCT ea.id) as totalExamsTaken,
        COUNT(DISTINCT CASE WHEN ea.score >= e."passingMarks" THEN ea.id END) as examsPassed,
        COUNT(DISTINCT CASE WHEN ea.score < e."passingMarks" THEN ea.id END) as examsFailed,
        ROUND(AVG(ea.score), 2) as averageScore,
        ROUND(AVG((ea.score / e."totalMarks") * 100), 1) as averagePercentage
      FROM "Students" s
      JOIN "Users" u ON s."userId" = u.id
      JOIN "ExamAttempts" ea ON s.id = ea."studentId"
      JOIN "Exams" e ON ea."examId" = e.id
      WHERE e.subject = $1 
        AND e."createdBy" = $2 
        AND ea.status = 'completed'
      GROUP BY s.id, u."name", u."fatherName", u."grandfatherName", u.email, s."idNumber", s.department, s."gradeLevel"
      ORDER BY u."name" ASC
    `, {
      bind: [teacherSubject, teacherId],
      type: sequelize.QueryTypes.SELECT
    });

    const totalStudents = studentPerformance.length;
    const totalExamsTaken = studentPerformance.reduce((sum, s) => sum + (parseInt(s.totalExamsTaken) || 0), 0);
    const totalExamsPassed = studentPerformance.reduce((sum, s) => sum + (parseInt(s.examsPassed) || 0), 0);
    const totalExamsFailed = studentPerformance.reduce((sum, s) => sum + (parseInt(s.examsFailed) || 0), 0);

    const overallPassRate = totalExamsTaken > 0 ? ((totalExamsPassed / totalExamsTaken) * 100).toFixed(1) : 0;
    const overallAverageScore = studentPerformance.length > 0
      ? (studentPerformance.reduce((sum, s) => sum + parseFloat(s.averagePercentage || 0), 0) / studentPerformance.length).toFixed(1)
      : 0;

    const studentsWithPass = studentPerformance.filter(s => parseInt(s.examsPassed || 0) > 0).length;
    const studentsWithFail = studentPerformance.filter(s => parseInt(s.examsPassed || 0) === 0 && parseInt(s.totalExamsTaken || 0) > 0).length;

    const gradeBreakdown = await sequelize.query(`
      SELECT 
        s."gradeLevel",
        COUNT(DISTINCT s.id) as studentCount,
        COUNT(ea.id) as totalAttempts,
        COUNT(CASE WHEN ea.score >= e."passingMarks" THEN 1 END) as passedAttempts,
        ROUND(AVG(ea.score), 2) as avgScore,
        ROUND(AVG((ea.score / e."totalMarks") * 100), 1) as avgPercentage
      FROM "Students" s
      JOIN "ExamAttempts" ea ON s.id = ea."studentId"
      JOIN "Exams" e ON ea."examId" = e.id
      WHERE e.subject = $1 
        AND e."createdBy" = $2 
        AND ea.status = 'completed'
      GROUP BY s."gradeLevel"
      ORDER BY s."gradeLevel"
    `, {
      bind: [teacherSubject, teacherId],
      type: sequelize.QueryTypes.SELECT
    });

    const recentAttempts = await sequelize.query(`
      SELECT 
        ea.id,
        ea.score,
        ea."totalMarks",
        ea."createdAt" as submittedAt,
        e.title as examTitle,
        e."passingMarks",
        u."name",
        u."fatherName",
        u."grandfatherName",
        s."idNumber"
      FROM "ExamAttempts" ea
      JOIN "Exams" e ON ea."examId" = e.id
      JOIN "Students" s ON ea."studentId" = s.id
      JOIN "Users" u ON s."userId" = u.id
      WHERE e.subject = $1 
        AND e."createdBy" = $2 
        AND ea.status = 'completed'
      ORDER BY ea."createdAt" DESC
      LIMIT 20
    `, {
      bind: [teacherSubject, teacherId],
      type: sequelize.QueryTypes.SELECT
    });

    const formattedRecentAttempts = recentAttempts.map(attempt => {
      const percentage = attempt.totalMarks > 0 ? ((attempt.score / attempt.totalMarks) * 100).toFixed(1) : 0;
      const isPassed = attempt.score >= (attempt.passingMarks || attempt.totalMarks / 2);
      const studentFullName = `${attempt.name || ''} ${attempt.fatherName || ''} ${attempt.grandfatherName || ''}`.trim().replace(/\s+/g, ' ') || attempt.idNumber;
      return {
        id: attempt.id,
        studentName: studentFullName,
        studentId: attempt.idNumber,
        examTitle: attempt.examTitle,
        score: attempt.score,
        totalMarks: attempt.totalMarks,
        percentage: percentage,
        isPassed: isPassed,
        submittedAt: attempt.submittedAt
      };
    });

    const formattedStudentDetails = studentPerformance.map(s => {
      const fullName = `${s.name || ''} ${s.fatherName || ''} ${s.grandfatherName || ''}`.trim().replace(/\s+/g, ' ') || s.idNumber;
      return {
        ...s,
        studentName: fullName,
        firstName: s.name,
        middleName: s.fatherName,
        lastName: s.grandfatherName
      };
    });

    res.json({
      success: true,
      data: {
        teacher: {
          id: teacher.id,
          name: teacherName,
          subject: teacherSubject,
          department: teacher.department,
          qualification: teacher.qualification
        },
        exams: {
          total: parseInt(examStats[0]?.total || 0),
          published: parseInt(examStats[0]?.published || 0),
          draft: parseInt(examStats[0]?.draft || 0)
        },
        materials: {
          total: parseInt(materialStats[0]?.total || 0),
          published: parseInt(materialStats[0]?.published || 0),
          draft: parseInt(materialStats[0]?.draft || 0)
        },
        students: {
          total: totalStudents,
          withPass: studentsWithPass,
          withFail: studentsWithFail
        },
        performance: {
          totalExamsTaken: totalExamsTaken,
          totalExamsPassed: totalExamsPassed,
          totalExamsFailed: totalExamsFailed,
          overallPassRate: overallPassRate,
          overallAverageScore: overallAverageScore,
          passRate: overallPassRate,
          averageScore: overallAverageScore
        },
        studentDetails: formattedStudentDetails,
        gradeBreakdown: gradeBreakdown,
        recentAttempts: formattedRecentAttempts
      }
    });
  } catch (error) {
    console.error('Get teacher stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ===========================================
// GET TEACHER DASHBOARD STATS
// ===========================================
const getTeacherDashboard = async (req, res, next) => {
  try {
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) throw createError('Teacher not found', 404);

    const [totalExams] = await sequelize.query(`
      SELECT COUNT(*) FROM "Exams" WHERE "createdBy" = $1
    `, { bind: [req.user.id] });

    const [publishedExams] = await sequelize.query(`
      SELECT COUNT(*) FROM "Exams" WHERE "createdBy" = $1 AND status = 'published'
    `, { bind: [req.user.id] });

    const [studentsCount] = await sequelize.query(`
      SELECT COUNT(DISTINCT s.id) FROM "Students" s
      JOIN "ExamAttempts" ea ON s.id = ea."studentId"
      JOIN "Exams" e ON ea."examId" = e.id
      WHERE e.subject = $1
    `, { bind: [teacher.specialization] });

    const [avgScore] = await sequelize.query(`
      SELECT AVG(ea.score) FROM "ExamAttempts" ea
      JOIN "Exams" e ON ea."examId" = e.id
      WHERE e.subject = $1 AND ea.status = 'completed'
    `, { bind: [teacher.specialization] });

    const [materialsCount] = await sequelize.query(`
      SELECT COUNT(*) FROM "Materials" WHERE "uploadedBy" = $1 AND status = 'published'
    `, { bind: [req.user.id] });

    const [passFailStats] = await sequelize.query(`
      SELECT 
        COUNT(CASE WHEN ea.score >= e."passingMarks" THEN 1 END) as passed,
        COUNT(CASE WHEN ea.score < e."passingMarks" THEN 1 END) as failed
      FROM "ExamAttempts" ea
      JOIN "Exams" e ON ea."examId" = e.id
      WHERE e.subject = $1 AND e."createdBy" = $2 AND ea.status = 'completed'
    `, { bind: [teacher.specialization, req.user.id] });

    res.json({
      success: true,
      data: {
        dashboard: {
          stats: {
            totalExams: parseInt(totalExams[0]?.count || 0),
            publishedExams: parseInt(publishedExams[0]?.count || 0),
            students: parseInt(studentsCount[0]?.count || 0),
            avgScore: Math.round(parseFloat(avgScore[0]?.avg || 0)),
            materials: parseInt(materialsCount[0]?.count || 0),
            examsPassed: parseInt(passFailStats[0]?.passed || 0),
            examsFailed: parseInt(passFailStats[0]?.failed || 0)
          }
        },
        teacher: {
          id: teacher.id,
          specialization: teacher.specialization,
          department: teacher.department,
          qualification: teacher.qualification
        }
      }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    next(error);
  }
};

// ===========================================
// GET TEACHER'S EXAMS
// ===========================================
const getTeacherExams = async (req, res, next) => {
  try {
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) throw createError('Teacher not found', 404);

    const teacherSubject = teacher.specialization;
    const isEnglishTeacher = teacherSubject === 'English';
    const isMathTeacher = teacherSubject === 'Mathematics';

    let allowedSubjects = [teacherSubject];
    if (isEnglishTeacher) allowedSubjects.push('Scholastic Aptitude - English Part');
    if (isMathTeacher) allowedSubjects.push('Scholastic Aptitude - Mathematics Part');

    const exams = await Exam.findAll({
      where: {
        createdBy: req.user.id,
        subject: { [Op.in]: allowedSubjects }
      },
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'title', 'description', 'type', 'duration', 'totalMarks', 'passingMarks', 'status', 'gradeLevel', 'subject', 'unit', 'year', 'schoolName', 'createdAt']
    });

    res.json({ success: true, data: { exams: exams || [] } });
  } catch (error) {
    console.error('Error fetching teacher exams:', error);
    res.status(500).json({ success: false, error: error.message, data: { exams: [] } });
  }
};

// ===========================================
// GET EXAMS BY TYPE (MOCK, MODEL, PAST, QUIZ)
// ===========================================
const getExamsByType = async (req, res, next) => {
  try {
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) {
      return res.status(404).json({ success: false, error: 'Teacher not found' });
    }

    const { type } = req.params;
    const { subject, year, unit } = req.query;

    let teacherSubject = subject || teacher.specialization;
    let allowedSubjects = [teacherSubject];

    if (teacherSubject === 'English') {
      allowedSubjects.push('Scholastic Aptitude - English Part');
    }
    if (teacherSubject === 'Mathematics') {
      allowedSubjects.push('Scholastic Aptitude - Mathematics Part');
    }

    const whereClause = {
      createdBy: req.user.id,
      subject: { [Op.in]: allowedSubjects },
      type: type
    };

    if (year) whereClause.year = parseInt(year);
    if (unit && unit !== 'all' && unit !== 'undefined' && unit !== 'practice') whereClause.unit = unit;

    console.log(`🔍 Looking for ${type} exams for teacher ID: ${req.user.id}`);

    const exams = await Exam.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'title', 'description', 'type', 'duration', 'totalMarks', 'passingMarks', 'status', 'gradeLevel', 'subject', 'unit', 'year', 'schoolName', 'createdAt']
    });

    console.log(`✅ Found ${exams.length} ${type} exams`);
    res.json({ success: true, data: { exams: exams || [] } });
  } catch (error) {
    console.error(`Error fetching ${req.params.type} exams:`, error);
    res.status(500).json({ success: false, error: error.message, data: { exams: [] } });
  }
};

// ===========================================
// GET EXAM TYPES FOR TEACHER
// ===========================================
const getExamTypes = async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) return res.status(404).json({ success: false, error: 'Teacher not found' });

    const { subject } = req.query;
    const teacherSubject = subject || teacher.specialization;
    const examTypes = [];

    const [pastCount] = await sequelize.query(`
      SELECT COUNT(*) FROM "Exams" 
      WHERE "createdBy" = $1 AND subject = $2 AND type = 'past'
    `, { bind: [req.user.id, teacherSubject] });

    const [modelCount] = await sequelize.query(`
      SELECT COUNT(*) FROM "Exams" 
      WHERE "createdBy" = $1 AND subject = $2 AND type = 'model'
    `, { bind: [req.user.id, teacherSubject] });

    const [mockCount] = await sequelize.query(`
      SELECT COUNT(*) FROM "Exams" 
      WHERE "createdBy" = $1 AND subject = $2 AND type = 'mock'
    `, { bind: [req.user.id, teacherSubject] });

    const [quizCount] = await sequelize.query(`
      SELECT COUNT(*) FROM "Exams" 
      WHERE "createdBy" = $1 AND subject = $2 AND type = 'quiz'
    `, { bind: [req.user.id, teacherSubject] });

    examTypes.push({ type: 'past', count: parseInt(pastCount[0]?.count || 0) });
    examTypes.push({ type: 'model', count: parseInt(modelCount[0]?.count || 0) });
    examTypes.push({ type: 'mock', count: parseInt(mockCount[0]?.count || 0) });
    examTypes.push({ type: 'quiz', count: parseInt(quizCount[0]?.count || 0) });

    res.json({ success: true, data: { examTypes } });
  } catch (error) {
    console.error('Error fetching exam types:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ===========================================
// GET EXAM YEARS FOR TEACHER
// ===========================================
const getExamYears = async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) return res.status(404).json({ success: false, error: 'Teacher not found' });

    const { subject, examType } = req.query;
    const teacherSubject = subject || teacher.specialization;

    let allowedSubjects = [teacherSubject];
    if (teacherSubject === 'English') allowedSubjects.push('Scholastic Aptitude - English Part');
    if (teacherSubject === 'Mathematics') allowedSubjects.push('Scholastic Aptitude - Mathematics Part');

    const [years] = await sequelize.query(`
      SELECT DISTINCT year, COUNT(*) as "examCount"
      FROM "Exams" 
      WHERE "createdBy" = $1 AND subject = ANY($2) AND type = $3 AND year IS NOT NULL
      GROUP BY year ORDER BY year DESC
    `, { bind: [req.user.id, allowedSubjects, examType] });

    res.json({ success: true, data: { years: years || [] } });
  } catch (error) {
    console.error('Error fetching exam years:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ===========================================
// GET QUIZ UNITS FOR TEACHER
// ===========================================
const getQuizUnits = async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) return res.status(404).json({ success: false, error: 'Teacher not found' });

    const { subject } = req.query;
    let teacherSubject = subject || teacher.specialization;

    const isScholasticAptitude = teacherSubject.includes('Scholastic Aptitude');

    if (isScholasticAptitude) {
      const [saQuizCount] = await sequelize.query(`
        SELECT COUNT(*) FROM "Exams" 
        WHERE "createdBy" = $1 
          AND subject = $2 
          AND type = 'quiz'
      `, { bind: [req.user.id, teacherSubject] });

      return res.json({
        success: true,
        data: {
          units: [
            {
              unit: 'practice',
              displayName: '📝 Practice Mode (Full Syllabus)',
              quizCount: parseInt(saQuizCount[0]?.count || 0),
              description: 'Practice questions covering all units for SA preparation'
            }
          ]
        }
      });
    }

    let allowedSubjects = [teacherSubject];
    if (teacherSubject === 'English') allowedSubjects.push('Scholastic Aptitude - English Part');
    if (teacherSubject === 'Mathematics') allowedSubjects.push('Scholastic Aptitude - Mathematics Part');

    const [units] = await sequelize.query(`
      SELECT DISTINCT unit, COUNT(*) as "quizCount"
      FROM "Exams" 
      WHERE "createdBy" = $1 
        AND subject = ANY($2) 
        AND type = 'quiz' 
        AND unit IS NOT NULL 
        AND unit != ''
      GROUP BY unit 
      ORDER BY unit ASC
    `, { bind: [req.user.id, allowedSubjects] });

    res.json({ success: true, data: { units: units || [] } });
  } catch (error) {
    console.error('Error fetching quiz units:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ===========================================
// GET EXAMS LIST WITH FILTERS
// ===========================================
const getExamsList = async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) return res.status(404).json({ success: false, error: 'Teacher not found' });

    const { subject, type, year, unit } = req.query;
    const teacherSubject = subject || teacher.specialization;

    let allowedSubjects = [teacherSubject];
    if (teacherSubject === 'English') allowedSubjects.push('Scholastic Aptitude - English Part');
    if (teacherSubject === 'Mathematics') allowedSubjects.push('Scholastic Aptitude - Mathematics Part');

    const where = { createdBy: req.user.id, subject: { [Op.in]: allowedSubjects }, type: type };
    if (year) where.year = parseInt(year);
    if (unit && unit !== 'all') where.unit = unit;

    const exams = await Exam.findAll({
      where,
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'title', 'description', 'type', 'duration', 'totalMarks', 'passingMarks', 'status', 'gradeLevel', 'subject', 'unit', 'year', 'schoolName', 'createdAt']
    });

    res.json({ success: true, data: { exams: exams || [] } });
  } catch (error) {
    console.error('Error fetching exams list:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ===========================================
// GET TEACHER'S MATERIALS
// ===========================================
const getTeacherMaterials = async (req, res, next) => {
  try {
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) throw createError('Teacher not found', 404);

    const teacherSubject = teacher.specialization;
    const subjectConditions = [teacherSubject];
    if (teacherSubject === 'English') subjectConditions.push('Scholastic Aptitude - English Part');
    if (teacherSubject === 'Mathematics') subjectConditions.push('Scholastic Aptitude - Mathematics Part');

    const materials = await Material.findAll({
      where: { uploadedBy: req.user.id, subject: { [Op.in]: subjectConditions } },
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'title', 'description', 'type', 'subject', 'fileUrl', 'linkUrl', 'downloads', 'views', 'status', 'gradeLevel', 'unit', 'department', 'youtubeLinks', 'createdAt', 'updatedAt']
    });

    res.json({ success: true, data: { materials: materials || [] } });
  } catch (error) {
    console.error('Error fetching teacher materials:', error);
    res.status(500).json({ success: false, error: error.message, data: { materials: [] } });
  }
};

// ===========================================
// GET TEACHER MESSAGES (FIXED - Both Inbox & Sent)
// ===========================================
const getTeacherMessages = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const [messages] = await sequelize.query(`
      SELECT 
        n.id, 
        n."userId", 
        n.title, 
        n.message, 
        n.type, 
        n."isRead",
        n."createdAt", 
        n."updatedAt", 
        n.metadata
      FROM "Notifications" n
      WHERE n."userId" = $1
      ORDER BY n."createdAt" DESC
      LIMIT 200
    `, { bind: [userId] });

    const parsedMessages = messages.map(msg => {
      let metadata = {};
      try {
        metadata = typeof msg.metadata === 'string' ? JSON.parse(msg.metadata || '{}') : (msg.metadata || {});
      } catch (e) {
        metadata = {};
      }

      const isSent = msg.type === 'sent_message' || metadata.isSent === true;

      let sender_name = 'System';
      let sender_role = '';
      let recipient_name = '';
      let recipient_role = '';
      let senderId = null;
      let sender = 'system';

      if (isSent) {
        // This is a message I sent - show recipient info
        if (metadata.to && metadata.to.length > 0) {
          if (Array.isArray(metadata.to)) {
            recipient_name = metadata.to.map(t => t.name || 'Recipient').join(', ');
          } else if (typeof metadata.to === 'object') {
            recipient_name = metadata.to.name || 'Recipient';
          } else {
            recipient_name = String(metadata.to);
          }
          recipient_role = metadata.toRole || '';
        } else if (metadata.toName) {
          recipient_name = metadata.toName;
          recipient_role = metadata.toRole || '';
        } else if (metadata.recipientName) {
          recipient_name = metadata.recipientName;
          recipient_role = metadata.recipientRole || '';
        }
        sender_name = 'You';
        sender_role = req.user.role;
        senderId = req.user.id;
        sender = 'teacher';
      } else {
        // This is a message I received - show sender info
        // For school messages, prefer school name over admin name
        if (metadata.fromRole === 'school' && metadata.fromSchoolName) {
          sender_name = metadata.fromSchoolName;
        } else {
          sender_name = metadata.fromName || metadata.senderName || 'System';
        }
        sender_role = metadata.fromRole || '';
        senderId = metadata.from;
        recipient_name = 'You';
        recipient_role = req.user.role;

        if (sender_role === 'school') sender = 'school';
        else if (sender_role === 'subadmin' || sender_role === 'superadmin') sender = 'subadmin';
        else if (sender_role === 'teacher') sender = 'teacher';
        else sender = 'system';
      }

      return {
        id: msg.id,
        userId: msg.userId,
        subject: msg.title,
        message: msg.message,
        type: msg.type,
        isRead: msg.isRead || false,
        createdAt: msg.createdAt,
        updatedAt: msg.updatedAt,
        metadata: metadata,
        isSent: isSent,
        sender_name: sender_name,
        sender_role: sender_role,
        recipient_name: recipient_name,
        recipient_role: recipient_role,
        senderId: senderId,
        sender: sender
      };
    });

    res.json({ success: true, data: parsedMessages });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ success: false, error: error.message, data: [] });
  }
};

// ===========================================
// SEND MESSAGE TO STUDENTS
// ===========================================
const sendMessageToStudents = async (req, res, next) => {
  try {
    const { subject, message, studentIds, department, isBulk } = req.body;
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) throw createError('Teacher not found', 404);

    let recipientDetails = [];
    if (!studentIds || studentIds.length === 0) {
      let query = `SELECT DISTINCT s.id, u.name, u.email FROM "Students" s JOIN "Users" u ON s."userId" = u.id WHERE u.status = 'active'`;
      const params = [];
      if (department) { query += ` AND s.department = $${params.length + 1}`; params.push(department); }
      const students = await sequelize.query(query, { bind: params });
      recipientDetails = students[0].map(s => ({ id: s.id, name: s.name, email: s.email }));
    } else {
      const students = await sequelize.query(`SELECT u.id, u.name, u.email FROM "Students" s JOIN "Users" u ON s."userId" = u.id WHERE s.id = ANY($1::int[])`, { bind: [studentIds] });
      recipientDetails = students[0];
    }

    const metadata = {
      from: req.user.id,
      fromName: req.user.name,
      fromRole: 'teacher',
      timestamp: new Date().toISOString(),
      recipientCount: recipientDetails.length,
      recipientNames: recipientDetails.map(r => r.name),
      isBulk: isBulk || false,
      department: department || null
    };

    for (const student of recipientDetails) {
      await sequelize.query(`
        INSERT INTO "Notifications" ("userId", title, message, type, metadata, "isRead", "createdAt")
        VALUES ($1, $2, $3, 'message', $4::jsonb, false, NOW())
      `, {
        bind: [student.id, subject, message, JSON.stringify(metadata)]
      });
    }

    const sentMetadata = {
      to: recipientDetails.map(r => ({ id: r.id, name: r.name })),
      toRole: 'student',
      timestamp: new Date().toISOString(),
      isSent: true,
      from: req.user.id,
      fromName: req.user.name,
      subject: subject,
      message: message,
      recipientCount: recipientDetails.length,
      recipientNames: recipientDetails.map(r => r.name)
    };

    await sequelize.query(`
      INSERT INTO "Notifications" ("userId", title, message, type, metadata, "isRead", "createdAt")
      VALUES ($1, $2, $3, 'sent_message', $4::jsonb, true, NOW())
    `, {
      bind: [req.user.id, subject, message, JSON.stringify(sentMetadata)]
    });

    console.log(`✅ Message sent to ${recipientDetails.length} students`);
    res.json({ success: true, message: `Message sent to ${recipientDetails.length} students` });
  } catch (error) {
    console.error('Error sending message:', error);
    next(error);
  }
};

// ===========================================
// SEND MESSAGE TO OTHER TEACHERS
// ===========================================
const sendMessageToTeachers = async (req, res, next) => {
  try {
    const { subject, message, teacherIds } = req.body;
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) throw createError('Teacher not found', 404);

    let recipientDetails = [];

    if (teacherIds && teacherIds.length > 0) {
      const ids = teacherIds.map(id => parseInt(id));

      const teachersByUserIds = await sequelize.query(`
        SELECT t.id, t."userId", u.name, u.email 
        FROM "Teachers" t
        JOIN "Users" u ON t."userId" = u.id
        WHERE t."userId" = ANY($1::int[]) AND t."userId" != $2 AND u.status = 'active'
      `, { bind: [ids, req.user.id] });

      if (teachersByUserIds[0].length > 0) {
        recipientDetails = teachersByUserIds[0];
      } else {
        const teachersByTeacherIds = await sequelize.query(`
          SELECT t.id, t."userId", u.name, u.email 
          FROM "Teachers" t
          JOIN "Users" u ON t."userId" = u.id
          WHERE t.id = ANY($1::int[]) AND t."userId" != $2 AND u.status = 'active'
        `, { bind: [ids, req.user.id] });
        recipientDetails = teachersByTeacherIds[0];
      }
    } else {
      const teachers = await sequelize.query(`
        SELECT t.id, t."userId", u.name, u.email 
        FROM "Teachers" t
        JOIN "Users" u ON t."userId" = u.id
        WHERE t."userId" != $1 AND u.status = 'active'
      `, { bind: [req.user.id] });
      recipientDetails = teachers[0];
    }

    if (recipientDetails.length === 0) {
      throw createError('No other teachers found', 404);
    }

    const metadata = {
      from: req.user.id,
      fromName: req.user.name,
      fromRole: 'teacher',
      timestamp: new Date().toISOString(),
      recipientCount: recipientDetails.length,
      recipientNames: recipientDetails.map(r => r.name)
    };

    for (const recipient of recipientDetails) {
      await sequelize.query(`
        INSERT INTO "Notifications" ("userId", title, message, type, metadata, "isRead", "createdAt")
        VALUES ($1, $2, $3, 'message', $4::jsonb, false, NOW())
      `, {
        bind: [recipient.userId, subject, message, JSON.stringify(metadata)]
      });
    }

    const sentMetadata = {
      to: recipientDetails.map(r => ({ id: r.id, name: r.name, userId: r.userId })),
      toRole: 'teacher',
      timestamp: new Date().toISOString(),
      isSent: true,
      from: req.user.id,
      fromName: req.user.name,
      subject: subject,
      message: message,
      recipientCount: recipientDetails.length,
      recipientNames: recipientDetails.map(r => r.name)
    };

    await sequelize.query(`
      INSERT INTO "Notifications" ("userId", title, message, type, metadata, "isRead", "createdAt")
      VALUES ($1, $2, $3, 'sent_message', $4::jsonb, true, NOW())
    `, {
      bind: [req.user.id, subject, message, JSON.stringify(sentMetadata)]
    });

    console.log(`✅ Message sent to ${recipientDetails.length} teacher(s)`);
    res.json({ success: true, message: `Message sent to ${recipientDetails.length} teacher(s)` });
  } catch (error) {
    console.error('Error sending message to teachers:', error);
    next(error);
  }
};

// ===========================================
// SEND MESSAGE TO SCHOOLS
// ===========================================
const sendMessageToSchools = async (req, res, next) => {
  try {
    const { subject, message, schoolIds } = req.body;
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) throw createError('Teacher not found', 404);

    let recipientDetails = [];

    if (!schoolIds || schoolIds.length === 0) {
      const schools = await sequelize.query(`
        SELECT s."adminId" as id, u.name, u.email 
        FROM "Schools" s
        JOIN "Users" u ON s."adminId" = u.id
        WHERE u.status = 'active'
      `);
      recipientDetails = schools[0];
    } else {
      const schools = await sequelize.query(`
        SELECT s."adminId" as id, u.name, u.email 
        FROM "Schools" s
        JOIN "Users" u ON s."adminId" = u.id
        WHERE s.id = ANY($1::int[]) AND u.status = 'active'
      `, { bind: [schoolIds] });
      recipientDetails = schools[0];
    }

    if (recipientDetails.length === 0) {
      throw createError('No schools found', 404);
    }

    const metadata = {
      from: req.user.id,
      fromName: req.user.name,
      fromRole: 'teacher',
      timestamp: new Date().toISOString(),
      recipientCount: recipientDetails.length,
      recipientNames: recipientDetails.map(r => r.name),
      toRole: 'school'
    };

    for (const recipient of recipientDetails) {
      await sequelize.query(`
        INSERT INTO "Notifications" ("userId", title, message, type, metadata, "isRead", "createdAt")
        VALUES ($1, $2, $3, 'message', $4::jsonb, false, NOW())
      `, {
        bind: [recipient.id, subject || `Message from Teacher ${req.user.name}`, message, JSON.stringify(metadata)]
      });
    }

    const sentMetadata = {
      to: recipientDetails.map(r => ({ id: r.id, name: r.name })),
      toRole: 'school',
      timestamp: new Date().toISOString(),
      isSent: true,
      from: req.user.id,
      fromName: req.user.name,
      subject: subject || `Message from Teacher ${req.user.name}`,
      message: message,
      recipientCount: recipientDetails.length,
      recipientNames: recipientDetails.map(r => r.name)
    };

    await sequelize.query(`
      INSERT INTO "Notifications" ("userId", title, message, type, metadata, "isRead", "createdAt")
      VALUES ($1, $2, $3, 'sent_message', $4::jsonb, true, NOW())
    `, {
      bind: [req.user.id, subject || `Message from Teacher ${req.user.name}`, message, JSON.stringify(sentMetadata)]
    });

    console.log(`✅ Message sent to ${recipientDetails.length} school(s)`);
    res.json({ success: true, message: `Message sent to ${recipientDetails.length} school(s)` });
  } catch (error) {
    console.error('Error sending message to schools:', error);
    next(error);
  }
};

// ===========================================
// SEND MESSAGE TO ADMIN
// ===========================================
const sendMessageToAdmin = async (req, res, next) => {
  try {
    const { subject, message, adminId } = req.body;
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) throw createError('Teacher not found', 404);

    let recipientDetails = [];

    if (!adminId) {
      const admins = await sequelize.query(`
        SELECT id, name, email FROM "Users" 
        WHERE role IN ('superadmin', 'subadmin') AND status = 'active'
      `);
      recipientDetails = admins[0];
    } else {
      const admin = await sequelize.query(`
        SELECT id, name, email FROM "Users" 
        WHERE id = $1 AND role IN ('superadmin', 'subadmin') AND status = 'active'
      `, { bind: [adminId] });
      recipientDetails = admin[0];
    }

    if (recipientDetails.length === 0) {
      throw createError('No admin recipients found', 404);
    }

    const metadata = {
      from: req.user.id,
      fromName: req.user.name,
      fromRole: 'teacher',
      timestamp: new Date().toISOString(),
      recipientCount: recipientDetails.length,
      recipientNames: recipientDetails.map(r => r.name),
      toRole: 'admin'
    };

    for (const admin of recipientDetails) {
      await sequelize.query(`
        INSERT INTO "Notifications" ("userId", title, message, type, metadata, "isRead", "createdAt")
        VALUES ($1, $2, $3, 'message', $4::jsonb, false, NOW())
      `, {
        bind: [admin.id, subject || `Message from Teacher ${req.user.name}`, message, JSON.stringify(metadata)]
      });
    }

    const sentMetadata = {
      to: recipientDetails.map(r => ({ id: r.id, name: r.name })),
      toRole: 'admin',
      timestamp: new Date().toISOString(),
      isSent: true,
      from: req.user.id,
      fromName: req.user.name,
      subject: subject || `Message from Teacher ${req.user.name}`,
      message: message,
      recipientCount: recipientDetails.length,
      recipientNames: recipientDetails.map(r => r.name)
    };

    await sequelize.query(`
      INSERT INTO "Notifications" ("userId", title, message, type, metadata, "isRead", "createdAt")
      VALUES ($1, $2, $3, 'sent_message', $4::jsonb, true, NOW())
    `, {
      bind: [req.user.id, subject || `Message from Teacher ${req.user.name}`, message, JSON.stringify(sentMetadata)]
    });

    console.log(`✅ Message sent to ${recipientDetails.length} admin(s)`);
    res.json({ success: true, message: `Message sent to ${recipientDetails.length} admin(s)` });
  } catch (error) {
    console.error('Error sending message to admin:', error);
    next(error);
  }
};

// ===========================================
// MARK MESSAGE AS READ
// ===========================================
const markMessageAsRead = async (req, res, next) => {
  try {
    const messageId = req.params.id;
    const userId = req.user.id;

    const [message] = await sequelize.query(`
      SELECT id, "isRead" FROM "Notifications" WHERE id = $1 AND "userId" = $2
    `, { bind: [messageId, userId] });

    if (!message[0]) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    if (!message[0].isRead) {
      await sequelize.query(`
        UPDATE "Notifications" SET "isRead" = true, "updatedAt" = NOW() 
        WHERE id = $1 AND "userId" = $2
      `, { bind: [messageId, userId] });
    }

    res.json({ success: true, message: 'Message marked as read' });
  } catch (error) {
    console.error('Error marking message as read:', error);
    next(error);
  }
};

// ===========================================
// DELETE MESSAGE
// ===========================================
const deleteMessage = async (req, res, next) => {
  try {
    await sequelize.query(`
      DELETE FROM "Notifications" WHERE id = $1 AND "userId" = $2
    `, { bind: [req.params.id, req.user.id] });

    res.json({ success: true, message: 'Message deleted' });
  } catch (error) {
    console.error('Error deleting message:', error);
    next(error);
  }
};

// ===========================================
// CHECK TEACHER CONTENT
// ===========================================
const checkTeacherContent = async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) return res.status(404).json({ success: false, error: 'Teacher not found' });

    const { subject, gradeLevel, unit } = req.query;
    const teacherSubject = subject || teacher.specialization;

    const whereMaterial = { uploadedBy: req.user.id, subject: teacherSubject, status: 'published' };
    const whereExam = { createdBy: req.user.id, subject: teacherSubject, status: 'published', type: 'quiz' };

    if (gradeLevel && gradeLevel !== 'all' && gradeLevel !== 'undefined') {
      whereMaterial.gradeLevel = gradeLevel;
      whereExam.gradeLevel = gradeLevel;
    }
    if (unit && unit !== 'all' && unit !== 'undefined' && unit !== 'General') {
      whereMaterial.unit = unit;
      whereExam.unit = unit;
    }

    const materialCount = await Material.count({ where: whereMaterial });
    const quizCount = await Exam.count({ where: whereExam });

    res.json({
      success: true,
      data: {
        hasMaterials: materialCount > 0,
        hasQuizzes: quizCount > 0,
        totalContent: materialCount + quizCount,
        materialCount,
        quizCount
      }
    });
  } catch (error) {
    console.error('Error checking teacher content:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ===========================================
// GET STUDENT DETAILS
// ===========================================
const getStudentDetails = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) return res.status(404).json({ success: false, error: 'Teacher not found' });

    const teacherSubject = teacher.specialization;

    const studentDetails = await sequelize.query(`
      SELECT s.id, s."idNumber", u."name", u."fatherName", u."grandfatherName", u.email,
             s.department, s."gradeLevel", s."schoolName", ea.id as attemptId,
             e.title as examTitle, e."totalMarks", e."passingMarks", ea.score, ea.status,
             ea."createdAt" as submittedAt,
             CASE WHEN ea.score >= e."passingMarks" THEN 'Passed' ELSE 'Failed' END as result
      FROM "Students" s
      JOIN "Users" u ON s."userId" = u.id
      JOIN "ExamAttempts" ea ON s.id = ea."studentId"
      JOIN "Exams" e ON ea."examId" = e.id
      WHERE s.id = $1 AND e.subject = $2 AND e."createdBy" = $3 AND ea.status = 'completed'
      ORDER BY ea."createdAt" DESC
    `, { bind: [studentId, teacherSubject, req.user.id], type: sequelize.QueryTypes.SELECT });

    if (studentDetails.length === 0) {
      return res.status(404).json({ success: false, error: 'No results found for this student' });
    }

    const totalExams = studentDetails.length;
    const passedExams = studentDetails.filter(s => s.result === 'Passed').length;
    const averageScore = totalExams > 0 ? (studentDetails.reduce((sum, s) => sum + (s.score || 0), 0) / totalExams).toFixed(1) : 0;

    const studentFullName = `${studentDetails[0].name || ''} ${studentDetails[0].fatherName || ''} ${studentDetails[0].grandfatherName || ''}`.trim().replace(/\s+/g, ' ') || studentDetails[0].idNumber;

    res.json({
      success: true,
      data: {
        student: {
          id: studentDetails[0].id,
          name: studentFullName,
          idNumber: studentDetails[0].idNumber,
          email: studentDetails[0].email,
          department: studentDetails[0].department,
          gradeLevel: studentDetails[0].gradeLevel,
          schoolName: studentDetails[0].schoolName
        },
        summary: {
          totalExams,
          passedExams,
          failedExams: totalExams - passedExams,
          averageScore,
          passRate: totalExams > 0 ? ((passedExams / totalExams) * 100).toFixed(1) : 0
        },
        examResults: studentDetails
      }
    });
  } catch (error) {
    console.error('Get student details error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ===========================================
// GET TEACHER GRADES WITH CONTENT
// ===========================================
const getTeacherGradesWithContent = async (req, res, next) => {
  try {
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) throw createError('Teacher not found', 404);

    const teacherSubject = teacher.specialization;

    const [materialGrades] = await sequelize.query(`
      SELECT DISTINCT "gradeLevel" FROM "Materials" 
      WHERE "uploadedBy" = $1 AND subject = $2 AND status = 'published' AND "gradeLevel" IS NOT NULL
      ORDER BY "gradeLevel" ASC
    `, { bind: [req.user.id, teacherSubject] });

    const [quizGrades] = await sequelize.query(`
      SELECT DISTINCT "gradeLevel" FROM "Exams" 
      WHERE "createdBy" = $1 AND subject = $2 AND status = 'published' AND type = 'quiz' AND "gradeLevel" IS NOT NULL
      ORDER BY "gradeLevel" ASC
    `, { bind: [req.user.id, teacherSubject] });

    const gradesSet = new Set();
    materialGrades.forEach(g => { if (g.gradeLevel) gradesSet.add(parseInt(g.gradeLevel)); });
    quizGrades.forEach(g => { if (g.gradeLevel) gradesSet.add(parseInt(g.gradeLevel)); });

    res.json({
      success: true,
      data: {
        teacherSubject,
        availableGrades: Array.from(gradesSet).sort((a, b) => a - b),
        materialGrades: materialGrades.map(g => g.gradeLevel),
        quizGrades: quizGrades.map(g => g.gradeLevel)
      }
    });
  } catch (error) {
    console.error('Error fetching teacher grades:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ===========================================
// GET TEACHER UNITS WITH CONTENT
// ===========================================
const getTeacherUnitsWithContent = async (req, res, next) => {
  try {
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) throw createError('Teacher not found', 404);

    const { gradeLevel } = req.query;
    if (!gradeLevel) return res.status(400).json({ success: false, error: 'Grade level is required' });

    const teacherSubject = teacher.specialization;

    const [materialUnits] = await sequelize.query(`
      SELECT DISTINCT unit FROM "Materials" 
      WHERE "uploadedBy" = $1 AND subject = $2 AND status = 'published' AND "gradeLevel" = $3
        AND unit IS NOT NULL AND unit != 'General' AND unit != ''
      ORDER BY unit ASC
    `, { bind: [req.user.id, teacherSubject, gradeLevel] });

    const [quizUnits] = await sequelize.query(`
      SELECT DISTINCT unit FROM "Exams" 
      WHERE "createdBy" = $1 AND subject = $2 AND status = 'published' AND type = 'quiz' AND "gradeLevel" = $3
        AND unit IS NOT NULL AND unit != 'General' AND unit != ''
      ORDER BY unit ASC
    `, { bind: [req.user.id, teacherSubject, gradeLevel] });

    const unitsSet = new Set();
    materialUnits.forEach(u => { if (u.unit) unitsSet.add(u.unit); });
    quizUnits.forEach(u => { if (u.unit) unitsSet.add(u.unit); });

    const availableUnits = Array.from(unitsSet).sort((a, b) => {
      const numA = parseInt(a.split(' ')[1]) || 0;
      const numB = parseInt(b.split(' ')[1]) || 0;
      return numA - numB;
    });

    res.json({
      success: true,
      data: {
        teacherSubject,
        gradeLevel: parseInt(gradeLevel),
        availableUnits,
        materialUnits: materialUnits.map(u => u.unit),
        quizUnits: quizUnits.map(u => u.unit)
      }
    });
  } catch (error) {
    console.error('Error fetching teacher units:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ===========================================
// GET TEACHER'S STUDENTS
// ===========================================
const getTeacherStudents = async (req, res, next) => {
  try {
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) throw createError('Teacher not found', 404);

    const { department } = req.query;
    let query = `
      SELECT s.id, s."userId", s."idNumber", s."gradeLevel", s.department,
             u."name", u."fatherName", u."grandfatherName", u.email
      FROM "Students" s JOIN "Users" u ON s."userId" = u.id 
      WHERE u.status = 'active'
    `;
    const params = [];

    if (department === 'Natural Science') {
      query += ` AND s.department = $${params.length + 1}`;
      params.push('Natural Science');
    } else if (department === 'Social Science') {
      query += ` AND s.department = $${params.length + 1}`;
      params.push('Social Science');
    }
    query += ` ORDER BY u."name" ASC`;

    const students = await sequelize.query(query, { bind: params });
    res.json({ success: true, data: students[0] });
  } catch (error) {
    console.error('Error fetching teacher students:', error);
    res.status(500).json({ success: false, error: error.message, data: [] });
  }
};

// ===========================================
// GET ALL TEACHERS
// ===========================================
const getAllTeachers = async (req, res, next) => {
  try {
    const currentTeacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!currentTeacher) throw createError('Teacher not found', 404);

    const teachers = await sequelize.query(`
      SELECT 
        t.id,
        t."userId",
        t.specialization,
        t.department,
        t.qualification,
        u.name,
        u."fatherName",
        u."grandfatherName",
        u.email,
        u.username
      FROM "Teachers" t
      JOIN "Users" u ON t."userId" = u.id
      WHERE t."userId" != $1 AND u.status = 'active'
      ORDER BY u.name ASC
    `, { bind: [req.user.id] });

    res.json({ success: true, data: teachers[0] });
  } catch (error) {
    console.error('Error fetching all teachers:', error);
    res.status(500).json({ success: false, error: error.message, data: [] });
  }
};

// ===========================================
// GET ALL SCHOOLS
// ===========================================
const getAllSchools = async (req, res, next) => {
  try {
    const schools = await sequelize.query(`
      SELECT 
        s.id,
        s."schoolName",
        s.email,
        s.address,
        s.phone,
        u.name as "adminName",
        u.email as "adminEmail"
      FROM "Schools" s
      LEFT JOIN "Users" u ON s."adminId" = u.id
      WHERE s.status = 'approved'
      ORDER BY s."schoolName" ASC
    `);
    res.json({ success: true, data: schools[0] });
  } catch (error) {
    console.error('Error fetching all schools:', error);
    res.status(500).json({ success: false, error: error.message, data: [] });
  }
};

// ===========================================
// GET ADMINS
// ===========================================
const getTeacherAdmins = async (req, res, next) => {
  try {
    const admins = await sequelize.query(`
      SELECT u.id, u."name", u."fatherName", u."grandfatherName", u.email, u.role, u.status,
        CASE 
          WHEN u.role = 'superadmin' THEN 'Super Administrator'
          WHEN u.role = 'subadmin' THEN 'Sub Administrator'
          ELSE u.role
        END as "roleDisplay"
      FROM "Users" u
      WHERE u.role IN ('superadmin', 'subadmin') AND u.status = 'active'
      ORDER BY CASE u.role WHEN 'superadmin' THEN 1 WHEN 'subadmin' THEN 2 ELSE 3 END, u."name" ASC
    `);
    res.json({ success: true, data: admins[0] });
  } catch (error) {
    console.error('Error fetching admins:', error);
    res.status(500).json({ success: false, error: error.message, data: [] });
  }
};

// ===========================================
// GET TEACHER'S SCHOOL INFO
// ===========================================
const getTeacherSchool = async (req, res, next) => {
  try {
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) throw createError('Teacher not found', 404);

    if (!teacher.schoolId) {
      return res.json({ success: true, data: null, message: 'Teacher is not assigned to a school' });
    }

    const [school] = await sequelize.query(`
      SELECT s.id, s."schoolName", s.address, s.phone, s.email, s.status,
             u."name" as "adminName", u."fatherName" as "adminFatherName",
             u."grandfatherName" as "adminGrandfatherName", u.email as "adminEmail"
      FROM "Schools" s LEFT JOIN "Users" u ON s."adminId" = u.id
      WHERE s.id = $1
    `, { bind: [teacher.schoolId] });

    if (!school[0]) return res.json({ success: true, data: null, message: 'School not found' });
    res.json({ success: true, data: school[0] });
  } catch (error) {
    console.error('Error fetching teacher school:', error);
    res.status(500).json({ success: false, error: error.message, data: null });
  }
};

// ===========================================
// GET TEACHER PROFILE
// ===========================================
const getTeacherProfile = async (req, res, next) => {
  try {
    const teacher = await Teacher.findOne({
      where: { userId: req.user.id },
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'fatherName', 'grandfatherName', 'email', 'username', 'profileImage'] }]
    });
    if (!teacher) throw createError('Teacher not found', 404);

    res.json({
      success: true,
      data: {
        id: teacher.id,
        userId: teacher.userId,
        specialization: teacher.specialization,
        department: teacher.department,
        qualification: teacher.qualification,
        status: teacher.status,
        user: teacher.user
      }
    });
  } catch (error) {
    console.error('Error fetching teacher profile:', error);
    next(error);
  }
};

// ===========================================
// UPDATE TEACHER PROFILE
// ===========================================
const updateTeacherProfile = async (req, res, next) => {
  try {
    const { qualification, specialization, department } = req.body;
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) throw createError('Teacher not found', 404);

    await teacher.update({ qualification, specialization, department });
    res.json({ success: true, message: 'Profile updated successfully', data: teacher });
  } catch (error) {
    console.error('Error updating teacher profile:', error);
    next(error);
  }
};

// ===========================================
// RECEIVED EXAMS FROM SCHOOLS
// ===========================================
const getReceivedExams = async (req, res, next) => {
  try {
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) throw createError('Teacher not found', 404);

    // Query SchoolExams table (where schools send exam files)
    const [exams] = await sequelize.query(`
      SELECT 
        se.id,
        se.title,
        se.description,
        se."subjectName" as subject,
        se."schoolName" as school_name,
        se.year,
        se.type,
        se.status,
        se."fileUrl",
        se."originalFileName",
        se."fileSize",
        se."createdAt",
        s.address as school_address,
        s.phone as school_phone
      FROM "SchoolExams" se
      LEFT JOIN "Schools" s ON se."schoolId" = s.id
      WHERE se."teacherId" = $1
      ORDER BY 
        CASE WHEN se.status = 'pending' THEN 1 ELSE 2 END,
        se."createdAt" DESC
    `, { bind: [teacher.id] });

    console.log(`✅ getReceivedExams function: Found ${exams.length} exam files for teacher ${teacher.id}`);
    res.json({ success: true, data: exams || [] });
  } catch (error) {
    console.error('Error fetching received exams:', error);
    res.status(500).json({ success: false, error: error.message, data: [] });
  }
};

// ===========================================
// REVIEW EXAM
// ===========================================
const reviewExam = async (req, res, next) => {
  try {
    const { status, feedback } = req.body;
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) throw createError('Teacher not found', 404);

    await sequelize.query(`
      UPDATE "ExamAssignments" 
      SET status = $1, feedback = $2, "updatedAt" = NOW() 
      WHERE id = $3 AND "teacherId" = $4
    `, {
      bind: [status, feedback, req.params.examId, teacher.id]
    });

    res.json({ success: true, message: 'Exam reviewed successfully' });
  } catch (error) {
    console.error('Error reviewing exam:', error);
    next(error);
  }
};

// ===========================================
// NOTIFICATIONS
// ===========================================
const getNotifications = async (req, res, next) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const notifications = await NotificationService.getUserNotifications(req.user.id, parseInt(limit), parseInt(offset));
    res.json({ success: true, data: notifications });
  } catch (error) {
    console.error('Error getting notifications:', error);
    next(error);
  }
};

const getUnreadCount = async (req, res, next) => {
  try {
    const count = await NotificationService.getUnreadCount(req.user.id);
    res.json({ success: true, data: { count } });
  } catch (error) {
    console.error('Error getting unread count:', error);
    next(error);
  }
};

const markAllAsRead = async (req, res, next) => {
  try {
    await NotificationService.markAllAsRead(req.user.id);
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Error marking all as read:', error);
    next(error);
  }
};

const clearAllNotifications = async (req, res, next) => {
  try {
    await NotificationService.clearAllNotifications(req.user.id);
    res.json({ success: true, message: 'All notifications cleared' });
  } catch (error) {
    console.error('Error clearing notifications:', error);
    next(error);
  }
};

// ===========================================
// STUDENT FEEDBACK (SINGLE VERSION - NO DUPLICATE)
// ===========================================
const getStudentFeedback = async (req, res, next) => {
  try {
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) {
      return res.status(404).json({ success: false, error: 'Teacher not found' });
    }

    const [feedback] = await sequelize.query(`
      SELECT 
        f.id,
        f.message,
        f.rating,
        f.status,
        f."teacherResponse",
        f."createdAt",
        f."updatedAt",
        u.id as student_user_id,
        u.name as student_name,
        u."fatherName" as student_father_name,
        u."grandfatherName" as student_grandfather_name,
        u.email as student_email,
        s."idNumber" as student_id_number,
        s.department as student_department,
        s."gradeLevel" as student_grade,
        s."schoolName" as student_school
      FROM "Feedbacks" f
      LEFT JOIN "Students" s ON f."userId" = s."userId"
      LEFT JOIN "Users" u ON s."userId" = u.id
      WHERE f."teacherId" = $1 AND f.category = 'teacher_feedback'
      ORDER BY 
        CASE WHEN f.status = 'pending' THEN 1 ELSE 2 END,
        f."createdAt" DESC
    `, { bind: [teacher.id] });

    const formattedFeedback = feedback.map(f => ({
      id: f.id,
      message: f.message,
      rating: f.rating,
      status: f.status,
      teacherResponse: f.teacherResponse,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
      student: {
        id: f.student_user_id,
        name: `${f.student_name || ''} ${f.student_father_name || ''}`.trim(),
        fullName: `${f.student_name || ''} ${f.student_father_name || ''} ${f.student_grandfather_name || ''}`.trim(),
        email: f.student_email,
        idNumber: f.student_id_number,
        department: f.student_department,
        gradeLevel: f.student_grade,
        school: f.student_school
      }
    }));

    const total = formattedFeedback.length;
    const pending = formattedFeedback.filter(f => f.status === 'pending').length;
    const responded = formattedFeedback.filter(f => f.status === 'responded').length;
    const averageRating = total > 0
      ? (formattedFeedback.reduce((sum, f) => sum + (f.rating || 0), 0) / total).toFixed(1)
      : 0;

    res.json({
      success: true,
      data: {
        feedback: formattedFeedback,
        stats: {
          total,
          pending,
          responded,
          averageRating: parseFloat(averageRating)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching student feedback:', error);
    res.status(500).json({ success: false, error: error.message, data: { feedback: [], stats: {} } });
  }
};

// ===========================================
// RESPOND TO STUDENT FEEDBACK
// ===========================================
const respondToFeedback = async (req, res, next) => {
  try {
    const { feedbackId, response } = req.body;
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) throw createError('Teacher not found', 404);

    if (!response || !response.trim()) throw createError('Response message is required', 400);

    const [feedback] = await sequelize.query(`
      SELECT f.*, u.email as student_email, u.name as student_name
      FROM "Feedbacks" f
      LEFT JOIN "Users" u ON f."userId" = u.id
      WHERE f.id = $1 AND f."teacherId" = $2
    `, { bind: [feedbackId, teacher.id] });

    if (!feedback[0]) throw createError('Feedback not found or not authorized', 404);

    await sequelize.query(`
      UPDATE "Feedbacks" 
      SET "teacherResponse" = $1, 
          status = 'responded', 
          "updatedAt" = NOW() 
      WHERE id = $2
    `, { bind: [response.trim(), feedbackId] });

    await sequelize.query(`
      INSERT INTO "Notifications" ("userId", title, message, type, metadata, "isRead", "createdAt")
      VALUES ($1, $2, $3, 'message', $4, false, NOW())
    `, {
      bind: [
        feedback[0].userId,
        '💬 Teacher Response to Your Feedback',
        `Your teacher ${req.user.name} has responded to your feedback: "${response.substring(0, 100)}${response.length > 100 ? '...' : ''}"`,
        JSON.stringify({
          from: req.user.id,
          fromName: req.user.name,
          fromRole: 'teacher',
          feedbackId: parseInt(feedbackId),
          response: response.trim(),
          timestamp: new Date().toISOString()
        })
      ]
    });

    res.json({ success: true, message: 'Response sent to student successfully' });
  } catch (error) {
    console.error('Error responding to feedback:', error);
    next(error);
  }
};

// backend/src/routes/teacherRoutes.js
// Add this endpoint after the other routes

// ===========================================
// GET TEACHER MESSAGES (Inbox & Sent)
// ===========================================
router.get('/messages', async (req, res) => {
  try {
    const userId = req.user.id;

    const [messages] = await sequelize.query(`
      SELECT 
        n.id, 
        n."userId", 
        n.title as subject, 
        n.message, 
        n.type, 
        n."isRead",
        n."createdAt", 
        n."updatedAt", 
        n.metadata
      FROM "Notifications" n
      WHERE n."userId" = $1
      ORDER BY n."createdAt" DESC
      LIMIT 200
    `, { bind: [userId] });

    const parsedMessages = messages.map(msg => {
      let metadata = {};
      try {
        metadata = typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : (msg.metadata || {});
      } catch (e) { metadata = {}; }

      const isSent = msg.type === 'sent_message' || metadata.isSent === true;

      let sender_name = 'System';
      let sender_role = '';
      let recipient_name = '';
      let recipient_role = '';
      let senderId = null;
      let sender = 'system';

      if (isSent) {
        // This is a message I sent - show recipient info
        if (metadata.to && metadata.to.length > 0) {
          recipient_name = metadata.to.map(t => t.name).join(', ');
          recipient_role = metadata.toRole || '';
        }
        sender_name = 'You';
        sender_role = 'teacher';
        senderId = req.user.id;
        sender = 'teacher';
      } else {
        // This is a message I received - show sender info
        // For school messages, prefer school name over admin name
        if (metadata.fromRole === 'school' && metadata.fromSchoolName) {
          sender_name = metadata.fromSchoolName;
        } else {
          sender_name = metadata.fromName || metadata.senderName || 'System';
        }
        sender_role = metadata.fromRole || '';
        senderId = metadata.from;
        recipient_name = 'You';
        recipient_role = 'teacher';

        if (sender_role === 'school') sender = 'school';
        else if (sender_role === 'subadmin' || sender_role === 'superadmin') sender = 'admin';
        else if (sender_role === 'teacher') sender = 'teacher';
        else sender = 'system';
      }

      return {
        id: msg.id,
        subject: msg.subject,
        message: msg.message,
        isRead: msg.isRead || false,
        createdAt: msg.createdAt,
        isSent: isSent,
        sender_name: sender_name,
        sender_role: sender_role,
        recipient_name: recipient_name,
        recipient_role: recipient_role,
        senderId: senderId,
        sender: sender
      };
    });

    console.log(`📨 Found ${parsedMessages.length} messages for teacher ${userId}`);
    res.json({ success: true, data: parsedMessages });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ success: false, error: error.message, data: [] });
  }
});

// ===========================================
// MARK MESSAGE AS READ
// ===========================================
router.put('/messages/:id/read', async (req, res) => {
  try {
    const messageId = req.params.id;
    const userId = req.user.id;

    await sequelize.query(`
      UPDATE "Notifications" 
      SET "isRead" = true, "updatedAt" = NOW() 
      WHERE id = $1 AND "userId" = $2
    `, { bind: [messageId, userId] });

    res.json({ success: true, message: 'Message marked as read' });
  } catch (error) {
    console.error('Error marking message as read:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// DELETE MESSAGE
// ===========================================
router.delete('/messages/:id', async (req, res) => {
  try {
    const messageId = req.params.id;
    const userId = req.user.id;

    await sequelize.query(`
      DELETE FROM "Notifications" 
      WHERE id = $1 AND "userId" = $2
    `, { bind: [messageId, userId] });

    res.json({ success: true, message: 'Message deleted' });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


// ===========================================
// GET RECEIVED EXAMS FROM SCHOOLS
// ===========================================
router.get('/received-exams', async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) {
      return res.status(404).json({ success: false, error: 'Teacher not found' });
    }

    // Query SchoolExams table (where schools send exam files)
    const [exams] = await sequelize.query(`
      SELECT 
        se.id,
        se.title,
        se.description,
        se."subjectName" as subject,
        se."schoolName" as school_name,
        se.year,
        se.type,
        se.status,
        se."fileUrl",
        se."originalFileName",
        se."fileSize",
        se."createdAt",
        s.address as school_address,
        s.phone as school_phone
      FROM "SchoolExams" se
      LEFT JOIN "Schools" s ON se."schoolId" = s.id
      WHERE se."teacherId" = $1
      ORDER BY 
        CASE WHEN se.status = 'pending' THEN 1 ELSE 2 END,
        se."createdAt" DESC
    `, { bind: [teacher.id] });

    console.log(`✅ Found ${exams.length} received exam files for teacher ${teacher.id}`);
    res.json({ success: true, data: exams });
  } catch (error) {
    console.error('Error fetching received exams:', error);
    res.status(500).json({ success: false, error: error.message, data: [] });
  }
});

// ===========================================
// REVIEW RECEIVED EXAM (Approve/Reject)
// ===========================================
router.put('/review-exam/:examId', async (req, res) => {
  try {
    const { status, feedback } = req.body;
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) {
      return res.status(404).json({ success: false, error: 'Teacher not found' });
    }

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Status must be approved or rejected' });
    }

    // Query SchoolExams table
    const [exam] = await sequelize.query(`
      SELECT se.*, s."schoolName", u.email as school_email, u.name as school_admin_name
      FROM "SchoolExams" se
      LEFT JOIN "Schools" s ON se."schoolId" = s.id
      LEFT JOIN "Users" u ON s."adminId" = u.id
      WHERE se.id = $1 AND se."teacherId" = $2
    `, { bind: [req.params.examId, teacher.id] });

    if (!exam[0]) {
      return res.status(404).json({ success: false, error: 'Exam not found' });
    }

    // Update SchoolExams table
    await sequelize.query(`
      UPDATE "SchoolExams" 
      SET status = $1, feedback = $2, "updatedAt" = NOW()
      WHERE id = $3
    `, { bind: [status, feedback || null, req.params.examId] });

    // Send notification to school admin
    await sequelize.query(`
      INSERT INTO "Notifications" ("userId", title, message, type, metadata, "isRead", "createdAt")
      VALUES ($1, $2, $3, 'exam_review', $4, false, NOW())
    `, {
      bind: [
        exam[0].createdBy,
        status === 'approved' ? '✅ Exam Approved' : '❌ Exam Rejected',
        `Your exam "${exam[0].title}" has been ${status} by teacher ${req.user.name}. ${feedback ? `Feedback: ${feedback}` : ''}`,
        JSON.stringify({
          examId: parseInt(req.params.examId),
          status,
          feedback,
          teacherName: req.user.name,
          teacherId: teacher.id,
          schoolName: exam[0].schoolName
        })
      ]
    });

    console.log(`✅ Exam ${status}: ${exam[0].title} from ${exam[0].schoolName}`);
    res.json({ success: true, message: `Exam ${status} successfully` });
  } catch (error) {
    console.error('Error reviewing exam:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// DOWNLOAD RECEIVED EXAM FILE
// ===========================================
router.get('/received-exams/:id/download', async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) {
      return res.status(404).json({ success: false, error: 'Teacher not found' });
    }

    // Query SchoolExams table
    const [exam] = await sequelize.query(`
      SELECT "fileUrl", "originalFileName", "schoolName" FROM "SchoolExams" 
      WHERE id = $1 AND "teacherId" = $2
    `, { bind: [req.params.id, teacher.id] });

    if (!exam[0]) {
      return res.status(404).json({ success: false, error: 'Exam not found' });
    }

    const filePath = path.join(__dirname, '../../', exam[0].fileUrl);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    console.log(`✅ Downloading exam file from ${exam[0].schoolName}: ${exam[0].originalFileName}`);
    res.download(filePath, exam[0].originalFileName || 'exam-file');
  } catch (error) {
    console.error('Error downloading exam file:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// GET FEEDBACK STATISTICS
// ===========================================
const getFeedbackStats = async (req, res, next) => {
  try {
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) throw createError('Teacher not found', 404);

    const [stats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'responded' THEN 1 ELSE 0 END) as responded,
        AVG(rating) as average_rating,
        MAX(rating) as highest_rating,
        MIN(rating) as lowest_rating
      FROM "Feedbacks"
      WHERE "teacherId" = $1 AND category = 'teacher_feedback'
    `, { bind: [teacher.id] });

    res.json({
      success: true,
      data: {
        total: parseInt(stats[0]?.total || 0),
        pending: parseInt(stats[0]?.pending || 0),
        responded: parseInt(stats[0]?.responded || 0),
        averageRating: parseFloat(stats[0]?.average_rating || 0).toFixed(1),
        highestRating: parseInt(stats[0]?.highest_rating || 0),
        lowestRating: parseInt(stats[0]?.lowest_rating || 0)
      }
    });
  } catch (error) {
    console.error('Error fetching feedback stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ===========================================
// ROUTES
// ===========================================

// Dashboard & Statistics
router.get('/dashboard', getTeacherDashboard);
router.get('/stats', getTeacherStats);

// Content Check
router.get('/content-check', checkTeacherContent);
router.get('/published-grades', getTeacherGradesWithContent);
router.get('/published-units', getTeacherUnitsWithContent);

// Exams - Main endpoints
router.get('/exams', getTeacherExams);
router.get('/exams/type/:type', getExamsByType);
router.get('/exam-types', getExamTypes);
router.get('/exam-years', getExamYears);
router.get('/quiz-units', getQuizUnits);
router.get('/exams/list', getExamsList);

// Materials
router.get('/materials', getTeacherMaterials);

// Student Results
router.get('/student/:studentId', getStudentDetails);

// Messages - All working
router.get('/messages', getTeacherMessages);
router.put('/messages/:id/read', markMessageAsRead);
router.delete('/messages/:id', deleteMessage);
router.post('/send-message', sendMessageToStudents);
router.post('/send-to-teachers', sendMessageToTeachers);
router.post('/send-to-schools', sendMessageToSchools);
router.post('/send-to-admin', sendMessageToAdmin);

// Dropdown Lists
router.get('/students', getTeacherStudents);
router.get('/all-teachers', getAllTeachers);
router.get('/all-schools', getAllSchools);
router.get('/admins', getTeacherAdmins);
router.get('/school', getTeacherSchool);

// Notifications
router.get('/notifications', getNotifications);
router.get('/notifications/unread-count', getUnreadCount);
router.put('/notifications/mark-all-read', markAllAsRead);
router.delete('/notifications/clear-all', clearAllNotifications);

// Feedback
router.get('/student-feedback', getStudentFeedback);
router.get('/feedback-stats', getFeedbackStats);
router.post('/respond-to-feedback', respondToFeedback);

// Received Exams
router.get('/received-exams', getReceivedExams);
router.get('/receivedExams', getReceivedExams);

// Review Exam
router.put('/review-exam/:examId', reviewExam);

// Profile
router.get('/profile', getTeacherProfile);
router.put('/profile', updateTeacherProfile);

module.exports = router;