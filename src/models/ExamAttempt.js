// backend/src/models/ExamAttempt.js
// FIXED - CamelCase table name with quotes

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ExamAttempt = sequelize.define('ExamAttempt', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  examId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'examId',
    references: { model: '"Exams"', key: 'id' },  // ← FIXED: quoted camelCase
  },
  studentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'studentId',
    references: { model: '"Students"', key: 'id' },  // ← FIXED: quoted camelCase
  },
  startedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'startedAt',
  },
  submittedAt: {
    type: DataTypes.DATE,
    field: 'submittedAt',
  },
  answers: {
    type: DataTypes.JSONB,
    field: 'answers',
  },
  score: {
    type: DataTypes.INTEGER,
    field: 'score',
  },
  totalMarks: {
    type: DataTypes.INTEGER,
    field: 'totalMarks',
  },
  status: {
    type: DataTypes.STRING(50),
    defaultValue: 'in_progress',
    field: 'status',
  },
}, {
  tableName: '"ExamAttempts"',  // ← FIXED: quoted camelCase
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: false,
});

module.exports = ExamAttempt;