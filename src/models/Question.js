// backend/src/models/Question.js
// FIXED - CamelCase table name with quotes

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Question = sequelize.define('Question', {
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
  questionText: {
    type: DataTypes.TEXT,
    allowNull: false,
    field: 'questionText',
  },
  questionType: {
    type: DataTypes.STRING(50),
    defaultValue: 'multiple_choice',
    field: 'questionType',
  },
  options: {
    type: DataTypes.JSONB,
    field: 'options',
  },
  correctAnswer: {
    type: DataTypes.TEXT,
    allowNull: false,
    field: 'correctAnswer',
  },
  marks: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    field: 'marks',
  },
  orderIndex: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'orderIndex',
  },
  explanation: {
    type: DataTypes.TEXT,
    field: 'explanation',
  },
  imageUrl: {
    type: DataTypes.TEXT,
    field: 'imageUrl',
  },
}, {
  tableName: '"Questions"',  // ← FIXED: quoted camelCase
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: false,
});

module.exports = Question;