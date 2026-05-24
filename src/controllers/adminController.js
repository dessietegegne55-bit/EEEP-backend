// backend/src/controllers/authController.js
// COMPLETE WORKING VERSION - CamelCase Database Compatible

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { User, Student, Teacher, School, Admin, Notification } = require('../models');
const { createError } = require('../middleware/errorHandler');
const { sendEmail } = require('../services/emailService');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');

const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '7d' }
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET || 'your-refresh-secret',
    { expiresIn: '30d' }
  );
};

// Helper function to generate temporary password
const generateTempPassword = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  for (let i = 0; i < 10; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password + 'Tmp@123';
};

// ===========================================
// STUDENT REGISTRATION - FIXED with proper schoolId handling
// ===========================================
const registerStudent = async (req, res, next) => {
  try {
    const {
      firstName, middleName, lastName, email, username, password,
      idNumber, gradeLevel, department, schoolId, schoolName, phone, address, sex,
      isOtherSchool
    } = req.body;

    console.log('\n📝 STUDENT REGISTRATION STARTED');
    console.log('   Name:', firstName, lastName);
    console.log('   ID Number:', idNumber);
    console.log('   Grade:', gradeLevel);
    console.log('   Department:', department);
    console.log('   School ID from request:', schoolId);
    console.log('   School Name:', schoolName);
    console.log('   Is Other School:', isOtherSchool);

    // Check existing user
    const existingUser = await User.findOne({
      where: { [Op.or]: [{ email }, { username }] }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Email or username already exists',
        code: 'USER_EXISTS'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Get school info - FIXED: Parse schoolId as integer
    let finalSchoolId = null;
    let finalSchoolName = schoolName || null;
    let isSchoolInList = false;

    if (schoolId && schoolId !== 'null' && schoolId !== '' && schoolId !== 'undefined' && !isOtherSchool) {
      finalSchoolId = parseInt(schoolId, 10);
      console.log('   ✅ Parsed schoolId as integer:', finalSchoolId);
      
      // Verify school exists
      const [schoolCheck] = await sequelize.query(`
        SELECT id, "schoolName" FROM "Schools" WHERE id = $1
      `, { bind: [finalSchoolId] });
      
      if (schoolCheck && schoolCheck.length > 0) {
        finalSchoolName = schoolCheck[0].schoolName;
        isSchoolInList = true;
        console.log('   ✅ School found in list:', finalSchoolName);
      } else {
        console.log('   ⚠️ School not found with ID:', finalSchoolId);
        isSchoolInList = false;
      }
    }

    let userStatus = 'pending';
    let autoApproved = false;
    let verificationStatus = '';
    let responseMessage = '';
    let schoolRecord = null;
    let needsIdPhoto = false;

    // PATH A: School IS in List
    if (isSchoolInList) {
      console.log('   🔍 PATH A: Checking pre-verified records...');

      try {
        const [preVerified] = await sequelize.query(`
          SELECT * FROM "school_student_lists" 
          WHERE "schoolId" = $1 AND "studentIdNumber" = $2
        `, { bind: [finalSchoolId, idNumber] });

        if (preVerified && preVerified.length > 0) {
          schoolRecord = preVerified[0];

          const firstNameMatch = schoolRecord.studentFirstName.toLowerCase().trim() === firstName.toLowerCase().trim();
          const lastNameMatch = schoolRecord.studentLastName.toLowerCase().trim() === lastName.toLowerCase().trim();
          const departmentMatch = schoolRecord.department.toLowerCase().trim() === department.toLowerCase().trim();
          const idMatch = schoolRecord.studentIdNumber === idNumber;

          if (firstNameMatch && lastNameMatch && departmentMatch && idMatch) {
            userStatus = 'active';
            autoApproved = true;
            verificationStatus = 'auto_approved';
            responseMessage = '✅ Registration successful! Your account is automatically approved. You can now login.';
            console.log(`   ✅✅✅ AUTO-APPROVED: ${firstName} ${lastName}`);
          } else {
            const schoolFullName = `${schoolRecord.studentFirstName} ${schoolRecord.studentLastName}`;
            let mismatchReason = '';
            if (!idMatch) {
              mismatchReason = `ID Number mismatch. Expected: ${schoolRecord.studentIdNumber}, Got: ${idNumber}`;
            } else if (!firstNameMatch || !lastNameMatch) {
              mismatchReason = `Name mismatch. School has "${schoolFullName}", You registered as "${firstName} ${lastName}"`;
            } else if (!departmentMatch) {
              mismatchReason = `Department mismatch. School has "${schoolRecord.department}", You selected "${department}"`;
            }

            return res.status(400).json({
              success: false,
              error: 'MISMATCH',
              message: mismatchReason
            });
          }
        } else {
          return res.status(400).json({
            success: false,
            error: 'ID_NOT_FOUND',
            message: 'ID Number not found in school records!'
          });
        }
      } catch (queryError) {
        console.error('   ❌ Error querying school_student_lists:', queryError.message);
        throw queryError;
      }
    }
    // PATH B: School NOT in List
    else {
      console.log('   🔍 PATH B: Other School');

      const hasIdPhoto = req.file !== undefined && req.file !== null;

      if (!hasIdPhoto) {
        return res.status(400).json({
          success: false,
          error: 'ID_PHOTO_REQUIRED',
          message: 'ID Photo Required! Please upload a valid student ID photo for verification.'
        });
      }

      userStatus = 'pending';
      autoApproved = false;
      verificationStatus = 'pending_other_school';
      responseMessage = 'Registration submitted! Your ID photo will be reviewed by admin.';
      needsIdPhoto = true;
      console.log(`   ⏳ Other School - Pending admin review`);
    }

    // CREATE USER
    const user = await User.create({
      firstName,
      middleName: middleName || null,
      lastName,
      email,
      username,
      passwordHash: hashedPassword,
      role: 'student',
      status: userStatus,
      sex: sex || null,
      forcePasswordChange: false,
      isFirstLogin: true,
      verificationStatus: verificationStatus
    });

    console.log('   ✅ User created with ID:', user.id, 'Status:', userStatus);

    // Handle ID photo
    let idPhotoPath = null;
    if (req.file) {
      idPhotoPath = `/uploads/id-photos/${req.file.filename}`;
    }

    // Create student record - FIXED: Ensure schoolId is properly set
    const student = await Student.create({
      userId: user.id,
      idNumber,
      idPhoto: idPhotoPath,
      gradeLevel: parseInt(gradeLevel, 10),
      department,
      schoolId: finalSchoolId,
      schoolName: finalSchoolName,
      address: address || null,
      phone: phone || null,
      photoVerified: autoApproved,
      verificationStatus: verificationStatus
    });

    console.log('   ✅ Student record created with schoolId:', finalSchoolId);

    // DELETE FROM pre-verified list
    if (autoApproved && schoolRecord) {
      await sequelize.query(`
        DELETE FROM "school_student_lists" 
        WHERE "schoolId" = $1 AND "studentIdNumber" = $2
      `, { bind: [finalSchoolId, idNumber] });
      console.log('   🗑️ Removed student from pre-verified list');
    }

    // NOTIFICATIONS
    if (!autoApproved && isSchoolInList === false) {
      const admins = await Admin.findAll({
        where: { adminType: ['superadmin', 'subadmin'] }
      });

      for (const admin of admins) {
        await Notification.create({
          userId: admin.userId,
          title: '📋 New Student Registration (Other School)',
          message: `${firstName} ${lastName} (${department}, Grade ${gradeLevel}) needs ID photo verification.`,
          type: 'pending_review',
          link: '/dashboard/admin/students',
          metadata: {
            studentId: student.id,
            userId: user.id,
            idNumber: idNumber,
            hasIdPhoto: true
          }
        });
      }
      console.log(`   📧 Notified ${admins.length} admins`);
    }

    res.status(201).json({
      success: true,
      message: responseMessage,
      data: {
        status: userStatus,
        autoApproved: autoApproved,
        verificationStatus: verificationStatus,
        needsIdPhoto: needsIdPhoto,
        userId: user.id,
        studentId: student.id
      }
    });

  } catch (error) {
    console.error('❌ Registration error:', error);
    next(error);
  }
};

// ===========================================
// LOGIN - FIXED
// ===========================================
const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    console.log('🔐 Login attempt for:', username);

    const user = await User.findOne({
      where: {
        [Op.or]: [
          { email: username },
          { username: username }
        ]
      }
    });

    if (!user) {
      console.log('❌ User not found:', username);
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    console.log('✅ User found:', user.username, 'Role:', user.role, 'Status:', user.status);

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      console.log('❌ Invalid password for user:', username);
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    if (user.status === 'pending') {
      return res.status(403).json({ success: false, error: 'Account pending approval. Please wait for admin approval.' });
    }
    if (user.status === 'rejected') {
      return res.status(403).json({ success: false, error: 'Account rejected. Please contact support.' });
    }
    if (user.status === 'suspended' || user.status === 'banned') {
      return res.status(403).json({ success: false, error: 'Account suspended. Please contact support.' });
    }

    await user.update({ lastLogin: new Date() });

    const token = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    res.cookie('token', token, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production'
    });
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production'
    });

    const isAdmin = ['superadmin', 'subadmin'].includes(user.role);
    let forcePasswordChange = false;

    if (user.role === 'teacher' || user.role === 'subadmin' || user.role === 'school') {
      forcePasswordChange = user.forcePasswordChange === true || user.isFirstLogin === true;
    }

    let roleData = {};

    if (user.role === 'student') {
      const student = await Student.findOne({ where: { userId: user.id } });
      roleData = { student };
    } else if (user.role === 'teacher') {
      const teacher = await Teacher.findOne({ where: { userId: user.id } });
      roleData = { teacher };
    } else if (user.role === 'school') {
      const school = await School.findOne({ where: { adminId: user.id } });
      roleData = { school };
    } else if (isAdmin) {
      const admin = await Admin.findOne({ where: { userId: user.id } });
      roleData = { admin };
    }

    console.log('✅ Login successful for:', user.username);

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          username: user.username,
          role: user.role,
          status: user.status,
          forcePasswordChange,
          isFirstLogin: user.isFirstLogin,
          ...roleData
        },
        token
      }
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    next(error);
  }
};

// ===========================================
// LOGOUT
// ===========================================
const logout = async (req, res, next) => {
  try {
    res.clearCookie('token');
    res.clearCookie('refreshToken');
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
};

// ===========================================
// REFRESH TOKEN
// ===========================================
const refreshToken = async (req, res, next) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) throw createError('Refresh token required', 401);

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || 'your-refresh-secret');
    const user = await User.findByPk(decoded.id);
    if (!user) throw createError('User not found', 401);

    const token = generateToken(user);
    res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'strict' });
    res.json({ success: true, data: { token } });
  } catch (error) {
    next(error);
  }
};

// ===========================================
// CHANGE PASSWORD
// ===========================================
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const user = await User.findByPk(req.user.id);

    if (!user) throw createError('User not found', 404);

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) throw createError('Current password is incorrect', 400);

    if (newPassword !== confirmPassword) throw createError('Passwords do not match', 400);
    if (newPassword.length < 8) throw createError('Password must be at least 8 characters', 400);

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.passwordHash = hashedPassword;
    user.passwordChangedAt = new Date();
    await user.save();

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    next(error);
  }
};

// ===========================================
// FORCE PASSWORD CHANGE - SUB ADMIN
// ===========================================
const forcePasswordChangeSubAdmin = async (req, res, next) => {
  try {
    const { newPassword, confirmPassword } = req.body;
    const user = await User.findByPk(req.user.id);

    if (!user) throw createError('User not found', 404);
    if (user.role !== 'subadmin') throw createError('Only sub admins can use this endpoint', 403);

    if (newPassword !== confirmPassword) throw createError('Passwords do not match', 400);
    if (newPassword.length < 8) throw createError('Password must be at least 8 characters', 400);

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.passwordHash = hashedPassword;
    user.forcePasswordChange = false;
    user.isFirstLogin = false;
    user.passwordChangedAt = new Date();
    await user.save();

    res.clearCookie('token');
    res.clearCookie('refreshToken');

    res.json({
      success: true,
      message: 'Password changed successfully. Please login again.',
      redirectTo: '/auth/admin-login'
    });
  } catch (error) {
    next(error);
  }
};

// ===========================================
// FORCE PASSWORD CHANGE - TEACHER
// ===========================================
const forcePasswordChangeTeacher = async (req, res, next) => {
  try {
    const { newPassword, confirmPassword } = req.body;
    const user = await User.findByPk(req.user.id);

    if (!user) throw createError('User not found', 404);
    if (user.role !== 'teacher') throw createError('Only teachers can use this endpoint', 403);

    if (newPassword !== confirmPassword) throw createError('Passwords do not match', 400);
    if (newPassword.length < 8) throw createError('Password must be at least 8 characters', 400);

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.passwordHash = hashedPassword;
    user.forcePasswordChange = false;
    user.isFirstLogin = false;
    user.passwordChangedAt = new Date();
    await user.save();

    res.clearCookie('token');
    res.clearCookie('refreshToken');

    res.json({
      success: true,
      message: 'Password changed successfully. Please login again.',
      redirectTo: '/auth/teacher-login'
    });
  } catch (error) {
    next(error);
  }
};

// ===========================================
// FORCE PASSWORD CHANGE - SCHOOL
// ===========================================
const forcePasswordChangeSchool = async (req, res, next) => {
  try {
    const { newPassword, confirmPassword } = req.body;
    
    console.log('🔄 Force password change for school user:', req.user.id);
    
    const user = await User.findByPk(req.user.id);

    if (!user) {
      console.log('❌ User not found:', req.user.id);
      throw createError('User not found', 404);
    }
    
    if (user.role !== 'school') {
      console.log('❌ Wrong role:', user.role);
      throw createError('Only school admins can use this endpoint', 403);
    }

    if (!newPassword || !confirmPassword) {
      throw createError('Please provide new password and confirmation', 400);
    }

    if (newPassword !== confirmPassword) {
      throw createError('Passwords do not match', 400);
    }
    
    if (newPassword.length < 8) {
      throw createError('Password must be at least 8 characters', 400);
    }

    const hasUpperCase = /[A-Z]/.test(newPassword);
    const hasLowerCase = /[a-z]/.test(newPassword);
    const hasNumbers = /[0-9]/.test(newPassword);

    if (!hasUpperCase || !hasLowerCase || !hasNumbers) {
      throw createError('Password must contain uppercase, lowercase and numbers', 400);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    await user.update({
      passwordHash: hashedPassword,
      forcePasswordChange: false,
      isFirstLogin: false,
      passwordChangedAt: new Date()
    });

    console.log('✅ School password changed successfully for user:', user.username);

    res.clearCookie('token');
    res.clearCookie('refreshToken');

    res.json({
      success: true,
      message: 'Password changed successfully. Please login again.',
      redirectTo: '/auth/school-login'
    });
  } catch (error) {
    console.error('❌ Force password change error:', error);
    next(error);
  }
};

// ===========================================
// GET CURRENT USER
// ===========================================
const getMe = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) throw createError('User not found', 404);

    const isAdmin = ['superadmin', 'subadmin'].includes(user.role);
    let forcePasswordChange = false;

    if (user.role === 'teacher' || user.role === 'subadmin' || user.role === 'school') {
      forcePasswordChange = user.forcePasswordChange === true || user.isFirstLogin === true;
    }

    let roleData = {};

    if (user.role === 'student') {
      const student = await Student.findOne({ where: { userId: user.id } });
      roleData = { student };
    } else if (user.role === 'teacher') {
      const teacher = await Teacher.findOne({ where: { userId: user.id } });
      roleData = { teacher };
    } else if (user.role === 'school') {
      const school = await School.findOne({ where: { adminId: user.id } });
      roleData = { school };
    } else if (isAdmin) {
      const admin = await Admin.findOne({ where: { userId: user.id } });
      roleData = { admin };
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        username: user.username,
        role: user.role,
        status: user.status,
        forcePasswordChange,
        isFirstLogin: user.isFirstLogin,
        profileImage: user.profileImage,
        ...roleData
      }
    });
  } catch (error) {
    next(error);
  }
};

// ===========================================
// FORGOT & RESET PASSWORD
// ===========================================
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ where: { email } });

    if (!user) {
      return res.json({
        success: true,
        message: 'If your email is registered, you will receive a password reset link'
      });
    }

    const resetToken = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET + user.passwordHash,
      { expiresIn: '1h' }
    );
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/reset-password?token=${resetToken}`;

    await sendEmail({
      to: user.email,
      subject: 'Password Reset Request - EEEP',
      html: `
        <h2>Password Reset Request</h2>
        <p>Hello ${user.firstName},</p>
        <p>Click <a href="${resetUrl}">here</a> to reset your password.</p>
        <p>This link expires in 1 hour.</p>
      `
    });

    res.json({
      success: true,
      message: 'If your email is registered, you will receive a password reset link'
    });
  } catch (error) {
    next(error);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword, confirmPassword } = req.body;
    const decoded = jwt.decode(token);

    if (!decoded || !decoded.id) throw createError('Invalid token', 400);

    const user = await User.findByPk(decoded.id);
    if (!user) throw createError('User not found', 404);

    try {
      jwt.verify(token, process.env.JWT_SECRET + user.passwordHash);
    } catch (error) {
      throw createError('Invalid or expired token', 400);
    }

    if (newPassword !== confirmPassword) throw createError('Passwords do not match', 400);
    if (newPassword.length < 8) throw createError('Password must be at least 8 characters', 400);

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.passwordHash = hashedPassword;
    user.passwordChangedAt = new Date();
    await user.save();

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    next(error);
  }
};

// ===========================================
// CREATE TEACHER
// ===========================================
const createTeacher = async (req, res, next) => {
  try {
    const { firstName, middleName, lastName, email, username, qualification, specialization, department, tempPassword } = req.body;

    const finalUsername = username || email.split('@')[0];
    const existingUser = await User.findOne({
      where: { [Op.or]: [{ email }, { username: finalUsername }] }
    });
    if (existingUser) throw createError('Email or username already exists', 400);

    const finalTempPassword = tempPassword || generateTempPassword();
    const hashedTempPassword = await bcrypt.hash(finalTempPassword, 10);

    const user = await User.create({
      firstName,
      middleName: middleName || null,
      lastName,
      email,
      username: finalUsername,
      passwordHash: hashedTempPassword,
      role: 'teacher',
      status: 'active',
      forcePasswordChange: true,
      isFirstLogin: true
    });

    await Teacher.create({
      userId: user.id,
      qualification,
      specialization,
      department
    });

    await sendEmail({
      to: email,
      subject: 'Your Teacher Account Has Been Created',
      html: `
        <h2>Welcome to EEEP!</h2>
        <p>Your teacher account has been created.</p>
        <p><strong>Username:</strong> ${finalUsername}</p>
        <p><strong>Temporary Password:</strong> ${finalTempPassword}</p>
        <p>Please change your password on first login.</p>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/teacher-login">Click here to login</a>
      `
    });

    res.status(201).json({
      success: true,
      message: 'Teacher created successfully',
      data: { username: finalUsername, tempPassword: finalTempPassword }
    });
  } catch (error) {
    next(error);
  }
};

// ===========================================
// CREATE SCHOOL
// ===========================================
const createSchool = async (req, res, next) => {
  try {
    const { schoolName, address, phone, email, adminFirstName, adminLastName, adminUsername, tempPassword } = req.body;

    const existingSchool = await School.findOne({ where: { schoolName: schoolName } });
    if (existingSchool) throw createError('School with this name already exists', 400);

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) throw createError('Email already exists', 400);

    const finalUsername = adminUsername || email.split('@')[0];
    const finalTempPassword = tempPassword || generateTempPassword();
    const hashedPassword = await bcrypt.hash(finalTempPassword, 10);

    const adminUser = await User.create({
      firstName: adminFirstName,
      lastName: adminLastName,
      email,
      username: finalUsername,
      passwordHash: hashedPassword,
      role: 'school',
      status: 'active',
      forcePasswordChange: true,
      isFirstLogin: true
    });

    const school = await School.create({
      schoolName,
      address: address || null,
      phone: phone || null,
      email: email || null,
      adminId: adminUser.id,
      status: 'approved'
    });

    await sendEmail({
      to: email,
      subject: 'Your School Account Has Been Created',
      html: `
        <h2>Welcome to EEEP!</h2>
        <p>Your school account has been created.</p>
        <p><strong>School:</strong> ${schoolName}</p>
        <p><strong>Username:</strong> ${finalUsername}</p>
        <p><strong>Temporary Password:</strong> ${finalTempPassword}</p>
        <p>Please change your password on first login.</p>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/school-login">Click here to login</a>
      `
    });

    res.status(201).json({
      success: true,
      message: 'School created successfully',
      data: { schoolId: school.id, username: finalUsername, tempPassword: finalTempPassword }
    });
  } catch (error) {
    next(error);
  }
};

// ===========================================
// CREATE SUB ADMIN
// ===========================================
const createSubAdmin = async (req, res, next) => {
  try {
    const { firstName, middleName, lastName, sex, email, username, tempPassword } = req.body;

    const finalUsername = username || email.split('@')[0];
    const existingUser = await User.findOne({
      where: { [Op.or]: [{ email }, { username: finalUsername }] }
    });
    if (existingUser) throw createError('Email or username already exists', 400);
    if (!tempPassword || tempPassword.length < 6) throw createError('Password must be at least 6 characters', 400);

    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const user = await User.create({
      firstName,
      middleName: middleName || null,
      lastName,
      sex: sex || null,
      email,
      username: finalUsername,
      passwordHash: hashedPassword,
      role: 'subadmin',
      status: 'active',
      forcePasswordChange: true,
      isFirstLogin: true
    });

    const superAdmin = await Admin.findOne({ where: { userId: req.user.id } });
    await Admin.create({
      userId: user.id,
      adminType: 'subadmin',
      managedBy: superAdmin?.id || null
    });

    await sendEmail({
      to: email,
      subject: 'Your Sub Admin Account Has Been Created',
      html: `
        <h2>Welcome to EEEP Admin Panel!</h2>
        <p>Your sub admin account has been created.</p>
        <p><strong>Username:</strong> ${finalUsername}</p>
        <p><strong>Temporary Password:</strong> ${tempPassword}</p>
        <p>Please change your password on first login.</p>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/admin-login">Click here to login</a>
      `
    });

    res.status(201).json({
      success: true,
      message: 'Sub admin created successfully',
      data: { username: finalUsername, tempPassword }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  registerStudent,
  login,
  logout,
  refreshToken,
  changePassword,
  forcePasswordChangeSubAdmin,
  forcePasswordChangeTeacher,
  forcePasswordChangeSchool,
  getMe,
  forgotPassword,
  resetPassword,
  createTeacher,
  createSchool,
  createSubAdmin
};