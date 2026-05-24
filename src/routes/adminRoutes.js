// backend/src/routes/adminRoutes.js
// COMPLETE FIXED VERSION - Proper Inbox/Sent separation

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const path = require('path');
const XLSX = require('xlsx');
const fs = require('fs');
const multer = require('multer');
const { User, Teacher, School, Student, Admin, Notification } = require('../models');
const { authenticate, authorizeAdmin, authorizeSuperAdmin } = require('../middleware/auth');
const { createError } = require('../middleware/errorHandler');
const { sendEmail, sendWelcomeEmail, sendAccountApprovedEmail } = require('../services/emailService');
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');

// Configure multer for local file uploads
const localUploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = 'uploads/school-lists/';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'local-upload-' + uniqueSuffix + ext);
  }
});

const localUpload = multer({
  storage: localUploadStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.xlsx', '.xls', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel and CSV files are allowed'));
    }
  }
});

router.use(authenticate);
router.use(authorizeAdmin);

// Helper function to generate temporary password
const generateTempPassword = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

// ===========================================
// HELPER: Column Detection with Confidence
// ===========================================
async function detectColumnsWithConfidence(headers, sampleRow) {
  const patterns = {
    name: [/^name$/i, /^fullname$/i, /^full name$/i, /^student name$/i, /^studentname$/i],
    fatherName: [/^father/i, /^fathername$/i, /^father name$/i, /^fname$/i],
    grandfatherName: [/^grandfather/i, /^grandfathername$/i, /^grandfather name$/i, /^gname$/i],
    idNumber: [/id$/i, /^id$/i, /number/i, /roll/i, /student id/i, /registration/i, /^id no$/i, /^student id$/i],
    grade: [/grade/i, /class/i, /level/i, /year/i, /form/i, /^gr$/i],
    department: [/dept/i, /department/i, /stream/i, /major/i, /section/i, /field/i],
    sex: [/sex/i, /gender/i, /male/i, /female/i, /^m$/i, /^f$/i]
  };

  const mapping = {};

  for (const [field, regexes] of Object.entries(patterns)) {
    let bestMatch = null;
    let bestScore = 0;

    for (const header of headers) {
      let score = 0;
      const lowerHeader = header.toLowerCase().trim();
      const cleanHeader = lowerHeader.replace(/[^a-z]/g, '');

      if (cleanHeader === field.toLowerCase()) score += 50;
      if (lowerHeader === field) score += 50;

      for (const regex of regexes) {
        if (regex.test(lowerHeader)) score += 30;
        if (regex.test(cleanHeader)) score += 20;
      }

      if (sampleRow && sampleRow[header]) {
        const sampleValue = String(sampleRow[header]).toLowerCase();
        if (field === 'name' && sampleValue.length >= 2 && sampleValue.length <= 50) score += 10;
        if (field === 'idNumber' && /[0-9]{3,}/.test(sampleValue)) score += 25;
        if (field === 'grade') {
          if (/^[9-9]$|^1[0-2]$/.test(sampleValue)) score += 25;
          if (sampleValue === '12' || sampleValue === 'grade 12' || sampleValue === '12th') score += 20;
        }
        if (field === 'sex' && (sampleValue === 'm' || sampleValue === 'f' || sampleValue === 'male' || sampleValue === 'female')) score += 25;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = header;
      }
    }

    mapping[field] = {
      column: bestMatch,
      confidence: bestScore,
      needsReview: bestScore < 60
    };
  }

  return mapping;
}

// Ensure tables exist
const ensureTables = async () => {
  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "Reports" (
        id SERIAL PRIMARY KEY,
        "title" VARCHAR(255) NOT NULL,
        "type" VARCHAR(50) NOT NULL,
        "data" JSONB,
        "fileUrl" TEXT,
        "fileSize" VARCHAR(50),
        "status" VARCHAR(50) DEFAULT 'completed',
        "period" VARCHAR(20) DEFAULT 'month',
        "createdBy" INTEGER REFERENCES "Users"(id),
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "Suggestions" (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER REFERENCES "Users"(id) ON DELETE CASCADE,
        "userName" VARCHAR(255),
        "userRole" VARCHAR(50),
        "title" VARCHAR(255) NOT NULL,
        "message" TEXT NOT NULL,
        "category" VARCHAR(50) DEFAULT 'general',
        "status" VARCHAR(50) DEFAULT 'pending',
        "decision" VARCHAR(50),
        "response" TEXT,
        "feedback" TEXT,
        "respondedBy" INTEGER REFERENCES "Users"(id),
        "respondedAt" TIMESTAMP,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Reports and Suggestions tables verified');
  } catch (error) {
    console.log('Tables may already exist:', error.message);
  }
};

ensureTables();

// ===========================================
// DASHBOARD STATS
// ===========================================
router.get('/stats', async (req, res, next) => {
  try {
    const isSuperAdmin = req.user.role === 'superadmin';

    const totalStudents = await Student.count();
    const totalTeachers = await Teacher.count();
    const totalSchools = await School.count();
    const pendingStudents = await User.count({ where: { role: 'student', status: 'pending' } });

    let response = { totalStudents, totalTeachers, totalSchools, pendingStudents };

    if (isSuperAdmin) {
      const totalSubAdmins = await User.count({ where: { role: 'subadmin' } });
      const activeSubAdmins = await User.count({ where: { role: 'subadmin', status: 'active' } });
      const totalSuperAdmins = await User.count({ where: { role: 'superadmin' } });
      response.totalSubAdmins = totalSubAdmins;
      response.activeSubAdmins = activeSubAdmins;
      response.totalSuperAdmins = totalSuperAdmins;
    }

    res.json({ success: true, data: response });
  } catch (error) {
    console.error('Stats error:', error);
    res.json({ success: true, data: { totalStudents: 0, totalTeachers: 0, totalSchools: 0, pendingStudents: 0 } });
  }
});

// ===========================================
// STUDENT MANAGEMENT
// ===========================================

router.get('/students', async (req, res, next) => {
  try {
    console.log('📊 Fetching all students...');

    const [registeredStudents] = await sequelize.query(`
      SELECT 
        s.id, s."userId", s."idNumber", s."idPhoto",
        s."gradeLevel", s."department", s."schoolId", 
        s."schoolName", s."address", s."phone", s."photoVerified",
        s."createdAt",
        u.id as "userId", u."name", u."fatherName", u."grandfatherName",
        u."sex", u."email", 
        u."username", u."status",
        sc."schoolName" as "schoolNameDisplay",
        'registered' as source
      FROM "Students" s
      INNER JOIN "Users" u ON s."userId" = u.id
      LEFT JOIN "Schools" sc ON s."schoolId" = sc.id
      ORDER BY s."createdAt" DESC
    `);

    let preVerifiedStudents = [];
    try {
      const [result] = await sequelize.query(`
        SELECT 
          NULL as id, NULL as "userId", ssl."studentIdNumber" as "idNumber", NULL as "idPhoto",
          ssl."gradeLevel", ssl."department", ssl."schoolId",
          ssl."schoolName", NULL as address, NULL as phone, FALSE as "photoVerified",
          ssl."createdAt", NULL as "userId",
          ssl."studentName" as "name", ssl."studentFatherName" as "fatherName",
          ssl."studentGrandfatherName" as "grandfatherName", ssl."sex",
          NULL as email, NULL as username, 'pre_verified' as status,
          ssl."schoolName" as "schoolNameDisplay", 'pre_verified' as source
        FROM "SchoolStudentLists" ssl
        WHERE NOT EXISTS (
          SELECT 1 FROM "Students" s 
          WHERE s."idNumber" = ssl."studentIdNumber" 
          AND s."schoolId" = ssl."schoolId"
        )
        ORDER BY ssl."createdAt" DESC
      `);
      preVerifiedStudents = result;
    } catch (err) {
      preVerifiedStudents = [];
    }

    const allStudents = [...registeredStudents, ...preVerifiedStudents];

    const formattedStudents = allStudents.map(s => ({
      id: s.userId,
      userId: s.userId,
      name: s.name || '',
      fatherName: s.fatherName || '',
      grandfatherName: s.grandfatherName || '',
      sex: s.sex || '',
      email: s.email,
      username: s.username,
      idNumber: s.idNumber,
      grade: s.gradeLevel,
      department: s.department,
      schoolId: s.schoolId,
      schoolName: s.schoolNameDisplay || s.schoolName || 'Other School',
      idPhoto: s.idPhoto || null,
      status: s.status === 'pre_verified' ? 'pre_verified' : (s.status || 'pending'),
      source: s.source,
      photoVerified: s.photoVerified || false,
      phone: s.phone,
      address: s.address,
      createdAt: s.createdAt
    }));

    res.json({ success: true, data: formattedStudents });
  } catch (error) {
    console.error('❌ Error getting students:', error);
    res.status(500).json({ success: false, error: error.message, data: [] });
  }
});

router.get('/students/:id', async (req, res, next) => {
  try {
    const [student] = await sequelize.query(`
      SELECT 
        s.id, s."userId", s."idNumber", s."idPhoto",
        s."gradeLevel", s."department", s."schoolId", 
        s."schoolName", s."address", s."phone", s."photoVerified",
        u.id as "userId", u."name", u."fatherName", u."grandfatherName",
        u."sex", u."email", u."username", u."status", u."createdAt"
      FROM "Students" s
      INNER JOIN "Users" u ON s."userId" = u.id
      WHERE u.id = $1
    `, { bind: [req.params.id] });

    if (!student[0]) {
      return res.status(404).json({ success: false, error: { message: 'Student not found' } });
    }

    const s = student[0];
    res.json({
      success: true,
      data: {
        id: s.userId,
        name: s.name,
        fatherName: s.fatherName,
        grandfatherName: s.grandfatherName,
        sex: s.sex,
        email: s.email,
        username: s.username,
        idNumber: s.idNumber,
        gradeLevel: s.gradeLevel,
        department: s.department,
        schoolName: s.schoolName,
        phone: s.phone,
        address: s.address,
        status: s.status,
        idPhoto: s.idPhoto,
        photoVerified: s.photoVerified,
        createdAt: s.createdAt
      }
    });
  } catch (error) {
    console.error('Error getting student:', error);
    next(error);
  }
});

router.post('/students/:id/approve', async (req, res, next) => {
  try {
    const [preVerifiedStudent] = await sequelize.query(`
      SELECT "studentIdNumber", "schoolId", "studentName", "studentFatherName", "studentGrandfatherName", "sex", "gradeLevel", "department", "schoolName"
      FROM "SchoolStudentLists" 
      WHERE "studentIdNumber" = $1
    `, { bind: [req.params.id] });

    if (preVerifiedStudent[0]) {
      const student = preVerifiedStudent[0];
      const username = `student_${student.studentIdNumber}`;
      const tempPassword = Math.random().toString(36).slice(-8);
      const passwordHash = await bcrypt.hash(tempPassword, 10);

      const [newUser] = await sequelize.query(`
        INSERT INTO "Users" (name, "fatherName", "grandfatherName", sex, email, username, "passwordHash", role, status, "createdAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'student', 'active', NOW())
        RETURNING id
      `, {
        bind: [
          student.studentName,
          student.studentFatherName,
          student.studentGrandfatherName,
          student.sex,
          `${student.studentIdNumber}@school.edu`,
          username,
          passwordHash
        ]
      });

      const userId = newUser[0].id;

      await sequelize.query(`
        INSERT INTO "Students" ("userId", "idNumber", "gradeLevel", "department", "schoolId", "schoolName", "photoVerified", "photoVerifiedBy", "photoVerifiedAt", "createdAt")
        VALUES ($1, $2, $3, $4, $5, $6, true, $7, NOW(), NOW())
      `, {
        bind: [
          userId,
          student.studentIdNumber,
          student.gradeLevel,
          student.department,
          student.schoolId,
          student.schoolName,
          req.user.id
        ]
      });

      await sequelize.query(`
        DELETE FROM "SchoolStudentLists" WHERE "studentIdNumber" = $1
      `, { bind: [req.params.id] });

      return res.json({
        success: true,
        message: 'Pre-verified student approved and account created',
        data: { userId, username, tempPassword }
      });
    }

    const [user] = await sequelize.query(`
      SELECT id FROM "Users" WHERE id = $1
    `, { bind: [req.params.id] });

    if (!user[0]) {
      return res.status(404).json({ success: false, error: 'Invalid student ID' });
    }

    await sequelize.query(`
      UPDATE "Users" SET status = 'active', "updatedAt" = NOW()
      WHERE id = $1
    `, { bind: [req.params.id] });

    const [studentRecord] = await sequelize.query(`
      SELECT id FROM "Students" WHERE "userId" = $1
    `, { bind: [req.params.id] });

    if (studentRecord[0]) {
      await sequelize.query(`
        UPDATE "Students" SET "photoVerified" = true, "photoVerifiedBy" = $1, "photoVerifiedAt" = NOW()
        WHERE "userId" = $2
      `, { bind: [req.user.id, req.params.id] });
    }

    const [student] = await sequelize.query(`
      SELECT u.email, u."name", u.username FROM "Users" u WHERE u.id = $1
    `, { bind: [req.params.id] });

    await sequelize.query(`
      INSERT INTO "Notifications" ("userId", title, message, type, "createdAt")
      VALUES ($1, '✅ Account Approved', 'Your student account has been approved. You can now login.', 'success', NOW())
    `, { bind: [req.params.id] });

    // Mark related admin notifications as read when student is approved
    await sequelize.query(`
      UPDATE "Notifications" 
      SET "isRead" = true, "updatedAt" = NOW()
      WHERE type = 'student_registration' AND metadata->>'userId' = $1
    `, { bind: [req.params.id] });

    if (student[0]?.email) {
      sendAccountApprovedEmail(student[0].email, student[0].name || 'Student', 'student').catch(err => {
        console.error('Failed to send approval email:', err.message);
      });
    }

    res.json({ success: true, message: 'Student approved successfully' });
  } catch (error) {
    console.error('Approve error:', error);
    next(error);
  }
});

router.post('/students/:id/reject', async (req, res, next) => {
  try {
    const { reason } = req.body;
    const rejectionReason = reason || 'Your account registration has been rejected.';

    await sequelize.query(`
      UPDATE "Users" SET status = 'rejected', "updatedAt" = NOW()
      WHERE id = $1 AND role = 'student'
    `, { bind: [req.params.id] });

    const [student] = await sequelize.query(`
      SELECT u.email, u."name" FROM "Users" u WHERE u.id = $1
    `, { bind: [req.params.id] });

    await sequelize.query(`
      INSERT INTO "Notifications" ("userId", title, message, type, metadata, "createdAt")
      VALUES ($1, '❌ Account Rejected', $2, 'error', $3, NOW())
    `, { bind: [req.params.id, rejectionReason, JSON.stringify({ reason })] });

    // Mark related admin notifications as read when student is rejected
    await sequelize.query(`
      UPDATE "Notifications" 
      SET "isRead" = true, "updatedAt" = NOW()
      WHERE type = 'student_registration' AND metadata->>'userId' = $1
    `, { bind: [req.params.id] });

    if (student[0]?.email) {
      sendEmail({
        to: student[0].email,
        subject: 'EEEP Account Rejected',
        html: `<h2>Account Rejected</h2><p>Reason: ${rejectionReason}</p><p>Contact support for more information.</p>`
      }).catch(err => console.error('Failed to send rejection email:', err.message));
    }

    res.json({ success: true, message: 'Student rejected' });
  } catch (error) {
    next(error);
  }
});

router.post('/students/:id/suspend', async (req, res, next) => {
  try {
    const { reason } = req.body;
    const suspendReason = reason || 'Your account has been suspended.';

    await sequelize.query(`
      UPDATE "Users" SET status = 'suspended', "updatedAt" = NOW()
      WHERE id = $1 AND role = 'student'
    `, { bind: [req.params.id] });

    await sequelize.query(`
      INSERT INTO "Notifications" ("userId", title, message, type, metadata, "createdAt")
      VALUES ($1, '⏸️ Account Suspended', $2, 'warning', $3, NOW())
    `, { bind: [req.params.id, suspendReason, JSON.stringify({ reason })] });

    res.json({ success: true, message: 'Student suspended' });
  } catch (error) {
    next(error);
  }
});

router.post('/students/:id/activate', async (req, res, next) => {
  try {
    const [user] = await sequelize.query(`
      SELECT id FROM "Users" WHERE id = $1
    `, { bind: [req.params.id] });

    if (!user[0]) {
      return res.status(404).json({ success: false, error: 'Invalid student ID' });
    }

    await sequelize.query(`
      UPDATE "Users" SET status = 'active', "updatedAt" = NOW()
      WHERE id = $1
    `, { bind: [req.params.id] });

    await sequelize.query(`
      INSERT INTO "Notifications" ("userId", title, message, type, "createdAt")
      VALUES ($1, '✅ Account Activated', 'Your account has been reactivated. You can now login.', 'success', NOW())
    `, { bind: [req.params.id] });

    res.json({ success: true, message: 'Student activated' });
  } catch (error) {
    next(error);
  }
});

router.post('/students/:id/ban', async (req, res, next) => {
  try {
    const { reason } = req.body;
    const banReason = reason || 'Your account has been permanently banned.';

    const [preVerifiedStudent] = await sequelize.query(`
      SELECT "studentIdNumber", "schoolId" FROM "SchoolStudentLists" 
      WHERE "studentIdNumber" = $1
    `, { bind: [req.params.id] });

    if (preVerifiedStudent[0]) {
      await sequelize.query(`
        UPDATE "SchoolStudentLists" SET status = 'rejected' WHERE "studentIdNumber" = $1
      `, { bind: [req.params.id] });

      return res.json({ success: true, message: 'Pre-verified student marked as rejected' });
    }

    const [user] = await sequelize.query(`
      SELECT id FROM "Users" WHERE id = $1
    `, { bind: [req.params.id] });

    if (!user[0]) {
      return res.status(404).json({ success: false, error: 'Invalid student ID' });
    }

    await sequelize.query(`
      UPDATE "Users" SET status = 'banned', "updatedAt" = NOW()
      WHERE id = $1
    `, { bind: [req.params.id] });

    await sequelize.query(`
      INSERT INTO "Notifications" ("userId", title, message, type, metadata, "createdAt")
      VALUES ($1, '🚫 Account Banned', $2, 'error', $3, NOW())
    `, { bind: [req.params.id, banReason, JSON.stringify({ reason })] });

    res.json({ success: true, message: 'Student banned' });
  } catch (error) {
    next(error);
  }
});

router.delete('/students/:id', async (req, res, next) => {
  try {
    const [preVerifiedStudent] = await sequelize.query(`
      SELECT "studentIdNumber", "schoolId" FROM "SchoolStudentLists" 
      WHERE "studentIdNumber" = $1
    `, { bind: [req.params.id] });

    if (preVerifiedStudent[0]) {
      await sequelize.query(`
        DELETE FROM "SchoolStudentLists" WHERE "studentIdNumber" = $1
      `, { bind: [req.params.id] });

      return res.json({ success: true, message: 'Pre-verified student deleted permanently' });
    }

    const [user] = await sequelize.query(`
      SELECT id FROM "Users" WHERE id = $1
    `, { bind: [req.params.id] });

    if (!user[0]) {
      return res.status(404).json({ success: false, error: 'Invalid student ID' });
    }

    const [student] = await sequelize.query(`
      SELECT id FROM "Students" WHERE "userId" = $1
    `, { bind: [req.params.id] });

    if (student[0]) {
      try {
        await sequelize.query(`DELETE FROM "ExamAttempts" WHERE "studentId" = $1`, { bind: [student[0].id] });
      } catch (e) { }
      try {
        await sequelize.query(`DELETE FROM "Progress" WHERE "studentId" = $1`, { bind: [student[0].id] });
      } catch (e) { }
      try {
        await sequelize.query(`DELETE FROM "Students" WHERE "userId" = $1`, { bind: [req.params.id] });
      } catch (e) { }
    }

    await sequelize.query(`DELETE FROM "Users" WHERE id = $1`, { bind: [req.params.id] });

    res.json({ success: true, message: 'Student deleted permanently' });
  } catch (error) {
    console.error('Delete student error:', error);
    next(error);
  }
});

// ===========================================
// SCHOOL MANAGEMENT
// ===========================================

router.get('/schools', async (req, res, next) => {
  try {
    const [schools] = await sequelize.query(`
      SELECT 
        s.id, s."schoolName", s.address, s.phone, s.email, s.status, s."createdAt",
        s."adminId",
        u."name" as "adminName", u."fatherName" as "adminFatherName", u."grandfatherName" as "adminGrandfatherName"
      FROM "Schools" s
      LEFT JOIN "Users" u ON s."adminId" = u.id
      ORDER BY s."schoolName" ASC
    `);
    res.json({ success: true, data: schools });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, data: [] });
  }
});

router.post('/schools', async (req, res, next) => {
  try {
    const { schoolName, address, phone, email, name, fatherName, grandfatherName, adminUsername, tempPassword } = req.body;

    if (!schoolName || !schoolName.trim()) throw createError('School name is required', 400);
    if (!email || !email.trim()) throw createError('Admin email is required', 400);
    if (!name || !name.trim()) throw createError('Admin name is required', 400);
    if (!fatherName || !fatherName.trim()) throw createError('Admin father name is required', 400);
    if (!grandfatherName || !grandfatherName.trim()) throw createError('Admin grandfather name is required', 400);
    if (!tempPassword || tempPassword.length < 6) throw createError('Temporary password must be at least 6 characters', 400);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) throw createError('Please enter a valid email address', 400);

    const [existingSchool] = await sequelize.query(`SELECT id FROM "Schools" WHERE "schoolName" = $1`, { bind: [schoolName.trim()] });
    if (existingSchool.length > 0) throw createError('School with this name already exists', 400);

    const [existingUser] = await sequelize.query(`SELECT id FROM "Users" WHERE email = $1`, { bind: [email.trim().toLowerCase()] });
    if (existingUser.length > 0) throw createError('Email already exists', 400);

    const finalUsername = adminUsername || email.split('@')[0];
    const finalTempPassword = tempPassword;
    const hashedPassword = await bcrypt.hash(finalTempPassword, 10);

    const [adminUser] = await sequelize.query(`
      INSERT INTO "Users" ("name", "fatherName", "grandfatherName", email, username, "passwordHash", role, status, "forcePasswordChange", "isFirstLogin", "createdAt")
      VALUES ($1, $2, $3, $4, $5, $6, 'school', 'active', true, true, NOW())
      RETURNING id
    `, { bind: [name.trim(), fatherName.trim(), grandfatherName.trim(), email.trim().toLowerCase(), finalUsername.toLowerCase(), hashedPassword] });

    const adminUserId = adminUser[0].id;

    const [school] = await sequelize.query(`
      INSERT INTO "Schools" ("schoolName", address, phone, email, "adminId", "createdBy", status, "createdAt")
      VALUES ($1, $2, $3, $4, $5, $6, 'approved', NOW())
      RETURNING id, "schoolName"
    `, { bind: [schoolName.trim(), address || null, phone || null, email.trim().toLowerCase(), adminUserId, req.user.id] });

    sendWelcomeEmail(email, name, 'school', finalTempPassword, finalUsername).catch(err => {
      console.error('Failed to send school admin email:', err.message);
    });

    res.status(201).json({
      success: true,
      message: 'School created successfully',
      data: { schoolId: school[0].id, schoolName, username: finalUsername, tempPassword: finalTempPassword }
    });
  } catch (error) {
    console.error('Error creating school:', error);
    next(error);
  }
});

router.delete('/schools/:id', async (req, res, next) => {
  try {
    const [school] = await sequelize.query(`SELECT "adminId" FROM "Schools" WHERE id = $1`, { bind: [req.params.id] });
    if (school[0]?.adminId) {
      await sequelize.query(`DELETE FROM "Users" WHERE id = $1`, { bind: [school[0].adminId] });
    }
    await sequelize.query(`DELETE FROM "Schools" WHERE id = $1`, { bind: [req.params.id] });
    res.json({ success: true, message: 'School deleted' });
  } catch (error) {
    next(error);
  }
});

// ===========================================
// TEACHER MANAGEMENT
// ===========================================

router.get('/teachers', async (req, res, next) => {
  try {
    const [teachers] = await sequelize.query(`
      SELECT 
        t.id, t."userId", t.qualification, t.specialization, t.department, t.status,
        u.id as "userId", u."name", u."fatherName", u."grandfatherName",
        u.email, u.username, u.status as userStatus
      FROM "Teachers" t
      INNER JOIN "Users" u ON t."userId" = u.id
      ORDER BY t."createdAt" DESC
    `);

    const formattedTeachers = teachers.map(t => ({
      id: t.id,
      userId: t.userId,
      qualification: t.qualification,
      specialization: t.specialization,
      department: t.department,
      status: t.status,
      user: {
        id: t.userId,
        name: t.name,
        fatherName: t.fatherName,
        grandfatherName: t.grandfatherName,
        email: t.email,
        username: t.username,
        status: t.userStatus
      }
    }));

    res.json({ success: true, data: formattedTeachers });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, data: [] });
  }
});

router.post('/teachers', async (req, res, next) => {
  try {
    const { name, fatherName, grandfatherName, email, username, qualification, specialization, department, tempPassword } = req.body;

    if (!name || !name.trim()) throw createError('Teacher name is required', 400);
    if (!fatherName || !fatherName.trim()) throw createError('Father name is required', 400);
    if (!grandfatherName || !grandfatherName.trim()) throw createError('Grandfather name is required', 400);
    if (!email || !email.trim()) throw createError('Email is required', 400);
    if (!specialization) throw createError('Specialization is required', 400);
    if (!tempPassword || tempPassword.length < 6) throw createError('Password must be at least 6 characters', 400);

    const finalUsername = username || email.split('@')[0];
    const finalTempPassword = tempPassword;
    const hashedPassword = await bcrypt.hash(finalTempPassword, 10);

    const [existingUser] = await sequelize.query(`SELECT id FROM "Users" WHERE email = $1 OR username = $2`, { bind: [email, finalUsername] });
    if (existingUser.length > 0) throw createError('Email or username already exists', 400);

    const [newUser] = await sequelize.query(`
      INSERT INTO "Users" ("name", "fatherName", "grandfatherName", email, username, "passwordHash", role, status, "forcePasswordChange", "isFirstLogin", "createdAt")
      VALUES ($1, $2, $3, $4, $5, $6, 'teacher', 'active', true, true, NOW())
      RETURNING id
    `, { bind: [name, fatherName, grandfatherName, email, finalUsername, hashedPassword] });

    const [newTeacher] = await sequelize.query(`
      INSERT INTO "Teachers" ("userId", qualification, specialization, department, status, "createdBy", "createdAt")
      VALUES ($1, $2, $3, $4, 'active', $5, NOW())
      RETURNING id
    `, { bind: [newUser[0].id, qualification, specialization, department, req.user.id] });

    sendWelcomeEmail(email, name, 'teacher', finalTempPassword, finalUsername).catch(err => {
      console.error('Failed to send teacher welcome email:', err.message);
    });

    res.status(201).json({ success: true, data: { id: newTeacher[0].id, username: finalUsername, tempPassword: finalTempPassword, specialization } });
  } catch (error) {
    next(error);
  }
});

router.delete('/teachers/:id', async (req, res, next) => {
  try {
    const [teacher] = await sequelize.query(`SELECT "userId" FROM "Teachers" WHERE id = $1`, { bind: [req.params.id] });
    if (teacher[0]?.userId) {
      await sequelize.query(`DELETE FROM "Users" WHERE id = $1`, { bind: [teacher[0].userId] });
    }
    await sequelize.query(`DELETE FROM "Teachers" WHERE id = $1`, { bind: [req.params.id] });
    res.json({ success: true, message: 'Teacher deleted' });
  } catch (error) {
    next(error);
  }
});

// ===========================================
// SUB ADMIN MANAGEMENT (Super Admin only)
// ===========================================

router.get('/subadmins', authorizeSuperAdmin, async (req, res, next) => {
  try {
    const [subadmins] = await sequelize.query(`
      SELECT u.id, u."name", u."fatherName", u."grandfatherName", u.email, u.username, u.status, u."createdAt"
      FROM "Users" u WHERE u.role = 'subadmin' ORDER BY u."createdAt" DESC
    `);
    res.json({ success: true, data: subadmins });
  } catch (error) {
    next(error);
  }
});

router.post('/subadmins', authorizeSuperAdmin, async (req, res, next) => {
  try {
    const { name, fatherName, grandfatherName, sex, email, username, tempPassword } = req.body;

    if (!name || !name.trim()) throw createError('Name is required', 400);
    if (!fatherName || !fatherName.trim()) throw createError('Father name is required', 400);
    if (!grandfatherName || !grandfatherName.trim()) throw createError('Grandfather name is required', 400);
    if (!email || !email.trim()) throw createError('Email is required', 400);
    if (!tempPassword || tempPassword.length < 6) throw createError('Password must be at least 6 characters', 400);

    const finalUsername = username || email.split('@')[0];

    const [existingUser] = await sequelize.query(`SELECT id FROM "Users" WHERE email = $1 OR username = $2`, { bind: [email, finalUsername] });
    if (existingUser.length > 0) throw createError('Email or username already exists', 400);

    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const [newUser] = await sequelize.query(`
      INSERT INTO "Users" ("name", "fatherName", "grandfatherName", sex, email, username, "passwordHash", role, status, "forcePasswordChange", "isFirstLogin", "createdAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'subadmin', 'active', true, true, NOW())
      RETURNING id
    `, { bind: [name, fatherName, grandfatherName, sex || null, email, finalUsername, hashedPassword] });

    await sequelize.query(`
      INSERT INTO "Admins" ("userId", "adminType", "managedBy", "createdAt")
      VALUES ($1, 'subadmin', $2, NOW())
    `, { bind: [newUser[0].id, req.user.id] });

    sendWelcomeEmail(email, name, 'subadmin', tempPassword, finalUsername).catch(err => {
      console.error('Failed to send subadmin welcome email:', err.message);
    });

    res.status(201).json({ success: true, data: { username: finalUsername, tempPassword } });
  } catch (error) {
    next(error);
  }
});

router.delete('/subadmins/:id', authorizeSuperAdmin, async (req, res, next) => {
  try {
    await sequelize.query(`DELETE FROM "Users" WHERE id = $1 AND role = 'subadmin'`, { bind: [req.params.id] });
    res.json({ success: true, message: 'Sub admin deleted' });
  } catch (error) {
    next(error);
  }
});

router.post('/subadmins/:id/reset-password', authorizeSuperAdmin, async (req, res, next) => {
  try {
    const { newPassword } = req.body;
    const tempPassword = newPassword || generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    await sequelize.query(`
      UPDATE "Users" SET "passwordHash" = $1, "forcePasswordChange" = true, "isFirstLogin" = true, "updatedAt" = NOW()
      WHERE id = $2 AND role = 'subadmin'
    `, { bind: [hashedPassword, req.params.id] });

    res.json({ success: true, data: { tempPassword } });
  } catch (error) {
    next(error);
  }
});

// ===========================================
// SUPER ADMIN MANAGEMENT (Super Admin only)
// ===========================================

router.get('/superadmins', authorizeSuperAdmin, async (req, res, next) => {
  try {
    const [superAdmins] = await sequelize.query(`
      SELECT u.id, u."name", u."fatherName", u."grandfatherName", u.email, u.username, u.status, u."createdAt", u."lastLogin"
      FROM "Users" u 
      WHERE u.role = 'superadmin' 
      ORDER BY u."createdAt" ASC
    `);
    res.json({ success: true, data: superAdmins });
  } catch (error) {
    next(error);
  }
});

router.post('/superadmins', authorizeSuperAdmin, async (req, res, next) => {
  try {
    const { name, fatherName, grandfatherName, sex, email, username, tempPassword } = req.body;

    if (!name || !name.trim()) throw createError('Name is required', 400);
    if (!fatherName || !fatherName.trim()) throw createError('Father name is required', 400);
    if (!grandfatherName || !grandfatherName.trim()) throw createError('Grandfather name is required', 400);
    if (!email || !email.trim()) throw createError('Email is required', 400);
    if (!tempPassword || tempPassword.length < 6) throw createError('Password must be at least 6 characters', 400);

    const finalUsername = username || email.split('@')[0];

    const [existingUser] = await sequelize.query(`SELECT id FROM "Users" WHERE email = $1 OR username = $2`, { bind: [email, finalUsername] });
    if (existingUser.length > 0) throw createError('Email or username already exists', 400);

    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const [newUser] = await sequelize.query(`
      INSERT INTO "Users" ("name", "fatherName", "grandfatherName", sex, email, username, "passwordHash", role, status, "forcePasswordChange", "isFirstLogin", "createdAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'superadmin', 'active', true, true, NOW())
      RETURNING id
    `, { bind: [name, fatherName, grandfatherName, sex || null, email, finalUsername, hashedPassword] });

    await sequelize.query(`
      INSERT INTO "Admins" ("userId", "adminType", "managedBy", "createdAt")
      VALUES ($1, 'superadmin', $2, NOW())
    `, { bind: [newUser[0].id, req.user.id] });

    sendWelcomeEmail(email, name, 'superadmin', tempPassword, finalUsername).catch(err => {
      console.error('Failed to send superadmin welcome email:', err.message);
    });

    res.status(201).json({
      success: true,
      message: 'Super Admin created successfully',
      data: { id: newUser[0].id, username: finalUsername, tempPassword }
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/superadmins/:id', authorizeSuperAdmin, async (req, res, next) => {
  try {
    const [countResult] = await sequelize.query(`SELECT COUNT(*) FROM "Users" WHERE role = 'superadmin' AND status = 'active'`);
    const superAdminCount = parseInt(countResult[0].count);

    if (superAdminCount <= 1) {
      throw createError('Cannot delete the last Super Admin. Create another one first.', 400);
    }

    const [superAdmin] = await sequelize.query(`SELECT id, role FROM "Users" WHERE id = $1`, { bind: [req.params.id] });
    if (!superAdmin[0] || superAdmin[0].role !== 'superadmin') {
      throw createError('Super Admin not found', 404);
    }

    if (parseInt(req.params.id) === req.user.id) {
      throw createError('You cannot delete your own account', 400);
    }

    await sequelize.query(`DELETE FROM "Users" WHERE id = $1 AND role = 'superadmin'`, { bind: [req.params.id] });
    res.json({ success: true, message: 'Super Admin deleted successfully' });
  } catch (error) {
    next(error);
  }
});

router.post('/superadmins/:id/reset-password', authorizeSuperAdmin, async (req, res, next) => {
  try {
    const { newPassword } = req.body;
    const tempPassword = newPassword || generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    await sequelize.query(`
      UPDATE "Users" 
      SET "passwordHash" = $1, 
          "forcePasswordChange" = true, 
          "isFirstLogin" = true, 
          "updatedAt" = NOW()
      WHERE id = $2 AND role = 'superadmin'
    `, { bind: [hashedPassword, req.params.id] });

    res.json({ success: true, data: { tempPassword } });
  } catch (error) {
    next(error);
  }
});

// ===========================================
// SUPERADMINS LIST FOR MESSAGING (SubAdmin access)
// ===========================================
// This endpoint allows subadmins to fetch superadmins for sending messages
router.get('/superadmins-for-messaging', async (req, res, next) => {
  try {
    // Only subadmins and superadmins can access this
    if (req.user.role !== 'subadmin' && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        error: { message: 'Access denied' }
      });
    }

    const [superAdmins] = await sequelize.query(`
      SELECT u.id, u."name", u.email, u.role
      FROM "Users" u 
      WHERE u.role = 'superadmin' AND u.status = 'active'
      ORDER BY u."name" ASC
    `);

    res.json({ success: true, data: superAdmins });
  } catch (error) {
    console.error('Error fetching superadmins for messaging:', error);
    next(error);
  }
});

// ===========================================
// SUGGESTIONS MANAGEMENT
// ===========================================

router.get('/suggestions', async (req, res, next) => {
  try {
    const isSuperAdmin = req.user.role === 'superadmin';
    const userId = req.user.id;

    let query = `
      SELECT 
        s.id, s.title, s.message, s.category, s.status, 
        s.decision, s.response, s.feedback,
        s."createdAt", s."respondedAt",
        u.name as user_name, u.email as user_email, u.role as user_role
      FROM "Suggestions" s
      LEFT JOIN "Users" u ON s."userId" = u.id
    `;

    const params = [];

    if (!isSuperAdmin) {
      query += ` WHERE s."userId" = $1`;
      params.push(userId);
    }

    query += ` ORDER BY s."createdAt" DESC`;

    const [suggestions] = await sequelize.query(query, { bind: params });
    res.json({ success: true, data: suggestions });
  } catch (error) {
    console.error('Error fetching suggestions:', error);
    res.json({ success: true, data: [] });
  }
});

router.get('/suggestions/stats', async (req, res, next) => {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Super Admin only.'
    });
  }

  try {
    const [stats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
      FROM "Suggestions"
    `);

    res.json({
      success: true,
      data: {
        total: parseInt(stats[0].total) || 0,
        pending: parseInt(stats[0].pending) || 0,
        approved: parseInt(stats[0].approved) || 0,
        rejected: parseInt(stats[0].rejected) || 0
      }
    });
  } catch (error) {
    console.error('Error fetching suggestions stats:', error);
    res.json({ success: true, data: { total: 0, pending: 0, approved: 0, rejected: 0 } });
  }
});

router.post('/suggestions', async (req, res, next) => {
  try {
    const { title, message, category } = req.body;

    if (!title || !title.trim()) throw createError('Title is required', 400);
    if (!message || !message.trim()) throw createError('Message is required', 400);

    await sequelize.query(`
      INSERT INTO "Suggestions" ("userId", "userName", "userRole", title, message, category, status, "createdAt")
      VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())
    `, {
      bind: [req.user.id, req.user.name, req.user.role, title.trim(), message.trim(), category || 'general']
    });

    const [superAdmins] = await sequelize.query(`
      SELECT u.id FROM "Users" u
      INNER JOIN "Admins" a ON u.id = a."userId"
      WHERE u.role = 'superadmin' AND u.status = 'active'
    `);

    for (const admin of superAdmins) {
      await sequelize.query(`
        INSERT INTO "Notifications" ("userId", title, message, type, metadata, "createdAt")
        VALUES ($1, '📋 New Suggestion Submitted', $2, 'suggestion', $3, NOW())
      `, {
        bind: [admin.id, `${req.user.name} submitted: ${title}`, JSON.stringify({ suggestionTitle: title, fromUser: req.user.id })]
      });
    }

    res.status(201).json({ success: true, message: 'Suggestion submitted successfully' });
  } catch (error) {
    next(error);
  }
});

router.post('/suggestions/:id/respond', async (req, res, next) => {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Only Super Admin can respond to suggestions.'
    });
  }

  try {
    const { decision, response, feedback } = req.body;
    const suggestionId = req.params.id;

    if (!decision || !['approved', 'rejected'].includes(decision)) {
      throw createError('Valid decision (approved/rejected) is required', 400);
    }
    if (!response || !response.trim()) throw createError('Response message is required', 400);

    await sequelize.query(`
      UPDATE "Suggestions" 
      SET status = $1, decision = $1, response = $2, feedback = $3, 
          "respondedBy" = $4, "respondedAt" = NOW(), "updatedAt" = NOW()
      WHERE id = $5
    `, {
      bind: [decision, response.trim(), feedback || null, req.user.id, suggestionId]
    });

    const [suggestion] = await sequelize.query(`
      SELECT "userId", title FROM "Suggestions" WHERE id = $1
    `, { bind: [suggestionId] });

    if (suggestion[0]) {
      await sequelize.query(`
        INSERT INTO "Notifications" ("userId", title, message, type, metadata, "createdAt")
        VALUES ($1, $2, $3, 'suggestion_response', $4, NOW())
      `, {
        bind: [
          suggestion[0].userId,
          decision === 'approved' ? '✅ Suggestion Approved' : '❌ Suggestion Rejected',
          `Your suggestion "${suggestion[0].title}" has been ${decision}. Response: ${response}`,
          JSON.stringify({ suggestionId, decision, response })
        ]
      });
    }

    res.json({ success: true, message: `Suggestion ${decision} successfully` });
  } catch (error) {
    next(error);
  }
});

// ===========================================
// CONTACT MESSAGES MANAGEMENT
// ===========================================

router.get('/contact-messages', async (req, res, next) => {
  try {
    const { status, limit = 50, page = 1 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT 
        cm.id, cm.name, cm.email, cm.subject, cm.message, 
        cm.status, cm."respondedBy", cm.response, cm."respondedAt",
        cm."createdAt", cm."updatedAt",
        u.name as responder_name, u.email as responder_email
      FROM "ContactMessages" cm
      LEFT JOIN "Users" u ON cm."respondedBy" = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'all') {
      params.push(status);
      query += ` AND cm.status = $${params.length}`;
    }

    const countQuery = query.replace(
      /SELECT cm\.id, cm\.name, cm\.email, cm\.subject, cm\.message, cm\.status, cm\."respondedBy", cm\.response, cm\."respondedAt", cm\."createdAt", cm\."updatedAt", u\.name as responder_name, u\.email as responder_email/,
      'SELECT COUNT(*) as count'
    );
    const [countResult] = await sequelize.query(countQuery, { bind: params });
    const total = countResult && countResult[0] ? parseInt(countResult[0].count || 0) : 0;

    query += ` ORDER BY cm.status ASC, cm."createdAt" DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), offset);

    const [messages] = await sequelize.query(query, { bind: params });

    res.json({
      success: true,
      data: {
        messages: messages,
        total: total,
        page: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        stats: {
          total: total,
          unread: 0,
          read: 0,
          responded: 0
        }
      }
    });
  } catch (error) {
    console.error('Error fetching contact messages:', error);
    res.json({ success: true, data: { messages: [], total: 0, page: 1, totalPages: 0, stats: { total: 0, unread: 0, read: 0, responded: 0 } } });
  }
});

router.get('/contact-messages/stats', async (req, res, next) => {
  try {
    const [stats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'unread' THEN 1 ELSE 0 END) as unread,
        SUM(CASE WHEN status = 'read' THEN 1 ELSE 0 END) as read,
        SUM(CASE WHEN status = 'responded' THEN 1 ELSE 0 END) as responded
      FROM "ContactMessages"
    `);

    res.json({
      success: true,
      data: {
        total: parseInt(stats[0]?.total || 0),
        unread: parseInt(stats[0]?.unread || 0),
        read: parseInt(stats[0]?.read || 0),
        responded: parseInt(stats[0]?.responded || 0)
      }
    });
  } catch (error) {
    console.error('Error fetching contact message stats:', error);
    res.json({ success: true, data: { total: 0, unread: 0, read: 0, responded: 0 } });
  }
});

router.put('/contact-messages/:id/read', async (req, res, next) => {
  try {
    const messageId = parseInt(req.params.id);

    const [message] = await sequelize.query(`
      SELECT id, status FROM "ContactMessages" WHERE id = $1
    `, { bind: [messageId] });

    if (!message[0]) {
      return res.status(404).json({
        success: false,
        error: 'Contact message not found'
      });
    }

    if (message[0].status === 'unread') {
      await sequelize.query(`
        UPDATE "ContactMessages" 
        SET status = 'read', "updatedAt" = NOW()
        WHERE id = $1
      `, { bind: [messageId] });
    }

    res.json({
      success: true,
      message: 'Message marked as read'
    });
  } catch (error) {
    console.error('Error marking message as read:', error);
    next(error);
  }
});

router.put('/contact-messages/:id/respond', async (req, res, next) => {
  try {
    const messageId = parseInt(req.params.id);
    const { response } = req.body;

    if (!response || !response.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Response message is required'
      });
    }

    const [message] = await sequelize.query(`
      SELECT id, name, email, subject FROM "ContactMessages" WHERE id = $1
    `, { bind: [messageId] });

    if (!message[0]) {
      return res.status(404).json({
        success: false,
        error: 'Contact message not found'
      });
    }

    await sequelize.query(`
      UPDATE "ContactMessages" 
      SET status = 'responded', response = $1, "respondedBy" = $2, 
          "respondedAt" = NOW(), "updatedAt" = NOW()
      WHERE id = $3
    `, { bind: [response.trim(), req.user.id, messageId] });

    res.json({
      success: true,
      message: 'Response sent successfully'
    });
  } catch (error) {
    console.error('Error responding to contact message:', error);
    next(error);
  }
});

router.delete('/contact-messages/:id', async (req, res, next) => {
  try {
    const messageId = parseInt(req.params.id);

    const [message] = await sequelize.query(`
      SELECT id FROM "ContactMessages" WHERE id = $1
    `, { bind: [messageId] });

    if (!message[0]) {
      return res.status(404).json({
        success: false,
        error: 'Contact message not found'
      });
    }

    await sequelize.query(`
      DELETE FROM "ContactMessages" WHERE id = $1
    `, { bind: [messageId] });

    res.json({
      success: true,
      message: 'Contact message deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting contact message:', error);
    next(error);
  }
});

// ===========================================
// REPORTS MANAGEMENT (Super Admin only)
// ===========================================

router.get('/reports', authorizeSuperAdmin, async (req, res, next) => {
  try {
    const { type, period } = req.query;

    let query = `SELECT * FROM "Reports" WHERE 1=1`;
    const params = [];

    if (type && type !== 'all') {
      params.push(type);
      query += ` AND type = $${params.length}`;
    }
    if (period && period !== 'all') {
      params.push(period);
      query += ` AND period = $${params.length}`;
    }

    query += ` ORDER BY "createdAt" DESC`;

    const [reports] = await sequelize.query(query, { bind: params });
    res.json({ success: true, data: reports });
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.json({ success: true, data: [] });
  }
});

router.post('/reports/generate/students', authorizeSuperAdmin, async (req, res, next) => {
  try {
    const { period } = req.body;

    const [totalStudents] = await sequelize.query(`SELECT COUNT(*) as count FROM "Users" WHERE role = 'student'`);
    const [activeStudents] = await sequelize.query(`SELECT COUNT(*) as count FROM "Users" WHERE role = 'student' AND status = 'active'`);
    const [pendingStudents] = await sequelize.query(`SELECT COUNT(*) as count FROM "Users" WHERE role = 'student' AND status = 'pending'`);
    const [studentsByGrade] = await sequelize.query(`SELECT "gradeLevel", COUNT(*) as count FROM "Students" GROUP BY "gradeLevel" ORDER BY "gradeLevel"`);
    const [studentsByDepartment] = await sequelize.query(`SELECT department, COUNT(*) as count FROM "Students" GROUP BY department`);

    const reportData = {
      reportId: `STU_${Date.now()}`,
      generatedAt: new Date(),
      period: period,
      summary: {
        totalStudents: parseInt(totalStudents[0].count),
        activeStudents: parseInt(activeStudents[0].count),
        pendingStudents: parseInt(pendingStudents[0].count),
        approvalRate: totalStudents[0].count > 0 ? ((activeStudents[0].count / totalStudents[0].count) * 100).toFixed(1) : 0
      },
      distribution: {
        byGrade: studentsByGrade,
        byDepartment: studentsByDepartment
      }
    };

    await sequelize.query(`
      INSERT INTO "Reports" ("title", "type", "data", "status", "period", "createdBy", "createdAt")
      VALUES ($1, 'students', $2, 'completed', $3, $4, NOW())
    `, {
      bind: [`Student Report - ${new Date().toLocaleDateString()}`, JSON.stringify(reportData), period || 'month', req.user.id]
    });

    res.json({ success: true, message: 'Student report generated successfully', data: reportData });
  } catch (error) {
    console.error('Error generating student report:', error);
    next(error);
  }
});

router.post('/reports/generate/teachers', authorizeSuperAdmin, async (req, res, next) => {
  try {
    const { period } = req.body;

    const [totalTeachers] = await sequelize.query(`SELECT COUNT(*) as count FROM "Users" WHERE role = 'teacher'`);
    const [activeTeachers] = await sequelize.query(`SELECT COUNT(*) as count FROM "Users" WHERE role = 'teacher' AND status = 'active'`);
    const [teachersByDepartment] = await sequelize.query(`SELECT department, COUNT(*) as count FROM "Teachers" GROUP BY department`);
    const [teachersBySpecialization] = await sequelize.query(`SELECT specialization, COUNT(*) as count FROM "Teachers" GROUP BY specialization ORDER BY count DESC`);

    const reportData = {
      reportId: `TCH_${Date.now()}`,
      generatedAt: new Date(),
      period: period,
      summary: {
        totalTeachers: parseInt(totalTeachers[0].count),
        activeTeachers: parseInt(activeTeachers[0].count)
      },
      distribution: {
        byDepartment: teachersByDepartment,
        bySpecialization: teachersBySpecialization
      }
    };

    await sequelize.query(`
      INSERT INTO "Reports" ("title", "type", "data", "status", "period", "createdBy", "createdAt")
      VALUES ($1, 'teachers', $2, 'completed', $3, $4, NOW())
    `, {
      bind: [`Teacher Report - ${new Date().toLocaleDateString()}`, JSON.stringify(reportData), period || 'month', req.user.id]
    });

    res.json({ success: true, message: 'Teacher report generated successfully', data: reportData });
  } catch (error) {
    console.error('Error generating teacher report:', error);
    next(error);
  }
});

router.post('/reports/generate/schools', authorizeSuperAdmin, async (req, res, next) => {
  try {
    const { period } = req.body;

    const [totalSchools] = await sequelize.query(`SELECT COUNT(*) as count FROM "Schools" WHERE status = 'approved'`);
    const [pendingSchools] = await sequelize.query(`SELECT COUNT(*) as count FROM "Schools" WHERE status = 'pending'`);
    const [schoolsWithMostStudents] = await sequelize.query(`
      SELECT s."schoolName", COUNT(st.id) as student_count
      FROM "Schools" s
      LEFT JOIN "Students" st ON s.id = st."schoolId"
      GROUP BY s.id, s."schoolName"
      ORDER BY student_count DESC
      LIMIT 10
    `);

    const reportData = {
      reportId: `SCH_${Date.now()}`,
      generatedAt: new Date(),
      period: period,
      summary: {
        totalSchools: parseInt(totalSchools[0].count),
        pendingSchools: parseInt(pendingSchools[0].count)
      },
      topSchools: schoolsWithMostStudents
    };

    await sequelize.query(`
      INSERT INTO "Reports" ("title", "type", "data", "status", "period", "createdBy", "createdAt")
      VALUES ($1, 'schools', $2, 'completed', $3, $4, NOW())
    `, {
      bind: [`Schools Report - ${new Date().toLocaleDateString()}`, JSON.stringify(reportData), period || 'month', req.user.id]
    });

    res.json({ success: true, message: 'Schools report generated successfully', data: reportData });
  } catch (error) {
    console.error('Error generating schools report:', error);
    next(error);
  }
});

router.post('/reports/generate/exams', authorizeSuperAdmin, async (req, res, next) => {
  try {
    const { period } = req.body;

    const [totalExams] = await sequelize.query(`SELECT COUNT(*) as count FROM "Exams"`);
    const [publishedExams] = await sequelize.query(`SELECT COUNT(*) as count FROM "Exams" WHERE status = 'published'`);
    const [examsByType] = await sequelize.query(`SELECT type, COUNT(*) as count FROM "Exams" GROUP BY type`);
    const [examsBySubject] = await sequelize.query(`SELECT subject, COUNT(*) as count FROM "Exams" GROUP BY subject ORDER BY count DESC`);

    const reportData = {
      reportId: `EXM_${Date.now()}`,
      generatedAt: new Date(),
      period: period,
      summary: {
        totalExams: parseInt(totalExams[0].count),
        publishedExams: parseInt(publishedExams[0].count)
      },
      distribution: {
        byType: examsByType,
        bySubject: examsBySubject
      }
    };

    await sequelize.query(`
      INSERT INTO "Reports" ("title", "type", "data", "status", "period", "createdBy", "createdAt")
      VALUES ($1, 'exams', $2, 'completed', $3, $4, NOW())
    `, {
      bind: [`Exams Report - ${new Date().toLocaleDateString()}`, JSON.stringify(reportData), period || 'month', req.user.id]
    });

    res.json({ success: true, message: 'Exams report generated successfully', data: reportData });
  } catch (error) {
    console.error('Error generating exams report:', error);
    next(error);
  }
});

router.post('/reports/generate/performance', authorizeSuperAdmin, async (req, res, next) => {
  try {
    const { period } = req.body;

    const [overallPerformance] = await sequelize.query(`
      SELECT 
        ROUND(AVG(ea.score), 2) as avg_score,
        ROUND(AVG((ea.score / e."totalMarks") * 100), 1) as avg_percentage,
        COUNT(CASE WHEN ea.score >= e."passingMarks" THEN 1 END) as passed,
        COUNT(*) as total_attempts
      FROM "ExamAttempts" ea
      JOIN "Exams" e ON ea."examId" = e.id
      WHERE ea.status = 'completed'
    `);

    const [performanceBySubject] = await sequelize.query(`
      SELECT 
        e.subject,
        COUNT(ea.id) as attempts,
        ROUND(AVG(ea.score), 2) as avg_score,
        ROUND(AVG((ea.score / e."totalMarks") * 100), 1) as avg_percentage
      FROM "ExamAttempts" ea
      JOIN "Exams" e ON ea."examId" = e.id
      WHERE ea.status = 'completed'
      GROUP BY e.subject
      ORDER BY avg_percentage DESC
    `);

    const reportData = {
      reportId: `PRF_${Date.now()}`,
      generatedAt: new Date(),
      period: period,
      overall: {
        averageScore: overallPerformance[0]?.avg_score || 0,
        averagePercentage: overallPerformance[0]?.avg_percentage || 0,
        passRate: overallPerformance[0]?.total_attempts > 0
          ? ((overallPerformance[0]?.passed / overallPerformance[0]?.total_attempts) * 100).toFixed(1)
          : 0
      },
      bySubject: performanceBySubject
    };

    await sequelize.query(`
      INSERT INTO "Reports" ("title", "type", "data", "status", "period", "createdBy", "createdAt")
      VALUES ($1, 'performance', $2, 'completed', $3, $4, NOW())
    `, {
      bind: [`Performance Report - ${new Date().toLocaleDateString()}`, JSON.stringify(reportData), period || 'month', req.user.id]
    });

    res.json({ success: true, message: 'Performance report generated successfully', data: reportData });
  } catch (error) {
    console.error('Error generating performance report:', error);
    next(error);
  }
});

router.get('/reports/download/:id', authorizeSuperAdmin, async (req, res, next) => {
  try {
    const [report] = await sequelize.query(`SELECT * FROM "Reports" WHERE id = $1`, { bind: [req.params.id] });

    if (!report[0]) {
      throw createError('Report not found', 404);
    }

    res.json({
      success: true,
      data: report[0],
      message: `Report "${report[0].title}" ready for download`
    });
  } catch (error) {
    next(error);
  }
});

// ===========================================
// MESSAGE EXCHANGE SYSTEM (FIXED)
// ===========================================

// GET /api/admin/messages - Fixed to properly separate Inbox and Sent
router.get('/messages', async (req, res, next) => {
  try {
    const userId = req.user.id;

    const [messages] = await sequelize.query(`
      SELECT 
        n.id, n."userId", n.title, n.message, n.type, n."isRead",
        n."createdAt", n."updatedAt", n.metadata
      FROM "Notifications" n
      WHERE n."userId" = $1
      ORDER BY n."createdAt" DESC
      LIMIT 200
    `, { bind: [userId] });

    const parsedMessages = messages.map(msg => {
      let metadata = {};
      try {
        metadata = typeof msg.metadata === 'string' ? JSON.parse(msg.metadata || '{}') : (msg.metadata || {});
      } catch (e) {
        metadata = {};
      }

      // Determine if this is a sent message or received message
      const isSent = msg.type === 'sent_message' || metadata.isSent === true;

      // For sent messages, we want to show recipient info
      // For received messages, we want to show sender info
      let sender_name = 'System';
      let sender_role = '';
      let recipient_name = '';
      let recipient_role = '';
      let senderId = null;

      if (isSent) {
        // This is a message I sent - show recipient info
        if (metadata.to && metadata.to.length > 0) {
          recipient_name = metadata.to.map(t => t.name).join(', ');
          recipient_role = metadata.toRole || '';
        } else if (metadata.toName) {
          recipient_name = metadata.toName;
          recipient_role = metadata.toRole || '';
        }
        sender_name = 'You';
        sender_role = req.user.role;
        senderId = req.user.id;
      } else {
        // This is a message I received - show sender info
        sender_name = metadata.fromName || metadata.senderName || 'System';
        sender_role = metadata.fromRole || '';
        senderId = metadata.from;
        recipient_name = 'You';
        recipient_role = req.user.role;
      }

      return {
        id: msg.id,
        userId: msg.userId,
        title: msg.title,
        message: msg.message,
        type: msg.type,
        isRead: msg.isRead || false,
        createdAt: msg.createdAt,
        updatedAt: msg.updatedAt,
        metadata: metadata,
        isSent: isSent,
        sender_name: sender_name,
        sender_role: sender_role,
        recipient_name: recipient_name,
        recipient_role: recipient_role,
        senderId: senderId
      };
    });

    res.json({ success: true, data: parsedMessages });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.json({ success: true, data: [] });
  }
});

// Send message from admin - Fixed to properly save sent messages
router.post('/send-message', async (req, res, next) => {
  try {
    const { recipientId, recipientRole, subject, message } = req.body;

    console.log('📨 Admin sending message:', { recipientId, recipientRole, subject, from: req.user.id, fromName: req.user.name });

    if (!subject || !subject.trim()) throw createError('Subject is required', 400);
    if (!message || !message.trim()) throw createError('Message is required', 400);

    let recipients = [];
    let recipientNames = [];

    if (recipientRole === 'all_teachers') {
      const [teachers] = await sequelize.query(`
        SELECT u.id, u.name FROM "Users" u 
        INNER JOIN "Teachers" t ON u.id = t."userId"
        WHERE u.status = 'active'
      `);
      recipients = teachers;
      recipientNames = teachers.map(t => t.name);
    } else if (recipientRole === 'all_schools') {
      const [schools] = await sequelize.query(`
        SELECT s."adminId" as id, u.name FROM "Schools" s
        INNER JOIN "Users" u ON s."adminId" = u.id
        WHERE u.status = 'active'
      `);
      recipients = schools;
      recipientNames = schools.map(s => s.name);
    } else if (recipientRole === 'all_subadmins') {
      const [subAdmins] = await sequelize.query(`
        SELECT id, name FROM "Users" 
        WHERE role = 'subadmin' AND status = 'active'
      `);
      recipients = subAdmins;
      recipientNames = subAdmins.map(a => a.name);
    } else if (recipientRole === 'all_superadmins') {
      const [superAdmins] = await sequelize.query(`
        SELECT id, name FROM "Users" 
        WHERE role = 'superadmin' AND status = 'active'
      `);
      recipients = superAdmins;
      recipientNames = superAdmins.map(a => a.name);
    } else if (recipientId) {
      const [user] = await sequelize.query(`
        SELECT id, name FROM "Users" WHERE id = $1
      `, { bind: [recipientId] });
      if (user[0]) {
        recipients = [{ id: user[0].id, name: user[0].name }];
        recipientNames = [user[0].name];
      }
    }

    if (recipients.length === 0) {
      throw createError('No recipients found', 400);
    }

    const recipientMetadata = {
      from: req.user.id,
      fromName: req.user.name,
      fromRole: req.user.role,
      timestamp: new Date().toISOString(),
      recipientCount: recipients.length,
      recipientNames: recipientNames,
      recipientRole: recipientRole
    };

    // Insert notifications for each recipient
    for (const recipient of recipients) {
      await sequelize.query(`
        INSERT INTO "Notifications" ("userId", title, message, type, metadata, "isRead", "createdAt")
        VALUES ($1, $2, $3, 'message', $4::jsonb, false, NOW())
      `, {
        bind: [recipient.id, subject.trim(), message.trim(), JSON.stringify({
          ...recipientMetadata,
          toId: recipient.id,
          toName: recipient.name
        })]
      });
    }

    // Create a "sent" record for the sender
    const sentMetadata = {
      to: recipients.map(r => ({ id: r.id, name: r.name })),
      toRole: recipientRole,
      timestamp: new Date().toISOString(),
      isSent: true,
      from: req.user.id,
      fromName: req.user.name,
      subject: subject.trim(),
      message: message.trim(),
      recipientCount: recipients.length
    };

    await sequelize.query(`
      INSERT INTO "Notifications" ("userId", title, message, type, metadata, "isRead", "createdAt")
      VALUES ($1, $2, $3, 'sent_message', $4::jsonb, true, NOW())
    `, {
      bind: [req.user.id, subject.trim(), message.trim(), JSON.stringify(sentMetadata)]
    });

    console.log(`✅ Message sent successfully to ${recipients.length} recipient(s)`);

    res.json({
      success: true,
      message: `Message sent to ${recipients.length} recipient(s)`,
      data: { recipientCount: recipients.length }
    });
  } catch (error) {
    console.error('Error sending message:', error);
    next(error);
  }
});

// Mark message as read
router.put('/messages/:id/read', async (req, res, next) => {
  try {
    const messageId = req.params.id;
    const userId = req.user.id;

    const [message] = await sequelize.query(`
      SELECT id, "isRead" FROM "Notifications" 
      WHERE id = $1 AND "userId" = $2
    `, { bind: [messageId, userId] });

    if (!message[0]) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    if (!message[0].isRead) {
      await sequelize.query(`
        UPDATE "Notifications" 
        SET "isRead" = true, "updatedAt" = NOW()
        WHERE id = $1 AND "userId" = $2
      `, { bind: [messageId, userId] });
    }

    res.json({ success: true, message: 'Message marked as read' });
  } catch (error) {
    console.error('Error marking message as read:', error);
    next(error);
  }
});

// Mark all messages as read
router.put('/messages/read-all', async (req, res, next) => {
  try {
    await sequelize.query(`
      UPDATE "Notifications" SET "isRead" = true, "updatedAt" = NOW()
      WHERE "userId" = $1 AND "isRead" = false AND type != 'sent_message'
    `, { bind: [req.user.id] });

    res.json({ success: true, message: 'All messages marked as read' });
  } catch (error) {
    next(error);
  }
});

// Get unread message count
router.get('/messages/unread/count', async (req, res, next) => {
  try {
    const [result] = await sequelize.query(`
      SELECT COUNT(*) as count FROM "Notifications" 
      WHERE "userId" = $1 AND "isRead" = false AND type != 'sent_message'
    `, { bind: [req.user.id] });

    res.json({ success: true, data: { unreadCount: parseInt(result[0].count) } });
  } catch (error) {
    next(error);
  }
});

// Delete message
router.delete('/messages/:id', async (req, res, next) => {
  try {
    await sequelize.query(`
      DELETE FROM "Notifications" 
      WHERE id = $1 AND "userId" = $2
    `, { bind: [req.params.id, req.user.id] });

    res.json({ success: true, message: 'Message deleted' });
  } catch (error) {
    next(error);
  }
});

// Delete all read messages
router.delete('/messages/read-all', async (req, res, next) => {
  try {
    await sequelize.query(`
      DELETE FROM "Notifications" 
      WHERE "userId" = $1 AND "isRead" = true
    `, { bind: [req.user.id] });

    res.json({ success: true, message: 'All read messages deleted' });
  } catch (error) {
    next(error);
  }
});

// ===========================================
// RECEIVED FILES FROM SCHOOLS
// ===========================================

router.get('/received-files', async (req, res, next) => {
  try {
    const [files] = await sequelize.query(`
      SELECT sfu.*, sc."schoolName" as "schoolName"
      FROM "SchoolFileUploads" sfu
      LEFT JOIN "Schools" sc ON sfu."schoolId" = sc.id
      ORDER BY sfu."createdAt" DESC
    `);
    res.json({ success: true, data: files });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, data: [] });
  }
});

router.post('/upload-local-file', localUpload.single('file'), async (req, res, next) => {
  try {
    const { schoolId, manualSchoolName } = req.body;

    if (!req.file) {
      throw createError('No file uploaded', 400);
    }

    let finalSchoolId = schoolId;
    let schoolName = '';

    if (schoolId === 'manual') {
      if (!manualSchoolName || !manualSchoolName.trim()) {
        throw createError('Manual school name is required', 400);
      }

      const [existingSchool] = await sequelize.query(`SELECT id FROM "Schools" WHERE "schoolName" = $1`, { bind: [manualSchoolName.trim()] });

      if (existingSchool[0]) {
        finalSchoolId = existingSchool[0].id;
        schoolName = manualSchoolName.trim();
      } else {
        const [newSchool] = await sequelize.query(`
          INSERT INTO "Schools" ("schoolName", status, "createdBy", "createdAt")
          VALUES ($1, 'approved', $2, NOW())
          RETURNING id, "schoolName"
        `, {
          bind: [manualSchoolName.trim(), req.user.id]
        });

        finalSchoolId = newSchool[0].id;
        schoolName = newSchool[0].schoolName;
      }
    } else {
      if (!schoolId) {
        throw createError('School ID is required', 400);
      }

      const [school] = await sequelize.query(`SELECT id, "schoolName" FROM "Schools" WHERE id = $1`, { bind: [schoolId] });
      if (!school[0]) {
        throw createError('School not found', 404);
      }

      finalSchoolId = schoolId;
      schoolName = school[0].schoolName;
    }

    const [newFile] = await sequelize.query(`
      INSERT INTO "SchoolFileUploads" (
        "fileName", "originalFileName", "fileUrl", "fileSize", 
        "schoolId", "processedBy", "status", "createdAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())
      RETURNING id, "fileName", "createdAt"
    `, {
      bind: [
        req.file.filename,
        req.file.originalname,
        req.file.path,
        req.file.size,
        finalSchoolId,
        req.user.id
      ]
    });

    res.json({
      success: true,
      message: 'File uploaded successfully',
      data: newFile[0],
      schoolName: schoolName
    });
  } catch (error) {
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    next(error);
  }
});

router.get('/download-file/:id', async (req, res, next) => {
  try {
    const [file] = await sequelize.query(`SELECT "fileUrl", "originalFileName" FROM "SchoolFileUploads" WHERE id = $1`, { bind: [req.params.id] });
    if (!file[0]) throw createError('File not found', 404);
    const filePath = path.join(__dirname, '../../', file[0].fileUrl || file[0].filePath);
    res.download(filePath, file[0].originalFileName || file[0].fileName);
  } catch (error) {
    next(error);
  }
});

router.get('/school-mapping/:schoolId', async (req, res, next) => {
  try {
    const [mapping] = await sequelize.query(`
      SELECT * FROM "SchoolColumnMappings" WHERE "schoolId" = $1
    `, { bind: [req.params.schoolId] });
    res.json({ success: true, data: mapping[0] || null });
  } catch (error) {
    res.json({ success: true, data: null });
  }
});

router.post('/preview-file/:id', async (req, res, next) => {
  try {
    const [file] = await sequelize.query(`SELECT * FROM "SchoolFileUploads" WHERE id = $1`, { bind: [req.params.id] });
    if (!file[0]) return res.status(404).json({ success: false, error: 'File not found' });

    const filePath = path.join(__dirname, '../../', file[0].fileUrl || file[0].filePath);
    const fileExt = path.extname(file[0].originalFileName || file[0].fileName || '').toLowerCase();

    let students = [];
    let headers = [];

    if (fileExt === '.csv') {
      const csvContent = fs.readFileSync(filePath, 'utf8');
      const lines = csvContent.split('\n');
      headers = lines[0].split(',').map(h => h.trim().replace(/['"]/g, ''));
      for (let i = 1; i < Math.min(lines.length, 6); i++) {
        if (!lines[i].trim()) continue;
        const values = lines[i].split(',').map(v => v.trim().replace(/['"]/g, ''));
        const row = {};
        headers.forEach((header, idx) => { row[header] = values[idx] || ''; });
        students.push(row);
      }
    } else if (fileExt === '.xlsx' || fileExt === '.xls') {
      const workbook = XLSX.readFile(filePath);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const allData = XLSX.utils.sheet_to_json(worksheet);
      headers = Object.keys(allData[0] || {});
      students = allData.slice(0, 5);
    } else {
      return res.json({ success: true, needsManual: true, message: 'PDF files require manual entry' });
    }

    const detectedMapping = await detectColumnsWithConfidence(headers, students[0]);
    const [savedMapping] = await sequelize.query(`SELECT * FROM "SchoolColumnMappings" WHERE "schoolId" = $1`, { bind: [file[0].schoolId] });

    res.json({
      success: true,
      data: {
        headers: headers,
        detectedMapping: detectedMapping,
        savedMappingExists: !!savedMapping[0],
        previewRows: students,
        fileName: file[0].fileName,
        schoolId: file[0].schoolId,
        schoolName: file[0].schoolName,
        fileId: file[0].id
      }
    });
  } catch (error) {
    console.error('Preview error:', error);
    next(error);
  }
});

router.post('/school-mapping', async (req, res, next) => {
  try {
    const { schoolId, nameColumn, fatherNameColumn, grandfatherNameColumn, idNumberColumn, gradeColumn, departmentColumn, sexColumn } = req.body;

    const [existing] = await sequelize.query(`SELECT id FROM "SchoolColumnMappings" WHERE "schoolId" = $1`, { bind: [schoolId] });

    if (existing[0]) {
      await sequelize.query(`
        UPDATE "SchoolColumnMappings" SET
          "nameColumn" = $2, "fatherNameColumn" = $3, "grandfatherNameColumn" = $4,
          "idNumberColumn" = $5, "gradeColumn" = $6, "departmentColumn" = $7, "sexColumn" = $8,
          "lastUsed" = NOW(), "timesUsed" = "timesUsed" + 1, "confirmedBy" = $9, "confirmedAt" = NOW()
        WHERE "schoolId" = $1
      `, { bind: [schoolId, nameColumn, fatherNameColumn, grandfatherNameColumn, idNumberColumn, gradeColumn, departmentColumn, sexColumn, req.user.id] });
    } else {
      await sequelize.query(`
        INSERT INTO "SchoolColumnMappings" ("schoolId", "nameColumn", "fatherNameColumn", "grandfatherNameColumn", "idNumberColumn", "gradeColumn", "departmentColumn", "sexColumn", "confirmedBy", "confirmedAt", "lastUsed", "timesUsed")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW(), 1)
      `, { bind: [schoolId, nameColumn, fatherNameColumn, grandfatherNameColumn, idNumberColumn, gradeColumn, departmentColumn, sexColumn, req.user.id] });
    }

    res.json({ success: true, message: 'Column mapping saved successfully' });
  } catch (error) {
    console.error('Error saving mapping:', error);
    next(error);
  }
});

router.post('/process-file-with-mapping/:id', async (req, res, next) => {
  try {
    const { columnMapping } = req.body;
    const [file] = await sequelize.query(`SELECT * FROM "SchoolFileUploads" WHERE id = $1 AND status = 'pending'`, { bind: [req.params.id] });
    if (!file[0]) throw createError('File not found or already processed', 404);

    const [school] = await sequelize.query(`SELECT "schoolName" FROM "Schools" WHERE id = $1`, { bind: [file[0].schoolId] });
    const schoolName = school[0]?.schoolName || '';

    const filePath = path.join(__dirname, '../../', file[0].fileUrl || file[0].filePath);
    const fileExt = path.extname(file[0].originalFileName || file[0].fileName || '').toLowerCase();

    let students = [];

    if (fileExt === '.csv') {
      const csvContent = fs.readFileSync(filePath, 'utf8');
      const lines = csvContent.split('\n');
      const headers = lines[0].split(',').map(h => h.trim().replace(/['"]/g, ''));
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = lines[i].split(',').map(v => v.trim().replace(/['"]/g, ''));
        const row = {};
        headers.forEach((header, idx) => { row[header] = values[idx] || ''; });
        students.push(row);
      }
    } else if (fileExt === '.xlsx' || fileExt === '.xls') {
      const workbook = XLSX.readFile(filePath);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      students = XLSX.utils.sheet_to_json(worksheet);
    }

    let addedCount = 0, skippedCount = 0;

    for (const student of students) {
      const name = student[columnMapping.name] || '';
      const idNumber = student[columnMapping.idNumber] || '';
      if (!name || !idNumber) { skippedCount++; continue; }

      const [existing] = await sequelize.query(`SELECT id FROM "SchoolStudentLists" WHERE "schoolId" = $1 AND "studentIdNumber" = $2`, { bind: [file[0].schoolId, idNumber] });
      if (existing.length > 0) { skippedCount++; continue; }

      await sequelize.query(`
        INSERT INTO "SchoolStudentLists" ("schoolId", "schoolName", "studentName", "studentFatherName", "studentGrandfatherName", "studentIdNumber", "gradeLevel", "department", "sex", "status", "createdAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', NOW())
      `, {
        bind: [
          file[0].schoolId, schoolName, name.trim(),
          student[columnMapping.fatherName] || null,
          student[columnMapping.grandfatherName] || null,
          idNumber.trim(),
          student[columnMapping.grade] || 12,
          student[columnMapping.department] || 'Natural Science',
          student[columnMapping.sex] || null
        ]
      });
      addedCount++;
    }

    await sequelize.query(`UPDATE "SchoolFileUploads" SET status = 'processed', "studentCount" = $1, "processedBy" = $2, "processedAt" = NOW() WHERE id = $3`, { bind: [addedCount, req.user.id, req.params.id] });

    res.json({ success: true, message: `Processed ${addedCount} students`, data: { addedCount, skippedCount } });
  } catch (error) {
    console.error('Error processing file:', error);
    next(error);
  }
});

router.post('/reject-file/:id', async (req, res, next) => {
  try {
    const { reason } = req.body;
    const [file] = await sequelize.query(`SELECT * FROM "SchoolFileUploads" WHERE id = $1 AND status = 'pending'`, { bind: [req.params.id] });
    if (!file[0]) throw createError('File not found or already processed', 404);

    await sequelize.query(`UPDATE "SchoolFileUploads" SET status = 'rejected', "rejectionReason" = $1, "processedAt" = NOW() WHERE id = $2`, { bind: [reason, req.params.id] });
    res.json({ success: true, message: 'File rejected successfully' });
  } catch (error) {
    next(error);
  }
});

router.post('/manual-add-students/:id', async (req, res, next) => {
  try {
    const { students } = req.body;
    const [file] = await sequelize.query(`SELECT * FROM "SchoolFileUploads" WHERE id = $1 AND status = 'pending'`, { bind: [req.params.id] });
    if (!file[0]) throw createError('File not found or already processed', 404);

    const [school] = await sequelize.query(`SELECT "schoolName" FROM "Schools" WHERE id = $1`, { bind: [file[0].schoolId] });
    const schoolName = school[0]?.schoolName || '';

    let addedCount = 0;

    for (const student of students) {
      await sequelize.query(`
        INSERT INTO "SchoolStudentLists" ("schoolId", "schoolName", "studentName", "studentFatherName", "studentGrandfatherName", "studentIdNumber", "gradeLevel", "department", "sex", "status", "createdAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', NOW())
      `, {
        bind: [
          file[0].schoolId, schoolName, student.name,
          student.fatherName || null, student.grandfatherName || null,
          student.idNumber, student.gradeLevel || 12,
          student.department || 'Natural Science', student.sex || null
        ]
      });
      addedCount++;
    }

    await sequelize.query(`UPDATE "SchoolFileUploads" SET status = 'processed', "studentCount" = "studentCount" + $1, "processedBy" = $2, "processedAt" = NOW() WHERE id = $3`, { bind: [addedCount, req.user.id, req.params.id] });
    res.json({ success: true, message: `Added ${addedCount} students manually` });
  } catch (error) {
    next(error);
  }
});

// Add single student individually (not from file)
router.post('/add-single-student', async (req, res, next) => {
  try {
    const { name, fatherName, grandfatherName, idNumber, gradeLevel, department, sex, schoolId, schoolName } = req.body;

    // Validate required fields
    if (!name || !fatherName || !grandfatherName || !idNumber || !schoolId) {
      throw createError('Name, Father Name, Grandfather Name, ID Number, and School are required', 400);
    }

    let finalSchoolId = schoolId;
    let finalSchoolName = schoolName;

    // Handle manual school creation
    if (schoolId === 'manual') {
      if (!schoolName || !schoolName.trim()) {
        throw createError('School name is required when creating a new school', 400);
      }

      // Check if school already exists
      const [existingSchool] = await sequelize.query(`SELECT id, "schoolName" FROM "Schools" WHERE "schoolName" = $1`, { bind: [schoolName.trim()] });

      if (existingSchool[0]) {
        // Use existing school
        finalSchoolId = existingSchool[0].id;
        finalSchoolName = existingSchool[0].schoolName;
      } else {
        // Create new school
        const [newSchool] = await sequelize.query(`
          INSERT INTO "Schools" ("schoolName", status, "createdBy", "createdAt")
          VALUES ($1, 'approved', $2, NOW())
          RETURNING id, "schoolName"
        `, {
          bind: [schoolName.trim(), req.user.id]
        });

        finalSchoolId = newSchool[0].id;
        finalSchoolName = newSchool[0].schoolName;
      }
    } else {
      // Get existing school name if not provided
      if (!finalSchoolName) {
        const [school] = await sequelize.query(`SELECT "schoolName" FROM "Schools" WHERE id = $1`, { bind: [schoolId] });
        if (!school[0]) {
          throw createError('School not found', 404);
        }
        finalSchoolName = school[0].schoolName;
      }
    }

    // Check if student with same ID already exists in this school
    const [existing] = await sequelize.query(`
      SELECT id FROM "SchoolStudentLists" 
      WHERE "studentIdNumber" = $1 AND "schoolId" = $2
    `, { bind: [idNumber, finalSchoolId] });

    if (existing.length > 0) {
      throw createError('A student with this ID number already exists in this school', 400);
    }

    // Insert the student
    await sequelize.query(`
      INSERT INTO "SchoolStudentLists" (
        "schoolId", "schoolName", "studentName", "studentFatherName", 
        "studentGrandfatherName", "studentIdNumber", "gradeLevel", 
        "department", "sex", "status", "createdAt"
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', NOW())
    `, {
      bind: [
        finalSchoolId,
        finalSchoolName,
        name.trim(),
        fatherName.trim(),
        grandfatherName.trim(),
        idNumber.trim(),
        gradeLevel || '12',
        department || 'Natural Science',
        sex || null
      ]
    });

    res.json({
      success: true,
      message: 'Student added successfully',
      data: { name, idNumber, schoolName: finalSchoolName }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/activities', async (req, res, next) => {
  try {
    const [activities] = await sequelize.query(`
      SELECT * FROM "Activities" 
      ORDER BY "createdAt" DESC 
      LIMIT 50
    `);
    res.json({ success: true, data: activities || [] });
  } catch (error) {
    console.error('Error fetching activities:', error);
    res.json({ success: true, data: [] });
  }
});

router.get('/test', async (req, res, next) => {
  try {
    const [studentCount] = await sequelize.query(`SELECT COUNT(*) FROM "Users" WHERE role = 'student'`);
    const [schoolCount] = await sequelize.query(`SELECT COUNT(*) FROM "Schools"`);
    res.json({
      success: true,
      message: 'API is working',
      studentCount: parseInt(studentCount[0].count),
      schoolCount: parseInt(schoolCount[0].count),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;