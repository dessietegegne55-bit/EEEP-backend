// backend/src/routes/publicRoutes.js
// COMPLETE PUBLIC ROUTES - For Home Page (Stats, Schools, Subjects, Exams, Materials)

const express = require('express');
const router = express.Router();
const { sequelize } = require('../config/database');

// ===========================================
// STATISTICS FOR HOME PAGE (Dynamic from database)
// ===========================================
router.get('/stats', async (req, res) => {
  try {
    console.log('📊 Fetching home page statistics...');

    let stats = {
      totalStudents: 0,
      totalExams: 0,
      totalMaterials: 0,
      totalSchools: 0,
      successRate: 0
    };

    try {
      const [studentCount] = await sequelize.query(`
        SELECT COUNT(*) as count FROM "Users" WHERE role = 'student' AND status = 'active'
      `);
      stats.totalStudents = parseInt(studentCount[0]?.count || 0);

      const [examCount] = await sequelize.query(`
        SELECT COUNT(*) as count FROM "Exams" WHERE status = 'published'
      `);
      stats.totalExams = parseInt(examCount[0]?.count || 0);

      const [materialCount] = await sequelize.query(`
        SELECT COUNT(*) as count FROM "Materials" WHERE status = 'published'
      `);
      stats.totalMaterials = parseInt(materialCount[0]?.count || 0);

      const [schoolCount] = await sequelize.query(`
        SELECT COUNT(*) as count FROM "Schools" WHERE status = 'approved'
      `);
      stats.totalSchools = parseInt(schoolCount[0]?.count || 0);

      const [successRateResult] = await sequelize.query(`
        SELECT 
          ROUND(
            (COUNT(CASE WHEN ea.score >= e."passingMarks" THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0))
          , 1) as successRate
        FROM "ExamAttempts" ea
        JOIN "Exams" e ON ea."examId" = e.id
        WHERE ea.status = 'completed'
      `);
      stats.successRate = parseFloat(successRateResult[0]?.successrate || 0);

      console.log(`✅ Stats: ${stats.totalStudents} students, ${stats.totalExams} exams, ${stats.totalMaterials} materials, ${stats.totalSchools} schools`);
    } catch (dbError) {
      console.error('⚠️ Database query failed, returning default stats:', dbError.message);
    }

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('❌ Error fetching stats:', error);
    res.json({
      success: true,
      data: {
        totalStudents: 0,
        totalExams: 0,
        totalMaterials: 0,
        totalSchools: 0,
        successRate: 0
      }
    });
  }
});

// ===========================================
// EXAM YEARS RANGE
// ===========================================
router.get('/exam-years', async (req, res) => {
  try {
    console.log('📅 Fetching exam year range...');

    const [yearRange] = await sequelize.query(`
      SELECT 
        MIN(year) as minYear,
        MAX(year) as maxYear
      FROM "Exams" 
      WHERE type = 'past' AND status = 'published' AND year IS NOT NULL
    `);

    const currentYear = new Date().getFullYear();
    const minYear = yearRange[0]?.minyear || 2010;
    const maxYear = yearRange[0]?.maxyear || currentYear;

    console.log(`✅ Exam years: ${minYear} - ${maxYear}`);

    res.json({
      success: true,
      data: {
        minYear: parseInt(minYear),
        maxYear: parseInt(maxYear)
      }
    });
  } catch (error) {
    console.error('❌ Error fetching exam years:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch exam years' }
    });
  }
});

// ===========================================
// SCHOOLS (Public - for registration dropdown)
// ===========================================
router.get('/schools', async (req, res) => {
  try {
    console.log('🏫 Fetching public schools list...');

    const [schools] = await sequelize.query(`
      SELECT id, "schoolName", address, phone, email
      FROM "Schools" 
      WHERE status = 'approved'
      ORDER BY "schoolName" ASC
    `);

    console.log(`✅ Found ${schools.length} schools`);

    res.json({
      success: true,
      data: schools,
      message: 'Schools fetched successfully'
    });
  } catch (error) {
    console.error('❌ Error fetching public schools:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch schools' }
    });
  }
});

// ===========================================
// SINGLE SCHOOL BY ID
// ===========================================
router.get('/schools/:id', async (req, res) => {
  try {
    const [school] = await sequelize.query(`
      SELECT id, "schoolName", address, phone, email
      FROM "Schools" 
      WHERE id = $1 AND status = 'approved'
    `, { bind: [req.params.id] });

    if (!school || school.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'School not found' }
      });
    }

    res.json({ success: true, data: school[0] });
  } catch (error) {
    console.error('Error fetching school:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch school' }
    });
  }
});

// ===========================================
// SUBJECTS (Public)
// ===========================================
router.get('/subjects', async (req, res) => {
  try {
    const { department, gradeLevel } = req.query;

    let query = `
      SELECT DISTINCT ON (name) id, name, description, department, "gradeLevel"
      FROM "Subjects"
      WHERE 1=1
    `;
    const params = [];

    if (department) {
      params.push(department);
      query += ` AND department = $${params.length}`;
    }
    if (gradeLevel) {
      params.push(gradeLevel);
      query += ` AND "gradeLevel" = $${params.length}`;
    }

    query += ` ORDER BY name, "gradeLevel" ASC`;

    const [subjects] = await sequelize.query(query, { bind: params });

    res.json({ success: true, data: subjects });
  } catch (error) {
    console.error('Error fetching subjects:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch subjects' }
    });
  }
});

// ===========================================
// SUBJECT BY ID
// ===========================================
router.get('/subjects/:id', async (req, res) => {
  try {
    const [subject] = await sequelize.query(`
      SELECT id, name, description, department, "gradeLevel"
      FROM "Subjects" WHERE id = $1
    `, { bind: [req.params.id] });

    if (!subject || subject.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'Subject not found' }
      });
    }

    res.json({ success: true, data: subject[0] });
  } catch (error) {
    console.error('Error fetching subject:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch subject' }
    });
  }
});

// ===========================================
// PUBLISHED EXAMS (Public)
// ===========================================
router.get('/exams', async (req, res) => {
  try {
    const { type, subjectId, department, gradeLevel, limit = 20, page = 1 } = req.query;

    let query = `
      SELECT e.id, e.title, e.description, e.type, e.department, 
             e."gradeLevel", e.duration, e."totalMarks",
             e."passingMarks", e.year, e."createdAt",
             s.id as "subjectId", s.name as "subjectName"
      FROM "Exams" e
      LEFT JOIN "Subjects" s ON e."subjectId" = s.id
      WHERE e.status = 'published'
    `;
    const params = [];

    if (type) {
      params.push(type);
      query += ` AND e.type = $${params.length}`;
    }
    if (subjectId) {
      params.push(subjectId);
      query += ` AND e."subjectId" = $${params.length}`;
    }
    if (department) {
      params.push(department);
      query += ` AND e.department = $${params.length}`;
    }
    if (gradeLevel) {
      params.push(gradeLevel);
      query += ` AND e."gradeLevel" = $${params.length}`;
    }

    const countQuery = query.replace(
      /SELECT e\.id, e\.title, e\.description, e\.type, e\.department, e\."gradeLevel", e\.duration, e\."totalMarks", e\."passingMarks", e\.year, e\."createdAt", s\.id as "subjectId", s\.name as "subjectName"/,
      'SELECT COUNT(*)'
    );
    const [countResult] = await sequelize.query(countQuery, { bind: params });
    const total = parseInt(countResult[0].count);

    query += ` ORDER BY e.year DESC NULLS LAST, e."createdAt" DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const [exams] = await sequelize.query(query, { bind: params });

    res.json({
      success: true,
      data: {
        exams: exams,
        total: total,
        page: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching public exams:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch exams' }
    });
  }
});

// ===========================================
// SINGLE EXAM BY ID
// ===========================================
router.get('/exams/:id', async (req, res) => {
  try {
    const [exam] = await sequelize.query(`
      SELECT e.id, e.title, e.description, e.type, e.department, 
             e."gradeLevel", e.duration, e."totalMarks",
             e."passingMarks", e.instructions, e.year, e."createdAt",
             s.id as "subjectId", s.name as "subjectName"
      FROM "Exams" e
      LEFT JOIN "Subjects" s ON e."subjectId" = s.id
      WHERE e.id = $1 AND e.status = 'published'
    `, { bind: [req.params.id] });

    if (!exam || exam.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'Exam not found' }
      });
    }

    res.json({ success: true, data: exam[0] });
  } catch (error) {
    console.error('Error fetching exam:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch exam' }
    });
  }
});

// ===========================================
// PUBLISHED MATERIALS (Public)
// ===========================================
router.get('/materials', async (req, res) => {
  try {
    const { type, subjectId, limit = 20, page = 1 } = req.query;

    let query = `
      SELECT m.id, m.title, m.description, m.type, 
             m."gradeLevel", m.unit,
             m."fileUrl", m."linkUrl",
             m.downloads, m.views, m."createdAt",
             s.id as "subjectId", s.name as "subjectName"
      FROM "Materials" m
      LEFT JOIN "Subjects" s ON m."subjectId" = s.id
      WHERE m.status = 'published'
    `;
    const params = [];

    if (type) {
      params.push(type);
      query += ` AND m.type = $${params.length}`;
    }
    if (subjectId) {
      params.push(subjectId);
      query += ` AND m."subjectId" = $${params.length}`;
    }

    const countQuery = query.replace(
      /SELECT m\.id, m\.title, m\.description, m\.type, m\."gradeLevel", m\.unit, m\."fileUrl", m\."linkUrl", m\.downloads, m\.views, m\."createdAt", s\.id as "subjectId", s\.name as "subjectName"/,
      'SELECT COUNT(*)'
    );
    const [countResult] = await sequelize.query(countQuery, { bind: params });
    const total = parseInt(countResult[0].count);

    query += ` ORDER BY m."createdAt" DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const [materials] = await sequelize.query(query, { bind: params });

    res.json({
      success: true,
      data: {
        materials: materials,
        total: total,
        page: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching public materials:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch materials' }
    });
  }
});

// ===========================================
// SYSTEM INFO
// ===========================================
router.get('/info', async (req, res) => {
  try {
    const [schoolCount] = await sequelize.query(`SELECT COUNT(*) FROM "Schools" WHERE status = 'approved'`);
    const [subjectCount] = await sequelize.query(`SELECT COUNT(*) FROM "Subjects"`);
    const [examCount] = await sequelize.query(`SELECT COUNT(*) FROM "Exams" WHERE status = 'published'`);
    const [materialCount] = await sequelize.query(`SELECT COUNT(*) FROM "Materials" WHERE status = 'published'`);

    res.json({
      success: true,
      data: {
        name: 'EEEP - Ethiopian Entrance Exam Preparation',
        version: '1.0.0',
        stats: {
          totalSchools: parseInt(schoolCount[0].count),
          totalSubjects: parseInt(subjectCount[0].count),
          totalPublishedExams: parseInt(examCount[0].count),
          totalMaterials: parseInt(materialCount[0].count)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching system info:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch system info' }
    });
  }
});

// ===========================================
// HEALTH CHECK
// ===========================================
router.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    }
  });
});

// ===========================================
// CONTACT MESSAGE SUBMISSION (Public) - FIXED
// ===========================================
router.post('/contact', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: { message: 'Name is required' }
      });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        error: { message: 'Email is required' }
      });
    }
    if (!subject || !subject.trim()) {
      return res.status(400).json({
        success: false,
        error: { message: 'Subject is required' }
      });
    }
    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: { message: 'Message is required' }
      });
    }

    console.log(`📧 New contact message from ${name} (${email}): ${subject}`);

    // ✅ FIXED: Added updatedAt column
    const [newMessage] = await sequelize.query(`
      INSERT INTO "ContactMessages" (name, email, subject, message, status, "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, 'unread', NOW(), NOW())
      RETURNING id, name, email, subject, message, status, "createdAt", "updatedAt"
    `, {
      bind: [name.trim(), email.trim(), subject.trim(), message.trim()]
    });

    // Get all superadmins and subadmins to notify them
    const [admins] = await sequelize.query(`
      SELECT id FROM "Users" 
      WHERE role IN ('superadmin', 'subadmin') AND status = 'active'
    `);

    // Create notifications for all admins
    for (const admin of admins) {
      await sequelize.query(`
        INSERT INTO "Notifications" ("userId", title, message, type, metadata, "createdAt")
        VALUES ($1, '📧 New Contact Message', $2, 'contact', $3, NOW())
      `, {
        bind: [
          admin.id,
          `New message from ${name}: ${subject}`,
          JSON.stringify({
            contactMessageId: newMessage[0].id,
            fromName: name.trim(),
            fromEmail: email.trim(),
            subject: subject.trim()
          })
        ]
      });
    }

    console.log(`✅ Contact message saved and ${admins.length} admins notified`);

    res.status(201).json({
      success: true,
      message: 'Thank you for your message! We will get back to you soon.',
      data: newMessage[0]
    });
  } catch (error) {
    console.error('❌ Error submitting contact message:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to submit message. Please try again.' }
    });
  }
});

module.exports = router;