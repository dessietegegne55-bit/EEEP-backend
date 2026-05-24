const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Admin = sequelize.define('Admin', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    field: 'userId',
    references: { model: '"Users"', key: 'id' },
    onDelete: 'CASCADE',
  },
  adminType: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'adminType'
  },
  managedBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'managedBy',
    references: { model: '"Admins"', key: 'id' },
  },
}, {
  tableName: '"Admins"',  // ← CRITICAL: Quoted table name
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
});

module.exports = Admin;