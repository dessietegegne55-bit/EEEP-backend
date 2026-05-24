// backend/src/models/Feedback.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Feedback = sequelize.define('Feedback', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    field: 'userId',
    references: { model: 'Users', key: 'id' },
    allowNull: true
  },
  teacherId: {
    type: DataTypes.INTEGER,
    field: 'teacherId',
    references: { model: 'Teachers', key: 'id' },
    allowNull: true
  },
  studentName: {
    type: DataTypes.STRING(255),
    field: 'studentName',
    allowNull: false
  },
  studentEmail: {
    type: DataTypes.STRING(255),
    field: 'studentEmail',
    allowNull: false
  },
  subject: {
    type: DataTypes.STRING(255),
    field: 'subject',
    allowNull: true
  },
  message: {
    type: DataTypes.TEXT,
    field: 'message',
    allowNull: false
  },
  category: {
    type: DataTypes.STRING(50),
    field: 'category',
    defaultValue: 'general'
  },
  rating: {
    type: DataTypes.INTEGER,
    field: 'rating',
    allowNull: true,
    validate: { min: 1, max: 5 }
  },
  status: {
    type: DataTypes.STRING(50),
    field: 'status',
    defaultValue: 'pending'
  },
  adminReply: {
    type: DataTypes.TEXT,
    field: 'adminReply',
    allowNull: true
  },
  teacherResponse: {
    type: DataTypes.TEXT,
    field: 'teacherResponse',
    allowNull: true
  }
}, {
  tableName: 'Feedbacks',
  timestamps: true
});

module.exports = Feedback;