// backend/src/models/Exam.js
// RECONSTRUCTED EXAM MODEL - Fixed the issue where it was identical to Material.js

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Exam = sequelize.define('Exam', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'title',
  },
  description: {
    type: DataTypes.TEXT,
    field: 'description',
  },
  type: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'type',
  },
  subject: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'subject',
  },
  subjectId: {
    type: DataTypes.INTEGER,
    field: 'subjectId',
    references: { model: '"Subjects"', key: 'id' },
  },
  department: {
    type: DataTypes.STRING(50),
    field: 'department',
  },
  gradeLevel: {
    type: DataTypes.STRING(10),
    field: 'gradeLevel',
  },
  unit: {
    type: DataTypes.STRING(255),
    field: 'unit',
  },
  year: {
    type: DataTypes.INTEGER,
    field: 'year',
  },
  schoolName: {
    type: DataTypes.STRING(255),
    field: 'schoolName',
  },
  duration: {
    type: DataTypes.INTEGER,
    field: 'duration',
  },
  totalMarks: {
    type: DataTypes.INTEGER,
    field: 'totalMarks',
  },
  passingMarks: {
    type: DataTypes.INTEGER,
    field: 'passingMarks',
  },
  instructions: {
    type: DataTypes.TEXT,
    field: 'instructions',
  },
  fileUrl: {
    type: DataTypes.TEXT,
    field: 'fileUrl',
  },
  status: {
    type: DataTypes.STRING(50),
    defaultValue: 'draft',
    field: 'status',
  },
  createdBy: {
    type: DataTypes.INTEGER,
    field: 'createdBy',
    references: { model: '"Users"', key: 'id' },
  },
}, {
  tableName: '"Exams"',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
});

// Association
Exam.associate = (models) => {
  Exam.belongsTo(models.Subject, {
    foreignKey: 'subjectId',
    as: 'subjectInfo',
  });

  Exam.belongsTo(models.User, {
    foreignKey: 'createdBy',
    as: 'creator',
  });
  
  Exam.hasMany(models.Question, {
    foreignKey: 'examId',
    as: 'questions',
  });

  Exam.hasMany(models.ExamAttempt, {
    foreignKey: 'examId',
    as: 'attempts',
  });
};

module.exports = Exam;