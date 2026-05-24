// backend/src/routes/schoolRoutes.js
// COMPLETE - Only school endpoints, no teacher endpoints

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { authenticate, authorize } = require('../middleware/auth');
const { sequelize } = require('../config/database');
const { createError } = require('../middleware/errorHandler');

// ===========================================
// MULTER CONFIGURATION
// ===========================================

// For student list uploads (Excel/CSV)
const studentListStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = 'uploads/school-student-lists/';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'student-list-' + uniqueSuffix + ext);
  }
});

const studentListUpload = multer({
  storage: studentListStorage,
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

// For exam file uploads (PDF, DOC, PPT)
const examFileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = 'uploads/school-exams/';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'school-exam-' + uniqueSuffix + ext);
  }
});

const examFileUpload = multer({
  storage: examFileStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.doc', '.docx', '.ppt', '.pptx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, DOC, DOCX, PPT, PPTX files are allowed'));
    }
  }
});

// Apply authentication and school authorization to all routes
router.use(authenticate);
router.use(authorize('school'));

// ===========================================
// HELPER FUNCTIONS
// ===========================================

const detectColumnsWithConfidence = (headers, sampleRow) => {
  const patterns = {
    name: [/^name$/i, /^fullname$/i, /^full name$/i, /^student name$/i, /^studentname$/i],
    fatherName: [/^father/i, /^fathername$/i, /^father name$/i, /^fname$/i],
    grandfatherName: [/^grandfather/i, /^grandfathername$/i, /^grandfather name$/i, /^gname$/i],
    idNumber: [/id$/i, /^id$/i, /number/i, /roll/i, /student id/i, /registration/i, /^id no$/i],
    grade: [/grade/i, /class/i, /level/i, /year/i, /form/i],
    department: [/dept/i, /department/i, /stream/i, /major/i, /section/i],
    sex: [/sex/i, /gender/i, /male/i, /female/i]
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
        if (field === 'name' && sampleValue.length >= 2) score += 10;
        if (field === 'idNumber' && /[0-9]{3,}/.test(sampleValue)) score += 25;
        if (field === 'grade' && /^[9-9]$|^1[0-2]$/.test(sampleValue)) score += 25;
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
};

// ===========================================
// SCHOOL PROFILE
// ===========================================

router.get('/profile', async (req, res) => {
  try {
    const [school] = await sequelize.query(`
      SELECT s.id, s."schoolName", s.address, s.phone, s.email, s.logo, s.status,
             u.id as admin_id, u.name as admin_name, u.email as admin_email
      FROM "Schools" s
      LEFT JOIN "Users" u ON s."adminId" = u.id
      WHERE s."adminId" = $1
    `, { bind: [req.user.id] });

    if (!school[0]) {
      return res.status(404).json({ success: false, error: 'School not found' });
    }

    res.json({ success: true, data: school[0] });
  } catch (error) {
    console.error('Error fetching school profile:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/profile', async (req, res) => {
  try {
    const { schoolName, address, phone, email } = req.body;

    const [school] = await sequelize.query(`
      UPDATE "Schools" 
      SET "schoolName" = COALESCE($1, "schoolName"),
          address = COALESCE($2, address),
          phone = COALESCE($3, phone),
          email = COALESCE($4, email),
          "updatedAt" = NOW()
      WHERE "adminId" = $5
      RETURNING *
    `, { bind: [schoolName, address, phone, email, req.user.id] });

    if (!school[0]) {
      return res.status(404).json({ success: false, error: 'School not found' });
    }

    res.json({ success: true, message: 'Profile updated successfully', data: school[0] });
  } catch (error) {
    console.error('Error updating school profile:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// STUDENT LIST MANAGEMENT
// ===========================================

router.get('/subjects', async (req, res) => {
  try {
    const [subjects] = await sequelize.query(`
      SELECT id, name, department FROM "Subjects" ORDER BY name ASC
    `);

    const hasSAEnglish = subjects.some(s => s.name === 'Scholastic Aptitude - English Part');
    const hasSAMath = subjects.some(s => s.name === 'Scholastic Aptitude - Mathematics Part');

    let allSubjects = [...subjects];

    if (!hasSAEnglish) {
      allSubjects.push({ id: 9991, name: 'Scholastic Aptitude - English Part', department: 'Both' });
    }
    if (!hasSAMath) {
      allSubjects.push({ id: 9992, name: 'Scholastic Aptitude - Mathematics Part', department: 'Both' });
    }

    res.json({ success: true, data: allSubjects });
  } catch (error) {
    console.error('Error fetching subjects:', error);
    res.status(500).json({ success: false, error: error.message, data: [] });
  }
});

router.get('/saved-mapping', async (req, res) => {
  try {
    const [school] = await sequelize.query(`
      SELECT id FROM "Schools" WHERE "adminId" = $1
    `, { bind: [req.user.id] });

    if (!school[0]) {
      return res.status(404).json({ success: false, error: 'School not found' });
    }

    const [mapping] = await sequelize.query(`
      SELECT * FROM "SchoolColumnMappings" WHERE "schoolId" = $1
    `, { bind: [school[0].id] });

    res.json({ success: true, data: mapping[0] || null });
  } catch (error) {
    console.error('Error fetching saved mapping:', error);
    res.status(500).json({ success: false, error: error.message, data: null });
  }
});

router.post('/save-mapping', async (req, res) => {
  try {
    const { nameColumn, fatherNameColumn, grandfatherNameColumn, idNumberColumn, gradeColumn, departmentColumn, sexColumn } = req.body;

    const [school] = await sequelize.query(`
      SELECT id FROM "Schools" WHERE "adminId" = $1
    `, { bind: [req.user.id] });

    if (!school[0]) {
      return res.status(404).json({ success: false, error: 'School not found' });
    }

    const [existing] = await sequelize.query(`
      SELECT id FROM "SchoolColumnMappings" WHERE "schoolId" = $1
    `, { bind: [school[0].id] });

    if (existing[0]) {
      await sequelize.query(`
        UPDATE "SchoolColumnMappings" SET
          "nameColumn" = $2,
          "fatherNameColumn" = $3,
          "grandfatherNameColumn" = $4,
          "idNumberColumn" = $5,
          "gradeColumn" = $6,
          "departmentColumn" = $7,
          "sexColumn" = $8,
          "confirmedBy" = $9,
          "confirmedAt" = NOW(),
          "lastUsed" = NOW(),
          "timesUsed" = "timesUsed" + 1
        WHERE "schoolId" = $1
      `, { bind: [school[0].id, nameColumn, fatherNameColumn, grandfatherNameColumn, idNumberColumn, gradeColumn, departmentColumn, sexColumn, req.user.id] });
    } else {
      await sequelize.query(`
        INSERT INTO "SchoolColumnMappings" (
          "schoolId", "nameColumn", "fatherNameColumn", "grandfatherNameColumn",
          "idNumberColumn", "gradeColumn", "departmentColumn", "sexColumn",
          "confirmedBy", "confirmedAt", "lastUsed", "timesUsed"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW(), 1)
      `, { bind: [school[0].id, nameColumn, fatherNameColumn, grandfatherNameColumn, idNumberColumn, gradeColumn, departmentColumn, sexColumn, req.user.id] });
    }

    res.json({ success: true, message: 'Column mapping saved successfully' });
  } catch (error) {
    console.error('Error saving mapping:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/upload-student-list', studentListUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const { useSavedMapping } = req.body;
    const useSaved = useSavedMapping === 'true';

    const [school] = await sequelize.query(`
      SELECT id, "schoolName" FROM "Schools" WHERE "adminId" = $1
    `, { bind: [req.user.id] });

    if (!school[0]) {
      return res.status(404).json({ success: false, error: 'School not found' });
    }

    const [fileRecord] = await sequelize.query(`
      INSERT INTO "SchoolFileUploads" (
        "schoolId", "fileName", "originalFileName", "fileUrl", "fileSize",
        "status", "createdAt"
      ) VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
      RETURNING id
    `, {
      bind: [
        school[0].id,
        req.file.filename,
        req.file.originalname,
        req.file.path.replace(/\\/g, '/'),
        req.file.size
      ]
    });

    const filePath = req.file.path;
    const fileExt = path.extname(req.file.originalname).toLowerCase();

    let headers = [];
    let previewRows = [];

    if (fileExt === '.csv') {
      const csvContent = fs.readFileSync(filePath, 'utf8');
      const lines = csvContent.split('\n');
      headers = lines[0].split(',').map(h => h.trim().replace(/['"]/g, ''));
      for (let i = 1; i < Math.min(lines.length, 6); i++) {
        if (!lines[i].trim()) continue;
        const values = lines[i].split(',').map(v => v.trim().replace(/['"]/g, ''));
        const row = {};
        headers.forEach((header, idx) => { row[header] = values[idx] || ''; });
        previewRows.push(row);
      }
    } else if (fileExt === '.xlsx' || fileExt === '.xls') {
      const workbook = XLSX.readFile(filePath);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const allData = XLSX.utils.sheet_to_json(worksheet);
      headers = Object.keys(allData[0] || {});
      previewRows = allData.slice(0, 5);
    }

    let savedMapping = null;
    let detectedMapping = null;

    if (useSaved) {
      const [mapping] = await sequelize.query(`
        SELECT * FROM "SchoolColumnMappings" WHERE "schoolId" = $1
      `, { bind: [school[0].id] });
      savedMapping = mapping[0] || null;
    }

    if (!savedMapping) {
      detectedMapping = detectColumnsWithConfidence(headers, previewRows[0]);
    }

    res.json({
      success: true,
      data: {
        fileId: fileRecord[0].id,
        headers: headers,
        previewRows: previewRows,
        savedMapping: savedMapping,
        detectedMapping: detectedMapping,
        schoolName: school[0].schoolName
      }
    });
  } catch (error) {
    console.error('Error uploading student list:', error);
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/process-student-list/:fileId', async (req, res) => {
  try {
    const { columnMapping, saveMapping } = req.body;
    const fileId = req.params.fileId;

    const [school] = await sequelize.query(`
      SELECT id, "schoolName" FROM "Schools" WHERE "adminId" = $1
    `, { bind: [req.user.id] });

    if (!school[0]) {
      return res.status(404).json({ success: false, error: 'School not found' });
    }

    const [file] = await sequelize.query(`
      SELECT * FROM "SchoolFileUploads" WHERE id = $1 AND "schoolId" = $2
    `, { bind: [fileId, school[0].id] });

    if (!file[0]) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    const filePath = file[0].fileUrl;
    const fileExt = path.extname(file[0].originalFileName).toLowerCase();

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

    let addedCount = 0;
    let skippedCount = 0;

    for (const student of students) {
      const name = student[columnMapping.name] || '';
      const idNumber = student[columnMapping.idNumber] || '';

      if (!name || !idNumber) {
        skippedCount++;
        continue;
      }

      const [existing] = await sequelize.query(`
        SELECT id FROM "SchoolStudentLists" 
        WHERE "schoolId" = $1 AND "studentIdNumber" = $2
      `, { bind: [school[0].id, idNumber] });

      if (existing.length > 0) {
        skippedCount++;
        continue;
      }

      await sequelize.query(`
        INSERT INTO "SchoolStudentLists" (
          "schoolId", "schoolName", "studentName", "studentFatherName",
          "studentGrandfatherName", "studentIdNumber", "gradeLevel",
          "department", "sex", "status", "createdAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', NOW())
      `, {
        bind: [
          school[0].id,
          school[0].schoolName,
          name.trim(),
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

    await sequelize.query(`
      UPDATE "SchoolFileUploads" 
      SET status = 'processed', "studentCount" = $1, "processedAt" = NOW()
      WHERE id = $2
    `, { bind: [addedCount, fileId] });

    if (saveMapping === 'true') {
      await sequelize.query(`
        INSERT INTO "SchoolColumnMappings" (
          "schoolId", "nameColumn", "fatherNameColumn", "grandfatherNameColumn",
          "idNumberColumn", "gradeColumn", "departmentColumn", "sexColumn",
          "confirmedBy", "confirmedAt", "lastUsed", "timesUsed"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW(), 1)
        ON CONFLICT ("schoolId") DO UPDATE SET
          "nameColumn" = EXCLUDED."nameColumn",
          "fatherNameColumn" = EXCLUDED."fatherNameColumn",
          "grandfatherNameColumn" = EXCLUDED."grandfatherNameColumn",
          "idNumberColumn" = EXCLUDED."idNumberColumn",
          "gradeColumn" = EXCLUDED."gradeColumn",
          "departmentColumn" = EXCLUDED."departmentColumn",
          "sexColumn" = EXCLUDED."sexColumn",
          "confirmedBy" = EXCLUDED."confirmedBy",
          "confirmedAt" = EXCLUDED."confirmedAt",
          "lastUsed" = NOW(),
          "timesUsed" = "timesUsed" + 1
      `, {
        bind: [
          school[0].id,
          columnMapping.name,
          columnMapping.fatherName,
          columnMapping.grandfatherName,
          columnMapping.idNumber,
          columnMapping.grade,
          columnMapping.department,
          columnMapping.sex,
          req.user.id
        ]
      });
    }

    res.json({
      success: true,
      message: `Processed ${addedCount} students (${skippedCount} skipped)`,
      data: { addedCount, skippedCount }
    });
  } catch (error) {
    console.error('Error processing student list:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/uploads-history', async (req, res) => {
  try {
    const [school] = await sequelize.query(`
      SELECT id FROM "Schools" WHERE "adminId" = $1
    `, { bind: [req.user.id] });

    if (!school[0]) {
      return res.status(404).json({ success: false, error: 'School not found' });
    }

    const [files] = await sequelize.query(`
      SELECT 
        id, "fileName", "originalFileName", "fileUrl", "fileSize",
        "studentCount", status, "createdAt", "processedAt"
      FROM "SchoolFileUploads"
      WHERE "schoolId" = $1
      ORDER BY "createdAt" DESC
    `, { bind: [school[0].id] });

    res.json({ success: true, data: files });
  } catch (error) {
    console.error('Error fetching uploads history:', error);
    res.json({ success: true, data: [] }); // Return empty array instead of error
  }
});

router.get('/upload-history', async (req, res) => {
  try {
    const [school] = await sequelize.query(`
      SELECT id FROM "Schools" WHERE "adminId" = $1
    `, { bind: [req.user.id] });

    if (!school[0]) {
      return res.status(404).json({ success: false, error: 'School not found' });
    }

    const [files] = await sequelize.query(`
      SELECT 
        id, "fileName", "originalFileName", "fileUrl", "fileSize",
        "studentCount", status, "createdAt", "processedAt"
      FROM "SchoolFileUploads"
      WHERE "schoolId" = $1
      ORDER BY "createdAt" DESC
    `, { bind: [school[0].id] });

    res.json({ success: true, data: files });
  } catch (error) {
    console.error('Error fetching uploads history:', error);
    res.status(500).json({ success: false, error: error.message, data: [] });
  }
});

// ===========================================
// EXAM FILE MANAGEMENT (Send to SchoolExams)
// ===========================================

// GET teachers list
router.get('/teachers', async (req, res) => {
  try {
    const { subject } = req.query;

    let query = `
      SELECT 
        t.id,
        t."userId",
        t.specialization,
        t.department,
        t.qualification,
        u.name,
        u."fatherName",
        u."grandfatherName",
        u.email
      FROM "Teachers" t
      JOIN "Users" u ON t."userId" = u.id
      WHERE u.status = 'active'
    `;
    const params = [];

    if (subject && subject !== 'undefined' && subject !== 'null' && subject !== '') {
      let searchSubject = subject;
      if (subject === 'Scholastic Aptitude - English Part') {
        searchSubject = 'English';
      } else if (subject === 'Scholastic Aptitude - Mathematics Part') {
        searchSubject = 'Mathematics';
      }

      query += ` AND t.specialization = $${params.length + 1}`;
      params.push(searchSubject);
    }

    query += ` ORDER BY u.name ASC`;

    const [teachers] = await sequelize.query(query, { bind: params });

    const formattedTeachers = teachers.map(t => ({
      id: t.id,
      name: `${t.name || ''} ${t.fatherName || ''} ${t.grandfatherName || ''}`.trim(),
      specialization: t.specialization,
      department: t.department,
      qualification: t.qualification,
      email: t.email
    }));

    res.json({ success: true, data: formattedTeachers });
  } catch (error) {
    console.error('Error fetching teachers:', error);
    res.status(500).json({ success: false, error: error.message, data: [] });
  }
});

// ✅ SEND exam file - Simple upload to SchoolExams table
router.post('/send-exam-file', examFileUpload.single('file'), async (req, res) => {
  try {
    const { title, subjectId, teacherId, year, description } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: 'Exam title is required' });
    }
    if (!subjectId) {
      return res.status(400).json({ success: false, error: 'Subject is required' });
    }
    if (!teacherId) {
      return res.status(400).json({ success: false, error: 'Teacher is required' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'File is required' });
    }

    const [school] = await sequelize.query(`
      SELECT id, "schoolName" FROM "Schools" WHERE "adminId" = $1 AND status = 'approved'
    `, { bind: [req.user.id] });

    if (!school[0]) {
      return res.status(404).json({ success: false, error: 'School not found or not approved' });
    }

    const [subject] = await sequelize.query(`
      SELECT id, name FROM "Subjects" WHERE id = $1
    `, { bind: [subjectId] });

    if (!subject[0]) {
      return res.status(404).json({ success: false, error: 'Subject not found' });
    }

    const [teacher] = await sequelize.query(`
      SELECT t.id, t."userId", u.name as teacher_name
      FROM "Teachers" t
      JOIN "Users" u ON t."userId" = u.id
      WHERE t.id = $1 AND u.status = 'active'
    `, { bind: [teacherId] });

    if (!teacher[0]) {
      return res.status(404).json({ success: false, error: 'Teacher not found' });
    }

    const fileUrl = req.file.path.replace(/\\/g, '/');

    let examType = 'model';
    if (title.toLowerCase().includes('mock')) {
      examType = 'mock';
    } else if (title.toLowerCase().includes('past')) {
      examType = 'past';
    }

    const [schoolExam] = await sequelize.query(`
      INSERT INTO "SchoolExams" (
        title, description, "subjectId", "subjectName", 
        "schoolId", "schoolName", "teacherId", "teacherName", 
        year, type, "fileUrl", "originalFileName", "fileSize", 
        status, "createdBy", "createdAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending', $14, NOW())
      RETURNING id
    `, {
      bind: [
        title.trim(),
        description || '',
        parseInt(subjectId),
        subject[0].name,
        school[0].id,
        school[0].schoolName,
        parseInt(teacherId),
        teacher[0].teacher_name,
        year ? parseInt(year) : new Date().getFullYear(),
        examType,
        fileUrl,
        req.file.originalname,
        req.file.size.toString(),
        req.user.id
      ]
    });

    console.log(`✅ Exam file stored: ID=${schoolExam[0].id}, School=${school[0].schoolName}, Teacher ID=${teacherId}, Teacher Name=${teacher[0].teacher_name}`);

    // Send notification to teacher
    await sequelize.query(`
      INSERT INTO "Notifications" ("userId", title, message, type, metadata, "isRead", "createdAt")
      VALUES ($1, $2, $3, 'exam_assignment', $4, false, NOW())
    `, {
      bind: [
        teacher[0].userId,
        '📚 New Exam File Received',
        `${school[0].schoolName} has sent you an exam file: ${title}`,
        JSON.stringify({
          schoolExamId: schoolExam[0].id,
          schoolName: school[0].schoolName,
          examTitle: title,
          subject: subject[0].name,
          year: year,
          examType: examType,
          fileUrl: fileUrl
        })
      ]
    });

    res.json({
      success: true,
      message: 'Exam file sent to teacher successfully',
      data: {
        id: schoolExam[0].id,
        title,
        subject: subject[0].name,
        schoolName: school[0].schoolName,
        teacherName: teacher[0].teacher_name,
        year,
        type: examType,
        status: 'pending'
      }
    });
  } catch (error) {
    console.error('Error sending exam file:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET sent exams history (from SchoolExams table)
router.get('/sent-exams', async (req, res) => {
  try {
    const [school] = await sequelize.query(`
      SELECT id FROM "Schools" WHERE "adminId" = $1
    `, { bind: [req.user.id] });

    if (!school[0]) {
      return res.status(404).json({ success: false, error: 'School not found' });
    }

    const [exams] = await sequelize.query(`
      SELECT 
        se.id,
        se.title,
        se."subjectName" as subject,
        se."teacherName",
        se.year,
        se.description,
        se.type,
        se.status,
        se."fileUrl",
        se."originalFileName",
        se."fileSize",
        se."createdAt"
      FROM "SchoolExams" se
      WHERE se."schoolId" = $1
      ORDER BY se."createdAt" DESC
    `, { bind: [school[0].id] });

    res.json({ success: true, data: exams });
  } catch (error) {
    console.error('Error fetching sent exams:', error);
    res.status(500).json({ success: false, error: error.message, data: [] });
  }
});

// ===========================================
// NOTIFICATIONS
// ===========================================

router.get('/notifications', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const [notifications] = await sequelize.query(`
      SELECT 
        n.id,
        n.title,
        n.message,
        n.type,
        n."isRead",
        n.metadata,
        n."createdAt",
        n."updatedAt"
      FROM "Notifications" n
      WHERE n."userId" = $1 AND n.type != 'sent_message'
      ORDER BY n."createdAt" DESC
      LIMIT $2 OFFSET $3
    `, { bind: [req.user.id, parseInt(limit), parseInt(offset)] });

    const [unreadResult] = await sequelize.query(`
      SELECT COUNT(*) as count FROM "Notifications" 
      WHERE "userId" = $1 AND "isRead" = false AND type != 'sent_message'
    `, { bind: [req.user.id] });

    res.json({
      success: true,
      data: {
        notifications: notifications,
        unread: parseInt(unreadResult[0]?.count || 0),
        total: notifications.length
      }
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ success: false, error: error.message, data: { notifications: [], unread: 0 } });
  }
});

router.put('/notifications/:id/read', async (req, res) => {
  try {
    const notificationId = req.params.id;

    await sequelize.query(`
      UPDATE "Notifications" 
      SET "isRead" = true, "updatedAt" = NOW()
      WHERE id = $1 AND "userId" = $2
    `, { bind: [notificationId, req.user.id] });

    res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/notifications/mark-all-read', async (req, res) => {
  try {
    await sequelize.query(`
      UPDATE "Notifications" 
      SET "isRead" = true, "updatedAt" = NOW()
      WHERE "userId" = $1 AND "isRead" = false
    `, { bind: [req.user.id] });

    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/notifications/:id', async (req, res) => {
  try {
    await sequelize.query(`
      DELETE FROM "Notifications" 
      WHERE id = $1 AND "userId" = $2
    `, { bind: [req.params.id, req.user.id] });

    res.json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// GET ADMIN LISTS (for messaging)
// ===========================================

// GET superadmins list
router.get('/superadmins', async (req, res) => {
  try {
    const [superadmins] = await sequelize.query(`
      SELECT u.id, u.name, u."fatherName", u."grandfatherName", u.email, u.username
      FROM "Users" u
      WHERE u.role = 'superadmin' AND u.status = 'active'
      ORDER BY u.name ASC
    `);
    res.json({ success: true, data: superadmins });
  } catch (error) {
    console.error('Error fetching superadmins:', error);
    res.status(500).json({ success: false, error: error.message, data: [] });
  }
});

// GET subadmins list
router.get('/subadmins', async (req, res) => {
  try {
    const [subadmins] = await sequelize.query(`
      SELECT u.id, u.name, u."fatherName", u."grandfatherName", u.email, u.username
      FROM "Users" u
      WHERE u.role = 'subadmin' AND u.status = 'active'
      ORDER BY u.name ASC
    `);
    res.json({ success: true, data: subadmins });
  } catch (error) {
    console.error('Error fetching subadmins:', error);
    res.status(500).json({ success: false, error: error.message, data: [] });
  }
});

// ===========================================
// MESSAGES - School can send to Super Admin, Sub Admin, and Teachers
// ===========================================

// POST /api/school/send-message - School can send messages to Super Admin, Sub Admin, and Teachers
router.post('/send-message', async (req, res) => {
  try {
    const { subject, message, recipientType, teacherId } = req.body;

    console.log('📨 School send-message request:', { subject, message, recipientType, teacherId });

    if (!subject || !subject.trim()) {
      return res.status(400).json({ success: false, error: 'Subject is required' });
    }

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }

    if (!recipientType) {
      return res.status(400).json({ success: false, error: 'Recipient type is required' });
    }

    // Get school info
    const [school] = await sequelize.query(`
      SELECT id, "schoolName" FROM "Schools" WHERE "adminId" = $1
    `, { bind: [req.user.id] });

    if (!school[0]) {
      return res.status(404).json({ success: false, error: 'School not found' });
    }

    console.log('🏫 School found:', school[0].schoolName);

    let recipientDetails = [];
    let recipientRole = '';

    // Determine recipients based on recipientType
    switch (recipientType) {
      case 'superadmin':
        // Get all super admins
        const [superAdmins] = await sequelize.query(`
          SELECT id, name, email FROM "Users" 
          WHERE role = 'superadmin' AND status = 'active'
        `);
        console.log('👑 Super admins found:', superAdmins.length, superAdmins);
        recipientDetails = superAdmins;
        recipientRole = 'superadmin';
        break;

      case 'subadmin':
        // Get all sub admins
        const [subAdmins] = await sequelize.query(`
          SELECT id, name, email FROM "Users" 
          WHERE role = 'subadmin' AND status = 'active'
        `);
        console.log('👥 Sub admins found:', subAdmins.length, subAdmins);
        recipientDetails = subAdmins;
        recipientRole = 'subadmin';
        break;

      case 'all_teachers':
        // Get all teachers
        const [allTeachers] = await sequelize.query(`
          SELECT u.id, u.name, u.email 
          FROM "Teachers" t
          JOIN "Users" u ON t."userId" = u.id
          WHERE u.status = 'active'
        `);
        console.log('👨‍🏫 All teachers found:', allTeachers.length, allTeachers);
        recipientDetails = allTeachers;
        recipientRole = 'teacher';
        break;

      case 'specific_teacher':
        if (!teacherId) {
          return res.status(400).json({ success: false, error: 'Teacher ID is required for specific teacher' });
        }

        // Get specific teacher
        const [specificTeacher] = await sequelize.query(`
          SELECT u.id, u.name, u.email 
          FROM "Teachers" t
          JOIN "Users" u ON t."userId" = u.id
          WHERE t.id = $1 AND u.status = 'active'
        `, { bind: [teacherId] });

        if (!specificTeacher[0]) {
          return res.status(404).json({ success: false, error: 'Teacher not found' });
        }

        recipientDetails = specificTeacher;
        recipientRole = 'teacher';
        break;

      default:
        return res.status(400).json({ success: false, error: 'Invalid recipient type' });
    }

    if (recipientDetails.length === 0) {
      console.log('❌ No recipients found for type:', recipientType);
      return res.status(404).json({ success: false, error: 'No recipients found' });
    }

    console.log(`✅ Found ${recipientDetails.length} recipients for ${recipientType}`);

    const metadata = {
      from: req.user.id,
      fromName: req.user.name,
      fromRole: 'school',
      fromSchoolId: school[0].id,
      fromSchoolName: school[0].schoolName,
      timestamp: new Date().toISOString(),
      recipientCount: recipientDetails.length,
      recipientNames: recipientDetails.map(r => r.name),
      recipientType: recipientType,
      teacherId: teacherId || null
    };

    // Send to each recipient
    for (const recipient of recipientDetails) {
      await sequelize.query(`
        INSERT INTO "Notifications" ("userId", title, message, type, metadata, "isRead", "createdAt")
        VALUES ($1, $2, $3, 'message', $4::jsonb, false, NOW())
      `, {
        bind: [recipient.id, subject, message, JSON.stringify(metadata)]
      });
    }

    // Save SENT copy for the school
    const sentMetadata = {
      to: recipientDetails.map(r => ({ id: r.id, name: r.name, role: recipientRole })),
      toRole: recipientRole,
      timestamp: new Date().toISOString(),
      isSent: true,
      from: req.user.id,
      fromName: req.user.name,
      fromSchoolId: school[0].id,
      fromSchoolName: school[0].schoolName,
      subject: subject,
      message: message,
      recipientCount: recipientDetails.length,
      recipientNames: recipientDetails.map(r => r.name),
      recipientType: recipientType,
      teacherId: teacherId || null
    };

    await sequelize.query(`
      INSERT INTO "Notifications" ("userId", title, message, type, metadata, "isRead", "createdAt")
      VALUES ($1, $2, $3, 'sent_message', $4::jsonb, true, NOW())
    `, {
      bind: [req.user.id, subject, message, JSON.stringify(sentMetadata)]
    });

    console.log(`✅ Message sent to ${recipientDetails.length} recipients (${recipientType})`);
    res.json({
      success: true,
      message: `Message sent to ${recipientDetails.length} recipients`,
      data: {
        recipientCount: recipientDetails.length,
        recipientType: recipientType,
        schoolName: school[0].schoolName
      }
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/school/messages - Get all messages for school (inbox and sent)
router.get('/messages', async (req, res) => {
  try {
    const userId = req.user.id;

    const [messages] = await sequelize.query(`
      SELECT n.id, n."userId", n.title, n.message, n.type, n."isRead",
             n."createdAt", n."updatedAt", n.metadata
      FROM "Notifications" n
      WHERE n."userId" = $1 AND (n.type = 'message' OR n.type = 'sent_message')
      ORDER BY n."createdAt" DESC LIMIT 200
    `, { bind: [userId] });

    const parsedMessages = messages.map(msg => {
      let metadata = {};
      try { metadata = typeof msg.metadata === 'string' ? JSON.parse(msg.metadata || '{}') : (msg.metadata || {}); } catch (e) { metadata = {}; }

      const isSent = msg.type === 'sent_message' || metadata.isSent === true;

      let sender_name = 'System';
      let sender_role = '';
      let recipient_name = '';
      let recipient_role = '';
      let senderId = null;
      let sender = 'system';

      if (isSent) {
        // This is a message I sent - show recipient info
        if (metadata.to && metadata.to.length > 0) {
          if (Array.isArray(metadata.to)) {
            recipient_name = metadata.to.map(t => t.name || 'Recipient').join(', ');
            recipient_role = metadata.to[0]?.role || metadata.toRole || '';
          } else if (typeof metadata.to === 'object') {
            recipient_name = metadata.to.name || 'Recipient';
            recipient_role = metadata.to.role || metadata.toRole || '';
          } else {
            recipient_name = String(metadata.to);
            recipient_role = metadata.toRole || '';
          }
        } else if (metadata.toName) {
          recipient_name = metadata.toName;
          recipient_role = metadata.toRole || '';
        } else if (metadata.recipientName) {
          recipient_name = metadata.recipientName;
          recipient_role = metadata.recipientRole || '';
        }
        sender_name = 'You';
        sender_role = 'school';
        senderId = req.user.id;
        sender = 'school';
      } else {
        // This is a message I received - show sender info
        sender_name = metadata.fromName || metadata.senderName || 'System';
        sender_role = metadata.fromRole || '';
        senderId = metadata.from;
        recipient_name = 'You';
        recipient_role = 'school';

        if (sender_role === 'superadmin') sender = 'superadmin';
        else if (sender_role === 'subadmin') sender = 'subadmin';
        else if (sender_role === 'teacher') sender = 'teacher';
        else if (sender_role === 'school') sender = 'school';
        else sender = 'system';
      }

      return {
        id: msg.id,
        userId: msg.userId,
        subject: msg.title,
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
        senderId: senderId,
        sender: sender
      };
    });

    res.json({ success: true, data: parsedMessages });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ success: false, error: error.message, data: [] });
  }
});

// PUT /api/school/messages/:id/read - Mark message as read
router.put('/messages/:id/read', async (req, res) => {
  try {
    const messageId = req.params.id;
    const userId = req.user.id;

    const [result] = await sequelize.query(`
      UPDATE "Notifications" 
      SET "isRead" = true, "updatedAt" = NOW()
      WHERE id = $1 AND "userId" = $2 AND type = 'message'
      RETURNING id
    `, { bind: [messageId, userId] });

    if (!result[0]) {
      return res.status(404).json({ success: false, error: 'Message not found or not accessible' });
    }

    res.json({ success: true, message: 'Message marked as read' });
  } catch (error) {
    console.error('Error marking message as read:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/school/messages/:id - Delete message
router.delete('/messages/:id', async (req, res) => {
  try {
    const messageId = req.params.id;
    const userId = req.user.id;

    const [result] = await sequelize.query(`
      DELETE FROM "Notifications" 
      WHERE id = $1 AND "userId" = $2 AND (type = 'message' OR type = 'sent_message')
      RETURNING id
    `, { bind: [messageId, userId] });

    if (!result[0]) {
      return res.status(404).json({ success: false, error: 'Message not found or not accessible' });
    }

    res.json({ success: true, message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;