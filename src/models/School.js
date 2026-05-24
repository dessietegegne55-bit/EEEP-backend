const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const School = sequelize.define('School', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  schoolName: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    field: 'schoolName'
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'address'
  },
  phone: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'phone'
  },
  email: {
    type: DataTypes.STRING(255),
    unique: true,
    allowNull: true,
    field: 'email'
  },
  adminId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'adminId',
    references: {
      model: '"Users"',
      key: 'id',
    },
    onDelete: 'SET NULL',
  },
  logo: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'logo'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'description'
  },
  website: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'website'
  },
  status: {
    type: DataTypes.STRING(50),
    defaultValue: 'approved',
    field: 'status'
  },
}, {
  tableName: '"Schools"',  // ← CRITICAL: Quoted table name
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
});

module.exports = School;