const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const SchoolExam = sequelize.define('SchoolExam', {
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
    subjectId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'subjectId'
    },
    subjectName: {
        type: DataTypes.STRING(100),
        allowNull: false,
        field: 'subjectName'
    },
    schoolId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'schoolId',
        references: {
            model: '"Schools"',
            key: 'id',
        },
        onDelete: 'CASCADE',
    },
    schoolName: {
        type: DataTypes.STRING(255),
        allowNull: false,
        field: 'schoolName'
    },
    teacherId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'teacherId',
        references: {
            model: '"Teachers"',
            key: 'id',
        },
        onDelete: 'CASCADE',
    },
    teacherName: {
        type: DataTypes.STRING(255),
        allowNull: false,
        field: 'teacherName'
    },
    year: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'year',
        defaultValue: () => new Date().getFullYear()
    },
    type: {
        type: DataTypes.STRING(50),
        allowNull: true,
        field: 'type',
        defaultValue: 'model'
    },
    status: {
        type: DataTypes.STRING(50),
        allowNull: true,
        field: 'status',
        defaultValue: 'pending'
    },
    fileUrl: {
        type: DataTypes.TEXT,
        allowNull: false,
        field: 'fileUrl'
    },
    originalFileName: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'originalFileName'
    },
    fileSize: {
        type: DataTypes.STRING(50),
        allowNull: true,
        field: 'fileSize'
    },
    feedback: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'feedback'
    },
    createdBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'createdBy',
        references: {
            model: '"Users"',
            key: 'id',
        },
    },
}, {
    tableName: '"SchoolExams"',
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
});

module.exports = SchoolExam;