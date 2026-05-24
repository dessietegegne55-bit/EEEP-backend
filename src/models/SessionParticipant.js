// backend/src/models/SessionParticipant.js

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const SessionParticipant = sequelize.define('SessionParticipant', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  sessionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'sessionId',
    references: {
      model: '"LiveSessions"',
      key: 'id',
    },
    onDelete: 'CASCADE',
  },
  studentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'studentId',
    references: {
      model: '"Students"',
      key: 'id',
    },
    onDelete: 'CASCADE',
  },
  studentName: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'studentName'
  },
  joinedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'joinedAt',
    defaultValue: DataTypes.NOW,
  },
  leftAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'leftAt'
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'duration',
    defaultValue: 0,
  },
  status: {
    type: DataTypes.ENUM('active', 'left', 'kicked'),
    allowNull: true,
    field: 'status',
    defaultValue: 'active',
  },
}, {
  tableName: '"SessionParticipants"',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['sessionId', 'studentId'],
      where: { status: 'active' },
    },
  ],
});

module.exports = SessionParticipant;