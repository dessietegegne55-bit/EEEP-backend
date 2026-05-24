// backend/src/controllers/subjectController.js
// FIXED - CamelCase compatible

const { Subject, Student, Teacher } = require('../models');
const { createError } = require('../middleware/errorHandler');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');

// Get all subjects
const getSubjects = async (req, res, next) => {
  try {
    const { department, gradeLevel, page = 1, limit = 50 } = req.query;

    const where = {};
    if (department) where.department = department;
    if (gradeLevel) where.gradeLevel = gradeLevel;

    const subjects = await Subject.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      order: [['gradeLevel', 'ASC'], ['name', 'ASC']]
    });

    res.json({
      success: true,
      data: {
        subjects: subjects.rows,
        total: subjects.count,
        page: parseInt(page),
        totalPages: Math.ceil(subjects.count / parseInt(limit))
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get subject by ID
const getSubjectById = async (req, res, next) => {
  try {
    const subject = await Subject.findByPk(req.params.id);

    if (!subject) {
      throw createError('Subject not found', 404);
    }

    res.json({
      success: true,
      data: subject
    });
  } catch (error) {
    next(error);
  }
};

// Create subject (admin only)
const createSubject = async (req, res, next) => {
  try {
    const { name, description, department, gradeLevel } = req.body;

    const existingSubject = await Subject.findOne({
      where: {
        name,
        department,
        gradeLevel
      }
    });

    if (existingSubject) {
      throw createError('Subject already exists for this grade and department', 400);
    }

    const subject = await Subject.create({
      name,
      description,
      department,
      gradeLevel
    });

    res.status(201).json({
      success: true,
      data: subject
    });
  } catch (error) {
    next(error);
  }
};

// Update subject
const updateSubject = async (req, res, next) => {
  try {
    const subject = await Subject.findByPk(req.params.id);

    if (!subject) {
      throw createError('Subject not found', 404);
    }

    await subject.update(req.body);

    res.json({
      success: true,
      data: subject
    });
  } catch (error) {
    next(error);
  }
};

// Delete subject
const deleteSubject = async (req, res, next) => {
  try {
    const subject = await Subject.findByPk(req.params.id);

    if (!subject) {
      throw createError('Subject not found', 404);
    }

    await subject.destroy();

    res.json({
      success: true,
      message: 'Subject deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// Get subjects for student (by department and grade)
const getStudentSubjects = async (req, res, next) => {
  try {
    const student = await Student.findOne({
      where: { userId: req.user.id }
    });

    if (!student) {
      throw createError('Student not found', 404);
    }

    const subjects = await Subject.findAll({
      where: {
        [Op.or]: [
          { department: student.department },
          { department: 'Both' }
        ],
        gradeLevel: student.gradeLevel
      },
      order: [['name', 'ASC']]
    });

    res.json({
      success: true,
      data: subjects
    });
  } catch (error) {
    next(error);
  }
};

// Get subjects for teacher (by teacher's department)
const getTeacherSubjects = async (req, res, next) => {
  try {
    const teacher = await Teacher.findOne({
      where: { userId: req.user.id }
    });

    if (!teacher) {
      throw createError('Teacher not found', 404);
    }

    const subjects = await Subject.findAll({
      where: {
        [Op.or]: [
          { department: teacher.department },
          { department: 'Both' }
        ]
      },
      order: [['gradeLevel', 'ASC'], ['name', 'ASC']]
    });

    res.json({
      success: true,
      data: subjects
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSubjects,
  getSubjectById,
  createSubject,
  updateSubject,
  deleteSubject,
  getStudentSubjects,
  getTeacherSubjects
};