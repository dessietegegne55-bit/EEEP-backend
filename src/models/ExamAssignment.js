// backend/src/models/ExamAssignment.js

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ExamAssignment = sequelize.define('ExamAssignment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  subjectId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  subjectName: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  schoolId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  schoolName: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  teacherId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  teacherName: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  year: {
    type: DataTypes.INTEGER,
    defaultValue: DataTypes.NOW,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  instructions: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  fileUrl: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  originalFileName: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('pending', 'completed', 'rejected'),
    defaultValue: 'pending',
  },
  examCreatedId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: '"ExamAssignments"',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
});

module.exports = ExamAssignment;