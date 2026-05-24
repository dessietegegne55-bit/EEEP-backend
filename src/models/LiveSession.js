// backend/src/models/LiveSession.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const LiveSession = sequelize.define('LiveSession', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'title'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'description'
  },
  teacherId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'teacherId',
    references: {
      model: '"Teachers"',
      key: 'id',
    },
  },
  subject: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'subject'
  },
  department: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'department'
  },
  gradeLevel: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'gradeLevel'
  },
  startTime: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'startTime'
  },
  endTime: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'endTime'
  },
  meetingUrl: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'meetingUrl'
  },
  meetingId: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'meetingId'
  },
  meetingPassword: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'meetingPassword'
  },
  status: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'status',
    defaultValue: 'scheduled'
  },
  recordings: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'recordings'
  },
}, {
  tableName: '"LiveSessions"',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
});

module.exports = LiveSession;