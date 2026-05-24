const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Teacher = sequelize.define('Teacher', {
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
  qualification: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'qualification'
  },
  specialization: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'specialization'
  },
  department: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'department'
  },
  schoolId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'schoolId',
    references: { model: '"Schools"', key: 'id' },
    onDelete: 'SET NULL',
  },
  status: {
    type: DataTypes.STRING(50),
    defaultValue: 'active',
    field: 'status'
  },
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'createdBy',
    references: { model: '"Users"', key: 'id' },
  },
}, {
  tableName: '"Teachers"',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
});

// Associations
Teacher.associate = (models) => {
  Teacher.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
  Teacher.belongsTo(models.User, { foreignKey: 'createdBy', as: 'creator' });
  Teacher.belongsTo(models.School, { foreignKey: 'schoolId', as: 'school' });
};

module.exports = Teacher;