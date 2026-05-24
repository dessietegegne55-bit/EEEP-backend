// backend/src/models/Notification.js
// FIXED - CamelCase table name with quotes

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Notification = sequelize.define('Notification', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'userId',
    references: {
      model: '"Users"',  // ← FIXED: quoted camelCase
      key: 'id',
    },
    onDelete: 'CASCADE',
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'title',
  },
  message: {
    type: DataTypes.TEXT,
    field: 'message',
  },
  type: {
    type: DataTypes.STRING(50),
    defaultValue: 'info',
    field: 'type',
  },
  isRead: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'isRead',
  },
  link: {
    type: DataTypes.STRING(255),
    field: 'link',
  },
  metadata: {
    type: DataTypes.JSONB,
    field: 'metadata',
  },
  expiresAt: {
    type: DataTypes.DATE,
    field: 'expiresAt',
  },
}, {
  tableName: '"Notifications"',  // ← FIXED: quoted camelCase
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
});

module.exports = Notification;