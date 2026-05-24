// backend/src/models/Progress.js

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Progress = sequelize.define('Progress', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  studentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'students',
      key: 'id',
    },
  },
  subjectId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'subjects',
      key: 'id',
    },
  },
  totalExams: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  completedExams: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  averageScore: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0,
  },
  studyHours: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  performanceData: {
    type: DataTypes.JSONB,
  },
  lastUpdated: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'progress',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['studentId', 'subjectId'],
    },
  ],
});

module.exports = Progress;