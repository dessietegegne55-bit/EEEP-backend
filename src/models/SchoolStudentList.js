// backend/src/models/SchoolStudentList.js

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const SchoolStudentList = sequelize.define('SchoolStudentList', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  schoolId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'schools', key: 'id' },
  },
  schoolName: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  studentFirstName: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  studentMiddleName: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  studentLastName: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  studentIdNumber: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  gradeLevel: {
    type: DataTypes.INTEGER,
    validate: { min: 9, max: 12 },
  },
  department: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  sex: {
    type: DataTypes.STRING(10),
    allowNull: true,
  },
  fileId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  status: {
    type: DataTypes.STRING(50),
    defaultValue: 'active',
  },
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
  },
}, {
  tableName: 'school_student_lists',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  indexes: [{ unique: true, fields: ['schoolId', 'studentIdNumber'] }],
});

module.exports = SchoolStudentList;