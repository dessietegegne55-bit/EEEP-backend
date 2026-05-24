// backend/src/models/Subject.js
// ✅ Already correct

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Subject = sequelize.define('Subject', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'name'
  },
  description: {
    type: DataTypes.TEXT,
    field: 'description'
  },
  department: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'Both',
    field: 'department'
  },
  gradeLevel: {
    type: DataTypes.INTEGER,
    field: 'gradeLevel',
    validate: { min: 9, max: 12 },
  },
}, {
  tableName: '"Subjects"',  // ✅ Correct
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: false,
});

module.exports = Subject;