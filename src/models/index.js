// backend/src/models/index.js
// COMPLETE FIXED VERSION - With LiveSession and SessionParticipant models

const { sequelize } = require('../config/database');

// Import models with correct table names
const User = require('./User');
const Student = require('./Student');
const Teacher = require('./Teacher');
const School = require('./School');
const Admin = require('./Admin');
const Subject = require('./Subject');
const Exam = require('./Exam');
const Question = require('./Question');
const ExamAttempt = require('./ExamAttempt');
const Material = require('./Material');
const Progress = require('./Progress');
const Notification = require('./Notification');
const SiteStat = require('./SiteStat');
const LiveSession = require('./LiveSession');
const SessionParticipant = require('./SessionParticipant');
const ExamAssignment = require('./ExamAssignment');
const ContactMessage = require('./ContactMessage');

// ===========================================
// USER ASSOCIATIONS
// ===========================================
User.hasOne(Student, { foreignKey: 'userId', as: 'student' });
Student.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasOne(Teacher, { foreignKey: 'userId', as: 'teacher' });
Teacher.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasOne(Admin, { foreignKey: 'userId', as: 'admin' });
Admin.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasOne(School, { foreignKey: 'adminId', as: 'school' });
School.belongsTo(User, { foreignKey: 'adminId', as: 'admin' });

// ===========================================
// STUDENT ASSOCIATIONS
// ===========================================
Student.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });
School.hasMany(Student, { foreignKey: 'schoolId', as: 'students' });

// ===========================================
// EXAM AND SUBJECT ASSOCIATIONS
// ===========================================
Exam.belongsTo(Subject, { foreignKey: 'subjectId', as: 'subjectInfo' });
Subject.hasMany(Exam, { foreignKey: 'subjectId', as: 'exams' });

// ===========================================
// EXAM AND USER ASSOCIATIONS
// ===========================================
Exam.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });
User.hasMany(Exam, { foreignKey: 'createdBy', as: 'exams' });

// ===========================================
// EXAM AND QUESTIONS ASSOCIATIONS
// ===========================================
Exam.hasMany(Question, { foreignKey: 'examId', as: 'questions' });
Question.belongsTo(Exam, { foreignKey: 'examId', as: 'exam' });

// ===========================================
// EXAM ATTEMPT ASSOCIATIONS
// ===========================================
ExamAttempt.belongsTo(Exam, { foreignKey: 'examId', as: 'exam' });
Exam.hasMany(ExamAttempt, { foreignKey: 'examId', as: 'attempts' });

ExamAttempt.belongsTo(Student, { foreignKey: 'studentId', as: 'student' });
Student.hasMany(ExamAttempt, { foreignKey: 'studentId', as: 'attempts' });

// ===========================================
// MATERIAL ASSOCIATIONS
// ===========================================
Material.belongsTo(Subject, { foreignKey: 'subjectId', as: 'subjectDetails' });
Subject.hasMany(Material, { foreignKey: 'subjectId', as: 'materials' });

Material.belongsTo(User, { foreignKey: 'uploadedBy', as: 'uploader' });
User.hasMany(Material, { foreignKey: 'uploadedBy', as: 'materials' });

// ===========================================
// PROGRESS ASSOCIATIONS
// ===========================================
Progress.belongsTo(Student, { foreignKey: 'studentId', as: 'student' });
Student.hasMany(Progress, { foreignKey: 'studentId', as: 'progress' });

Progress.belongsTo(Subject, { foreignKey: 'subjectId', as: 'subject' });
Subject.hasMany(Progress, { foreignKey: 'subjectId', as: 'progressRecords' });

// ===========================================
// NOTIFICATION ASSOCIATIONS
// ===========================================
Notification.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications' });

// ===========================================
// LIVE SESSION ASSOCIATIONS
// ===========================================
LiveSession.belongsTo(Teacher, { foreignKey: 'teacherId', as: 'teacher' });
Teacher.hasMany(LiveSession, { foreignKey: 'teacherId', as: 'liveSessions' });

LiveSession.hasMany(SessionParticipant, { foreignKey: 'sessionId', as: 'participants' });
SessionParticipant.belongsTo(LiveSession, { foreignKey: 'sessionId', as: 'session' });

SessionParticipant.belongsTo(Student, { foreignKey: 'studentId', as: 'student' });
Student.hasMany(SessionParticipant, { foreignKey: 'studentId', as: 'sessions' });

// ===========================================
// CONTACT MESSAGE ASSOCIATIONS
// ===========================================
ContactMessage.belongsTo(User, { foreignKey: 'respondedBy', as: 'responder' });
User.hasMany(ContactMessage, { foreignKey: 'respondedBy', as: 'respondedMessages' });

// ===========================================
// SITESTAT ASSOCIATIONS (No associations needed - standalone table)
// ===========================================

// ===========================================
// EXPORT ALL MODELS
// ===========================================
module.exports = {
  sequelize,
  User,
  Student,
  Teacher,
  School,
  Admin,
  Subject,
  Exam,
  Question,
  ExamAttempt,
  Material,
  Progress,
  Notification,
  SiteStat,
  LiveSession,
  SessionParticipant,
  ExamAssignment,
  ContactMessage,
};