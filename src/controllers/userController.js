const { User, Student, Teacher, School, Admin, Notification } = require('../models');
const { createError } = require('../middleware/errorHandler');
const { Op } = require('sequelize');
const { sendEmail } = require('../services/emailService');
const bcrypt = require('bcryptjs');

// Helper function to generate temporary password
const generateTempPassword = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  for (let i = 0; i < 10; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password + 'Tmp@123';
};

// Get all users
const getUsers = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      role,
      status,
      search,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = req.query;

    const offset = (page - 1) * limit;

    const where = {};
    if (role) where.role = role;
    if (status) where.status = status;
    if (search) {
      where[Op.or] = [
        { firstName: { [Op.iLike]: `%${search}%` } },
        { lastName: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { username: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const users = await User.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [[sortBy, sortOrder]],
      include: [
        {
          model: Student,
          as: 'student',
          include: ['school'],
          required: false,
        },
        {
          model: Teacher,
          as: 'teacher',
          required: false,
        },
        {
          model: School,
          as: 'school',
          required: false,
        },
        {
          model: Admin,
          as: 'admin',
          required: false,
        },
      ],
    });

    res.json({
      success: true,
      data: {
        users: users.rows,
        total: users.count,
        page: parseInt(page),
        totalPages: Math.ceil(users.count / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get user by ID
const getUserById = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id, {
      include: [
        {
          model: Student,
          as: 'student',
          include: ['school'],
        },
        {
          model: Teacher,
          as: 'teacher',
        },
        {
          model: School,
          as: 'school',
        },
        {
          model: Admin,
          as: 'admin',
        },
      ],
    });

    if (!user) {
      throw createError('User not found', 404);
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

// Update user
const updateUser = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id);

    if (!user) {
      throw createError('User not found', 404);
    }

    // Don't allow role change
    delete req.body.role;

    await user.update(req.body);

    // Update role-specific data if provided
    if (user.role === 'student' && req.body.student) {
      await Student.update(req.body.student, {
        where: { userId: user.id },
      });
    } else if (user.role === 'teacher' && req.body.teacher) {
      await Teacher.update(req.body.teacher, {
        where: { userId: user.id },
      });
    } else if (user.role === 'school' && req.body.school) {
      await School.update(req.body.school, {
        where: { adminId: user.id },
      });
    }

    res.json({
      success: true,
      message: 'User updated successfully',
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

// Delete user
const deleteUser = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id);

    if (!user) {
      throw createError('User not found', 404);
    }

    // Don't allow deleting own account
    if (user.id === req.user.id) {
      throw createError('Cannot delete your own account', 400);
    }

    await user.destroy();

    res.json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

// Approve user
const approveUser = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id);

    if (!user) {
      throw createError('User not found', 404);
    }

    if (user.status !== 'pending') {
      throw createError(`User is already ${user.status}`, 400);
    }

    await user.update({ status: 'approved' });

    // Create notification for user
    await Notification.create({
      userId: user.id,
      title: 'Account Approved',
      message: 'Your account has been approved! You can now login.',
      type: 'success',
    });

    // Send approval email
    await sendEmail({
      to: user.email,
      subject: 'Account Approved',
      html: `
        <h2>Welcome to Ethio Entrance Exam Preparation!</h2>
        <p>Dear ${user.firstName},</p>
        <p>Your account has been approved. You can now login to the system.</p>
        <p><a href="${process.env.FRONTEND_URL}/auth/login">Login Here</a></p>
      `,
    });

    res.json({
      success: true,
      message: 'User approved successfully',
    });
  } catch (error) {
    next(error);
  }
};

// Reject user
const rejectUser = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const user = await User.findByPk(req.params.id);

    if (!user) {
      throw createError('User not found', 404);
    }

    if (user.status !== 'pending') {
      throw createError(`User is already ${user.status}`, 400);
    }

    await user.update({ status: 'rejected' });

    // Create notification for user
    await Notification.create({
      userId: user.id,
      title: 'Account Rejected',
      message: reason || 'Your account has been rejected.',
      type: 'error',
    });

    // Send rejection email
    await sendEmail({
      to: user.email,
      subject: 'Account Registration Update',
      html: `
        <h2>Account Registration Status</h2>
        <p>Dear ${user.firstName},</p>
        <p>We regret to inform you that your account registration has been rejected.</p>
        ${reason ? `<p>Reason: ${reason}</p>` : ''}
        <p>Please contact support for more information.</p>
      `,
    });

    res.json({
      success: true,
      message: 'User rejected successfully',
    });
  } catch (error) {
    next(error);
  }
};

// Suspend user
const suspendUser = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const user = await User.findByPk(req.params.id);

    if (!user) {
      throw createError('User not found', 404);
    }

    if (user.id === req.user.id) {
      throw createError('Cannot suspend your own account', 400);
    }

    await user.update({ status: 'suspended' });

    // Create notification for user
    await Notification.create({
      userId: user.id,
      title: 'Account Suspended',
      message: reason || 'Your account has been suspended.',
      type: 'warning',
    });

    // Send suspension email
    await sendEmail({
      to: user.email,
      subject: 'Account Suspended',
      html: `
        <h2>Account Suspended</h2>
        <p>Dear ${user.firstName},</p>
        <p>Your account has been suspended.</p>
        ${reason ? `<p>Reason: ${reason}</p>` : ''}
        <p>Please contact support for more information.</p>
      `,
    });

    res.json({
      success: true,
      message: 'User suspended successfully',
    });
  } catch (error) {
    next(error);
  }
};

// Reset user password
const resetUserPassword = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id);

    if (!user) {
      throw createError('User not found', 404);
    }

    // Generate temporary password
    const tempPassword = generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    user.passwordHash = hashedPassword;
    user.forcePasswordChange = true;
    await user.save();

    // Create notification for user
    await Notification.create({
      userId: user.id,
      title: 'Password Reset',
      message: 'Your password has been reset by an administrator.',
      type: 'info',
    });

    // Send email with temporary password
    await sendEmail({
      to: user.email,
      subject: 'Password Reset',
      html: `
        <h2>Password Reset</h2>
        <p>Dear ${user.firstName},</p>
        <p>Your password has been reset by an administrator.</p>
        <p><strong>Temporary Password:</strong> ${tempPassword}</p>
        <p>You will be required to change your password on first login.</p>
        <p><a href="${process.env.FRONTEND_URL}/auth/login">Login Here</a></p>
      `,
    });

    res.json({
      success: true,
      message: 'Password reset successfully',
      data: { tempPassword }, // Only shown to admin
    });
  } catch (error) {
    next(error);
  }
};

// Get pending users
const getPendingUsers = async (req, res, next) => {
  try {
    const users = await User.findAll({
      where: { status: 'pending' },
      order: [['createdAt', 'ASC']],
      include: [
        {
          model: Student,
          as: 'student',
          required: false,
        },
        {
          model: Teacher,
          as: 'teacher',
          required: false,
        },
        {
          model: School,
          as: 'school',
          required: false,
        },
      ],
    });

    res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    next(error);
  }
};

// Export users
const exportUsers = async (req, res, next) => {
  try {
    const { format = 'csv', ...filters } = req.query;

    const users = await User.findAll({
      where: filters,
      include: [
        {
          model: Student,
          as: 'student',
          required: false,
        },
        {
          model: Teacher,
          as: 'teacher',
          required: false,
        },
        {
          model: School,
          as: 'school',
          required: false,
        },
      ],
    });

    if (format === 'csv') {
      // Simple CSV export
      const csv = users.map(u => `${u.id},${u.firstName},${u.lastName},${u.email},${u.role},${u.status}`).join('\n');
      res.header('Content-Type', 'text/csv');
      res.attachment('users.csv');
      res.send(csv);
    } else {
      res.json({
        success: true,
        data: users,
      });
    }
  } catch (error) {
    next(error);
  }
};

// Update current user's profile
const updateProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { name, fatherName, grandfatherName, email } = req.body;

    const user = await User.findByPk(userId);

    if (!user) {
      throw createError('User not found', 404);
    }

    // Check if email is being changed and if it's already taken
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        throw createError('Email already in use', 400);
      }
    }

    // Update user fields
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (fatherName !== undefined) updateData.fatherName = fatherName;
    if (grandfatherName !== undefined) updateData.grandfatherName = grandfatherName;
    if (email !== undefined) updateData.email = email;

    await user.update(updateData);

    // Return updated user without sensitive data
    const updatedUser = await User.findByPk(userId, {
      attributes: { exclude: ['passwordHash'] },
      include: [
        {
          model: Student,
          as: 'student',
          include: ['school'],
          required: false,
        },
        {
          model: Teacher,
          as: 'teacher',
          required: false,
        },
        {
          model: School,
          as: 'school',
          required: false,
        },
        {
          model: Admin,
          as: 'admin',
          required: false,
        },
      ],
    });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedUser,
    });
  } catch (error) {
    next(error);
  }
};

// Export all functions
module.exports = {
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
  approveUser,
  rejectUser,
  suspendUser,
  resetUserPassword,
  getPendingUsers,
  exportUsers,
  updateProfile
};