// backend/src/services/emailService.js
// COMPLETE FIXED VERSION - ALWAYS SHOWS PASSWORD IN EMAIL
// FIXED: sendPasswordResetEmail now accepts role parameter

const nodemailer = require('nodemailer');

// Create transporter
let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  return transporter;
};

const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const mailTransporter = getTransporter();

    await mailTransporter.verify();
    console.log('✅ Email transporter verified');

    const info = await mailTransporter.sendMail({
      from: process.env.EMAIL_FROM || `"EEEP System" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
      text: text || html?.replace(/<[^>]*>/g, '') || ''
    });

    console.log('✅ Email sent successfully:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Email sending failed:', error.message);
    return { success: false, error: error.message };
  }
};

// ============================================
// SUPER ADMIN SPECIFIC EMAILS (GREEN THEME)
// ============================================

// Send Super Admin welcome email - ALWAYS SHOWS PASSWORD
const sendSuperAdminWelcomeEmail = async (email, name, username, tempPassword, isTemporary = true) => {
  const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/admin-login`;
  const greenColor = '#27ae60';
  const greenDark = '#1e8449';
  const greenLight = '#d1fae5';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Super Admin Account Created - EEEP</title>
      <style>
        body {
          font-family: 'Segoe UI', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background: #f0f2f5;
        }
        .header {
          background: linear-gradient(135deg, ${greenColor}, ${greenDark});
          padding: 30px;
          text-align: center;
          color: white;
          border-radius: 15px 15px 0 0;
        }
        .header h1 {
          margin: 0;
          font-size: 28px;
        }
        .header p {
          margin: 10px 0 0;
          opacity: 0.9;
        }
        .content {
          background: white;
          padding: 30px;
          border-radius: 0 0 15px 15px;
          box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        }
        .credentials-box {
          background: #f8f9fa;
          border-left: 4px solid ${greenColor};
          padding: 20px;
          margin: 20px 0;
          border-radius: 8px;
        }
        .credential-item {
          margin: 15px 0;
          padding: 10px;
          background: white;
          border-radius: 6px;
          border: 1px solid #e0e0e0;
        }
        .credential-label {
          font-weight: bold;
          color: ${greenColor};
          display: block;
          font-size: 12px;
          text-transform: uppercase;
          margin-bottom: 5px;
        }
        .credential-value {
          font-size: 18px;
          font-weight: bold;
          font-family: 'Courier New', monospace;
          color: #2c3e50;
          word-break: break-all;
        }
        .password-box {
          background: ${greenLight};
          border: 2px solid ${greenColor};
          padding: 20px;
          text-align: center;
          border-radius: 10px;
          margin: 20px 0;
        }
        .password-value {
          font-size: 28px;
          font-weight: bold;
          font-family: 'Courier New', monospace;
          background: white;
          padding: 15px 25px;
          border-radius: 8px;
          display: inline-block;
          letter-spacing: 2px;
          border: 1px solid #ddd;
          color: ${greenColor};
        }
        .btn {
          display: inline-block;
          background: ${greenColor};
          color: white !important;
          padding: 14px 35px;
          text-decoration: none;
          border-radius: 8px;
          margin: 20px 0;
          font-weight: bold;
          font-size: 16px;
          text-align: center;
        }
        .btn:hover {
          background: ${greenDark};
        }
        .warning {
          background: #f8d7da;
          border-left: 4px solid #dc3545;
          padding: 15px;
          margin: 20px 0;
          border-radius: 8px;
          color: #721c24;
        }
        .info-box {
          background: ${greenLight};
          border-left: 4px solid ${greenColor};
          padding: 15px;
          margin: 20px 0;
          border-radius: 8px;
          color: #0c5460;
        }
        .footer {
          text-align: center;
          padding: 20px;
          color: #666;
          font-size: 12px;
          border-top: 1px solid #eee;
          margin-top: 20px;
        }
        @media (max-width: 480px) {
          .password-value { font-size: 20px; padding: 10px 15px; }
          .credential-value { font-size: 14px; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🛡️ Super Admin Account Created</h1>
        <p>Ethiopian Entrance Exam Preparation Platform</p>
      </div>
      
      <div class="content">
        <h2>Dear ${name},</h2>
        <p>Your <strong>Super Administrator</strong> account has been successfully created on the EEEP platform.</p>
        
        <div class="credentials-box">
          <h3 style="margin-top: 0; color: ${greenColor};">📋 Your Login Credentials</h3>
          
          <div class="credential-item">
            <span class="credential-label">👤 Username</span>
            <div class="credential-value">${username}</div>
          </div>
          
          <div class="credential-item">
            <span class="credential-label">📧 Email Address</span>
            <div class="credential-value">${email}</div>
          </div>
        </div>
        
        <div class="password-box">
          <strong>🔑 YOUR PASSWORD</strong><br>
          <div class="password-value">${tempPassword}</div>
          <p style="margin: 10px 0 0; font-size: 13px;">
            💡 Use this password to login to your account.
            ${isTemporary ? '<br>⚠️ This is a TEMPORARY password. Please change it after first login.' : '<br>You can change this password after logging in.'}
          </p>
        </div>
        
        <div style="text-align: center;">
          <a href="${loginUrl}" class="btn">🔐 Login to Admin Dashboard</a>
        </div>
        
        ${isTemporary ? `
        <div class="warning">
          <strong>⚠️ IMPORTANT SECURITY NOTICE:</strong>
          <ul style="margin: 10px 0 0 20px;">
            <li>This password is <strong>temporary</strong> and must be changed immediately after first login</li>
            <li>Do not share this password with anyone</li>
            <li>The system will force you to create a new password</li>
            <li>Store your new password in a secure password manager</li>
          </ul>
        </div>
        ` : `
        <div class="info-box">
          <strong>🔐 Password Information:</strong>
          <ul style="margin: 10px 0 0 20px;">
            <li>Keep this password secure</li>
            <li>You can change your password after logging in</li>
            <li>Contact support if you forget your password</li>
          </ul>
        </div>
        `}
        
        <div class="info-box">
          <strong>🔧 Super Admin Privileges:</strong>
          <ul style="margin: 10px 0 0 20px;">
            <li>Full system access and configuration</li>
            <li>Manage all users (students, teachers, school admins, sub-admins)</li>
            <li>Create and manage exams, materials, and resources</li>
            <li>Monitor system analytics and reports</li>
            <li>Approve or reject school registrations</li>
            <li>Manage site-wide settings and notifications</li>
          </ul>
        </div>
        
        <div class="footer">
          <p>© 2025 EEEP - Ethiopian Entrance Exam Preparation Platform</p>
          <p>If you didn't request this email, please contact support immediately.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
SUPER ADMIN ACCOUNT CREATED - EEEP PLATFORM

Dear ${name},

Your Super Administrator account has been successfully created.

LOGIN CREDENTIALS:
Username: ${username}
Email: ${email}
Password: ${tempPassword}

Login URL: ${loginUrl}

${isTemporary ? `
IMPORTANT: This is a TEMPORARY password. You MUST change it upon first login.
` : ''}

Super Admin Privileges:
- Full system access and configuration
- Manage all users (students, teachers, school admins, sub-admins)
- Create and manage exams, materials, and resources
- Monitor system analytics and reports
- Approve or reject school registrations
- Manage site-wide settings and notifications

---
EEEP Support Team
  `;

  return sendEmail({
    to: email,
    subject: `🛡️ Super Admin Account Created - EEEP Platform`,
    html,
    text
  });
};

// ============================================
// PASSWORD RESET EMAIL (FIXED - accepts role parameter)
// ============================================
const sendPasswordResetEmail = async (email, firstName, resetToken, role = 'student') => {
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/reset-password?token=${resetToken}&role=${role}`;
  const greenColor = '#27ae60';
  const greenDark = '#1e8449';

  // Get role display name
  let roleDisplay = 'Student';
  if (role === 'teacher') roleDisplay = 'Teacher';
  if (role === 'school') roleDisplay = 'School Administrator';
  if (role === 'subadmin') roleDisplay = 'Administrator';
  if (role === 'superadmin') roleDisplay = 'Super Administrator';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Password Reset - EEEP</title>
      <style>
        body {
          font-family: 'Segoe UI', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background: #f0f2f5;
        }
        .header {
          background: linear-gradient(135deg, ${greenColor}, ${greenDark});
          padding: 30px;
          text-align: center;
          color: white;
          border-radius: 15px 15px 0 0;
        }
        .header h1 {
          margin: 0;
          font-size: 28px;
        }
        .header p {
          margin: 10px 0 0;
          opacity: 0.9;
        }
        .content {
          background: white;
          padding: 30px;
          border-radius: 0 0 15px 15px;
          box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        }
        .reset-button {
          display: inline-block;
          background: ${greenColor};
          color: white !important;
          padding: 14px 35px;
          text-decoration: none;
          border-radius: 8px;
          margin: 20px 0;
          font-weight: bold;
          font-size: 16px;
          text-align: center;
        }
        .reset-button:hover {
          background: ${greenDark};
        }
        .info-box {
          background: #e8f8f5;
          border-left: 4px solid ${greenColor};
          padding: 15px;
          margin: 20px 0;
          border-radius: 8px;
        }
        .warning-box {
          background: #fff3cd;
          border-left: 4px solid #ffc107;
          padding: 15px;
          margin: 20px 0;
          border-radius: 8px;
        }
        .footer {
          text-align: center;
          padding: 20px;
          color: #666;
          font-size: 12px;
          border-top: 1px solid #eee;
          margin-top: 20px;
        }
        @media (max-width: 480px) {
          .reset-button { padding: 12px 20px; font-size: 14px; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🔐 Password Reset Request</h1>
        <p>${roleDisplay} Account - Ethiopian Entrance Exam Preparation Platform</p>
      </div>
      
      <div class="content">
        <h2>Hello ${firstName}!</h2>
        <p>We received a request to reset your password for your <strong>${roleDisplay}</strong> account.</p>
        
        <div class="info-box">
          <strong>📋 Reset Instructions:</strong>
          <ul style="margin: 10px 0 0 20px;">
            <li>Click the button below to reset your password</li>
            <li>The link will expire in <strong>1 hour</strong></li>
            <li>If you didn't request this, please ignore this email</li>
          </ul>
        </div>
        
        <div style="text-align: center;">
          <a href="${resetUrl}" class="reset-button">🔑 Reset My Password</a>
        </div>
        
        <div class="warning-box">
          <strong>⚠️ Security Note:</strong>
          <p style="margin: 10px 0 0 0; font-size: 13px;">
            This link will expire in 1 hour for security reasons. 
            If you did not request a password reset, please ignore this email 
            and your password will remain unchanged.
          </p>
        </div>
        
        <p style="font-size: 13px; color: #666;">
          Or copy and paste this link into your browser:<br>
          <a href="${resetUrl}" style="color: ${greenColor}; word-break: break-all;">${resetUrl}</a>
        </p>
        
        <div class="footer">
          <p>© 2025 EEEP - Ethiopian Entrance Exam Preparation Platform</p>
          <p>If you didn't request this email, please contact support immediately.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
PASSWORD RESET REQUEST - EEEP PLATFORM

Hello ${firstName},

We received a request to reset your password for your ${roleDisplay} account.

Reset Instructions:
- Click the link below to reset your password
- The link will expire in 1 hour
- If you didn't request this, please ignore this email

Reset Link: ${resetUrl}

This link will expire in 1 hour for security reasons.

---
EEEP Support Team
  `;

  return sendEmail({
    to: email,
    subject: `🔐 Password Reset Request - EEEP (${roleDisplay})`,
    html,
    text
  });
};

// ============================================
// SUPER ADMIN BLOCKED EMAIL
// ============================================
const sendSuperAdminBlockedEmail = async (email, name, blockedBy, reason) => {
  const contactUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/contact`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Super Admin Account Blocked - EEEP</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
        .header { background: linear-gradient(135deg, #dc3545, #c82333); padding: 30px; text-align: center; color: white; border-radius: 15px 15px 0 0; }
        .content { background: white; padding: 30px; border-radius: 0 0 15px 15px; }
        .warning-box { background: #f8d7da; border-left: 4px solid #dc3545; padding: 20px; margin: 20px 0; border-radius: 8px; }
        .btn { display: inline-block; background: #dc3545; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🔒 Account Blocked</h1>
      </div>
      <div class="content">
        <h2>Dear ${name},</h2>
        <p>Your Super Administrator account has been <strong>blocked/suspended</strong>.</p>
        
        <div class="warning-box">
          <h3>📋 Block Details:</h3>
          <p><strong>Blocked By:</strong> ${blockedBy}</p>
          <p><strong>Reason:</strong> ${reason || 'Administrative action'}</p>
          <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
        </div>
        
        <p>If you believe this is an error, please contact the system administrator.</p>
        
        <div style="text-align: center;">
          <a href="${contactUrl}" class="btn">Contact Support</a>
        </div>
        
        <div class="footer">
          <p>© 2025 EEEP Platform</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: '🔒 Super Admin Account Blocked - EEEP',
    html
  });
};

// ============================================
// SUPER ADMIN REACTIVATED EMAIL
// ============================================
const sendSuperAdminReactivatedEmail = async (email, name, reactivatedBy) => {
  const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/admin-login`;
  const greenColor = '#27ae60';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Super Admin Account Reactivated - EEEP</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
        .header { background: linear-gradient(135deg, ${greenColor}, #1e8449); padding: 30px; text-align: center; color: white; border-radius: 15px 15px 0 0; }
        .content { background: white; padding: 30px; border-radius: 0 0 15px 15px; }
        .success-box { background: #d4edda; border-left: 4px solid ${greenColor}; padding: 20px; margin: 20px 0; border-radius: 8px; }
        .btn { display: inline-block; background: ${greenColor}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>✅ Account Reactivated</h1>
      </div>
      <div class="content">
        <h2>Dear ${name},</h2>
        <p>Your Super Administrator account has been <strong>reactivated</strong>.</p>
        
        <div class="success-box">
          <h3>📋 Reactivation Details:</h3>
          <p><strong>Reactivated By:</strong> ${reactivatedBy}</p>
          <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
        </div>
        
        <p>You can now login and access the admin dashboard again.</p>
        
        <div style="text-align: center;">
          <a href="${loginUrl}" class="btn">Login to Admin Dashboard</a>
        </div>
        
        <div class="footer">
          <p>© 2025 EEEP Platform</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: '✅ Super Admin Account Reactivated - EEEP',
    html
  });
};

// ============================================
// SUPER ADMIN PASSWORD RESET NOTIFICATION
// ============================================
const sendSuperAdminPasswordResetEmail = async (email, name, tempPassword, resetBy = 'System Administrator') => {
  const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/admin-login`;
  const greenColor = '#27ae60';
  const greenLight = '#d1fae5';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Super Admin Password Reset - EEEP</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
        .header { background: linear-gradient(135deg, ${greenColor}, #1e8449); padding: 30px; text-align: center; color: white; border-radius: 15px 15px 0 0; }
        .content { background: white; padding: 30px; border-radius: 0 0 15px 15px; }
        .password-box { background: ${greenLight}; border: 2px solid ${greenColor}; padding: 20px; text-align: center; border-radius: 10px; margin: 20px 0; }
        .password-value { font-size: 24px; font-weight: bold; font-family: monospace; background: white; padding: 12px 20px; border-radius: 8px; display: inline-block; color: ${greenColor}; }
        .warning-box { background: #f8d7da; border-left: 4px solid #dc3545; padding: 15px; margin: 20px 0; border-radius: 8px; }
        .btn { display: inline-block; background: ${greenColor}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🔑 Password Reset</h1>
      </div>
      <div class="content">
        <h2>Dear ${name},</h2>
        <p>Your Super Administrator password has been reset by <strong>${resetBy}</strong>.</p>
        
        <div class="password-box">
          <strong>🆕 New Temporary Password:</strong><br>
          <div class="password-value">${tempPassword}</div>
        </div>
        
        <div class="warning-box">
          <strong>⚠️ IMPORTANT:</strong>
          <ul style="margin: 10px 0 0 20px;">
            <li>This is a TEMPORARY password</li>
            <li>You MUST change it on first login</li>
            <li>Previous password will no longer work</li>
          </ul>
        </div>
        
        <div style="text-align: center;">
          <a href="${loginUrl}" class="btn">Login with New Password</a>
        </div>
        
        <div class="footer">
          <p>© 2025 EEEP Platform</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: '🔑 Super Admin Password Reset - EEEP',
    html
  });
};

// ============================================
// SUPER ADMIN DELETED EMAIL
// ============================================
const sendSuperAdminDeletedEmail = async (email, name, deletedBy, reason) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Super Admin Account Deleted - EEEP</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
        .header { background: linear-gradient(135deg, #6c757d, #495057); padding: 30px; text-align: center; color: white; border-radius: 15px 15px 0 0; }
        .content { background: white; padding: 30px; border-radius: 0 0 15px 15px; }
        .delete-box { background: #f8d7da; border-left: 4px solid #dc3545; padding: 20px; margin: 20px 0; border-radius: 8px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🗑️ Account Deleted</h1>
      </div>
      <div class="content">
        <h2>Dear ${name},</h2>
        <p>Your Super Administrator account has been <strong>deleted</strong> from the EEEP platform.</p>
        
        <div class="delete-box">
          <h3>📋 Deletion Details:</h3>
          <p><strong>Deleted By:</strong> ${deletedBy}</p>
          <p><strong>Reason:</strong> ${reason || 'Administrative action'}</p>
          <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
        </div>
        
        <p>You no longer have access to the admin dashboard.</p>
        <p>If you believe this is an error, please contact the system administrator.</p>
        
        <div class="footer">
          <p>© 2025 EEEP Platform</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: '🗑️ Super Admin Account Deleted - EEEP',
    html
  });
};

// ============================================
// SUPER ADMIN SECURITY ALERT
// ============================================
const sendSuperAdminSecurityAlert = async (email, name, action, details, ipAddress) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Security Alert - EEEP</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
        .header { background: linear-gradient(135deg, #dc3545, #c82333); padding: 30px; text-align: center; color: white; border-radius: 15px 15px 0 0; }
        .content { background: white; padding: 30px; border-radius: 0 0 15px 15px; }
        .alert-box { background: #f8d7da; border-left: 4px solid #dc3545; padding: 20px; margin: 20px 0; border-radius: 8px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>⚠️ Security Alert</h1>
      </div>
      <div class="content">
        <h2>Dear ${name},</h2>
        <p>A security-related action has been performed on your Super Admin account.</p>
        
        <div class="alert-box">
          <h3>📋 Action Details:</h3>
          <p><strong>Action:</strong> ${action}</p>
          <p><strong>Details:</strong> ${details}</p>
          <p><strong>IP Address:</strong> ${ipAddress || 'Unknown'}</p>
          <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
        </div>
        
        <p>If you did not perform this action, please contact support immediately.</p>
        
        <div class="footer">
          <p>© 2025 EEEP Platform</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: '⚠️ Security Alert - Super Admin Action - EEEP',
    html
  });
};

// ============================================
// REGULAR USER EMAILS (Students, Teachers, Sub Admins)
// ============================================

// Send welcome email (for students, teachers, subadmins)
const sendWelcomeEmail = async (email, firstName, role, tempPassword = null, username = null) => {
  let loginUrl = '';
  let roleDisplay = '';

  switch (role) {
    case 'student':
      loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/student-login`;
      roleDisplay = 'Student';
      break;
    case 'teacher':
      loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/teacher-login`;
      roleDisplay = 'Teacher';
      break;
    case 'school':
      loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/school-login`;
      roleDisplay = 'School Administrator';
      break;
    case 'subadmin':
      loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/admin-login`;
      roleDisplay = 'Sub Administrator';
      break;
    default:
      loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/login`;
      roleDisplay = role;
  }

  const greenColor = '#27ae60';
  const greenDark = '#1e8449';
  const greenLight = '#d1fae5';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Welcome to EEEP</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
        .header { background: linear-gradient(135deg, ${greenColor}, ${greenDark}); padding: 20px; text-align: center; color: white; border-radius: 10px 10px 0 0; }
        .content { background: white; padding: 30px; border-radius: 0 0 10px 10px; }
        .btn { display: inline-block; background: ${greenColor}; color: white; padding: 14px 35px; text-decoration: none; border-radius: 8px; margin: 15px 0; }
        .password-box { background: ${greenLight}; padding: 20px; border-radius: 8px; margin: 15px 0; text-align: center; }
        .password-value { background: white; padding: 12px 20px; border-radius: 8px; font-size: 20px; font-weight: bold; font-family: monospace; display: inline-block; color: ${greenColor}; }
        .warning { color: #e74c3c; font-size: 12px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🎓 Welcome to EEEP!</h1>
      </div>
      <div class="content">
        <h2>Hello ${firstName}!</h2>
        <p>Your <strong>${roleDisplay}</strong> account has been created successfully.</p>
        
        ${username ? `<p><strong>Username:</strong> ${username}</p>` : ''}
        
        ${tempPassword ? `
        <div class="password-box">
          <strong>🔑 Your Password:</strong><br>
          <div class="password-value">${tempPassword}</div>
          <p class="warning">⚠️ Please change this password after your first login.</p>
        </div>
        ` : ''}
        
        <div style="text-align: center;">
          <a href="${loginUrl}" class="btn">Login to Your Account</a>
        </div>
        
        <div class="footer">
          <p>© 2025 EEEP - Ethiopian Entrance Exam Preparation Platform</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: `Welcome to EEEP - ${roleDisplay} Account`,
    html
  });
};

// Send account approval email
const sendAccountApprovedEmail = async (email, firstName, role) => {
  let loginUrl = '';
  const greenColor = '#27ae60';

  switch (role) {
    case 'student':
      loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/student-login`;
      break;
    case 'teacher':
      loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/teacher-login`;
      break;
    case 'school':
      loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/school-login`;
      break;
    default:
      loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/login`;
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Account Approved - EEEP</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
        .header { background: linear-gradient(135deg, ${greenColor}, #1e8449); padding: 20px; text-align: center; color: white; border-radius: 10px 10px 0 0; }
        .content { background: white; padding: 30px; border-radius: 0 0 10px 10px; }
        .btn { display: inline-block; background: ${greenColor}; color: white; padding: 14px 35px; text-decoration: none; border-radius: 8px; margin: 15px 0; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>✅ Account Approved!</h1>
      </div>
      <div class="content">
        <h2>Congratulations ${firstName}!</h2>
        <p>Your ${role} account has been approved.</p>
        <div style="text-align: center;">
          <a href="${loginUrl}" class="btn">Login Now</a>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({ to: email, subject: 'Your EEEP Account Has Been Approved! 🎉', html });
};

// Send notification email
const sendNotificationEmail = async (email, firstName, notificationType, data) => {
  let subject = '';
  let html = '';
  const greenColor = '#27ae60';

  switch (notificationType) {
    case 'new_exam':
      subject = `📚 New Exam Available: ${data.examTitle}`;
      html = `
        <!DOCTYPE html>
        <html>
        <head><title>New Exam Available</title></head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2>New Exam: ${data.examTitle}</h2>
          <p>Subject: ${data.subject}</p>
          <a href="${data.examUrl}" style="background: ${greenColor}; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Exam</a>
        </body>
        </html>
      `;
      break;
    default:
      subject = `🔔 New Notification`;
      html = `
        <!DOCTYPE html>
        <html>
        <head><title>New Notification</title></head>
        <body style="font-family: Arial, sans-serif;">
          <h2>${data.title}</h2>
          <p>${data.message}</p>
        </body>
        </html>
      `;
  }

  return sendEmail({ to: email, subject, html });
};

// Test email connection
const testEmailConnection = async () => {
  try {
    const mailTransporter = getTransporter();
    await mailTransporter.verify();
    console.log('✅ Email service is ready to send emails');
    return true;
  } catch (error) {
    console.error('❌ Email service connection failed:', error.message);
    return false;
  }
};

// ============================================
// EXPORTS
// ============================================

module.exports = {
  sendEmail,
  testEmailConnection,
  // Super Admin specific (GREEN THEME)
  sendSuperAdminWelcomeEmail,
  sendSuperAdminBlockedEmail,
  sendSuperAdminReactivatedEmail,
  sendSuperAdminPasswordResetEmail,
  sendSuperAdminDeletedEmail,
  sendSuperAdminSecurityAlert,
  // Regular user functions
  sendWelcomeEmail,
  sendAccountApprovedEmail,
  sendPasswordResetEmail,
  sendNotificationEmail
};