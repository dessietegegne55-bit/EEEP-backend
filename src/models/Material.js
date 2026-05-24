const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Material = sequelize.define('Material', {
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
  gradeLevel: {
    type: DataTypes.STRING(10),
    field: 'gradeLevel',
    allowNull: true,
    defaultValue: '12'
  },
  unit: {
    type: DataTypes.STRING(255),
    field: 'unit',
    allowNull: true,
    defaultValue: 'General'
  },
  fileUrl: {
    type: DataTypes.TEXT,
    field: 'fileUrl',
  },
  linkUrl: {
    type: DataTypes.TEXT,
    field: 'linkUrl',
  },
  youtubeLinks: {
    type: DataTypes.JSONB,
    field: 'youtubeLinks',
    defaultValue: [],
  },
  downloads: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'downloads',
  },
  views: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'views',
  },
  status: {
    type: DataTypes.STRING(50),
    defaultValue: 'draft',
    field: 'status',
  },
  uploadedBy: {
    type: DataTypes.INTEGER,
    field: 'uploadedBy',
    references: { model: '"Users"', key: 'id' },
  },
  department: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'department',
  },
}, {
  tableName: '"Materials"',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
});

Material.associate = (models) => {
  Material.belongsTo(models.Subject, {
    foreignKey: 'subjectId',
    as: 'subjectDetails',
    targetKey: 'id',
  });

  Material.belongsTo(models.User, {
    foreignKey: 'uploadedBy',
    as: 'uploader',
  });
};

module.exports = Material;