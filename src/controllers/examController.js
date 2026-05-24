// backend/src/controllers/examController.js
// COMPLETE FIXED VERSION - Proper getExamResult for frontend

const { Exam, Question, ExamAttempt, Student, User, Subject, Teacher } = require('../models');
const { Op } = require('sequelize');
const { createError } = require('../middleware/errorHandler');
const { sequelize } = require('../config/database');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Helper function to get full name
const getFullName = (user) => {
  if (!user) return 'Unknown';
  return `${user.name || ''} ${user.fatherName || ''} ${user.grandfatherName || ''}`.trim().replace(/\s+/g, ' ') || 'User';
};

// ===========================================
// GET PUBLIC EXAMS (Published only)
// ===========================================
const getExams = async (req, res, next) => {
  try {
    const { type, subject, department, gradeLevel, limit = 20, page = 1 } = req.query;

    const where = { status: 'published' };
    if (type) where.type = type;
    if (subject) where.subject = subject;
    if (department) where.department = department;
    if (gradeLevel) where.gradeLevel = gradeLevel;

    const exams = await Exam.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      order: [['createdAt', 'DESC']],
      include: [{ model: Subject, as: 'subjectInfo', attributes: ['id', 'name', 'department'] }]
    });

    res.json({
      success: true,
      data: {
        exams: exams.rows,
        total: exams.count,
        page: parseInt(page),
        totalPages: Math.ceil(exams.count / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get exams error:', error);
    next(error);
  }
};

// ===========================================
// GET PAST EXAMS
// ===========================================
const getPastExams = async (req, res, next) => {
  try {
    const exams = await Exam.findAll({
      where: { type: 'past', status: 'published' },
      order: [['year', 'DESC']],
      include: [{ model: Subject, as: 'subjectInfo' }]
    });
    res.json({ success: true, data: exams });
  } catch (error) {
    next(error);
  }
};

// ===========================================
// GET MODEL EXAMS
// ===========================================
const getModelExams = async (req, res, next) => {
  try {
    const exams = await Exam.findAll({
      where: { type: 'model', status: 'published' },
      order: [['createdAt', 'DESC']],
      include: [{ model: Subject, as: 'subjectInfo' }]
    });
    res.json({ success: true, data: exams });
  } catch (error) {
    next(error);
  }
};

// ===========================================
// GET MOCK EXAMS
// ===========================================
const getMockExams = async (req, res, next) => {
  try {
    const exams = await Exam.findAll({
      where: { type: 'mock', status: 'published' },
      order: [['createdAt', 'DESC']],
      include: [{ model: Subject, as: 'subjectInfo' }]
    });
    res.json({ success: true, data: exams });
  } catch (error) {
    next(error);
  }
};

// ===========================================
// GET QUIZZES
// ===========================================
const getQuizzes = async (req, res, next) => {
  try {
    const exams = await Exam.findAll({
      where: { type: 'quiz', status: 'published' },
      order: [['createdAt', 'DESC']],
      include: [{ model: Subject, as: 'subjectInfo' }]
    });
    res.json({ success: true, data: exams });
  } catch (error) {
    next(error);
  }
};

// ===========================================
// GET EXAM BY ID
// ===========================================
const getExamById = async (req, res, next) => {
  try {
    const exam = await Exam.findByPk(req.params.id, {
      include: [
        { model: Subject, as: 'subjectInfo' },
        { model: Question, as: 'questions', order: [['orderIndex', 'ASC']] },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'name', 'fatherName', 'grandfatherName', 'email']
        }
      ]
    });

    if (!exam) {
      throw createError('Exam not found', 404);
    }

    const examData = exam.toJSON();
    if (examData.creator) {
      examData.creator.fullName = getFullName(examData.creator);
    }

    // Add statistics data
    const totalAttempts = await ExamAttempt.count({
      where: { examId: req.params.id, status: 'completed' }
    });

    const passedAttempts = await ExamAttempt.count({
      where: {
        examId: req.params.id,
        status: 'completed',
        score: { [Op.gte]: exam.passingMarks || (exam.totalMarks / 2) }
      }
    });

    const failedAttempts = totalAttempts - passedAttempts;

    const avgScoreResult = await ExamAttempt.findOne({
      where: { examId: req.params.id, status: 'completed' },
      attributes: [[sequelize.fn('AVG', sequelize.col('score')), 'avgScore']],
      raw: true
    });

    const passRate = totalAttempts > 0 ? ((passedAttempts / totalAttempts) * 100).toFixed(1) : 0;

    examData.attempts = {
      total: totalAttempts,
      passed: passedAttempts,
      failed: failedAttempts,
      averageScore: Math.round(avgScoreResult?.avgScore || 0),
      passRate: parseFloat(passRate)
    };

    // Log questions with images for debugging
    const questionsWithImages = examData.questions?.filter(q => q.imageUrl) || [];
    if (questionsWithImages.length > 0) {
      console.log(`📸 Exam ${examData.id} has ${questionsWithImages.length} questions with images`);
    }

    res.json({ success: true, data: examData });
  } catch (error) {
    console.error('Get exam by id error:', error);
    next(error);
  }
};

// ===========================================
// GET EXAM QUESTIONS
// ===========================================
const getExamQuestions = async (req, res, next) => {
  try {
    const questions = await Question.findAll({
      where: { examId: req.params.id },
      order: [['orderIndex', 'ASC']]
    });
    res.json({ success: true, data: questions });
  } catch (error) {
    next(error);
  }
};

// ===========================================
// GET STUDENT EXAMS (Filtered by department)
// ===========================================
const getStudentExams = async (req, res, next) => {
  try {
    const student = await Student.findOne({ where: { userId: req.user.id } });

    if (!student) {
      throw createError('Student not found', 404);
    }

    console.log(`📚 Student department: ${student.department}, Grade: ${student.gradeLevel}`);

    const exams = await Exam.findAll({
      where: {
        status: 'published',
        gradeLevel: student.gradeLevel,
        [Op.or]: [
          { department: student.department },
          { department: 'Both' }
        ]
      },
      order: [['createdAt', 'DESC']],
      include: [{ model: Subject, as: 'subjectInfo' }]
    });

    console.log(`✅ Found ${exams.length} exams for ${student.department} student`);

    res.json({
      success: true,
      data: {
        exams: exams,
        total: exams.length
      }
    });
  } catch (error) {
    console.error('Get student exams error:', error);
    next(error);
  }
};

// ===========================================
// GET TEACHER EXAMS - FIXED (Queries Exams table)
// ===========================================
const getTeacherExams = async (req, res, next) => {
  try {
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
    const isEnglishTeacher = teacherSubject === 'English';
    const isMathTeacher = teacherSubject === 'Mathematics';

    let allowedSubjects = [teacherSubject];

    if (isEnglishTeacher) {
      allowedSubjects.push('Scholastic Aptitude - English Part');
    }
    if (isMathTeacher) {
      allowedSubjects.push('Scholastic Aptitude - Mathematics Part');
    }

    console.log(`📚 Fetching exams for teacher: ${teacherSubject}`);
    console.log(`   Allowed subjects: ${allowedSubjects.join(', ')}`);

    const exams = await Exam.findAll({
      where: {
        createdBy: req.user.id,
        subject: { [Op.in]: allowedSubjects }
      },
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'title', 'description', 'type', 'duration', 'totalMarks', 'passingMarks', 'status', 'gradeLevel', 'subject', 'unit', 'year', 'schoolName', 'createdAt', 'updatedAt']
    });

    console.log(`✅ Found ${exams.length} exams in Exams table for ${teacherSubject}`);

    res.json({
      success: true,
      data: { exams: exams || [] }
    });
  } catch (error) {
    console.error('Error fetching teacher exams:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message },
      data: { exams: [] }
    });
  }
};

// ===========================================
// CREATE EXAM
// ===========================================
const createExam = async (req, res, next) => {
  try {
    const {
      title, description, type, subject, department, duration,
      totalMarks, passingMarks, gradeLevel, year, schoolName, unit, instructions
    } = req.body;

    const exam = await Exam.create({
      title,
      description,
      type,
      subject,
      department: department || 'Both',
      duration: parseInt(duration),
      totalMarks: parseInt(totalMarks),
      passingMarks: parseInt(passingMarks),
      gradeLevel: gradeLevel || 12,
      year: year || null,
      schoolName: schoolName || null,
      unit: unit || null,
      instructions: instructions || null,
      status: 'draft',
      createdBy: req.user.id
    });

    if (req.file) {
      exam.fileUrl = `/uploads/exams/${req.file.filename}`;
      await exam.save();
    }

    res.status(201).json({
      success: true,
      data: exam,
      message: 'Exam created as draft. Publish it to make it visible to students.'
    });
  } catch (error) {
    console.error('Create exam error:', error);
    next(error);
  }
};

// ===========================================
// UPLOAD EXAM FILE
// ===========================================
const uploadExamFile = async (req, res, next) => {
  try {
    const examId = req.params.id;
    const exam = await Exam.findByPk(examId);

    if (!exam) {
      throw createError('Exam not found', 404);
    }

    if (exam.createdBy !== req.user.id && req.user.role !== 'superadmin' && req.user.role !== 'subadmin') {
      throw createError('You are not authorized to upload files for this exam', 403);
    }

    if (!req.file) {
      throw createError('No file uploaded', 400);
    }

    exam.fileUrl = `/uploads/exams/${req.file.filename}`;
    await exam.save();

    res.json({
      success: true,
      data: { fileUrl: exam.fileUrl, filename: req.file.originalname },
      message: 'Exam file uploaded successfully'
    });
  } catch (error) {
    console.error('Upload exam file error:', error);
    next(error);
  }
};

// ===========================================
// EXPORT EXAM AS PDF
// ===========================================
const exportExamAsPDF = async (req, res, next) => {
  try {
    const exam = await Exam.findByPk(req.params.id, {
      include: [
        { model: Subject, as: 'subjectInfo' },
        { model: Question, as: 'questions', order: [['orderIndex', 'ASC']] }
      ]
    });

    if (!exam) {
      throw createError('Exam not found', 404);
    }

    if (exam.createdBy !== req.user.id && !['superadmin', 'subadmin'].includes(req.user.role)) {
      throw createError('You do not have permission to export this exam', 403);
    }

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${exam.title.replace(/[^a-z0-9]/gi, '_')}.pdf"`);
    doc.pipe(res);

    doc.fontSize(20).font('Helvetica-Bold').text(exam.title, { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).font('Helvetica');
    doc.rect(50, doc.y, 495, 80).stroke();
    doc.text(`Subject: ${exam.subject}`, 60, doc.y - 70);
    doc.text(`Type: ${exam.type.toUpperCase()}`, 60, doc.y - 55);
    doc.text(`Duration: ${exam.duration} minutes`, 60, doc.y - 40);
    doc.text(`Total Marks: ${exam.totalMarks}`, 60, doc.y - 25);
    doc.text(`Passing Marks: ${exam.passingMarks}`, 300, doc.y - 70);
    doc.text(`Department: ${exam.department || 'Both'}`, 300, doc.y - 55);
    if (exam.gradeLevel) doc.text(`Grade Level: ${exam.gradeLevel}`, 300, doc.y - 40);
    if (exam.year) doc.text(`Year: ${exam.year}`, 300, doc.y - 25);
    doc.moveDown(3);

    if (exam.instructions) {
      doc.fontSize(12).font('Helvetica-Bold').text('Instructions:', { underline: true });
      doc.fontSize(10).font('Helvetica').text(exam.instructions, { lineGap: 5 });
      doc.moveDown();
    }

    doc.fontSize(14).font('Helvetica-Bold').text('Questions:', { underline: true });
    doc.moveDown(0.5);

    const questions = exam.questions || [];

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      doc.fontSize(11).font('Helvetica-Bold').text(`Question ${i + 1} (${q.marks} mark${q.marks > 1 ? 's' : ''}):`);
      doc.fontSize(10).font('Helvetica').text(q.questionText, { indent: 10, lineGap: 3 });
      doc.moveDown(0.3);

      if (q.questionType === 'multipleChoice' && q.options && q.options.length > 0) {
        const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
        q.options.forEach((opt, idx) => { doc.text(`${letters[idx]}. ${opt}`, { indent: 15 }); });
        doc.moveDown(0.3);
        doc.font('Helvetica-Bold').text(`Correct Answer: ${q.correctAnswer}`, { indent: 10 });
      }

      if (q.questionType === 'trueFalse') {
        doc.text('A. True', { indent: 15 });
        doc.text('B. False', { indent: 15 });
        doc.moveDown(0.3);
        doc.font('Helvetica-Bold').text(`Correct Answer: ${q.correctAnswer}`, { indent: 10 });
      }

      if (q.questionType === 'fillBlank') {
        doc.text('Answer: _______________', { indent: 15 });
        doc.moveDown(0.3);
        doc.font('Helvetica-Bold').text(`Correct Answer: ${q.correctAnswer}`, { indent: 10 });
      }

      if (q.questionType === 'workOut') {
        doc.text('Answer: _________________________________________', { indent: 15 });
        doc.text('_________________________________________', { indent: 15 });
      }

      if (q.explanation) {
        doc.moveDown(0.2);
        doc.font('Helvetica-Oblique').fontSize(9).text(`💡 Explanation: ${q.explanation}`, { indent: 10 });
      }
      doc.moveDown(0.8);
      if ((i + 1) % 5 === 0 && i !== questions.length - 1) {
        doc.addPage();
        doc.fontSize(14).font('Helvetica-Bold').text('Questions (continued):', { underline: true });
        doc.moveDown(0.5);
      }
    }

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).font('Helvetica');
      doc.text(`EEEP Exam - ${new Date().toLocaleDateString()}`, 50, doc.page.height - 30, { align: 'center' });
      doc.text(`Page ${i + 1} of ${pageCount}`, 50, doc.page.height - 20, { align: 'center' });
    }
    doc.end();
  } catch (error) {
    console.error('Export PDF error:', error);
    next(error);
  }
};

// ===========================================
// GET EXAM STATISTICS
// ===========================================
const getExamStatistics = async (req, res, next) => {
  try {
    const examId = req.params.id;
    const exam = await Exam.findOne({ where: { id: examId, createdBy: req.user.id } });

    if (!exam) {
      return res.status(404).json({ success: false, error: { message: 'Exam not found or you do not have permission' } });
    }

    const totalAttempts = await ExamAttempt.count({ where: { examId: examId, status: 'completed' } });
    const passedAttempts = await ExamAttempt.count({ where: { examId: examId, status: 'completed', score: { [Op.gte]: exam.passingMarks } } });
    const failedAttempts = totalAttempts - passedAttempts;
    const avgScoreResult = await ExamAttempt.findOne({ where: { examId: examId, status: 'completed' }, attributes: [[sequelize.fn('AVG', sequelize.col('score')), 'avgScore']], raw: true });
    const passRate = totalAttempts > 0 ? ((passedAttempts / totalAttempts) * 100).toFixed(1) : 0;

    res.json({
      success: true,
      data: { totalAttempts, passedAttempts, failedAttempts, averageScore: Math.round(avgScoreResult?.avgScore || 0), passRate: parseFloat(passRate) }
    });
  } catch (error) {
    console.error('Get exam statistics error:', error);
    next(error);
  }
};

// ===========================================
// ADD QUESTIONS TO EXAM
// ===========================================
const addQuestions = async (req, res, next) => {
  try {
    const { questions } = req.body;
    const examId = req.params.id;
    const exam = await Exam.findByPk(examId);
    if (!exam) throw createError('Exam not found', 404);

    await Question.destroy({ where: { examId } });
    const createdQuestions = [];
    for (const q of questions) {
      console.log(`📝 Adding question ${q.orderIndex} with imageUrl:`, q.imageUrl || 'No image');
      const question = await Question.create({
        examId, questionText: q.questionText, questionType: q.questionType || 'multipleChoice',
        options: q.options || null, correctAnswer: q.correctAnswer, marks: q.marks || 1,
        orderIndex: q.orderIndex, explanation: q.explanation || '', imageUrl: q.imageUrl || null
      });
      createdQuestions.push(question);
    }
    console.log(`✅ ${createdQuestions.length} questions added to exam ${examId}`);
    res.json({ success: true, data: createdQuestions, message: `${createdQuestions.length} questions added successfully` });
  } catch (error) {
    console.error('Add questions error:', error);
    next(error);
  }
};

// ===========================================
// UPLOAD QUESTION IMAGE
// ===========================================
const uploadQuestionImage = async (req, res, next) => {
  try {
    console.log('📸 uploadQuestionImage called');
    console.log('📸 Exam ID:', req.params.id);
    console.log('📸 File received:', req.file ? 'YES' : 'NO');

    if (req.file) {
      console.log('📸 File details:', {
        fieldname: req.file.fieldname,
        originalname: req.file.originalname,
        filename: req.file.filename,
        size: req.file.size,
        mimetype: req.file.mimetype,
        destination: req.file.destination,
        path: req.file.path
      });
    }

    if (!req.file) {
      console.error('❌ No file in request');
      throw createError('No image file uploaded', 400);
    }

    // Return relative path WITHOUT leading slash (consistent with materials and ID photos)
    const imageUrl = `uploads/question-images/${req.file.filename}`;

    console.log('✅ Question image uploaded successfully:', imageUrl);

    res.json({
      success: true,
      data: { imageUrl },
      message: 'Question image uploaded successfully'
    });
  } catch (error) {
    console.error('❌ Upload question image error:', error);
    next(error);
  }
};

// ===========================================
// UPDATE EXAM
// ===========================================
const updateExam = async (req, res, next) => {
  try {
    const exam = await Exam.findByPk(req.params.id);
    if (!exam) throw createError('Exam not found', 404);
    await exam.update(req.body);
    res.json({ success: true, data: exam, message: 'Exam updated successfully' });
  } catch (error) { next(error); }
};

// ===========================================
// PUBLISH EXAM
// ===========================================
const publishExam = async (req, res, next) => {
  try {
    const exam = await Exam.findByPk(req.params.id);
    if (!exam) throw createError('Exam not found', 404);
    await exam.update({ status: 'published' });
    res.json({ success: true, message: 'Exam published successfully' });
  } catch (error) { next(error); }
};

// ===========================================
// ARCHIVE EXAM
// ===========================================
const archiveExam = async (req, res, next) => {
  try {
    const exam = await Exam.findByPk(req.params.id);
    if (!exam) throw createError('Exam not found', 404);
    await exam.update({ status: 'archived' });
    res.json({ success: true, message: 'Exam archived successfully' });
  } catch (error) { next(error); }
};

// ===========================================
// DELETE EXAM
// ===========================================
const deleteExam = async (req, res, next) => {
  try {
    const exam = await Exam.findByPk(req.params.id);
    if (!exam) throw createError('Exam not found', 404);
    await exam.destroy();
    res.json({ success: true, message: 'Exam deleted successfully' });
  } catch (error) { next(error); }
};

// ===========================================
// UPDATE QUESTION
// ===========================================
const updateQuestion = async (req, res, next) => {
  try {
    const question = await Question.findByPk(req.params.questionId);
    if (!question) throw createError('Question not found', 404);
    await question.update(req.body);
    res.json({ success: true, data: question });
  } catch (error) { next(error); }
};

// ===========================================
// DELETE QUESTION
// ===========================================
const deleteQuestion = async (req, res, next) => {
  try {
    const question = await Question.findByPk(req.params.questionId);
    if (!question) throw createError('Question not found', 404);
    await question.destroy();
    res.json({ success: true, message: 'Question deleted successfully' });
  } catch (error) { next(error); }
};

// ===========================================
// START EXAM
// ===========================================
const startExam = async (req, res, next) => {
  try {
    const exam = await Exam.findByPk(req.params.id);
    if (!exam) throw createError('Exam not found', 404);

    const student = await Student.findOne({ where: { userId: req.user.id } });
    if (!student) throw createError('Student not found', 404);

    let attempt = await ExamAttempt.findOne({ where: { examId: exam.id, studentId: student.id, status: 'in_progress' } });
    if (attempt) {
      return res.json({ success: true, data: { attemptId: attempt.id, message: 'Resuming exam' } });
    }

    attempt = await ExamAttempt.create({ examId: exam.id, studentId: student.id, startedAt: new Date(), status: 'in_progress', totalMarks: exam.totalMarks });
    res.json({ success: true, data: { attemptId: attempt.id, message: 'Exam started' } });
  } catch (error) { next(error); }
};

// ===========================================
// SUBMIT EXAM
// ===========================================
const submitExam = async (req, res, next) => {
  try {
    const { answers } = req.body;
    const examId = req.params.id;
    const student = await Student.findOne({ where: { userId: req.user.id } });
    if (!student) throw createError('Student not found', 404);

    const attempt = await ExamAttempt.findOne({ where: { examId: examId, studentId: student.id, status: 'in_progress' }, include: [{ model: Exam, as: 'exam' }] });
    if (!attempt) throw createError('No active exam attempt found', 404);

    const questions = await Question.findAll({ where: { examId: attempt.examId }, order: [['orderIndex', 'ASC']] });
    let score = 0;
    const answersObject = {};

    for (const question of questions) {
      const userAnswer = answers && answers[question.id] ? answers[question.id] : '';
      const isCorrect = userAnswer.toString().toLowerCase().trim() === (question.correctAnswer || '').toString().toLowerCase().trim();
      if (isCorrect) score += question.marks;
      answersObject[question.id] = userAnswer;
    }

    await attempt.update({ answers: answersObject, score: score, submittedAt: new Date(), status: 'completed' });

    res.json({
      success: true,
      data: {
        score: score,
        totalMarks: attempt.exam.totalMarks,
        passingMarks: attempt.exam.passingMarks || attempt.exam.totalMarks / 2,
        percentage: parseFloat(((score / attempt.exam.totalMarks) * 100).toFixed(1)),
        isPassed: score >= (attempt.exam.passingMarks || attempt.exam.totalMarks / 2)
      }
    });
  } catch (error) { next(error); }
};

// ===========================================
// GET EXAM RESULT - FIXED for frontend compatibility
// ===========================================
const getExamResult = async (req, res, next) => {
  try {
    const examId = req.params.id;
    const student = await Student.findOne({ where: { userId: req.user.id } });
    if (!student) throw createError('Student not found', 404);

    const attempt = await ExamAttempt.findOne({
      where: { examId: examId, studentId: student.id, status: 'completed' },
      order: [['createdAt', 'DESC']]
    });

    if (!attempt) throw createError('Completed attempt not found', 404);

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
    next(error);
  }
};

// ===========================================
// GET USER ATTEMPTS
// ===========================================
const getUserAttempts = async (req, res, next) => {
  try {
    const student = await Student.findOne({ where: { userId: req.user.id } });
    if (!student) throw createError('Student not found', 404);

    const attempts = await ExamAttempt.findAll({
      where: { studentId: student.id },
      include: [{ model: Exam, as: 'exam', include: [{ model: Subject, as: 'subjectInfo' }] }],
      order: [['createdAt', 'DESC']]
    });
    res.json({ success: true, data: attempts });
  } catch (error) { next(error); }
};

// ===========================================
// EXPORT ALL FUNCTIONS
// ===========================================
module.exports = {
  getExams,
  getPastExams,
  getModelExams,
  getMockExams,
  getQuizzes,
  getExamById,
  getExamQuestions,
  getStudentExams,
  getTeacherExams,
  createExam,
  uploadExamFile,
  uploadQuestionImage,
  exportExamAsPDF,
  getExamStatistics,
  addQuestions,
  updateExam,
  publishExam,
  archiveExam,
  deleteExam,
  updateQuestion,
  deleteQuestion,
  startExam,
  submitExam,
  getExamResult,
  getUserAttempts
};