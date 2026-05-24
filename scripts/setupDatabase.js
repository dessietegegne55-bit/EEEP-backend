// backend/scripts/setupDatabase.js
// COMPLETE FIXED - All tables with correct columns

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { sequelize } = require('../src/config/database');
const bcrypt = require('bcryptjs');

// ============================================
// DEFAULT PASSWORD FOR SUPER ADMIN
// ============================================
const DEFAULT_PASSWORD = 'SuperAdmin@123';

// ============================================
// PARSE COMMAND LINE ARGUMENTS
// ============================================
const parseAdminArgs = () => {
  const args = process.argv.slice(2);

  const actionIndex = args.indexOf('--action');
  if (actionIndex !== -1) {
    const action = args[actionIndex + 1];
    const targetIndex = args.indexOf('--target');
    const target = targetIndex !== -1 ? args[targetIndex + 1] : null;
    return { action, target };
  }

  const adminsIndex = args.indexOf('--admins');
  if (adminsIndex !== -1 && args[adminsIndex + 1]) {
    try {
      let jsonString = args[adminsIndex + 1];
      if (jsonString.startsWith('"') && jsonString.endsWith('"')) {
        jsonString = jsonString.slice(1, -1);
      }
      jsonString = jsonString.replace(/""/g, '"');
      const adminsData = JSON.parse(jsonString);
      if (!Array.isArray(adminsData)) {
        console.error('❌ --admins must be a JSON array');
        return null;
      }
      return { admins: adminsData };
    } catch (error) {
      console.error('❌ Invalid JSON format:', error.message);
      return null;
    }
  }

  return null;
};

// ============================================
// GENERATE USERNAME
// ============================================
const generateUsername = (name, fatherName = '', grandfatherName = '') => {
  const cleanName = name.toLowerCase().replace(/[^a-z]/g, '');
  const cleanFather = fatherName ? fatherName.toLowerCase().replace(/[^a-z]/g, '').substring(0, 1) : '';
  const cleanGrandfather = grandfatherName ? grandfatherName.toLowerCase().replace(/[^a-z]/g, '').substring(0, 1) : '';
  let username = `${cleanName}${cleanFather}${cleanGrandfather}`.substring(0, 20);
  if (username.length < 3) {
    username = `admin${Math.floor(Math.random() * 10000)}`;
  }
  return username;
};

// ============================================
// SEND WELCOME EMAIL
// ============================================
const sendWelcomeEmail = async (email, name, username, password, isTemporary) => {
  try {
    const emailService = require('../src/services/emailService');
    const result = await emailService.sendSuperAdminWelcomeEmail(email, name, username, password, isTemporary);
    return result.success;
  } catch (error) {
    console.log(`   ⚠️ Email not sent: ${error.message}`);
    return false;
  }
};

// ============================================
// 1. CREATE OR UPDATE SUPER ADMIN
// ============================================
const createOrUpdateSuperAdmin = async (adminData) => {
  const { name, fatherName, grandfatherName, email, password, username: providedUsername } = adminData;

  const username = providedUsername || generateUsername(name, fatherName, grandfatherName);

  let finalPassword;
  let isTemporary;

  if (password) {
    finalPassword = password;
    isTemporary = false;
  } else {
    finalPassword = DEFAULT_PASSWORD;
    isTemporary = false;
  }

  const passwordHash = await bcrypt.hash(finalPassword, 10);

  const [existing] = await sequelize.query(`
    SELECT id FROM "Users" WHERE email = $1 OR username = $2
  `, { bind: [email, username] });

  let userId;
  let isNew = false;

  if (existing && existing.length > 0) {
    await sequelize.query(`
      UPDATE "Users" 
      SET "name" = $1, "fatherName" = $2, "grandfatherName" = $3,
          "passwordHash" = $4, "role" = 'superadmin', "status" = 'active',
          "forcePasswordChange" = FALSE, "isFirstLogin" = FALSE,
          "passwordChangedAt" = NOW(), "updatedAt" = NOW()
      WHERE id = $5
    `, {
      bind: [name, fatherName || null, grandfatherName || null, passwordHash, existing[0].id]
    });
    userId = existing[0].id;
    console.log(`   🔄 UPDATED: ${name} (${username})`);
  } else {
    const [newUser] = await sequelize.query(`
      INSERT INTO "Users" (
        "name", "fatherName", "grandfatherName", "email", "username", 
        "passwordHash", "role", "status", "forcePasswordChange", "isFirstLogin",
        "createdAt", "updatedAt"
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'superadmin', 'active', FALSE, FALSE, NOW(), NOW())
      RETURNING id
    `, {
      bind: [name, fatherName || null, grandfatherName || null, email, username, passwordHash]
    });

    userId = newUser[0].id;
    isNew = true;

    await sequelize.query(`
      INSERT INTO "Admins" ("userId", "adminType", "createdAt", "updatedAt")
      VALUES ($1, 'superadmin', NOW(), NOW())
    `, { bind: [userId] });

    console.log(`   ✅ CREATED: ${name} (${username})`);
  }

  await sequelize.query(`
    INSERT INTO "PasswordResetAudit" ("userId", "resetBy", "resetMethod", "resetReason", "tempPasswordUsed", "createdAt")
    VALUES ($1, 'command_line', 'admin_creation', 'Super admin created via command line', FALSE, NOW())
  `, { bind: [userId] });

  const fullName = `${name}${fatherName ? ' ' + fatherName : ''}${grandfatherName ? ' ' + grandfatherName : ''}`;

  return {
    fullName: fullName,
    email: email,
    username: username,
    password: finalPassword,
    isTemporary: isTemporary,
    isNew: isNew,
    userId: userId
  };
};

// ============================================
// 2. LIST ALL SUPER ADMINS
// ============================================
const listSuperAdmins = async () => {
  console.log('\n' + '='.repeat(80));
  console.log('📋 SUPER ADMIN LIST');
  console.log('='.repeat(80));

  const [admins] = await sequelize.query(`
    SELECT u.id, u.name, u."fatherName", u."grandfatherName", 
           u.email, u.username, u.status, u."forcePasswordChange", 
           u."lastLogin", u."createdAt"
    FROM "Users" u
    WHERE u.role = 'superadmin'
    ORDER BY u.id
  `);

  if (admins.length === 0) {
    console.log('❌ No super admins found');
    return;
  }

  console.log(`\n📊 Total: ${admins.length} super admin(s)\n`);

  admins.forEach((admin, idx) => {
    const fullName = `${admin.name} ${admin.fatherName || ''} ${admin.grandfatherName || ''}`.trim();
    let statusIcon = '';
    if (admin.status === 'active') statusIcon = '✅ ACTIVE';
    else if (admin.status === 'suspended') statusIcon = '🔒 SUSPENDED';
    else if (admin.status === 'blocked') statusIcon = '🚫 BLOCKED';
    else statusIcon = '⚠️ ' + admin.status;

    console.log(`${idx + 1}. ID: ${admin.id}`);
    console.log(`   📛 Name: ${fullName}`);
    console.log(`   📧 Email: ${admin.email}`);
    console.log(`   👤 Username: ${admin.username}`);
    console.log(`   📊 Status: ${statusIcon}`);
    console.log(`   🔐 Force Password Change: ${admin.forcePasswordChange ? '⚠️ YES' : '❌ NO'}`);
    console.log(`   🕐 Last Login: ${admin.lastLogin ? new Date(admin.lastLogin).toLocaleString() : 'Never'}`);
    console.log(`   📅 Created: ${new Date(admin.createdAt).toLocaleDateString()}`);
    console.log('-'.repeat(40));
  });

  console.log('='.repeat(80));
};

// ============================================
// 3. DELETE SUPER ADMIN
// ============================================
const deleteSuperAdmin = async (identifier) => {
  console.log(`\n🗑️ DELETING Super Admin: ${identifier}`);

  const [admin] = await sequelize.query(`
    SELECT id, name, u."fatherName", u."grandfatherName", email, username, status 
    FROM "Users" u
    WHERE (u.username = $1 OR u.email = $1) AND u.role = 'superadmin'
  `, { bind: [identifier] });

  if (!admin || admin.length === 0) {
    console.log(`❌ Super admin not found: ${identifier}`);
    return false;
  }

  const adminId = admin[0].id;
  const adminName = admin[0].name;
  const adminEmail = admin[0].email;

  const [count] = await sequelize.query(`
    SELECT COUNT(*) FROM "Users" WHERE role = 'superadmin' AND status = 'active'
  `);

  if (parseInt(count[0].count) === 1 && admin[0].status === 'active') {
    console.log(`⚠️ WARNING: This is the ONLY active super admin! Cannot delete.`);
    return false;
  }

  console.log(`   Deleting records for: ${adminName} (${adminEmail})`);

  await sequelize.query(`DELETE FROM "PasswordResetAudit" WHERE "userId" = $1`, { bind: [adminId] });
  console.log(`   ✅ Deleted from PasswordResetAudit`);

  await sequelize.query(`DELETE FROM "Admins" WHERE "userId" = $1`, { bind: [adminId] });
  console.log(`   ✅ Deleted from Admins`);

  await sequelize.query(`DELETE FROM "Users" WHERE id = $1`, { bind: [adminId] });
  console.log(`   ✅ Deleted from Users`);

  console.log(`✅ SUPER ADMIN DELETED: ${adminName} (${adminEmail})`);
  return true;
};

// ============================================
// 4. BLOCK SUPER ADMIN
// ============================================
const blockSuperAdmin = async (identifier) => {
  console.log(`\n🚫 BLOCKING Super Admin: ${identifier}`);

  const [admin] = await sequelize.query(`
    SELECT id, name, email, username, status FROM "Users" 
    WHERE (username = $1 OR email = $1) AND role = 'superadmin'
  `, { bind: [identifier] });

  if (!admin || admin.length === 0) {
    console.log(`❌ Super admin not found: ${identifier}`);
    return false;
  }

  if (admin[0].status === 'blocked') {
    console.log(`⚠️ Admin ${admin[0].name} is already BLOCKED`);
    return false;
  }

  await sequelize.query(`
    UPDATE "Users" 
    SET status = 'blocked', "updatedAt" = NOW()
    WHERE id = $1
  `, { bind: [admin[0].id] });

  console.log(`✅ SUPER ADMIN BLOCKED: ${admin[0].name} (${admin[0].email})`);
  return true;
};

// ============================================
// 5. SUSPEND SUPER ADMIN
// ============================================
const suspendSuperAdmin = async (identifier) => {
  console.log(`\n🔒 SUSPENDING Super Admin: ${identifier}`);

  const [admin] = await sequelize.query(`
    SELECT id, name, email, username, status FROM "Users" 
    WHERE (username = $1 OR email = $1) AND role = 'superadmin'
  `, { bind: [identifier] });

  if (!admin || admin.length === 0) {
    console.log(`❌ Super admin not found: ${identifier}`);
    return false;
  }

  if (admin[0].status === 'suspended') {
    console.log(`⚠️ Admin ${admin[0].name} is already SUSPENDED`);
    return false;
  }

  await sequelize.query(`
    UPDATE "Users" 
    SET status = 'suspended', "updatedAt" = NOW()
    WHERE id = $1
  `, { bind: [admin[0].id] });

  console.log(`✅ SUPER ADMIN SUSPENDED: ${admin[0].name} (${admin[0].email})`);
  return true;
};

// ============================================
// 6. REACTIVATE SUPER ADMIN
// ============================================
const reactivateSuperAdmin = async (identifier) => {
  console.log(`\n🔄 REACTIVATING Super Admin: ${identifier}`);

  const [admin] = await sequelize.query(`
    SELECT id, name, email, username, status FROM "Users" 
    WHERE (username = $1 OR email = $1) AND role = 'superadmin'
  `, { bind: [identifier] });

  if (!admin || admin.length === 0) {
    console.log(`❌ Super admin not found: ${identifier}`);
    return false;
  }

  if (admin[0].status === 'active') {
    console.log(`⚠️ Admin ${admin[0].name} is already ACTIVE`);
    return false;
  }

  await sequelize.query(`
    UPDATE "Users" 
    SET status = 'active', "updatedAt" = NOW()
    WHERE id = $1
  `, { bind: [admin[0].id] });

  console.log(`✅ SUPER ADMIN REACTIVATED: ${admin[0].name} (${admin[0].email})`);
  return true;
};

// ============================================
// 7. RESET SUPER ADMIN PASSWORD
// ============================================
const resetSuperAdminPassword = async (identifier) => {
  console.log(`\n🔑 RESETTING PASSWORD for: ${identifier}`);

  const [admin] = await sequelize.query(`
    SELECT id, name, email, username, status FROM "Users" 
    WHERE (username = $1 OR email = $1) AND role = 'superadmin'
  `, { bind: [identifier] });

  if (!admin || admin.length === 0) {
    console.log(`❌ Super admin not found: ${identifier}`);
    return;
  }

  if (admin[0].status !== 'active') {
    console.log(`⚠️ Admin is ${admin[0].status}. Reactivate first before resetting password.`);
    return;
  }

  const tempPassword = DEFAULT_PASSWORD;
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  await sequelize.query(`
    UPDATE "Users" 
    SET "passwordHash" = $1, "forcePasswordChange" = FALSE, "isFirstLogin" = FALSE,
        "passwordChangedAt" = NOW(), "updatedAt" = NOW()
    WHERE id = $2
  `, { bind: [passwordHash, admin[0].id] });

  await sequelize.query(`
    INSERT INTO "PasswordResetAudit" ("userId", "resetBy", "resetMethod", "resetReason", "tempPasswordUsed", "createdAt")
    VALUES ($1, 'system_admin', 'manual_reset', 'Password reset by administrator', FALSE, NOW())
  `, { bind: [admin[0].id] });

  console.log(`✅ PASSWORD RESET for: ${admin[0].name} (${admin[0].username})`);
  console.log(`   🔑 NEW PASSWORD: ${tempPassword}`);
  console.log(`   ✅ Direct access - No force password change required`);

  await sendWelcomeEmail(admin[0].email, admin[0].name, admin[0].username, tempPassword, false);
};

// ============================================
// CHECK TABLES EXIST
// ============================================
const checkTablesExist = async () => {
  try {
    const [result] = await sequelize.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'Users'
      );
    `);
    return result[0].exists;
  } catch (error) {
    return false;
  }
};

// ============================================
// CREATE DEFAULT SUPER ADMIN (FULL SETUP)
// ============================================
const createDefaultSuperAdmin = async () => {
  console.log('\n👑 Creating DEFAULT SUPERADMIN...');

  const defaultAdmin = {
    name: 'System',
    fatherName: 'Administrator',
    grandfatherName: 'EEEP',
    email: 'admin@eeep.com',
    username: 'superadmin',
    password: DEFAULT_PASSWORD
  };

  const passwordHash = await bcrypt.hash(defaultAdmin.password, 10);

  const [existing] = await sequelize.query(`
    SELECT id FROM "Users" WHERE email = $1 OR username = $2
  `, { bind: [defaultAdmin.email, defaultAdmin.username] });

  let userId;

  if (existing && existing.length > 0) {
    await sequelize.query(`
      UPDATE "Users" 
      SET "name" = $1, "fatherName" = $2, "grandfatherName" = $3,
          "passwordHash" = $4, "role" = 'superadmin', "status" = 'active',
          "forcePasswordChange" = FALSE, "isFirstLogin" = FALSE,
          "passwordChangedAt" = NOW(), "updatedAt" = NOW()
      WHERE id = $5
    `, {
      bind: [defaultAdmin.name, defaultAdmin.fatherName, defaultAdmin.grandfatherName, passwordHash, existing[0].id]
    });
    userId = existing[0].id;
    console.log(`   🔄 UPDATED Default Superadmin`);
  } else {
    const [newUser] = await sequelize.query(`
      INSERT INTO "Users" (
        "name", "fatherName", "grandfatherName", "email", "username", 
        "passwordHash", "role", "status", "forcePasswordChange", "isFirstLogin",
        "createdAt", "updatedAt"
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'superadmin', 'active', FALSE, FALSE, NOW(), NOW())
      RETURNING id
    `, {
      bind: [defaultAdmin.name, defaultAdmin.fatherName, defaultAdmin.grandfatherName,
      defaultAdmin.email, defaultAdmin.username, passwordHash]
    });

    userId = newUser[0].id;

    await sequelize.query(`
      INSERT INTO "Admins" ("userId", "adminType", "createdAt", "updatedAt")
      VALUES ($1, 'superadmin', NOW(), NOW())
    `, { bind: [userId] });

    console.log(`   ✅ CREATED Default Superadmin`);
  }

  return {
    name: `${defaultAdmin.name} ${defaultAdmin.fatherName} ${defaultAdmin.grandfatherName}`,
    email: defaultAdmin.email,
    username: defaultAdmin.username,
    password: defaultAdmin.password
  };
};

// ============================================
// CREATE ALL TABLES (COMPLETE WITH ALL COLUMNS)
// ============================================
const createAllTables = async () => {
  console.log('\n📝 Creating tables...');

  const tables = [
    `CREATE TABLE IF NOT EXISTS "Users" (
      id SERIAL PRIMARY KEY,
      "name" VARCHAR(100) NOT NULL,
      "fatherName" VARCHAR(100),
      "grandfatherName" VARCHAR(100),
      "sex" VARCHAR(10),
      "email" VARCHAR(255) UNIQUE NOT NULL,
      "username" VARCHAR(100) UNIQUE NOT NULL,
      "passwordHash" VARCHAR(255) NOT NULL,
      "role" VARCHAR(50) NOT NULL DEFAULT 'student',
      "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
      "profileImage" TEXT,
      "lastLogin" TIMESTAMP,
      "forcePasswordChange" BOOLEAN DEFAULT FALSE,
      "isFirstLogin" BOOLEAN DEFAULT TRUE,
      "passwordChangedAt" TIMESTAMP,
      "verificationStatus" VARCHAR(50),
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS "PasswordResetAudit" (
      id SERIAL PRIMARY KEY,
      "userId" INTEGER REFERENCES "Users"(id) ON DELETE CASCADE,
      "resetBy" VARCHAR(255),
      "resetMethod" VARCHAR(50),
      "resetReason" TEXT,
      "tempPasswordUsed" BOOLEAN DEFAULT FALSE,
      "ipAddress" VARCHAR(50),
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS "Admins" (
      id SERIAL PRIMARY KEY,
      "userId" INTEGER UNIQUE NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,
      "adminType" VARCHAR(50) NOT NULL,
      "managedBy" INTEGER REFERENCES "Admins"(id),
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS "Subjects" (
      id SERIAL PRIMARY KEY,
      "name" VARCHAR(100) NOT NULL,
      "description" TEXT,
      "department" VARCHAR(50) NOT NULL,
      "gradeLevel" INTEGER,
      "isScholasticAptitude" BOOLEAN DEFAULT FALSE,
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS "Schools" (
      id SERIAL PRIMARY KEY,
      "schoolName" VARCHAR(255) NOT NULL UNIQUE,
      "address" TEXT,
      "phone" VARCHAR(50),
      "email" VARCHAR(255) UNIQUE,
      "adminId" INTEGER REFERENCES "Users"(id) ON DELETE SET NULL,
      "logo" TEXT,
      "description" TEXT,
      "website" VARCHAR(255),
      "status" VARCHAR(50) DEFAULT 'approved',
      "createdBy" INTEGER REFERENCES "Users"(id),
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS "Teachers" (
      id SERIAL PRIMARY KEY,
      "userId" INTEGER UNIQUE NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,
      "specialization" VARCHAR(100) NOT NULL,
      "department" VARCHAR(50) NOT NULL,
      "qualification" VARCHAR(100),
      "schoolId" INTEGER REFERENCES "Schools"(id) ON DELETE SET NULL,
      "status" VARCHAR(50) DEFAULT 'active',
      "createdBy" INTEGER REFERENCES "Users"(id),
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS "Students" (
      id SERIAL PRIMARY KEY,
      "userId" INTEGER UNIQUE NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,
      "idNumber" VARCHAR(50) NOT NULL UNIQUE,
      "idPhoto" TEXT,
      "phone" VARCHAR(20),
      "address" TEXT,
      "department" VARCHAR(50) NOT NULL,
      "gradeLevel" INTEGER DEFAULT 9,
      "schoolId" INTEGER REFERENCES "Schools"(id) ON DELETE SET NULL,
      "schoolName" VARCHAR(255),
      "status" VARCHAR(50) DEFAULT 'active',
      "photoVerified" BOOLEAN DEFAULT FALSE,
      "photoVerifiedBy" INTEGER REFERENCES "Users"(id),
      "photoVerifiedAt" TIMESTAMP,
      "verificationStatus" VARCHAR(50) DEFAULT 'pending',
      "enrolledAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS "Exams" (
      id SERIAL PRIMARY KEY,
      "title" VARCHAR(255) NOT NULL,
      "description" TEXT,
      "subject" VARCHAR(100) NOT NULL,
      "subjectId" INTEGER REFERENCES "Subjects"(id),
      "duration" INTEGER NOT NULL,
      "totalMarks" INTEGER NOT NULL,
      "passingMarks" INTEGER,
      "gradeLevel" INTEGER DEFAULT 12,
      "type" VARCHAR(50) DEFAULT 'quiz',
      "status" VARCHAR(50) DEFAULT 'draft',
      "instructions" TEXT,
      "department" VARCHAR(50),
      "year" INTEGER,
      "schoolName" VARCHAR(255),
      "unit" VARCHAR(255),
      "fileUrl" TEXT,
      "createdBy" INTEGER REFERENCES "Users"(id),
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS "Questions" (
      id SERIAL PRIMARY KEY,
      "examId" INTEGER NOT NULL REFERENCES "Exams"(id) ON DELETE CASCADE,
      "questionText" TEXT NOT NULL,
      "questionType" VARCHAR(50) DEFAULT 'multipleChoice',
      "options" JSONB,
      "correctAnswer" TEXT NOT NULL,
      "marks" INTEGER DEFAULT 1,
      "orderIndex" INTEGER NOT NULL,
      "explanation" TEXT,
      "imageUrl" TEXT,
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS "Materials" (
      id SERIAL PRIMARY KEY,
      "title" VARCHAR(255) NOT NULL,
      "description" TEXT,
      "subject" VARCHAR(100) NOT NULL,
      "subjectId" INTEGER REFERENCES "Subjects"(id),
      "type" VARCHAR(50) NOT NULL,
      "fileUrl" TEXT,
      "linkUrl" TEXT,
      "youtubeLinks" JSONB DEFAULT '[]',
      "downloads" INTEGER DEFAULT 0,
      "views" INTEGER DEFAULT 0,
      "uploadedBy" INTEGER REFERENCES "Users"(id),
      "status" VARCHAR(50) DEFAULT 'draft',
      "gradeLevel" VARCHAR(10) DEFAULT '12',
      "unit" VARCHAR(255) DEFAULT 'General',
      "department" VARCHAR(50),
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS "ExamAttempts" (
      id SERIAL PRIMARY KEY,
      "examId" INTEGER NOT NULL REFERENCES "Exams"(id) ON DELETE CASCADE,
      "studentId" INTEGER NOT NULL REFERENCES "Students"(id) ON DELETE CASCADE,
      "score" INTEGER DEFAULT 0,
      "totalMarks" INTEGER NOT NULL,
      "answers" JSONB,
      "status" VARCHAR(50) DEFAULT 'in_progress',
      "startedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "submittedAt" TIMESTAMP,
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS "Notifications" (
      id SERIAL PRIMARY KEY,
      "userId" INTEGER NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,
      "title" VARCHAR(255) NOT NULL,
      "message" TEXT NOT NULL,
      "type" VARCHAR(50) DEFAULT 'info',
      "metadata" JSONB,
      "isRead" BOOLEAN DEFAULT FALSE,
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS "Feedbacks" (
      id SERIAL PRIMARY KEY,
      "userId" INTEGER NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,
      "teacherId" INTEGER NOT NULL REFERENCES "Teachers"(id) ON DELETE CASCADE,
      "message" TEXT NOT NULL,
      "rating" INTEGER,
      "status" VARCHAR(50) DEFAULT 'pending',
      "teacherResponse" TEXT,
      "category" VARCHAR(50) DEFAULT 'teacher_feedback',
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS "SchoolExams" (
      id SERIAL PRIMARY KEY,
      "title" VARCHAR(255) NOT NULL,
      "description" TEXT,
      "subjectId" INTEGER,
      "subjectName" VARCHAR(100) NOT NULL,
      "schoolId" INTEGER NOT NULL REFERENCES "Schools"(id) ON DELETE CASCADE,
      "schoolName" VARCHAR(255) NOT NULL,
      "teacherId" INTEGER NOT NULL REFERENCES "Teachers"(id) ON DELETE CASCADE,
      "teacherName" VARCHAR(255) NOT NULL,
      "year" INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
      "type" VARCHAR(50) DEFAULT 'model',
      "status" VARCHAR(50) DEFAULT 'pending',
      "fileUrl" TEXT NOT NULL,
      "originalFileName" VARCHAR(255),
      "fileSize" VARCHAR(50),
      "feedback" TEXT,
      "createdBy" INTEGER REFERENCES "Users"(id),
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS "SchoolColumnMappings" (
      id SERIAL PRIMARY KEY,
      "schoolId" INTEGER NOT NULL REFERENCES "Schools"(id) ON DELETE CASCADE,
      "nameColumn" VARCHAR(255),
      "fatherNameColumn" VARCHAR(255),
      "grandfatherNameColumn" VARCHAR(255),
      "idNumberColumn" VARCHAR(255),
      "gradeColumn" VARCHAR(255),
      "departmentColumn" VARCHAR(255),
      "sexColumn" VARCHAR(255),
      "confirmedBy" INTEGER REFERENCES "Users"(id),
      "confirmedAt" TIMESTAMP,
      "lastUsed" TIMESTAMP,
      "timesUsed" INTEGER DEFAULT 0,
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE("schoolId")
    );`,

    `CREATE TABLE IF NOT EXISTS "SchoolFileUploads" (
      id SERIAL PRIMARY KEY,
      "schoolId" INTEGER NOT NULL REFERENCES "Schools"(id) ON DELETE CASCADE,
      "fileName" VARCHAR(255) NOT NULL,
      "originalFileName" VARCHAR(255) NOT NULL,
      "fileUrl" TEXT NOT NULL,
      "fileSize" INTEGER,
      "studentCount" INTEGER,
      "status" VARCHAR(50) DEFAULT 'pending',
      "rejectionReason" TEXT,
      "processedBy" INTEGER REFERENCES "Users"(id),
      "processedAt" TIMESTAMP,
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS "SchoolStudentLists" (
      id SERIAL PRIMARY KEY,
      "schoolId" INTEGER NOT NULL REFERENCES "Schools"(id) ON DELETE CASCADE,
      "schoolName" VARCHAR(255),
      "studentName" VARCHAR(255) NOT NULL,
      "studentFatherName" VARCHAR(255),
      "studentGrandfatherName" VARCHAR(255),
      "studentIdNumber" VARCHAR(50) NOT NULL,
      "gradeLevel" INTEGER,
      "department" VARCHAR(50),
      "sex" VARCHAR(10),
      "status" VARCHAR(50) DEFAULT 'active',
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS "LiveSessions" (
      id SERIAL PRIMARY KEY,
      "title" VARCHAR(255) NOT NULL,
      "description" TEXT,
      "teacherId" INTEGER NOT NULL REFERENCES "Teachers"(id) ON DELETE CASCADE,
      "subject" VARCHAR(100) NOT NULL,
      "department" VARCHAR(50),
      "gradeLevel" INTEGER,
      "startTime" TIMESTAMP NOT NULL,
      "endTime" TIMESTAMP,
      "meetingUrl" TEXT,
      "meetingId" VARCHAR(255),
      "meetingPassword" VARCHAR(255),
      "status" VARCHAR(50) DEFAULT 'scheduled',
      "recordings" JSONB,
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS "ContactMessages" (
      id SERIAL PRIMARY KEY,
      "name" VARCHAR(255) NOT NULL,
      "email" VARCHAR(255) NOT NULL,
      "subject" VARCHAR(255) NOT NULL,
      "message" TEXT NOT NULL,
      "status" VARCHAR(50) DEFAULT 'unread',
      "response" TEXT,
      "respondedBy" INTEGER REFERENCES "Users"(id),
      "respondedAt" TIMESTAMP,
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS "Reports" (
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
    );`,

    `CREATE TABLE IF NOT EXISTS "Suggestions" (
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
    );`
  ];

  for (const table of tables) {
    try {
      await sequelize.query(table);
      console.log(`   ✅ Table created`);
    } catch (err) {
      console.log(`   ⚠️ Table may already exist: ${err.message}`);
    }
  }

  console.log('✅ All tables created');
};

// ============================================
// CREATE INDEXES
// ============================================
const createIndexes = async () => {
  console.log('\n📊 Creating indexes...');

  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_school_exams_teacher_id ON "SchoolExams"("teacherId");`,
    `CREATE INDEX IF NOT EXISTS idx_school_exams_school_id ON "SchoolExams"("schoolId");`,
    `CREATE INDEX IF NOT EXISTS idx_school_exams_status ON "SchoolExams"("status");`,
    `CREATE INDEX IF NOT EXISTS idx_exam_attempts_student_id ON "ExamAttempts"("studentId");`,
    `CREATE INDEX IF NOT EXISTS idx_exam_attempts_exam_id ON "ExamAttempts"("examId");`,
    `CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON "Notifications"("userId");`,
    `CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON "Notifications"("isRead");`,
    `CREATE INDEX IF NOT EXISTS idx_feedbacks_teacher_id ON "Feedbacks"("teacherId");`,
    `CREATE INDEX IF NOT EXISTS idx_materials_uploaded_by ON "Materials"("uploadedBy");`,
    `CREATE INDEX IF NOT EXISTS idx_materials_subject_id ON "Materials"("subjectId");`,
    `CREATE INDEX IF NOT EXISTS idx_live_sessions_teacher_id ON "LiveSessions"("teacherId");`,
    `CREATE INDEX IF NOT EXISTS idx_school_file_uploads_school_id ON "SchoolFileUploads"("schoolId");`,
    `CREATE INDEX IF NOT EXISTS idx_school_student_lists_school_id ON "SchoolStudentLists"("schoolId");`,
    `CREATE INDEX IF NOT EXISTS idx_school_student_lists_id_number ON "SchoolStudentLists"("studentIdNumber");`,
    `CREATE INDEX IF NOT EXISTS idx_contact_messages_status ON "ContactMessages"("status");`,
    `CREATE INDEX IF NOT EXISTS idx_reports_type ON "Reports"("type");`,
    `CREATE INDEX IF NOT EXISTS idx_suggestions_status ON "Suggestions"("status");`
  ];

  for (const index of indexes) {
    try {
      await sequelize.query(index);
      console.log(`   ✅ Index created`);
    } catch (err) {
      console.log(`   ⚠️ Index creation skipped: ${err.message}`);
    }
  }

  console.log('✅ All indexes created');
};

// ============================================
// INSERT SUBJECTS
// ============================================
const insertSubjects = async () => {
  console.log('\n📚 Inserting subjects...');

  const subjects = [
    'Biology', 'Chemistry', 'Physics', 'History', 'Geography',
    'Economics', 'Mathematics', 'English', 'Citizenship Education',
    'Scholastic Aptitude - English Part', 'Scholastic Aptitude - Mathematics Part'
  ];

  for (const subject of subjects) {
    const department = (subject === 'Biology' || subject === 'Chemistry' || subject === 'Physics') ? 'Natural Science' :
      (subject === 'History' || subject === 'Geography' || subject === 'Economics') ? 'Social Science' : 'Both';

    const [exists] = await sequelize.query(`
      SELECT id FROM "Subjects" WHERE name = $1
    `, { bind: [subject] });

    if (!exists || exists.length === 0) {
      await sequelize.query(`
        INSERT INTO "Subjects" (name, department, "createdAt")
        VALUES ($1, $2, NOW())
      `, { bind: [subject, department] });
      console.log(`   ✅ Added: ${subject}`);
    } else {
      console.log(`   ⏭️ Already exists: ${subject}`);
    }
  }

  console.log('✅ Subjects inserted');
};

// ============================================
// FULL DATABASE SETUP
// ============================================
const fullDatabaseSetup = async () => {
  console.log('\n' + '='.repeat(70));
  console.log('🗄️  FULL DATABASE SETUP');
  console.log('='.repeat(70));

  console.log('\n🔄 Dropping existing tables...');

  const tablesToDrop = [
    '"Suggestions"', '"Reports"', '"ContactMessages"', '"LiveSessions"',
    '"SchoolStudentLists"', '"SchoolFileUploads"', '"SchoolColumnMappings"',
    '"SchoolExams"', '"Feedbacks"', '"Notifications"', '"ExamAttempts"',
    '"Materials"', '"Questions"', '"Exams"', '"Students"', '"Teachers"',
    '"Schools"', '"Subjects"', '"Admins"', '"PasswordResetAudit"', '"Users"'
  ];

  for (const table of tablesToDrop) {
    try {
      await sequelize.query(`DROP TABLE IF EXISTS ${table} CASCADE;`);
      console.log(`   ✅ Dropped: ${table}`);
    } catch (err) {
      console.log(`   ⚠️ Could not drop ${table}: ${err.message}`);
    }
  }
  console.log('✅ All tables dropped');

  await createAllTables();
  await createIndexes();
  await insertSubjects();

  const defaultAdmin = await createDefaultSuperAdmin();

  console.log('\n' + '='.repeat(70));
  console.log('✅✅✅ FULL DATABASE SETUP COMPLETE! ✅✅✅');
  console.log('='.repeat(70));

  console.log('\n📋 DEFAULT SUPERADMIN:');
  console.log('-'.repeat(50));
  console.log(`   👤 Username: ${defaultAdmin.username}`);
  console.log(`   🔑 Password: ${defaultAdmin.password}`);
  console.log(`   ✅ Direct access - No password change required`);
  console.log('-'.repeat(50));
  console.log(`🔗 Login: http://localhost:3000/auth/admin-login`);
  console.log('='.repeat(70));

  return defaultAdmin;
};

// ============================================
// MAIN FUNCTION
// ============================================
const main = async () => {
  try {
    console.log('\n' + '='.repeat(70));
    console.log('👑 SUPER ADMIN MANAGEMENT TOOL');
    console.log('='.repeat(70));

    await sequelize.authenticate();
    console.log('✅ Database connected');

    const cmdArgs = parseAdminArgs();

    // Handle management actions
    if (cmdArgs && cmdArgs.action) {
      switch (cmdArgs.action) {
        case 'list':
          await listSuperAdmins();
          break;
        case 'delete':
          if (cmdArgs.target) await deleteSuperAdmin(cmdArgs.target);
          else console.log('❌ Please provide --target');
          break;
        case 'block':
          if (cmdArgs.target) await blockSuperAdmin(cmdArgs.target);
          else console.log('❌ Please provide --target');
          break;
        case 'suspend':
          if (cmdArgs.target) await suspendSuperAdmin(cmdArgs.target);
          else console.log('❌ Please provide --target');
          break;
        case 'reactivate':
          if (cmdArgs.target) await reactivateSuperAdmin(cmdArgs.target);
          else console.log('❌ Please provide --target');
          break;
        case 'reset-password':
          if (cmdArgs.target) await resetSuperAdminPassword(cmdArgs.target);
          else console.log('❌ Please provide --target');
          break;
        default:
          console.log(`❌ Unknown action: ${cmdArgs.action}`);
          console.log('\n📋 Available actions: list, delete, block, suspend, reactivate, reset-password');
      }

      await sequelize.close();
      process.exit(0);
      return;
    }

    // Handle custom super admin creation
    if (cmdArgs && cmdArgs.admins) {
      const tablesExist = await checkTablesExist();

      if (!tablesExist) {
        console.error('\n❌ Database tables do not exist!');
        console.error('   Running full database setup first...');
        await fullDatabaseSetup();
      }

      console.log(`\n📋 Processing ${cmdArgs.admins.length} Super Admin(s)...\n`);
      console.log('-'.repeat(70));

      for (let i = 0; i < cmdArgs.admins.length; i++) {
        const admin = cmdArgs.admins[i];

        if (!admin.name || !admin.email) {
          console.error(`   ❌ Admin ${i + 1}: Missing name or email - SKIPPED`);
          continue;
        }

        try {
          console.log(`\n   Processing: ${admin.name}`);
          const result = await createOrUpdateSuperAdmin(admin);

          await sendWelcomeEmail(result.email, result.fullName, result.username, result.password, result.isTemporary);
          console.log(`   📧 Email sent to: ${result.email}`);
          console.log(`   👤 Username: ${result.username}`);
          console.log(`   🔑 Password: ${result.password}`);
          console.log(`   ✅ Direct access - Login with this password`);

        } catch (error) {
          console.error(`   ❌ Failed: ${error.message}`);
        }
      }

      console.log('\n' + '='.repeat(70));
      console.log('✅ SUPER ADMIN OPERATION COMPLETE!');
      console.log('='.repeat(70));

    } else {
      // No command - run FULL DATABASE SETUP
      await fullDatabaseSetup();
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await sequelize.close();
    console.log('\n✅ Done\n');
    process.exit(0);
  }
};

main();