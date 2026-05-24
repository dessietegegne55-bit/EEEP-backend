// backend/src/controllers/teacherController.js
// COMPLETE FIXED TEACHER CONTROLLER

const { Teacher, Exam, Material, ExamAttempt, Student, User, Subject, Notification } = require('../models');
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');
const { createError } = require('../middleware/errorHandler');

// ===========================================
// GET TEACHER COMPLETE STATISTICS
// ===========================================
const getTeacherStats = async (req, res, next) => {
    try {
        const teacher = await Teacher.findOne({
            where: { userId: req.user.id },
            include: [{ model: User, as: 'user' }]
        });

        if (!teacher) {
            return res.status(404).json({ success: false, error: 'Teacher not found' });
        }

        const teacherSubject = teacher.specialization;
        const teacherId = req.user.id;

        console.log(`📊 Fetching complete stats for teacher: ${teacherSubject}`);

        // 1. Exam Statistics
        const [examStats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) as published,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft
      FROM "Exams"
      WHERE "createdBy" = $1 AND subject = $2
    `, { bind: [teacherId, teacherSubject] });

        // 2. Material Statistics
        const [materialStats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) as published,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft
      FROM "Materials"
      WHERE "uploadedBy" = $1 AND subject = $2
    `, { bind: [teacherId, teacherSubject] });

        // 3. Student Performance (Pass/Fail counts)
        const studentPerformance = await sequelize.query(`
      SELECT 
        s.id as studentId,
        s."idNumber",
        u."firstName",
        u."lastName",
        u.email,
        s.department,
        s."gradeLevel",
        COUNT(DISTINCT ea.id) as totalExamsTaken,
        COUNT(DISTINCT CASE WHEN ea.score >= e."passingMarks" THEN ea.id END) as examsPassed,
        COUNT(DISTINCT CASE WHEN ea.score < e."passingMarks" THEN ea.id END) as examsFailed,
        ROUND(AVG(ea.score), 2) as averageScore,
        ROUND(AVG((ea.score / e."totalMarks") * 100), 1) as averagePercentage
      FROM "Students" s
      JOIN "Users" u ON s."userId" = u.id
      JOIN "ExamAttempts" ea ON s.id = ea."studentId"
      JOIN "Exams" e ON ea."examId" = e.id
      WHERE e.subject = $1 
        AND e."createdBy" = $2 
        AND ea.status = 'completed'
      GROUP BY s.id, u."firstName", u."lastName", u.email, s."idNumber", s.department, s."gradeLevel"
      ORDER BY u."lastName" ASC
    `, {
            bind: [teacherSubject, teacherId],
            type: sequelize.QueryTypes.SELECT
        });

        // 4. Summary Statistics
        const totalStudents = studentPerformance.length;
        const totalExamsTaken = studentPerformance.reduce((sum, s) => sum + (parseInt(s.totalExamsTaken) || 0), 0);
        const totalExamsPassed = studentPerformance.reduce((sum, s) => sum + (parseInt(s.examsPassed) || 0), 0);
        const totalExamsFailed = studentPerformance.reduce((sum, s) => sum + (parseInt(s.examsFailed) || 0), 0);

        const overallPassRate = totalExamsTaken > 0 ? ((totalExamsPassed / totalExamsTaken) * 100).toFixed(1) : 0;
        const overallAverageScore = studentPerformance.length > 0
            ? (studentPerformance.reduce((sum, s) => sum + parseFloat(s.averagePercentage || 0), 0) / studentPerformance.length).toFixed(1)
            : 0;

        const studentsWithPass = studentPerformance.filter(s => parseInt(s.examsPassed || 0) > 0).length;
        const studentsWithFail = studentPerformance.filter(s => parseInt(s.examsPassed || 0) === 0 && parseInt(s.totalExamsTaken || 0) > 0).length;

        // 5. Grade Level Breakdown
        const gradeBreakdown = await sequelize.query(`
      SELECT 
        s."gradeLevel",
        COUNT(DISTINCT s.id) as studentCount,
        COUNT(ea.id) as totalAttempts,
        COUNT(CASE WHEN ea.score >= e."passingMarks" THEN 1 END) as passedAttempts,
        ROUND(AVG(ea.score), 2) as avgScore,
        ROUND(AVG((ea.score / e."totalMarks") * 100), 1) as avgPercentage
      FROM "Students" s
      JOIN "ExamAttempts" ea ON s.id = ea."studentId"
      JOIN "Exams" e ON ea."examId" = e.id
      WHERE e.subject = $1 
        AND e."createdBy" = $2 
        AND ea.status = 'completed'
      GROUP BY s."gradeLevel"
      ORDER BY s."gradeLevel"
    `, {
            bind: [teacherSubject, teacherId],
            type: sequelize.QueryTypes.SELECT
        });

        // 6. Recent Exam Attempts
        const recentAttempts = await sequelize.query(`
      SELECT 
        ea.id,
        ea.score,
        ea."totalMarks",
        ea."createdAt" as submittedAt,
        e.title as examTitle,
        e."passingMarks",
        u."firstName",
        u."lastName",
        s."idNumber"
      FROM "ExamAttempts" ea
      JOIN "Exams" e ON ea."examId" = e.id
      JOIN "Students" s ON ea."studentId" = s.id
      JOIN "Users" u ON s."userId" = u.id
      WHERE e.subject = $1 
        AND e."createdBy" = $2 
        AND ea.status = 'completed'
      ORDER BY ea."createdAt" DESC
      LIMIT 20
    `, {
            bind: [teacherSubject, teacherId],
            type: sequelize.QueryTypes.SELECT
        });

        const formattedRecentAttempts = recentAttempts.map(attempt => {
            const percentage = attempt.totalMarks > 0 ? ((attempt.score / attempt.totalMarks) * 100).toFixed(1) : 0;
            const isPassed = attempt.score >= (attempt.passingMarks || attempt.totalMarks / 2);

            return {
                id: attempt.id,
                studentName: `${attempt.firstName} ${attempt.lastName}`.trim(),
                studentId: attempt.idNumber,
                examTitle: attempt.examTitle,
                score: attempt.score,
                totalMarks: attempt.totalMarks,
                percentage: percentage,
                isPassed: isPassed,
                submittedAt: attempt.submittedAt
            };
        });

        res.json({
            success: true,
            data: {
                teacher: {
                    id: teacher.id,
                    name: `${teacher.user?.firstName || ''} ${teacher.user?.lastName || ''}`.trim(),
                    subject: teacherSubject,
                    department: teacher.department,
                    qualification: teacher.qualification
                },
                exams: {
                    total: parseInt(examStats[0]?.total || 0),
                    published: parseInt(examStats[0]?.published || 0),
                    draft: parseInt(examStats[0]?.draft || 0)
                },
                materials: {
                    total: parseInt(materialStats[0]?.total || 0),
                    published: parseInt(materialStats[0]?.published || 0),
                    draft: parseInt(materialStats[0]?.draft || 0)
                },
                students: {
                    total: totalStudents,
                    withPass: studentsWithPass,
                    withFail: studentsWithFail
                },
                performance: {
                    totalExamsTaken: totalExamsTaken,
                    totalExamsPassed: totalExamsPassed,
                    totalExamsFailed: totalExamsFailed,
                    overallPassRate: overallPassRate,
                    overallAverageScore: overallAverageScore
                },
                studentDetails: studentPerformance,
                gradeBreakdown: gradeBreakdown,
                recentAttempts: formattedRecentAttempts
            }
        });

    } catch (error) {
        console.error('Get teacher stats error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ===========================================
// GET STUDENT DETAILS FOR TEACHER
// ===========================================
const getStudentDetails = async (req, res, next) => {
    try {
        const { studentId } = req.params;
        const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
        if (!teacher) {
            return res.status(404).json({ success: false, error: 'Teacher not found' });
        }

        const teacherSubject = teacher.specialization;

        const studentDetails = await sequelize.query(`
      SELECT 
        s.id,
        s."idNumber",
        u."firstName",
        u."lastName",
        u.email,
        s.department,
        s."gradeLevel",
        s."schoolName",
        ea.id as attemptId,
        e.title as examTitle,
        e."totalMarks",
        e."passingMarks",
        ea.score,
        ea.status,
        ea."createdAt" as submittedAt,
        CASE WHEN ea.score >= e."passingMarks" THEN 'Passed' ELSE 'Failed' END as result
      FROM "Students" s
      JOIN "Users" u ON s."userId" = u.id
      JOIN "ExamAttempts" ea ON s.id = ea."studentId"
      JOIN "Exams" e ON ea."examId" = e.id
      WHERE s.id = $1 
        AND e.subject = $2 
        AND e."createdBy" = $3
        AND ea.status = 'completed'
      ORDER BY ea."createdAt" DESC
    `, {
            bind: [studentId, teacherSubject, req.user.id],
            type: sequelize.QueryTypes.SELECT
        });

        if (studentDetails.length === 0) {
            return res.status(404).json({ success: false, error: 'No results found for this student' });
        }

        const totalExams = studentDetails.length;
        const passedExams = studentDetails.filter(s => s.result === 'Passed').length;
        const failedExams = totalExams - passedExams;
        const averageScore = totalExams > 0 ? (studentDetails.reduce((sum, s) => sum + (s.score || 0), 0) / totalExams).toFixed(1) : 0;

        res.json({
            success: true,
            data: {
                student: {
                    id: studentDetails[0].id,
                    name: `${studentDetails[0].firstName} ${studentDetails[0].lastName}`,
                    idNumber: studentDetails[0].idNumber,
                    email: studentDetails[0].email,
                    department: studentDetails[0].department,
                    gradeLevel: studentDetails[0].gradeLevel,
                    schoolName: studentDetails[0].schoolName
                },
                summary: {
                    totalExams: totalExams,
                    passedExams: passedExams,
                    failedExams: failedExams,
                    averageScore: averageScore,
                    passRate: totalExams > 0 ? ((passedExams / totalExams) * 100).toFixed(1) : 0
                },
                examResults: studentDetails
            }
        });

    } catch (error) {
        console.error('Get student details error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ===========================================
// GET TEACHER DASHBOARD STATS (Simple)
// ===========================================
const getTeacherDashboard = async (req, res, next) => {
    try {
        const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
        if (!teacher) throw createError('Teacher not found', 404);

        const teacherSubject = teacher.specialization;
        const teacherId = req.user.id;

        const [examStats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) as published
      FROM "Exams" 
      WHERE "createdBy" = $1 AND subject = $2
    `, { bind: [teacherId, teacherSubject] });

        const [studentsCount] = await sequelize.query(`
      SELECT COUNT(DISTINCT s.id) as count FROM "Students" s
      JOIN "ExamAttempts" ea ON s.id = ea."studentId"
      JOIN "Exams" e ON ea."examId" = e.id
      WHERE e.subject = $1 AND e."createdBy" = $2
    `, { bind: [teacherSubject, teacherId] });

        const [avgScore] = await sequelize.query(`
      SELECT ROUND(AVG(ea.score), 0) as avg FROM "ExamAttempts" ea
      JOIN "Exams" e ON ea."examId" = e.id
      WHERE e.subject = $1 AND e."createdBy" = $2 AND ea.status = 'completed'
    `, { bind: [teacherSubject, teacherId] });

        const [materialsCount] = await sequelize.query(`
      SELECT COUNT(*) as count FROM "Materials" 
      WHERE "uploadedBy" = $1 AND status = 'published'
    `, { bind: [teacherId] });

        const [passFailStats] = await sequelize.query(`
      SELECT 
        COUNT(CASE WHEN ea.score >= e."passingMarks" THEN 1 END) as passed,
        COUNT(CASE WHEN ea.score < e."passingMarks" THEN 1 END) as failed
      FROM "ExamAttempts" ea
      JOIN "Exams" e ON ea."examId" = e.id
      WHERE e.subject = $1 AND e."createdBy" = $2 AND ea.status = 'completed'
    `, { bind: [teacherSubject, teacherId] });

        res.json({
            success: true,
            data: {
                stats: {
                    totalExams: parseInt(examStats[0]?.total || 0),
                    publishedExams: parseInt(examStats[0]?.published || 0),
                    students: parseInt(studentsCount[0]?.count || 0),
                    avgScore: Math.round(parseFloat(avgScore[0]?.avg || 0)),
                    materials: parseInt(materialsCount[0]?.count || 0),
                    examsPassed: parseInt(passFailStats[0]?.passed || 0),
                    examsFailed: parseInt(passFailStats[0]?.failed || 0)
                },
                teacher: {
                    id: teacher.id,
                    specialization: teacher.specialization,
                    department: teacher.department,
                    qualification: teacher.qualification
                }
            }
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        next(error);
    }
};

// ===========================================
// GET TEACHER'S EXAMS
// ===========================================
const getTeacherExams = async (req, res, next) => {
    try {
        const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
        if (!teacher) throw createError('Teacher not found', 404);

        const exams = await Exam.findAll({
            where: {
                createdBy: req.user.id,
                subject: teacher.specialization
            },
            order: [['createdAt', 'DESC']],
            include: [{ model: Subject, as: 'subjectInfo' }]
        });

        res.json({
            success: true,
            data: { exams: exams || [] }
        });
    } catch (error) {
        console.error('Error fetching teacher exams:', error);
        res.status(500).json({ success: false, error: error.message, data: { exams: [] } });
    }
};

// ===========================================
// GET TEACHER'S MATERIALS
// ===========================================
const getTeacherMaterials = async (req, res, next) => {
    try {
        const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
        if (!teacher) throw createError('Teacher not found', 404);

        const materials = await Material.findAll({
            where: {
                uploadedBy: req.user.id,
                subject: teacher.specialization
            },
            order: [['createdAt', 'DESC']],
            include: [{ model: Subject, as: 'subjectDetails' }]
        });

        res.json({
            success: true,
            data: { materials: materials || [] }
        });
    } catch (error) {
        console.error('Error fetching teacher materials:', error);
        res.status(500).json({ success: false, error: error.message, data: { materials: [] } });
    }
};

// ===========================================
// GET RECEIVED EXAMS FROM SCHOOLS
// ===========================================
const getReceivedExams = async (req, res, next) => {
    try {
        const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
        if (!teacher) throw createError('Teacher not found', 404);

        const assignments = await sequelize.query(`
      SELECT 
        ea.*,
        s.name as "subjectName"
      FROM "ExamAssignments" ea
      LEFT JOIN "Subjects" s ON ea."subjectId" = s.id
      WHERE ea."teacherId" = $1
      ORDER BY ea."createdAt" DESC
    `, { bind: [teacher.id] });

        res.json({ success: true, data: assignments[0] || [] });
    } catch (error) {
        console.error('Error fetching received exams:', error);
        res.status(500).json({ success: false, error: error.message, data: [] });
    }
};

// ===========================================
// REVIEW EXAM FROM SCHOOL
// ===========================================
const reviewExam = async (req, res, next) => {
    try {
        const { status, feedback } = req.body;
        const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
        if (!teacher) throw createError('Teacher not found', 404);

        await sequelize.query(`
      UPDATE "ExamAssignments" 
      SET status = $1, feedback = $2, "updatedAt" = NOW()
      WHERE id = $3 AND "teacherId" = $4
    `, { bind: [status, feedback, req.params.examId, teacher.id] });

        res.json({ success: true, message: 'Exam reviewed successfully' });
    } catch (error) {
        console.error('Error reviewing exam:', error);
        next(error);
    }
};

// ===========================================
// GET TEACHER MESSAGES
// ===========================================
const getTeacherMessages = async (req, res, next) => {
    try {
        const messages = await Notification.findAll({
            where: { userId: req.user.id },
            order: [['createdAt', 'DESC']]
        });

        res.json({ success: true, data: messages || [] });
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ success: false, error: error.message, data: [] });
    }
};

// ===========================================
// MARK MESSAGE AS READ
// ===========================================
const markMessageAsRead = async (req, res, next) => {
    try {
        await Notification.update(
            { isRead: true },
            { where: { id: req.params.id, userId: req.user.id } }
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Error marking message as read:', error);
        next(error);
    }
};

// ===========================================
// SEND MESSAGE TO STUDENTS
// ===========================================
const sendMessageToStudents = async (req, res, next) => {
    try {
        const { subject, message, studentIds } = req.body;
        const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
        if (!teacher) throw createError('Teacher not found', 404);

        let targetStudentIds = studentIds;
        if (!targetStudentIds || targetStudentIds.length === 0) {
            const students = await sequelize.query(`
        SELECT DISTINCT s.id FROM "Students" s
        JOIN "ExamAttempts" ea ON s.id = ea."studentId"
        JOIN "Exams" e ON ea."examId" = e.id
        WHERE e.subject = $1
      `, { bind: [teacher.specialization] });
            targetStudentIds = students[0].map(s => s.id);
        }

        for (const studentId of targetStudentIds) {
            await Notification.create({
                userId: studentId,
                title: subject,
                message: message,
                type: 'message'
            });
        }

        res.json({ success: true, message: `Message sent to ${targetStudentIds.length} students` });
    } catch (error) {
        console.error('Error sending message:', error);
        next(error);
    }
};

// ===========================================
// GET TEACHER PROFILE
// ===========================================
const getTeacherProfile = async (req, res, next) => {
    try {
        const teacher = await Teacher.findOne({
            where: { userId: req.user.id },
            include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName', 'email', 'username'] }]
        });
        if (!teacher) throw createError('Teacher not found', 404);

        res.json({
            success: true,
            data: {
                id: teacher.id,
                userId: teacher.userId,
                specialization: teacher.specialization,
                department: teacher.department,
                qualification: teacher.qualification,
                status: teacher.status,
                user: teacher.user
            }
        });
    } catch (error) {
        console.error('Error fetching teacher profile:', error);
        next(error);
    }
};

// ===========================================
// UPDATE TEACHER PROFILE
// ===========================================
const updateTeacherProfile = async (req, res, next) => {
    try {
        const { qualification, specialization, department } = req.body;
        const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
        if (!teacher) throw createError('Teacher not found', 404);

        await teacher.update({ qualification, specialization, department });

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: teacher
        });
    } catch (error) {
        console.error('Error updating teacher profile:', error);
        next(error);
    }
};

// ===========================================
// EXPORT ALL FUNCTIONS
// ===========================================
module.exports = {
    getTeacherStats,
    getStudentDetails,
    getTeacherDashboard,
    getTeacherExams,
    getTeacherMaterials,
    getReceivedExams,
    reviewExam,
    getTeacherMessages,
    markMessageAsRead,
    sendMessageToStudents,
    sendMessageToSchool,
    sendMessageToAdmin,
    getTeacherStudents,
    getTeacherSchool,
    getTeacherAdmins,
    getTeacherProfile,
    updateTeacherProfile
};

// ===========================================
// SEND MESSAGE TO SCHOOL
// ===========================================
const sendMessageToSchool = async (req, res, next) => {
    try {
        const { subject, message } = req.body;
        const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
        if (!teacher) throw createError('Teacher not found', 404);

        // Get teacher's school
        const school = await sequelize.query(`
            SELECT s.* FROM "Schools" s
            JOIN "Teachers" t ON s.id = t."schoolId"
            WHERE t."userId" = $1
        `, { bind: [req.user.id] });

        if (!school[0] || school[0].length === 0) {
            throw createError('School not found for this teacher', 404);
        }

        const schoolData = school[0][0];

        // Create notification for school admin
        await Notification.create({
            userId: schoolData.userId,
            title: subject,
            message: message,
            type: 'message',
            senderId: req.user.id,
            senderType: 'teacher'
        });

        res.json({
            success: true,
            message: 'Message sent to school administrator'
        });
    } catch (error) {
        console.error('Error sending message to school:', error);
        next(error);
    }
};

// ===========================================
// SEND MESSAGE TO ADMIN
// ===========================================
const sendMessageToAdmin = async (req, res, next) => {
    try {
        const { subject, message, adminId } = req.body;
        const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
        if (!teacher) throw createError('Teacher not found', 404);

        let targetAdminIds = [];

        if (adminId) {
            // Send to specific admin
            targetAdminIds = [adminId];
        } else {
            // Send to all admins
            const admins = await sequelize.query(`
                SELECT u.id FROM "Users" u
                JOIN "Admins" a ON u.id = a."userId"
                WHERE u.role IN ('superadmin', 'subadmin')
            `);
            targetAdminIds = admins[0].map(a => a.id);
        }

        for (const adminId of targetAdminIds) {
            await Notification.create({
                userId: adminId,
                title: subject,
                message: message,
                type: 'message',
                senderId: req.user.id,
                senderType: 'teacher'
            });
        }

        res.json({
            success: true,
            message: `Message sent to ${targetAdminIds.length} administrator(s)`
        });
    } catch (error) {
        console.error('Error sending message to admin:', error);
        next(error);
    }
};

// ===========================================
// GET TEACHER'S STUDENTS
// ===========================================
const getTeacherStudents = async (req, res, next) => {
    try {
        const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
        if (!teacher) throw createError('Teacher not found', 404);

        const students = await sequelize.query(`
            SELECT DISTINCT 
                s.id, s."userId", s."idNumber", s."gradeLevel", s."department", s."sex",
                u."firstName" as name, u."fatherName", u."grandfatherName", u.email
            FROM "Students" s
            JOIN "Users" u ON s."userId" = u.id
            JOIN "ExamAttempts" ea ON s.id = ea."studentId"
            JOIN "Exams" e ON ea."examId" = e.id
            WHERE e.subject = $1
            ORDER BY u."firstName", u."fatherName"
        `, { bind: [teacher.specialization] });

        res.json({
            success: true,
            data: students[0] || []
        });
    } catch (error) {
        console.error('Error fetching teacher students:', error);
        next(error);
    }
};

// ===========================================
// GET TEACHER'S SCHOOL
// ===========================================
const getTeacherSchool = async (req, res, next) => {
    try {
        const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
        if (!teacher) throw createError('Teacher not found', 404);

        const school = await sequelize.query(`
            SELECT s.*, u."firstName" as adminName, u.email as adminEmail
            FROM "Schools" s
            JOIN "Users" u ON s."userId" = u.id
            WHERE s.id = $1
        `, { bind: [teacher.schoolId] });

        if (!school[0] || school[0].length === 0) {
            throw createError('School not found', 404);
        }

        res.json({
            success: true,
            data: school[0][0]
        });
    } catch (error) {
        console.error('Error fetching teacher school:', error);
        next(error);
    }
};

// ===========================================
// GET TEACHER'S ADMINS
// ===========================================
const getTeacherAdmins = async (req, res, next) => {
    try {
        const admins = await sequelize.query(`
            SELECT 
                a.id, u.id as userId, u."firstName" as name, u.email,
                u.role, a."createdAt", a."updatedAt"
            FROM "Admins" a
            JOIN "Users" u ON a."userId" = u.id
            WHERE u.role IN ('superadmin', 'subadmin')
            ORDER BY 
                CASE u.role 
                    WHEN 'superadmin' THEN 1
                    WHEN 'subadmin' THEN 2
                    ELSE 3
                END,
                u."firstName"
        `);

        res.json({
            success: true,
            data: admins[0] || []
        });
    } catch (error) {
        console.error('Error fetching admins:', error);
        next(error);
    }
};
