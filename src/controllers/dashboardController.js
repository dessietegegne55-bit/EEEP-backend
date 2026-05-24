// backend/src/controllers/dashboardController.js
// COMPLETE FIXED VERSION - Using name, fatherName, grandfatherName (no firstName/lastName)

const { User, Student, Teacher, School, Exam, ExamAttempt, Material, Progress, Subject } = require('../models');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');

// Get student dashboard data
const getStudentDashboard = async (req, res, next) => {
  try {
    const student = await Student.findOne({
      where: { userId: req.user.id },
      include: [{ model: School, as: 'school' }]
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        error: { message: 'Student not found' }
      });
    }

    const totalExams = await Exam.count({
      where: {
        department: student.department,
        status: 'published'
      }
    });

    const completedExams = await ExamAttempt.count({
      where: {
        studentId: student.id,
        status: 'completed'
      }
    });

    const inProgressExams = await ExamAttempt.count({
      where: {
        studentId: student.id,
        status: 'in_progress'
      }
    });

    const materialsCount = await Material.count({
      where: {
        status: 'published',
        [Op.or]: [
          { department: student.department },
          { department: 'Both' }
        ]
      }
    });

    const recentExams = await Exam.findAll({
      where: {
        department: student.department,
        status: 'published'
      },
      limit: 5,
      order: [['createdAt', 'DESC']]
    });

    const recentAttempts = await ExamAttempt.findAll({
      where: { studentId: student.id },
      limit: 5,
      order: [['createdAt', 'DESC']],
      include: [{ model: Exam, as: 'exam' }]
    });

    const progress = await Progress.findAll({
      where: { studentId: student.id }
    });

    const averageScore = progress.length > 0
      ? progress.reduce((acc, p) => acc + parseFloat(p.averageScore || 0), 0) / progress.length
      : 0;

    res.json({
      success: true,
      data: {
        student: {
          id: student.id,
          gradeLevel: student.gradeLevel,
          department: student.department,
          idNumber: student.idNumber,
          school: student.school
        },
        stats: {
          totalExams,
          completedExams,
          inProgressExams,
          materialsCount,
          averageScore: Math.round(averageScore)
        },
        recentExams,
        recentAttempts,
        progress
      }
    });
  } catch (error) {
    console.error('❌ Error in getStudentDashboard:', error);
    next(error);
  }
};

// Get teacher dashboard data - COMPLETELY FIXED (no firstName/lastName)
const getTeacherDashboard = async (req, res, next) => {
  try {
    const teacher = await Teacher.findOne({
      where: { userId: req.user.id }
    });

    if (!teacher) {
      return res.status(404).json({
        success: false,
        error: { message: 'Teacher not found' }
      });
    }

    const teacherSubject = teacher.specialization;
    const teacherDepartment = teacher.department;

    console.log(`📚 Teacher ${req.user.id} teaches: ${teacherSubject}`);

    // Get teacher's user info
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'name', 'fatherName', 'grandfatherName', 'email']
    });

    // Use raw queries with camelCase table names - REMOVED firstName/lastName
    const [totalExams] = await sequelize.query(`
      SELECT COUNT(*) FROM "Exams" WHERE "createdBy" = $1 AND subject = $2
    `, { bind: [req.user.id, teacherSubject] });

    const [publishedExams] = await sequelize.query(`
      SELECT COUNT(*) FROM "Exams" WHERE "createdBy" = $1 AND status = 'published' AND subject = $2
    `, { bind: [req.user.id, teacherSubject] });

    const [draftExams] = await sequelize.query(`
      SELECT COUNT(*) FROM "Exams" WHERE "createdBy" = $1 AND status = 'draft' AND subject = $2
    `, { bind: [req.user.id, teacherSubject] });

    const [materialsCount] = await sequelize.query(`
      SELECT COUNT(*) FROM "Materials" WHERE "uploadedBy" = $1
    `, { bind: [req.user.id] });

    const [studentsCount] = await sequelize.query(`
      SELECT COUNT(*) FROM "Students" WHERE department = $1
    `, { bind: [teacherDepartment] });

    const [recentExams] = await sequelize.query(`
      SELECT id, title, description, type, duration, "totalMarks", "passingMarks",
             status, "gradeLevel", "createdAt", subject
      FROM "Exams"
      WHERE "createdBy" = $1 AND subject = $2
      ORDER BY "createdAt" DESC
      LIMIT 5
    `, { bind: [req.user.id, teacherSubject] });

    // FIXED: Using name instead of firstName, lastName
    const [examAttempts] = await sequelize.query(`
      SELECT 
        ea.*, 
        e.title as exam_title, 
        u."name",
        u."fatherName",
        u."grandfatherName"
      FROM "ExamAttempts" ea
      JOIN "Exams" e ON ea."examId" = e.id
      JOIN "Students" s ON ea."studentId" = s.id
      JOIN "Users" u ON s."userId" = u.id
      WHERE e."createdBy" = $1 AND e.subject = $2
      ORDER BY ea."createdAt" DESC
      LIMIT 10
    `, { bind: [req.user.id, teacherSubject] });

    // Format attempts with full name
    const formattedAttempts = (examAttempts || []).map(attempt => ({
      ...attempt,
      studentName: `${attempt.name || ''} ${attempt.fatherName || ''} ${attempt.grandfatherName || ''}`.trim()
    }));

    const [avgScoreResult] = await sequelize.query(`
      SELECT COALESCE(AVG(ea.score), 0) as avgScore
      FROM "ExamAttempts" ea
      JOIN "Exams" e ON ea."examId" = e.id
      WHERE e."createdBy" = $1 AND e.subject = $2 AND ea.status = 'completed'
    `, { bind: [req.user.id, teacherSubject] });

    const averageScore = Math.round(parseFloat(avgScoreResult[0]?.avgscore || 0));

    res.json({
      success: true,
      data: {
        teacher: {
          id: teacher.id,
          userId: teacher.userId,
          name: user?.name,
          fatherName: user?.fatherName,
          grandfatherName: user?.grandfatherName,
          email: user?.email,
          qualification: teacher.qualification,
          specialization: teacher.specialization,
          department: teacher.department
        },
        stats: {
          totalExams: parseInt(totalExams[0]?.count || 0),
          publishedExams: parseInt(publishedExams[0]?.count || 0),
          draftExams: parseInt(draftExams[0]?.count || 0),
          materialsCount: parseInt(materialsCount[0]?.count || 0),
          studentsCount: parseInt(studentsCount[0]?.count || 0),
          averageScore: averageScore
        },
        subjects: {
          [teacherSubject]: {
            students: parseInt(studentsCount[0]?.count || 0),
            exams: parseInt(totalExams[0]?.count || 0),
            avgScore: averageScore
          }
        },
        recentExams: recentExams || [],
        recentAttempts: formattedAttempts || []
      }
    });
  } catch (error) {
    console.error('❌ Error in getTeacherDashboard:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to load teacher dashboard', details: error.message }
    });
  }
};

// Get school dashboard data
const getSchoolDashboard = async (req, res, next) => {
  try {
    const school = await School.findOne({
      where: { adminId: req.user.id }
    });

    if (!school) {
      return res.status(404).json({
        success: false,
        error: { message: 'School not found' }
      });
    }

    const studentsCount = await Student.count({
      where: { schoolId: school.id }
    });

    const teachersCount = await Teacher.count({
      where: { schoolId: school.id }
    });

    const examsCount = await Exam.count({
      where: { schoolId: school.id }
    });

    const recentStudents = await Student.findAll({
      where: { schoolId: school.id },
      limit: 5,
      order: [['createdAt', 'DESC']],
      include: [{ model: User, as: 'user', attributes: ['name', 'fatherName', 'grandfatherName', 'email'] }]
    });

    const recentTeachers = await Teacher.findAll({
      where: { schoolId: school.id },
      limit: 5,
      order: [['createdAt', 'DESC']],
      include: [{ model: User, as: 'user', attributes: ['name', 'fatherName', 'grandfatherName', 'email'] }]
    });

    const recentExams = await Exam.findAll({
      where: { schoolId: school.id },
      limit: 5,
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      data: {
        school: {
          id: school.id,
          name: school.schoolName,
          address: school.address,
          phone: school.phone,
          email: school.email
        },
        stats: {
          studentsCount,
          teachersCount,
          examsCount
        },
        recentStudents,
        recentTeachers,
        recentExams
      }
    });
  } catch (error) {
    console.error('❌ Error in getSchoolDashboard:', error);
    next(error);
  }
};

// Get admin dashboard data
const getAdminDashboard = async (req, res, next) => {
  try {
    const isSuperAdmin = req.user.role === 'superadmin';

    const totalUsers = await User.count();
    const totalStudents = await User.count({ where: { role: 'student' } });
    const totalTeachers = await User.count({ where: { role: 'teacher' } });
    const totalSchools = await School.count();
    const pendingApprovals = await User.count({ where: { status: 'pending' } });

    const recentUsers = await User.findAll({
      limit: 10,
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'name', 'fatherName', 'grandfatherName', 'email', 'role', 'status', 'createdAt']
    });

    const naturalScienceStudents = await Student.count({ where: { department: 'Natural Science' } });
    const socialScienceStudents = await Student.count({ where: { department: 'Social Science' } });

    const totalExams = await Exam.count();
    const publishedExams = await Exam.count({ where: { status: 'published' } });
    const pastExams = await Exam.count({ where: { type: 'past' } });
    const modelExams = await Exam.count({ where: { type: 'model' } });
    const quizzes = await Exam.count({ where: { type: 'quiz' } });

    res.json({
      success: true,
      data: {
        stats: {
          totalUsers,
          totalStudents,
          totalTeachers,
          totalSchools,
          pendingApprovals,
          naturalScienceStudents,
          socialScienceStudents,
          totalExams,
          publishedExams,
          pastExams,
          modelExams,
          quizzes
        },
        recentUsers,
        isSuperAdmin
      }
    });
  } catch (error) {
    console.error('❌ Error in getAdminDashboard:', error);
    next(error);
  }
};

module.exports = {
  getStudentDashboard,
  getTeacherDashboard,
  getSchoolDashboard,
  getAdminDashboard
};