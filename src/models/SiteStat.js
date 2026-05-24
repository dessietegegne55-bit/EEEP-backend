// backend/src/models/SiteStat.js
// Site Statistics Model for caching home page stats

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const SiteStat = sequelize.define('SiteStat', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  totalStudents: {
    type: DataTypes.INTEGER,
    field: 'totalStudents',
    defaultValue: 0
  },
  totalExams: {
    type: DataTypes.INTEGER,
    field: 'totalExams',
    defaultValue: 0
  },
  totalMaterials: {
    type: DataTypes.INTEGER,
    field: 'totalMaterials',
    defaultValue: 0
  },
  totalSchools: {
    type: DataTypes.INTEGER,
    field: 'totalSchools',
    defaultValue: 0
  },
  successRate: {
    type: DataTypes.DECIMAL(5, 2),
    field: 'successRate',
    defaultValue: 0
  },
  lastUpdated: {
    type: DataTypes.DATE,
    field: 'lastUpdated',
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'SiteStats',
  timestamps: false,
  underscored: false
});

module.exports = SiteStat;