// backend/src/models/User.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const bcrypt = require('bcryptjs');

const User = sequelize.define('User', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(100), allowNull: false, field: 'name' },
  fatherName: { type: DataTypes.STRING(100), allowNull: true, field: 'fatherName' },
  grandfatherName: { type: DataTypes.STRING(100), allowNull: true, field: 'grandfatherName' },
  sex: { type: DataTypes.STRING(10), allowNull: true, field: 'sex' },
  email: { type: DataTypes.STRING(255), allowNull: false, unique: true, field: 'email' },
  username: { type: DataTypes.STRING(100), allowNull: false, unique: true, field: 'username' },
  passwordHash: { type: DataTypes.STRING(255), allowNull: false, field: 'passwordHash' },
  role: { type: DataTypes.STRING(50), defaultValue: 'student', field: 'role' },
  status: { type: DataTypes.STRING(50), defaultValue: 'pending', field: 'status' },
  profileImage: { type: DataTypes.TEXT, field: 'profileImage' },
  lastLogin: { type: DataTypes.DATE, field: 'lastLogin' },
  forcePasswordChange: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'forcePasswordChange' },
  isFirstLogin: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'isFirstLogin' },
  passwordChangedAt: { type: DataTypes.DATE, field: 'passwordChangedAt' },
  verificationStatus: { type: DataTypes.STRING(50), field: 'verificationStatus' }
}, {
  tableName: '"Users"',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  hooks: {
    beforeCreate: async (user) => {
      if (user.passwordHash && !user.passwordHash.startsWith('$2a$') && !user.passwordHash.startsWith('$2b$')) {
        const salt = await bcrypt.genSalt(12);
        user.passwordHash = await bcrypt.hash(user.passwordHash, salt);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('passwordHash') && user.passwordHash && !user.passwordHash.startsWith('$2a$') && !user.passwordHash.startsWith('$2b$')) {
        const salt = await bcrypt.genSalt(12);
        user.passwordHash = await bcrypt.hash(user.passwordHash, salt);
        user.passwordChangedAt = new Date();
      }
    }
  }
});

User.prototype.comparePassword = async function (password) {
  return bcrypt.compare(password, this.passwordHash);
};

User.prototype.toJSON = function () {
  const values = Object.assign({}, this.get());
  delete values.passwordHash;
  return values;
};

module.exports = User;