// backend/src/routes/studentRoutes.js
// COMPLETE FIXED - Scholastic Aptitude added as a subject
// Includes feedback to teachers functionality

const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');
const NotificationService = require('../services/notificationService');

const Exam = require('../models/Exam');
const Question = require('../models/Question');
const ExamAttempt = require('../models/ExamAttempt');
const Student = require('../models/Student');
const Material = require('../models/Material');
const User = require('../models/User');

router.use(authenticate);

// ============================================
// HELPER FUNCTIONS
// ============================================
const getVisibleGrades = (studentGrade) => {
  const grade = parseInt(studentGrade);
  const visible = [];
  for (let g = 9; g <= grade; g++) {
    visible.push(g);
  }
  return visible;
};

const isGrade12Student = (studentGrade) => parseInt(studentGrade) === 12;
const isStudent = (user) => user?.role === 'student';
const canPreview = (user) => ['teacher', 'superadmin', 'subadmin'].includes(user?.role);

const capitalizeSubject = (subjectId) => {
  const subjectMap = {
    'english': 'English', 'mathematics': 'Mathematics', 'biology': 'Biology',
    'chemistry': 'Chemistry', 'physics': 'Physics', 'history': 'History',
    'geography': 'Geography', 'economics': 'Economics', 'citizenship education': 'Citizenship Education',
    'scholastic aptitude': 'Scholastic Aptitude'
  };
  return subjectMap[subjectId?.toLowerCase()] || subjectId;
};

// ============================================
// GET EXAM SUBJECTS - ADDED SCHOLASTIC APTITUDE
// ============================================
router.get('/exam-subjects', authorize('student'), async (req, res) => {
  try {
    const student = await Student.findOne({ where: { userId: req.user.id } });
    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }

    const studentGrade = student.gradeLevel;

    if (studentGrade !== 12) {
      return res.json({ success: true, data: { subjects: [] } });
    }

    let subjects = [];
    if (student.department === 'Natural Science') {
      subjects = ['Biology', 'Chemistry', 'Physics', 'Mathematics', 'English', 'Citizenship Education'];
    } else {
      subjects = ['History', 'Geography', 'Economics', 'Mathematics', 'English', 'Citizenship Education'];
    }

    const subjectsWithCounts = [];

    for (const subject of subjects) {
      let pastCount = 0, modelCount = 0, mockCount = 0;

      const [pastResult] = await sequelize.query(`
        SELECT COUNT(*) FROM "Exams" 
        WHERE subject = $1 AND type = 'past' AND status = 'published' AND "gradeLevel" = 12
      `, { bind: [subject] });

      const [modelResult] = await sequelize.query(`
        SELECT COUNT(*) FROM "Exams" 
        WHERE subject = $1 AND type = 'model' AND status = 'published' AND "gradeLevel" = 12
      `, { bind: [subject] });

      const [mockResult] = await sequelize.query(`
        SELECT COUNT(*) FROM "Exams" 
        WHERE subject = $1 AND type = 'mock' AND status = 'published' AND "gradeLevel" = 12
      `, { bind: [subject] });

      pastCount += parseInt(pastResult[0]?.count || 0);
      modelCount += parseInt(modelResult[0]?.count || 0);
      mockCount += parseInt(mockResult[0]?.count || 0);

      if (pastCount > 0 || modelCount > 0 || mockCount > 0) {
        subjectsWithCounts.push({
          id: subject.toLowerCase(),
          name: subject,
          pastCount: pastCount,
          modelCount: modelCount,
          mockCount: mockCount,
          scholasticCount: 0
        });
      }
    }

    // ADD SCHOLASTIC APTITUDE AS A SUBJECT
    const saEnglishSubject = 'Scholastic Aptitude - English Part';
    const saMathSubject = 'Scholastic Aptitude - Mathematics Part';

    let saPastCount = 0, saModelCount = 0, saMockCount = 0;

    const [saEnglishPast] = await sequelize.query(`
      SELECT COUNT(*) FROM "Exams" 
      WHERE subject = $1 AND type = 'past' AND status = 'published' AND "gradeLevel" = 12
    `, { bind: [saEnglishSubject] });

    const [saEnglishModel] = await sequelize.query(`
      SELECT COUNT(*) FROM "Exams" 
      WHERE subject = $1 AND type = 'model' AND status = 'published' AND "gradeLevel" = 12
    `, { bind: [saEnglishSubject] });

    const [saEnglishMock] = await sequelize.query(`
      SELECT COUNT(*) FROM "Exams" 
      WHERE subject = $1 AND type = 'mock' AND status = 'published' AND "gradeLevel" = 12
    `, { bind: [saEnglishSubject] });

    const [saMathPast] = await sequelize.query(`
      SELECT COUNT(*) FROM "Exams" 
      WHERE subject = $1 AND type = 'past' AND status = 'published' AND "gradeLevel" = 12
    `, { bind: [saMathSubject] });

    const [saMathModel] = await sequelize.query(`
      SELECT COUNT(*) FROM "Exams" 
      WHERE subject = $1 AND type = 'model' AND status = 'published' AND "gradeLevel" = 12
    `, { bind: [saMathSubject] });

    const [saMathMock] = await sequelize.query(`
      SELECT COUNT(*) FROM "Exams" 
      WHERE subject = $1 AND type = 'mock' AND status = 'published' AND "gradeLevel" = 12
    `, { bind: [saMathSubject] });

    saPastCount = parseInt(saEnglishPast[0]?.count || 0) + parseInt(saMathPast[0]?.count || 0);
    saModelCount = parseInt(saEnglishModel[0]?.count || 0) + parseInt(saMathModel[0]?.count || 0);
    saMockCount = parseInt(saEnglishMock[0]?.count || 0) + parseInt(saMathMock[0]?.count || 0);

    const [saEnglishQuiz] = await sequelize.query(`
      SELECT COUNT(*) FROM "Exams" 
      WHERE subject = $1 AND type = 'quiz' AND status = 'published' AND "gradeLevel" = 12
    `, { bind: [saEnglishSubject] });

    const [saMathQuiz] = await sequelize.query(`
      SELECT COUNT(*) FROM "Exams" 
      WHERE subject = $1 AND type = 'quiz' AND status = 'published' AND "gradeLevel" = 12
    `, { bind: [saMathSubject] });

    const saQuizCount = parseInt(saEnglishQuiz[0]?.count || 0) + parseInt(saMathQuiz[0]?.count || 0);

    if (saPastCount > 0 || saModelCount > 0 || saMockCount > 0 || saQuizCount > 0) {
      subjectsWithCounts.push({
        id: 'scholastic-aptitude',
        name: 'Scholastic Aptitude',
        pastCount: saPastCount,
        modelCount: saModelCount,
        mockCount: saMockCount,
        scholasticCount: saQuizCount
      });
    }

    res.json({ success: true, data: { subjects: subjectsWithCounts, studentGrade } });
  } catch (error) {
    console.error('Error fetching exam subjects:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// GET EXAM TYPES - FIXED: INTEGER 12
// ============================================
router.get('/exam-types', authorize('student'), async (req, res) => {
  try {
    const student = await Student.findOne({ where: { userId: req.user.id } });
    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }

    const studentGrade = student.gradeLevel;

    if (studentGrade !== 12) {
      return res.json({ success: true, data: { examTypes: [] } });
    }

    const { subjectId } = req.query;
    const subjectName = subjectId;

    console.log(`🔍 Fetching exam types for: ${subjectName}`);

    const examTypes = [];
    const examTypeList = ['past', 'model', 'mock'];

    for (const examType of examTypeList) {
      const [result] = await sequelize.query(`
        SELECT COUNT(*) FROM "Exams" 
        WHERE subject = $1 
          AND type = $2 
          AND status = 'published' 
          AND "gradeLevel" = 12
      `, { bind: [subjectName, examType] });

      const count = parseInt(result[0]?.count || 0);
      if (count > 0) {
        examTypes.push({ type: examType, count: count });
        console.log(`   ✅ Found ${count} ${examType} exams`);
      }
    }

    res.json({ success: true, data: { examTypes } });
  } catch (error) {
    console.error('Error fetching exam types:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// GET EXAM YEARS - FIXED: INTEGER 12
// ============================================
router.get('/exam-years', authorize('student'), async (req, res) => {
  try {
    const student = await Student.findOne({ where: { userId: req.user.id } });
    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }

    const studentGrade = student.gradeLevel;
    if (studentGrade !== 12) {
      return res.json({ success: true, data: { years: [] } });
    }

    const { subjectId, examType, gradeLevel } = req.query;
    const subjectName = subjectId;
    const targetGrade = gradeLevel ? parseInt(gradeLevel) : 12;

    console.log(`🔍 Fetching years for: ${subjectName}, type: ${examType}`);

    const years = await sequelize.query(`
      SELECT DISTINCT year, COUNT(*) as "examCount"
      FROM "Exams"
      WHERE subject = $1 
        AND type = $2 
        AND status = 'published' 
        AND "gradeLevel" = $3 
        AND year IS NOT NULL
      GROUP BY year 
      ORDER BY year DESC
    `, { bind: [subjectName, examType, targetGrade], type: sequelize.QueryTypes.SELECT });

    console.log(`📊 Found ${years.length} years:`, years);
    res.json({ success: true, data: { years: years || [] } });
  } catch (error) {
    console.error('Error fetching exam years:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// GET EXAMS BY YEAR - FIXED: INTEGER 12
// ============================================
router.get('/exams-by-year', authorize('student'), async (req, res) => {
  try {
    const student = await Student.findOne({ where: { userId: req.user.id } });
    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }

    const studentGrade = student.gradeLevel;
    if (studentGrade !== 12) {
      return res.json({ success: true, data: { exams: [] } });
    }

    const { subjectId, examType, year, gradeLevel } = req.query;
    const subjectName = subjectId;
    const targetGrade = gradeLevel ? parseInt(gradeLevel) : 12;

    let query = `
      SELECT id, title, description, type, duration, "totalMarks", "passingMarks", year, "schoolName"
      FROM "Exams"
      WHERE subject = $1 
        AND type = $2 
        AND status = 'published' 
        AND "gradeLevel" = $3
    `;
    const params = [subjectName, examType, targetGrade];

    if (year) {
      query += ` AND year = $4`;
      params.push(parseInt(year));
    }

    query += ` ORDER BY year DESC, title ASC`;

    const exams = await sequelize.query(query, { bind: params, type: sequelize.QueryTypes.SELECT });

    console.log(`📊 Found ${exams.length} exams for ${subjectName} ${examType} ${year || ''}`);
    res.json({ success: true, data: { exams: exams || [] } });
  } catch (error) {
    console.error('Error fetching exams by year:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// GET SINGLE EXAM - FIXED: INTEGER 12
// ============================================
router.get('/exams/:id', async (req, res) => {
  try {
    const examId = parseInt(req.params.id);
    const isPreviewMode = req.query.preview === 'true';
    const userId = req.user.id;

    let student = null;
    if (isStudent(req.user)) {
      student = await Student.findOne({ where: { userId: userId } });
    }

    if (isPreviewMode && canPreview(req.user)) {
      const exam = await Exam.findOne({
        where: { id: examId },
        attributes: ['id', 'title', 'description', 'subject', 'duration', 'totalMarks', 'passingMarks', 'type', 'gradeLevel', 'department', 'year', 'unit', 'instructions']
      });
      if (!exam) return res.status(404).json({ success: false, error: 'Exam not found' });

      const questions = await Question.findAll({
        where: { examId: examId },
        attributes: ['id', 'questionText', 'questionType', 'options', 'marks', 'orderIndex', 'correctAnswer', 'explanation'],
        order: [['orderIndex', 'ASC']]
      });
      return res.json({ success: true, data: { exam, questions } });
    }

    if (!student) return res.status(404).json({ success: false, error: 'Student not found' });
    if (student.gradeLevel !== 12) {
      return res.status(403).json({ success: false, error: 'Exams are only available for Grade 12 students' });
    }

    const exam = await Exam.findOne({
      where: { id: examId, status: 'published', gradeLevel: 12 }
    });

    if (!exam) return res.status(404).json({ success: false, error: 'Exam not available' });

    const questions = await Question.findAll({
      where: { examId: examId },
      attributes: ['id', 'questionText', 'questionType', 'options', 'marks', 'orderIndex'],
      order: [['orderIndex', 'ASC']]
    });

    const sanitizedQuestions = questions.map(q => ({
      id: q.id, questionText: q.questionText, questionType: q.questionType,
      options: q.options, marks: q.marks, orderIndex: q.orderIndex
    }));

    const attempt = await ExamAttempt.findOne({
      where: { examId: examId, studentId: student.id, status: 'in_progress' }
    });

    res.json({ success: true, data: { exam, questions: sanitizedQuestions, attempt: attempt || null } });
  } catch (error) {
    console.error('Error fetching exam:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// START EXAM - FIXED: INTEGER 12
// ============================================
router.post('/exams/:id/start', authorize('student'), async (req, res) => {
  try {
    const student = await Student.findOne({ where: { userId: req.user.id } });
    if (!student) return res.status(404).json({ success: false, error: 'Student not found' });
    if (student.gradeLevel !== 12) {
      return res.status(403).json({ success: false, error: 'Exams are only available for Grade 12 students' });
    }

    const examId = parseInt(req.params.id);

    const exam = await Exam.findOne({
      where: { id: examId, status: 'published', gradeLevel: 12 }
    });

    if (!exam) return res.status(404).json({ success: false, error: 'Exam not available' });

    let attempt = await ExamAttempt.findOne({
      where: { examId: examId, studentId: student.id, status: 'in_progress' }
    });

    if (attempt) {
      return res.json({ success: true, data: { attemptId: attempt.id, message: 'Resuming exam' } });
    }

    attempt = await ExamAttempt.create({
      examId: examId, studentId: student.id,
      startedAt: new Date(), status: 'in_progress', totalMarks: exam.totalMarks
    });

    res.json({ success: true, data: { attemptId: attempt.id, message: 'Exam started' } });
  } catch (error) {
    console.error('Start exam error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// SUBMIT EXAM
// ============================================
router.post('/exams/:id/submit', authorize('student'), async (req, res) => {
  try {
    const student = await Student.findOne({ where: { userId: req.user.id } });
    if (!student) return res.status(404).json({ success: false, error: 'Student not found' });

    const { answers } = req.body;
    const examId = parseInt(req.params.id);
    const exam = await Exam.findOne({ where: { id: examId } });
    if (!exam) return res.status(404).json({ success: false, error: 'Exam not found' });

    const attempt = await ExamAttempt.findOne({
      where: { examId: examId, studentId: student.id, status: 'in_progress' }
    });
    if (!attempt) return res.status(404).json({ success: false, error: 'No active attempt found' });

    const questions = await Question.findAll({
      where: { examId: examId }, attributes: ['id', 'correctAnswer', 'marks']
    });

    let score = 0;
    const answersObject = {};

    for (const question of questions) {
      const userAnswer = answers && answers[question.id] ? answers[question.id] : '';
      const isCorrect = userAnswer.toString().toLowerCase().trim() === (question.correctAnswer || '').toString().toLowerCase().trim();
      if (isCorrect) score += question.marks;
      answersObject[question.id] = userAnswer;
    }

    await attempt.update({
      answers: answersObject, score: score,
      submittedAt: new Date(), status: 'completed'
    });

    res.json({
      success: true,
      data: {
        score: score, totalMarks: exam.totalMarks,
        passingMarks: exam.passingMarks || exam.totalMarks / 2,
        percentage: parseFloat(((score / exam.totalMarks) * 100).toFixed(1)),
        isPassed: score >= (exam.passingMarks || exam.totalMarks / 2)
      }
    });
  } catch (error) {
    console.error('Submit exam error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// GET EXAM RESULT
// ============================================
router.get('/exams/:id/result', authorize('student'), async (req, res) => {
  try {
    const student = await Student.findOne({ where: { userId: req.user.id } });
    if (!student) return res.status(404).json({ success: false, error: 'Student not found' });

    const examId = parseInt(req.params.id);
    const attempt = await ExamAttempt.findOne({
      where: { examId: examId, studentId: student.id, status: 'completed' },
      include: [{ model: Exam, as: 'exam' }],
      order: [['createdAt', 'DESC']]
    });

    if (!attempt) return res.status(404).json({ success: false, error: 'No completed attempt' });

    const questions = await Question.findAll({
      where: { examId: examId },
      attributes: ['id', 'questionText', 'correctAnswer', 'explanation', 'marks'],
      order: [['orderIndex', 'ASC']]
    });

    let parsedAnswers = attempt.answers;
    if (typeof parsedAnswers === 'string') {
      try { parsedAnswers = JSON.parse(parsedAnswers); } catch (e) { parsedAnswers = {}; }
    }

    const detailedResults = questions.map(q => ({
      id: q.id, questionText: q.questionText,
      userAnswer: parsedAnswers[q.id] || '(Not answered)',
      correctAnswer: q.correctAnswer,
      isCorrect: (parsedAnswers[q.id] || '').toString().toLowerCase().trim() === q.correctAnswer.toString().toLowerCase().trim(),
      marks: q.marks, explanation: q.explanation
    }));

    res.json({
      success: true,
      data: {
        exam: attempt.exam, score: attempt.score,
        totalMarks: attempt.exam.totalMarks,
        passingMarks: attempt.exam.passingMarks || attempt.exam.totalMarks / 2,
        percentage: parseFloat(((attempt.score / attempt.exam.totalMarks) * 100).toFixed(1)),
        isPassed: attempt.score >= (attempt.exam.passingMarks || attempt.exam.totalMarks / 2),
        results: detailedResults, submittedAt: attempt.submittedAt || attempt.createdAt
      }
    });
  } catch (error) {
    console.error('Get result error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// GET DASHBOARD STATS
// ============================================
router.get('/dashboard', authorize('student'), async (req, res) => {
  try {
    const student = await Student.findOne({ where: { userId: req.user.id } });
    if (!student) return res.status(404).json({ success: false, error: 'Student not found' });

    const totalExams = await Exam.count({ where: { status: 'published', gradeLevel: 12 } });
    const completedExams = await ExamAttempt.count({ where: { studentId: student.id, status: 'completed' } });
    const inProgressExams = await ExamAttempt.count({ where: { studentId: student.id, status: 'in_progress' } });

    const avgScoreResult = await ExamAttempt.findOne({
      where: { studentId: student.id, status: 'completed' },
      attributes: [[sequelize.fn('AVG', sequelize.col('score')), 'avgScore']],
      raw: true
    });

    const materialsCount = await Material.count({ where: { status: 'published' } });

    res.json({
      success: true,
      data: {
        stats: {
          totalExams: totalExams || 0, completedExams: completedExams || 0,
          inProgressExams: inProgressExams || 0,
          averageScore: Math.round(avgScoreResult?.avgScore || 0),
          materialsCount: materialsCount || 0
        },
        student: {
          id: student.id, department: student.department,
          gradeLevel: student.gradeLevel, schoolName: student.schoolName
        }
      }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// GET MATERIALS
// ============================================
router.get('/materials', authorize('student'), async (req, res) => {
  try {
    const student = await Student.findOne({ where: { userId: req.user.id } });
    if (!student) return res.json({ success: true, data: { materials: [] } });

    const studentGrade = student.gradeLevel;
    const visibleGrades = getVisibleGrades(studentGrade);
    const { subject, gradeLevel, unit } = req.query;
    let targetGrade = gradeLevel ? parseInt(gradeLevel) : null;

    if (targetGrade && !visibleGrades.includes(targetGrade)) {
      return res.json({ success: true, data: { materials: [] } });
    }

    const gradesToCheck = targetGrade ? [targetGrade.toString()] : visibleGrades.map(g => g.toString());

    const where = {
      status: 'published',
      gradeLevel: { [Op.in]: gradesToCheck },
      [Op.or]: [{ department: student.department }, { department: 'Both' }]
    };

    if (subject && subject !== 'all' && subject !== 'undefined') where.subject = subject;
    if (unit && unit !== 'all' && unit !== 'undefined' && unit !== 'General') where.unit = unit;

    const materials = await Material.findAll({
      where,
      attributes: ['id', 'title', 'description', 'type', 'subject', 'gradeLevel', 'unit', 'fileUrl', 'linkUrl', 'downloads', 'views', 'department', 'createdAt', 'youtubeLinks'],
      order: [['gradeLevel', 'ASC'], ['unit', 'ASC'], ['createdAt', 'DESC']]
    });

    res.json({ success: true, data: { materials: materials || [] } });
  } catch (error) {
    console.error('Error fetching materials:', error);
    res.json({ success: true, data: { materials: [] } });
  }
});

// ============================================
// GET QUIZZES
// ============================================
router.get('/quizzes', authorize('student'), async (req, res) => {
  try {
    const student = await Student.findOne({ where: { userId: req.user.id } });
    if (!student) return res.json({ success: true, data: { quizzes: [] } });

    const studentGrade = student.gradeLevel;
    const visibleGrades = getVisibleGrades(studentGrade);
    const { subject, gradeLevel, unit } = req.query;
    let targetGrade = gradeLevel ? parseInt(gradeLevel) : null;

    if (targetGrade && !visibleGrades.includes(targetGrade)) {
      return res.json({ success: true, data: { quizzes: [] } });
    }

    const gradesToCheck = targetGrade ? [targetGrade] : visibleGrades;

    const where = {
      status: 'published',
      type: 'quiz',
      gradeLevel: { [Op.in]: gradesToCheck },
      [Op.or]: [{ department: student.department }, { department: 'Both' }]
    };

    if (subject && subject !== 'all' && subject !== 'undefined') where.subject = subject;
    if (unit && unit !== 'all' && unit !== 'undefined' && unit !== 'General') where.unit = unit;

    const quizzes = await Exam.findAll({
      where,
      attributes: ['id', 'title', 'subject', 'duration', 'totalMarks', 'passingMarks', 'type', 'unit', 'gradeLevel', 'description'],
      order: [['gradeLevel', 'ASC'], ['unit', 'ASC'], ['createdAt', 'DESC']]
    });

    res.json({ success: true, data: { quizzes: quizzes || [] } });
  } catch (error) {
    console.error('Error fetching quizzes:', error);
    res.json({ success: true, data: { quizzes: [] } });
  }
});

// ============================================
// GET AVAILABLE UNITS
// ============================================
router.get('/available-units', authorize('student'), async (req, res) => {
  try {
    const student = await Student.findOne({ where: { userId: req.user.id } });
    if (!student) return res.status(404).json({ success: false, error: 'Student not found' });

    const { subject, gradeLevel } = req.query;
    if (!subject || !gradeLevel) {
      return res.status(400).json({ success: false, error: 'Subject and gradeLevel are required' });
    }

    const studentGrade = student.gradeLevel;
    const visibleGrades = getVisibleGrades(studentGrade);
    const targetGrade = parseInt(gradeLevel);

    if (!visibleGrades.includes(targetGrade)) {
      return res.status(403).json({ success: false, error: `Grade ${targetGrade} content is not available for you` });
    }

    const [unitsWithMaterials] = await sequelize.query(`
      SELECT DISTINCT unit FROM "Materials"
      WHERE subject = $1 AND status = 'published' AND "gradeLevel" = $2
        AND (department = $3 OR department = 'Both')
        AND unit IS NOT NULL AND unit != '' AND unit != 'General'
      ORDER BY unit ASC
    `, { bind: [subject, targetGrade.toString(), student.department] });

    const [unitsWithQuizzes] = await sequelize.query(`
      SELECT DISTINCT unit FROM "Exams"
      WHERE subject = $1 AND status = 'published' AND type = 'quiz' AND "gradeLevel" = $2
        AND (department = $3 OR department = 'Both')
        AND unit IS NOT NULL AND unit != '' AND unit != 'General'
      ORDER BY unit ASC
    `, { bind: [subject, targetGrade.toString(), student.department] });

    const unitsSet = new Set();
    unitsWithMaterials.forEach(u => { if (u.unit) unitsSet.add(u.unit); });
    unitsWithQuizzes.forEach(u => { if (u.unit) unitsSet.add(u.unit); });

    const availableUnits = Array.from(unitsSet).sort((a, b) => {
      const numA = parseInt(a.split(' ')[1]) || 0;
      const numB = parseInt(b.split(' ')[1]) || 0;
      return numA - numB;
    });

    res.json({ success: true, data: { subject, gradeLevel: targetGrade, availableUnits, studentGrade } });
  } catch (error) {
    console.error('Error fetching units:', error);
    res.status(500).json({ success: false, error: error.message, data: { availableUnits: [] } });
  }
});

// ============================================
// GET AVAILABLE GRADES
// ============================================
router.get('/available-grades', authorize('student'), async (req, res) => {
  try {
    const student = await Student.findOne({ where: { userId: req.user.id } });
    if (!student) return res.status(404).json({ success: false, error: 'Student not found' });

    const { subject, studentGrade } = req.query;
    const targetStudentGrade = parseInt(studentGrade) || student.gradeLevel;
    const visibleGrades = getVisibleGrades(targetStudentGrade);

    const availableGrades = [];

    for (const grade of visibleGrades) {
      const [materialCount] = await sequelize.query(`
        SELECT COUNT(*) FROM "Materials" 
        WHERE subject = $1 AND status = 'published' 
        AND "gradeLevel" = $2
        AND (department = $3 OR department = 'Both')
      `, { bind: [subject, grade.toString(), student.department] });

      const [quizCount] = await sequelize.query(`
        SELECT COUNT(*) FROM "Exams" 
        WHERE subject = $1 AND status = 'published' AND type = 'quiz'
        AND "gradeLevel" = $2
        AND (department = $3 OR department = 'Both')
      `, { bind: [subject, grade.toString(), student.department] });

      const materialCountValue = parseInt(materialCount[0]?.count || 0);
      const quizCountValue = parseInt(quizCount[0]?.count || 0);

      if (materialCountValue > 0 || quizCountValue > 0) {
        availableGrades.push({
          grade: grade,
          materialCount: materialCountValue,
          quizCount: quizCountValue
        });
      }
    }

    res.json({ success: true, data: { availableGrades } });
  } catch (error) {
    console.error('Error fetching available grades:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// GET SUBJECTS WITH CONTENT (for Materials tab)
// ============================================
router.get('/subjects-with-content', authorize('student'), async (req, res) => {
  try {
    const student = await Student.findOne({ where: { userId: req.user.id } });
    if (!student) return res.status(404).json({ success: false, error: 'Student not found' });

    const studentGrade = student.gradeLevel;
    const visibleGrades = getVisibleGrades(studentGrade);

    const subjectsList = [];

    let subjects = [];
    if (student.department === 'Natural Science') {
      subjects = ['Biology', 'Chemistry', 'Physics', 'Mathematics', 'English', 'Citizenship Education'];
    } else {
      subjects = ['History', 'Geography', 'Economics', 'Mathematics', 'English', 'Citizenship Education'];
    }

    for (const subject of subjects) {
      let materialCount = 0;
      let quizCount = 0;

      for (const grade of visibleGrades) {
        const [matCount] = await sequelize.query(`
          SELECT COUNT(*) FROM "Materials" 
          WHERE subject = $1 AND status = 'published' AND "gradeLevel" = $2
          AND (department = $3 OR department = 'Both')
        `, { bind: [subject, grade.toString(), student.department] });
        materialCount += parseInt(matCount[0]?.count || 0);

        const [qzCount] = await sequelize.query(`
          SELECT COUNT(*) FROM "Exams" 
          WHERE subject = $1 AND status = 'published' AND type = 'quiz' AND "gradeLevel" = $2
          AND (department = $3 OR department = 'Both')
        `, { bind: [subject, grade.toString(), student.department] });
        quizCount += parseInt(qzCount[0]?.count || 0);
      }

      subjectsList.push({
        name: subject,
        materialCount: materialCount,
        quizCount: quizCount,
        isScholasticAptitude: false
      });
    }

    // Add Scholastic Aptitude for materials (Grade 12 only)
    if (studentGrade === 12) {
      const saEnglishSubject = 'Scholastic Aptitude - English Part';
      const saMathSubject = 'Scholastic Aptitude - Mathematics Part';

      const [engMaterialCount] = await sequelize.query(`
        SELECT COUNT(*) FROM "Materials" 
        WHERE subject = $1 AND status = 'published' AND "gradeLevel" = '12'
      `, { bind: [saEnglishSubject] });

      const [engQuizCount] = await sequelize.query(`
        SELECT COUNT(*) FROM "Exams" 
        WHERE subject = $1 AND status = 'published' AND type = 'quiz' AND "gradeLevel" = '12'
      `, { bind: [saEnglishSubject] });

      const [mathMaterialCount] = await sequelize.query(`
        SELECT COUNT(*) FROM "Materials" 
        WHERE subject = $1 AND status = 'published' AND "gradeLevel" = '12'
      `, { bind: [saMathSubject] });

      const [mathQuizCount] = await sequelize.query(`
        SELECT COUNT(*) FROM "Exams" 
        WHERE subject = $1 AND status = 'published' AND type = 'quiz' AND "gradeLevel" = '12'
      `, { bind: [saMathSubject] });

      const hasEnglish = parseInt(engMaterialCount[0]?.count || 0) > 0 || parseInt(engQuizCount[0]?.count || 0) > 0;
      const hasMath = parseInt(mathMaterialCount[0]?.count || 0) > 0 || parseInt(mathQuizCount[0]?.count || 0) > 0;

      if (hasEnglish || hasMath) {
        subjectsList.push({
          name: 'Scholastic Aptitude',
          materialCount: (parseInt(engMaterialCount[0]?.count || 0) + parseInt(mathMaterialCount[0]?.count || 0)),
          quizCount: (parseInt(engQuizCount[0]?.count || 0) + parseInt(mathQuizCount[0]?.count || 0)),
          isScholasticAptitude: true,
          parts: []
        });

        if (hasEnglish) {
          subjectsList[subjectsList.length - 1].parts.push({
            name: saEnglishSubject,
            shortName: 'English Part',
            icon: '📖',
            materialCount: parseInt(engMaterialCount[0]?.count || 0),
            quizCount: parseInt(engQuizCount[0]?.count || 0)
          });
        }
        if (hasMath) {
          subjectsList[subjectsList.length - 1].parts.push({
            name: saMathSubject,
            shortName: 'Mathematics Part',
            icon: '🧮',
            materialCount: parseInt(mathMaterialCount[0]?.count || 0),
            quizCount: parseInt(mathQuizCount[0]?.count || 0)
          });
        }
      }
    }

    const filteredSubjects = subjectsList.filter(s => s.materialCount > 0 || s.quizCount > 0);
    res.json({ success: true, data: { subjects: filteredSubjects, studentGrade } });
  } catch (error) {
    console.error('Error fetching subjects with content:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// GET TEACHERS LIST FOR STUDENT FEEDBACK
// ============================================
router.get('/teachers', authorize('student'), async (req, res) => {
  try {
    const student = await Student.findOne({ where: { userId: req.user.id } });
    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }

    const [teachers] = await sequelize.query(`
      SELECT 
        t.id as teacher_id,
        t."userId",
        u.name as teacher_name,
        u."fatherName",
        u."grandfatherName",
        u.email,
        t.specialization,
        t.department,
        t.qualification,
        t.status
      FROM "Teachers" t
      INNER JOIN "Users" u ON t."userId" = u.id
      WHERE u.status = 'active'
      ORDER BY u.name ASC
    `);

    res.json({ success: true, data: teachers });
  } catch (error) {
    console.error('Error fetching teachers:', error);
    res.status(500).json({ success: false, error: error.message, data: [] });
  }
});

// ============================================
// SEND FEEDBACK TO TEACHER
// ============================================
router.post('/send-feedback-to-teacher', authorize('student'), async (req, res) => {
  try {
    const student = await Student.findOne({ where: { userId: req.user.id } });
    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }

    const { teacherId, subject, message, rating } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }

    if (!teacherId) {
      return res.status(400).json({ success: false, error: 'Teacher ID is required' });
    }

    const [teacher] = await sequelize.query(`
      SELECT t.id, t."userId" as teacher_user_id, u.name as teacher_name, t.specialization, u.email as teacher_email
      FROM "Teachers" t
      INNER JOIN "Users" u ON t."userId" = u.id
      WHERE t.id = $1 AND u.status = 'active'
    `, { bind: [teacherId] });

    if (!teacher[0]) {
      return res.status(404).json({ success: false, error: 'Teacher not found or inactive' });
    }

    await sequelize.query(`
      INSERT INTO "Feedbacks" (
        "userId", "teacherId", "studentName", "studentEmail", "subject", 
        "message", "category", "rating", "status", "createdAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, 'teacher_feedback', $7, 'pending', NOW())
    `, {
      bind: [
        req.user.id,
        teacherId,
        req.user.name,
        req.user.email,
        subject || teacher[0].specialization,
        message.trim(),
        rating || null
      ]
    });

    await sequelize.query(`
      INSERT INTO "Notifications" ("userId", title, message, type, metadata, "isRead", "createdAt")
      VALUES ($1, $2, $3, 'feedback_received', $4, false, NOW())
    `, {
      bind: [
        teacher[0].teacher_user_id,
        '💬 New Feedback from Student',
        `Student ${req.user.name} sent you feedback`,
        JSON.stringify({
          from: req.user.id,
          fromName: req.user.name,
          fromRole: 'student',
          studentName: req.user.name,
          studentId: student.id,
          subject: subject || teacher[0].specialization,
          rating: rating || null,
          message: message.trim(),
          timestamp: new Date().toISOString()
        })
      ]
    });

    res.json({ success: true, message: 'Feedback sent to teacher successfully' });
  } catch (error) {
    console.error('Send feedback error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// GET STUDENT'S FEEDBACK HISTORY
// ============================================
router.get('/my-feedback', authorize('student'), async (req, res) => {
  try {
    const student = await Student.findOne({ where: { userId: req.user.id } });
    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found' });
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
        t.id as teacher_id,
        u.name as teacher_name
      FROM "Feedbacks" f
      LEFT JOIN "Teachers" t ON f."teacherId" = t.id
      LEFT JOIN "Users" u ON t."userId" = u.id
      WHERE f."userId" = $1 AND f.category = 'teacher_feedback'
      ORDER BY f."createdAt" DESC
    `, { bind: [req.user.id] });

    res.json({ success: true, data: feedback });
  } catch (error) {
    console.error('Error fetching feedback history:', error);
    res.status(500).json({ success: false, error: error.message, data: [] });
  }
});

// ============================================
// NOTIFICATION ENDPOINTS
// ============================================
router.get('/notifications', authorize('student'), async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const notifications = await NotificationService.getUserNotifications(req.user.id, parseInt(limit), parseInt(offset));
    res.json({ success: true, data: notifications });
  } catch (error) {
    console.error('Error getting notifications:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/notifications/unread-count', authorize('student'), async (req, res) => {
  try {
    const count = await NotificationService.getUnreadCount(req.user.id);
    res.json({ success: true, data: { count } });
  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/notifications/mark-all-read', authorize('student'), async (req, res) => {
  try {
    await NotificationService.markAllAsRead(req.user.id);
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Error marking all as read:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/notifications/:id/read', authorize('student'), async (req, res) => {
  try {
    await NotificationService.markAsRead(req.user.id, req.params.id);
    res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/notifications/clear-all', authorize('student'), async (req, res) => {
  try {
    await NotificationService.clearAllNotifications(req.user.id);
    res.json({ success: true, message: 'All notifications cleared' });
  } catch (error) {
    console.error('Error clearing notifications:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// GET SUBJECTS STATS (for StudentSubjects component)
// ============================================
// GET SUBJECTS STATS (for StudentSubjects component)
// ============================================
router.get('/subjects-stats', authorize('student'), async (req, res) => {
  try {
    const student = await Student.findOne({ where: { userId: req.user.id } });
    if (!student) return res.json({ success: true, data: {} });

    const studentGrade = student.gradeLevel;
    const visibleGrades = getVisibleGrades(studentGrade);

    const subjects = ['Biology', 'Chemistry', 'Physics', 'History', 'Geography', 'Economics', 'Mathematics', 'English', 'Citizenship Education'];
    const subjectsStats = {};

    for (const subject of subjects) {
      let materialCount = 0;
      let totalExams = 0;
      let completedExams = 0;
      let totalScore = 0;
      let examAttempts = 0;

      for (const grade of visibleGrades) {
        // Count materials
        const [matCount] = await sequelize.query(`
          SELECT COUNT(*) FROM "Materials" 
          WHERE subject = $1 AND status = 'published' AND "gradeLevel" = $2
          AND (department = $3 OR department = 'Both')
        `, { bind: [subject, grade.toString(), student.department] });
        materialCount += parseInt(matCount[0]?.count || 0);

        // Count total exams (all types)
        const [examCount] = await sequelize.query(`
          SELECT COUNT(*) FROM "Exams" 
          WHERE subject = $1 AND status = 'published' AND "gradeLevel" = $2
          AND (department = $3 OR department = 'Both')
        `, { bind: [subject, grade.toString(), student.department] });
        totalExams += parseInt(examCount[0]?.count || 0);

        // Count completed exams and get scores
        const [attemptData] = await sequelize.query(`
          SELECT COUNT(*) as completed_count, AVG(score) as avg_score, SUM(score) as total_score
          FROM "ExamAttempts" ea
          JOIN "Exams" e ON ea."examId" = e.id
          WHERE ea."studentId" = $1 AND e.subject = $2 AND e."gradeLevel" = $3
          AND e.status = 'published' AND ea.status = 'completed'
          AND (e.department = $4 OR e.department = 'Both')
        `, { bind: [student.id, subject, grade.toString(), student.department] });

        const attemptResult = attemptData[0];
        if (attemptResult) {
          completedExams += parseInt(attemptResult.completed_count || 0);
          if (attemptResult.total_score) {
            totalScore += parseFloat(attemptResult.total_score);
            examAttempts += parseInt(attemptResult.completed_count || 0);
          }
        }
      }

      // Calculate average score
      const averageScore = examAttempts > 0 ? Math.round(totalScore / examAttempts) : 0;

      // Only include subjects that have content or exams
      if (materialCount > 0 || totalExams > 0) {
        subjectsStats[subject] = {
          totalExams,
          completedExams,
          averageScore,
          materialsCount: materialCount
        };
      }
    }

    res.json({ success: true, data: subjectsStats });
  } catch (error) {
    console.error('Error fetching subjects stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;