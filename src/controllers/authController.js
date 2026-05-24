// backend/src/controllers/authController.js
// COMPLETE FIXED - Superadmin login working

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { User, Student, Teacher, School, Admin, Notification } = require('../models');
const { createError } = require('../middleware/errorHandler');
const { sendEmail, sendPasswordResetEmail, sendWelcomeEmail, sendAccountApprovedEmail } = require('../services/emailService');
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

// ===========================================
// LOGIN - FIXED
// ===========================================
const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({
      where: {
        [Op.or]: [
          { email: username },
          { username: username }
        ]
      }
    });

    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Check account status
    if (user.status === 'pending') {
      return res.status(403).json({ success: false, error: 'Account pending approval.' });
    }
    if (user.status === 'rejected') {
      return res.status(403).json({ success: false, error: 'Account rejected.' });
    }
    if (user.status === 'suspended' || user.status === 'blocked') {
      return res.status(403).json({ success: false, error: 'Account suspended or blocked.' });
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

    // Check forcePasswordChange for all admin roles
    let forcePasswordChange = false;

    if (user.role === 'superadmin' || user.role === 'subadmin' || user.role === 'teacher' || user.role === 'school') {
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
    } else if (user.role === 'superadmin' || user.role === 'subadmin') {
      const admin = await Admin.findOne({ where: { userId: user.id } });
      roleData = { admin };
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          fatherName: user.fatherName,
          grandfatherName: user.grandfatherName,
          email: user.email,
          username: user.username,
          role: user.role,
          status: user.status,
          forcePasswordChange: forcePasswordChange,
          isFirstLogin: user.isFirstLogin,
          ...roleData
        },
        token,
        forcePasswordChange: forcePasswordChange
      }
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    next(error);
  }
};

// ===========================================
// FORCE PASSWORD CHANGE
// ===========================================
const forcePasswordChange = async (req, res, next) => {
  try {
    const { newPassword, confirmPassword, role } = req.body;
    const user = await User.findByPk(req.user.id);

    if (!user) {
      throw createError('User not found', 404);
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

    if ((user.role === 'subadmin' || user.role === 'superadmin') && !/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)) {
      throw createError('Admin password must contain at least one special character', 400);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await user.update({
      passwordHash: hashedPassword,
      forcePasswordChange: false,
      isFirstLogin: false,
      passwordChangedAt: new Date()
    });

    const newToken = generateToken(user);

    const updatedUser = {
      id: user.id,
      name: user.name,
      fatherName: user.fatherName,
      grandfatherName: user.grandfatherName,
      email: user.email,
      username: user.username,
      role: user.role,
      status: user.status,
      forcePasswordChange: false,
      isFirstLogin: false
    };

    let dashboardUrl = '/dashboard/admin';
    if (user.role === 'teacher') {
      dashboardUrl = '/dashboard/teacher';
    } else if (user.role === 'school') {
      dashboardUrl = '/dashboard/school';
    } else if (user.role === 'superadmin' || user.role === 'subadmin') {
      dashboardUrl = '/dashboard/admin';
    }

    res.json({
      success: true,
      message: 'Password changed successfully! Redirecting to dashboard...',
      redirectTo: dashboardUrl,
      role: user.role,
      token: newToken,
      user: updatedUser
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

    let forcePasswordChange = false;

    if (user.role === 'teacher' || user.role === 'subadmin' || user.role === 'school' || user.role === 'superadmin') {
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
    } else if (user.role === 'superadmin' || user.role === 'subadmin') {
      const admin = await Admin.findOne({ where: { userId: user.id } });
      roleData = { admin };
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        fatherName: user.fatherName,
        grandfatherName: user.grandfatherName,
        email: user.email,
        username: user.username,
        role: user.role,
        status: user.status,
        forcePasswordChange: forcePasswordChange,
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
// FORGOT PASSWORD
// ===========================================
const forgotPassword = async (req, res, next) => {
  try {
    const { email, role } = req.body;

    const user = await User.findOne({ where: { email } });

    if (!user) {
      return res.json({
        success: true,
        message: 'If your email is registered, you will receive a password reset link'
      });
    }

    if (role && user.role !== role) {
      return res.json({
        success: true,
        message: 'If your email is registered, you will receive a password reset link'
      });
    }

    const resetToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '1h' }
    );

    await sendPasswordResetEmail(
      user.email,
      user.name || user.username,
      resetToken,
      user.role
    );

    res.json({
      success: true,
      message: 'If your email is registered, you will receive a password reset link'
    });
  } catch (error) {
    console.error('❌ Forgot password error:', error);
    next(error);
  }
};

// ===========================================
// RESET PASSWORD
// ===========================================
const resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword, confirmPassword } = req.body;

    if (!token) {
      throw createError('Reset token is required', 400);
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    } catch (err) {
      throw createError('Invalid or expired token. Please request a new reset link.', 400);
    }

    if (!decoded || !decoded.id) {
      throw createError('Invalid token', 400);
    }

    const user = await User.findByPk(decoded.id);
    if (!user) {
      throw createError('User not found', 404);
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

    if ((user.role === 'superadmin' || user.role === 'subadmin') && !/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)) {
      throw createError('Admin password must contain at least one special character', 400);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await user.update({
      passwordHash: hashedPassword,
      passwordChangedAt: new Date(),
      forcePasswordChange: false,
      isFirstLogin: false
    });

    res.clearCookie('token');
    res.clearCookie('refreshToken');

    res.json({
      success: true,
      message: 'Password reset successfully',
      role: user.role
    });
  } catch (error) {
    console.error('❌ Reset password error:', error);
    next(error);
  }
};

// ===========================================
// CREATE TEACHER
// ===========================================
const createTeacher = async (req, res, next) => {
  try {
    const { name, fatherName, grandfatherName, email, username, qualification, specialization, department, tempPassword } = req.body;

    const finalUsername = username || email.split('@')[0];
    const existingUser = await User.findOne({
      where: { [Op.or]: [{ email }, { username: finalUsername }] }
    });
    if (existingUser) throw createError('Email or username already exists', 400);

    const finalTempPassword = tempPassword || 'Teacher@123';
    const hashedTempPassword = await bcrypt.hash(finalTempPassword, 10);

    const user = await User.create({
      name,
      fatherName: fatherName || null,
      grandfatherName: grandfatherName || null,
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

    await sendWelcomeEmail(email, name, 'teacher', finalTempPassword, finalUsername).catch(err => {
      console.error('Failed to send teacher welcome email:', err.message);
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
    const { schoolName, address, phone, email, adminName, adminFatherName, adminGrandfatherName, adminUsername, tempPassword } = req.body;

    const existingSchool = await School.findOne({ where: { schoolName: schoolName } });
    if (existingSchool) throw createError('School with this name already exists', 400);

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) throw createError('Email already exists', 400);

    const finalUsername = adminUsername || email.split('@')[0];
    const finalTempPassword = tempPassword || 'School@123';
    const hashedPassword = await bcrypt.hash(finalTempPassword, 10);

    const adminUser = await User.create({
      name: adminName,
      fatherName: adminFatherName || null,
      grandfatherName: adminGrandfatherName || null,
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

    await sendWelcomeEmail(email, adminName, 'school', finalTempPassword, finalUsername).catch(err => {
      console.error('Failed to send school welcome email:', err.message);
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
    const { name, fatherName, grandfatherName, sex, email, username, tempPassword } = req.body;

    const finalUsername = username || email.split('@')[0];
    const existingUser = await User.findOne({
      where: { [Op.or]: [{ email }, { username: finalUsername }] }
    });
    if (existingUser) throw createError('Email or username already exists', 400);
    if (!tempPassword || tempPassword.length < 6) throw createError('Password must be at least 6 characters', 400);

    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const user = await User.create({
      name,
      fatherName: fatherName || null,
      grandfatherName: grandfatherName || null,
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

    await sendWelcomeEmail(email, name, 'subadmin', tempPassword, finalUsername).catch(err => {
      console.error('Failed to send subadmin welcome email:', err.message);
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

// ===========================================
// REGISTER STUDENT
// ===========================================
const registerStudent = async (req, res, next) => {
  try {
    const {
      name, fatherName, grandfatherName, email, username, password,
      idNumber, gradeLevel, department, schoolId, schoolName, phone, address, sex,
      isOtherSchool
    } = req.body;

    const existingUser = await User.findOne({
      where: { [Op.or]: [{ email }, { username }] }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'USER_EXISTS',
        message: 'Email or username already exists'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    let finalSchoolId = null;
    let finalSchoolName = schoolName || null;
    let isSchoolInList = false;

    const isOther = isOtherSchool === 'true' || isOtherSchool === true;

    if (!isOther && schoolId && schoolId !== 'null' && schoolId !== '' && schoolId !== 'undefined') {
      finalSchoolId = parseInt(schoolId, 10);
      const school = await School.findByPk(finalSchoolId);
      if (school) {
        finalSchoolName = school.schoolName;
        isSchoolInList = true;
      }
    }

    let userStatus = 'pending';
    let autoApproved = false;
    let verificationStatus = '';
    let responseMessage = '';
    let schoolRecord = null;
    let needsIdPhoto = false;

    if (isSchoolInList) {
      try {
        const [preVerified] = await sequelize.query(`
          SELECT * FROM "SchoolStudentLists" 
          WHERE "schoolId" = $1 AND "studentIdNumber" = $2
        `, { bind: [finalSchoolId, idNumber] });

        if (preVerified && preVerified.length > 0) {
          schoolRecord = preVerified[0];

          const nameMatch = schoolRecord.studentName && schoolRecord.studentName.toLowerCase().trim() === name.toLowerCase().trim();
          const departmentMatch = schoolRecord.department && schoolRecord.department.toLowerCase().trim() === department.toLowerCase().trim();

          if (nameMatch && departmentMatch) {
            userStatus = 'active';
            autoApproved = true;
            verificationStatus = 'auto_approved';
            responseMessage = '✅ Registration successful! Your account is automatically approved.';
          } else {
            return res.status(400).json({
              success: false,
              error: 'MISMATCH',
              message: `Information mismatch. Please check your details.`
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
        console.error('   ❌ Error querying:', queryError.message);
        isSchoolInList = false;
      }
    }

    if (!isSchoolInList) {
      const hasIdPhoto = req.file !== undefined && req.file !== null;

      if (!hasIdPhoto) {
        return res.status(400).json({
          success: false,
          error: 'ID_PHOTO_REQUIRED',
          message: 'ID Photo Required! Please upload your student ID photo.'
        });
      }

      userStatus = 'pending';
      autoApproved = false;
      verificationStatus = 'pending_other_school';
      responseMessage = 'Registration submitted! Your ID photo will be reviewed by admin.';
      needsIdPhoto = true;
    }

    const user = await User.create({
      name,
      fatherName: fatherName || null,
      grandfatherName: grandfatherName || null,
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

    let idPhotoPath = null;
    if (req.file) {
      idPhotoPath = `/uploads/id-photos/${req.file.filename}`;
    }

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

    if (autoApproved && schoolRecord) {
      try {
        await sequelize.query(`
          DELETE FROM "SchoolStudentLists" 
          WHERE "schoolId" = $1 AND "studentIdNumber" = $2
        `, { bind: [finalSchoolId, idNumber] });
      } catch (err) {
        console.log('   ⚠️ Could not remove from pre-verified list:', err.message);
      }
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

    // Create notification for admins about new student registration (only if not auto-approved)
    if (!autoApproved) {
      try {
        // Get all admins (super admin and sub admins)
        const [admins] = await sequelize.query(`
          SELECT u.id FROM "Users" u
          INNER JOIN "Admins" a ON u.id = a."userId"
          WHERE u.role IN ('superadmin', 'subadmin') AND u.status = 'active'
        `);

        // Create notification for each admin
        for (const admin of admins) {
          await sequelize.query(`
            INSERT INTO "Notifications" ("userId", title, message, type, metadata, "isRead", "createdAt")
            VALUES ($1, $2, $3, 'student_registration', $4, false, NOW())
          `, {
            bind: [
              admin.id,
              '👨‍🎓 New Student Registration',
              `${name} has registered and is waiting for approval. ID: ${idNumber}`,
              'student_registration',
              JSON.stringify({
                studentId: student.id,
                userId: user.id,
                studentName: name,
                idNumber: idNumber,
                schoolName: finalSchoolName,
                needsIdPhoto: needsIdPhoto
              })
            ]
          });
        }

        console.log(`📢 Created notifications for ${admins.length} admin(s) about new student registration: ${name}`);
      } catch (notificationError) {
        console.error('Error creating admin notifications:', notificationError);
        // Don't fail the registration if notification creation fails
      }
    }

  } catch (error) {
    console.error('❌ Registration error:', error);
    next(error);
  }
};

// ===========================================
// LEGACY FORCE PASSWORD CHANGE ENDPOINTS
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
      message: 'Password changed successfully. Redirecting to login...',
      redirectTo: '/auth/admin-login'
    });
  } catch (error) {
    next(error);
  }
};

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
      message: 'Password changed successfully. Redirecting to login...',
      redirectTo: '/auth/teacher-login'
    });
  } catch (error) {
    next(error);
  }
};

const forcePasswordChangeSchool = async (req, res, next) => {
  try {
    const { newPassword, confirmPassword } = req.body;
    const user = await User.findByPk(req.user.id);

    if (!user) throw createError('User not found', 404);
    if (user.role !== 'school') throw createError('Only school admins can use this endpoint', 403);

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
      message: 'Password changed successfully. Redirecting to login...',
      redirectTo: '/auth/school-login'
    });
  } catch (error) {
    next(error);
  }
};

// ===========================================
// EXPORT ALL FUNCTIONS
// ===========================================
module.exports = {
  registerStudent,
  login,
  logout,
  refreshToken,
  changePassword,
  forcePasswordChange,
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