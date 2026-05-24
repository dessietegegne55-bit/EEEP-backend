// backend/src/models/ContactMessage.js
// Model for contact messages from public website

const { Model, DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

class ContactMessage extends Model { }

ContactMessage.init({
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
            isEmail: true
        }
    },
    subject: {
        type: DataTypes.STRING,
        allowNull: false
    },
    message: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    status: {
        type: DataTypes.ENUM('unread', 'read', 'responded', 'archived'),
        defaultValue: 'unread'
    },
    respondedAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    respondedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'Users',
            key: 'id'
        }
    },
    response: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    ipAddress: {
        type: DataTypes.STRING,
        allowNull: true
    },
    userAgent: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    sequelize,
    modelName: 'ContactMessage',
    tableName: 'ContactMessages',
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
});

module.exports = ContactMessage;