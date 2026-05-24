// backend/src/routes/examRoutes.js
// COMPLETE FIXED - Includes proper result endpoint

const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate, authorize } = require('../middleware/auth');
const validate = require('../middleware/validation');
const upload = require('../middleware/upload');

// Import models
const { Exam, Teacher, Student, ExamAttempt, Question } = require('../models');
const { Op } = require('sequelize');

// Use the controller for other routes
const examController = require('../controllers/examController');

const createExamValidation = [
  body('title').notEmpty().withMessage('Title is required'),
  body('type').isIn(['past', 'model', 'mock', 'quiz', 'scholastic']).withMessage('Invalid exam type'),
  body('subject').notEmpty().withMessage('Subject is required'),
  body('department').isIn(['Natural Science', 'Social Science', 'Both']).withMessage('Invalid department'),
  body('duration').isInt({ min: 1 }).withMessage('Duration must be a positive number'),
  body('totalMarks').isInt({ min: 1 }).withMessage('Total marks must be a positive number'),
  body('passingMarks').isInt({ min: 1 }).withMessage('Passing marks must be a positive number'),
];

// ===========================================
// PUBLIC ROUTES
// ===========================================
router.get('/', examController.getExams);
router.get('/past', examController.getPastExams);
router.get('/model', examController.getModelExams);
router.get('/mock', examController.getMockExams);
router.get('/quiz', examController.getQuizzes);

// ===========================================
// TEACHER ROUTES
// ===========================================
router.get('/teacher', authenticate, authorize('teacher'), async (req, res) => {
  try {
    console.log('✅ /api/exams/teacher - Using Exams table');

    const teacher = await Teacher.findOne({
      where: { userId: req.user.id }
    });

    if (!teacher) {
      return res.status(404).json({
        success: false,
        error: { message: 'Teacher profile not found' }
      });
    }

    const teacherSubject = teacher.specialization;
    let allowedSubjects = [teacherSubject];

    if (teacherSubject === 'English') {
      allowedSubjects.push('Scholastic Aptitude - English Part');
    }
    if (teacherSubject === 'Mathematics') {
      allowedSubjects.push('Scholastic Aptitude - Mathematics Part');
    }

    console.log(`📚 Teacher: ${teacherSubject}`);
    console.log(`   Subjects: ${allowedSubjects.join(', ')}`);

    const exams = await Exam.findAll({
      where: {
        createdBy: req.user.id,
        subject: { [Op.in]: allowedSubjects }
      },
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'title', 'description', 'type', 'duration', 'totalMarks', 'passingMarks', 'status', 'gradeLevel', 'subject', 'unit', 'year', 'schoolName', 'createdAt', 'updatedAt']
    });

    console.log(`✅ Found ${exams.length} exams`);

    res.json({
      success: true,
      data: { exams: exams || [] }
    });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message },
      data: { exams: [] }
    });
  }
});

// ===========================================
// STUDENT ROUTES
// ===========================================
router.get('/student', authenticate, authorize('student'), examController.getStudentExams);

// ===========================================
// STATISTICS & EXPORT
// ===========================================
router.get('/:id/stats', authenticate, authorize('teacher', 'superadmin', 'subadmin'), examController.getExamStatistics);
router.get('/:id/export-pdf', authenticate, authorize('teacher', 'superadmin', 'subadmin'), examController.exportExamAsPDF);

// ===========================================
// EXAM DETAILS
// ===========================================
router.get('/:id', examController.getExamById);
router.get('/:id/questions', examController.getExamQuestions);

// ===========================================
// EXAM ATTEMPTS
// ===========================================
router.post('/:id/start', authenticate, authorize('student'), examController.startExam);
router.post('/:id/submit', authenticate, authorize('student'), examController.submitExam);

// ===========================================
// GET EXAM RESULT - FIXED VERSION
// ===========================================
router.get('/:id/result', authenticate, authorize('student'), async (req, res) => {
  try {
    const student = await Student.findOne({ where: { userId: req.user.id } });
    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }

    const examId = parseInt(req.params.id);

    const attempt = await ExamAttempt.findOne({
      where: { examId: examId, studentId: student.id, status: 'completed' },
      order: [['createdAt', 'DESC']]
    });

    if (!attempt) {
      return res.status(404).json({ success: false, error: 'No completed attempt found' });
    }

    const exam = await Exam.findOne({
      where: { id: examId },
      attributes: ['id', 'title', 'subject', 'duration', 'totalMarks', 'passingMarks', 'description', 'type', 'gradeLevel', 'year']
    });

    const questions = await Question.findAll({
      where: { examId: examId },
      attributes: ['id', 'questionText', 'correctAnswer', 'explanation', 'marks', 'options', 'questionType'],
      order: [['orderIndex', 'ASC']]
    });

    let parsedAnswers = attempt.answers;
    if (typeof parsedAnswers === 'string') {
      try { parsedAnswers = JSON.parse(parsedAnswers); } catch (e) { parsedAnswers = {}; }
    }

    const results = questions.map(q => {
      const userAnswer = parsedAnswers[q.id] || '';
      const isCorrect = userAnswer.toString().toLowerCase().trim() === (q.correctAnswer || '').toString().toLowerCase().trim();

      return {
        id: q.id,
        questionText: q.questionText,
        questionType: q.questionType,
        options: q.options,
        userAnswer: userAnswer,
        correctAnswer: q.correctAnswer,
        isCorrect: isCorrect,
        marks: q.marks,
        explanation: q.explanation || 'No explanation provided.'
      };
    });

    const percentage = exam.totalMarks > 0 ? (attempt.score / exam.totalMarks) * 100 : 0;

    res.json({
      success: true,
      data: {
        exam: {
          id: exam.id,
          title: exam.title,
          subject: exam.subject,
          duration: exam.duration,
          totalMarks: exam.totalMarks,
          passingMarks: exam.passingMarks || exam.totalMarks / 2,
          description: exam.description,
          type: exam.type,
          gradeLevel: exam.gradeLevel,
          year: exam.year
        },
        score: attempt.score,
        totalMarks: exam.totalMarks,
        passingMarks: exam.passingMarks || exam.totalMarks / 2,
        percentage: parseFloat(percentage.toFixed(1)),
        isPassed: attempt.score >= (exam.passingMarks || exam.totalMarks / 2),
        submittedAt: attempt.submittedAt || attempt.createdAt,
        results: results
      }
    });
  } catch (error) {
    console.error('Get result error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/attempts', authenticate, examController.getUserAttempts);

// ===========================================
// CREATE, UPDATE, DELETE
// ===========================================
router.post('/', authenticate, authorize('teacher', 'superadmin', 'subadmin'), upload.single('examFile'), createExamValidation, validate, examController.createExam);
router.post('/:id/upload', authenticate, authorize('teacher', 'superadmin', 'subadmin'), upload.single('examFile'), examController.uploadExamFile);
router.post('/:id/question-image', authenticate, authorize('teacher', 'superadmin', 'subadmin'), (req, res, next) => {
  console.log('🔵 [ROUTE] Question image upload route hit');
  console.log('🔵 [ROUTE] Exam ID:', req.params.id);
  console.log('🔵 [ROUTE] User:', req.user?.id);
  next();
}, upload.single('questionImage'), examController.uploadQuestionImage);
router.post('/:id/questions', authenticate, authorize('teacher', 'superadmin', 'subadmin'), examController.addQuestions);
router.put('/:id', authenticate, authorize('teacher', 'superadmin', 'subadmin'), examController.updateExam);
router.put('/:id/publish', authenticate, authorize('teacher', 'superadmin', 'subadmin'), examController.publishExam);
router.put('/:id/archive', authenticate, authorize('teacher', 'superadmin', 'subadmin'), examController.archiveExam);
router.delete('/:id', authenticate, authorize('teacher', 'superadmin', 'subadmin'), examController.deleteExam);
router.put('/questions/:questionId', authenticate, authorize('teacher', 'superadmin', 'subadmin'), examController.updateQuestion);
router.delete('/questions/:questionId', authenticate, authorize('teacher', 'superadmin', 'subadmin'), examController.deleteQuestion);

module.exports = router;