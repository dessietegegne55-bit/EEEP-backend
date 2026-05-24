const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Student = sequelize.define('Student', {
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
    references: {
      model: '"Users"',
      key: 'id',
    },
    onDelete: 'CASCADE',
  },
  idNumber: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    field: 'idNumber'
  },
  idPhoto: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'idPhoto'
  },
  gradeLevel: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'gradeLevel',
    validate: { min: 9, max: 12 },
  },
  department: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'department'
  },
  schoolId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'schoolId',  // ← CRITICAL: Must match database column name
    references: {
      model: '"Schools"',
      key: 'id',
    },
    onDelete: 'SET NULL',
  },
  schoolName: {
    type: DataTypes.STRING(255),
    allowNull: true,
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
  photoVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'photoVerified'
  },
  photoVerifiedBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'photoVerifiedBy',
    references: { model: '"Users"', key: 'id' },
  },
  photoVerifiedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'photoVerifiedAt'
  },
  verificationStatus: {
    type: DataTypes.STRING(50),
    defaultValue: 'pending',
    field: 'verificationStatus'
  },
}, {
  tableName: '"Students"',  // ← CRITICAL: Quoted table name
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
});

module.exports = Student;