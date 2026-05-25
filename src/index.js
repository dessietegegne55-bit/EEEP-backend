// backend/src/index.js
// COMPLETE FIXED VERSION - Testimonials removed

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
require('dotenv').config();

const { sequelize, connectDatabase } = require('./config/database');
const { errorHandler } = require('./middleware/errorHandler');
const notFound = require('./middleware/notFound');

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const examRoutes = require('./routes/examRoutes');
const materialRoutes = require('./routes/materialRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const subjectRoutes = require('./routes/subjectRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const adminRoutes = require('./routes/adminRoutes');
const teacherRoutes = require('./routes/teacherRoutes');
const schoolRoutes = require('./routes/schoolRoutes');
const publicRoutes = require('./routes/publicRoutes');
const studentRoutes = require('./routes/studentRoutes');
const feedbackRoutes = require('./routes/feedbackRoutes');
const liveSessionRoutes = require('./routes/liveSessionRoutes');

// Simple console logger
const logger = {
  info: (...args) => console.log(...args),
  error: (...args) => console.error(...args),
  warn: (...args) => console.warn(...args),
  debug: (...args) => console.debug(...args)
};

// Global state for teaching sessions (PDF/Video sync)
const globalTeachingState = {};

// Debug: Check if routes are valid
console.log('\n' + '='.repeat(70));
console.log('📦 ROUTES IMPORT STATUS:');
console.log('='.repeat(70));
console.log('  ✅ authRoutes:', typeof authRoutes === 'function' ? 'Loaded' : '❌ Failed');
console.log('  ✅ userRoutes:', typeof userRoutes === 'function' ? 'Loaded' : '❌ Failed');
console.log('  ✅ examRoutes:', typeof examRoutes === 'function' ? 'Loaded' : '❌ Failed');
console.log('  ✅ materialRoutes:', typeof materialRoutes === 'function' ? 'Loaded' : '❌ Failed');
console.log('  ✅ dashboardRoutes:', typeof dashboardRoutes === 'function' ? 'Loaded' : '❌ Failed');
console.log('  ✅ subjectRoutes:', typeof subjectRoutes === 'function' ? 'Loaded' : '❌ Failed');
console.log('  ✅ notificationRoutes:', typeof notificationRoutes === 'function' ? 'Loaded' : '❌ Failed');
console.log('  ✅ adminRoutes:', typeof adminRoutes === 'function' ? 'Loaded' : '❌ Failed');
console.log('  ✅ teacherRoutes:', typeof teacherRoutes === 'function' ? 'Loaded' : '❌ Failed');
console.log('  ✅ schoolRoutes:', typeof schoolRoutes === 'function' ? 'Loaded' : '❌ Failed');
console.log('  ✅ publicRoutes:', typeof publicRoutes === 'function' ? 'Loaded' : '❌ Failed');
console.log('  ✅ studentRoutes:', typeof studentRoutes === 'function' ? 'Loaded' : '❌ Failed');
console.log('  ✅ feedbackRoutes:', typeof feedbackRoutes === 'function' ? 'Loaded' : '❌ Failed');
console.log('  ✅ liveSessionRoutes:', typeof liveSessionRoutes === 'function' ? 'Loaded' : '❌ Failed');
console.log('='.repeat(70) + '\n');

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
});

// Enable trust proxy for rate limiter
app.set('trust proxy', 1);

// ===========================================
// RATE LIMITING
// ===========================================
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'development' ? 1000 : 100,
  message: {
    success: false,
    error: {
      message: 'Too many requests from this IP, please try again later.'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    return process.env.NODE_ENV === 'development' && req.path === '/health';
  }
});

// Apply rate limiting to API routes only (skip public routes)
app.use('/api/', limiter);

// ===========================================
// HELMET CONFIGURATION - FIXED FOR IFRAMES
// ===========================================
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  frameguard: false,
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      frameSrc: ["'self'", "http://localhost:3000", "https://www.youtube.com", "https://player.vimeo.com", "https://meet.google.com", "https://zoom.us"],
      connectSrc: ["'self'", "http://localhost:5000", "http://localhost:3000"],
    }
  } : false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
}));

// ===========================================
// CORS CONFIGURATION
// ===========================================
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
}));

app.use(compression());
app.use(morgan('combined', {
  stream: {
    write: (message) => {
      logger.info(message.trim());
    }
  }
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// ===========================================
// STATIC FILE SERVING
// ===========================================
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.pdf')) {
      res.setHeader('X-Frame-Options', 'ALLOWALL');
      res.setHeader('Content-Security-Policy', "frame-ancestors *");
    }
  }
}));

// ===========================================
// ROOT ROUTE
// ===========================================
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'EEEP Backend API is running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      api: '/api',
      public: '/api/public',
      auth: '/api/auth/login'
    }
  });
});

// ===========================================
// HEALTH CHECK
// ===========================================
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      database: sequelize ? 'connected' : 'disconnected'
    }
  });
});

// ===========================================
// DEBUG DATABASE CONNECTION
// ===========================================
app.get('/debug-db', async (req, res) => {
  try {
    const [dbName] = await sequelize.query('SELECT current_database() as db_name');
    const [users] = await sequelize.query('SELECT COUNT(*) as user_count FROM "Users"');
    const [superadmin] = await sequelize.query('SELECT username, email, LENGTH("passwordHash") as hash_len FROM "Users" WHERE username = \'superadmin\'');

    res.json({
      database: dbName[0],
      user_count: users[0].user_count,
      superadmin: superadmin[0] || null,
      env: process.env.NODE_ENV
    });
  } catch (error) {
    res.json({ error: error.message });
  }
});

// ===========================================
// CREATE SUPERADMIN (PRODUCTION ONLY)
// ===========================================
app.post('/create-superadmin', async (req, res) => {
  try {
    if (process.env.NODE_ENV !== 'production') {
      return res.status(403).json({ error: 'Only available in production' });
    }

    // Check if superadmin already exists
    const [existing] = await sequelize.query('SELECT id FROM "Users" WHERE username = \'superadmin\'');
    if (existing.length > 0) {
      return res.json({ success: false, message: 'Superadmin already exists' });
    }

    // Create superadmin user
    const passwordHash = '$2a$10$or.mqUMJF6FoNRx0vZvUp.W.zqmzE8SRC23l7rHpZZvTiboN85HZ6';

    await sequelize.query(`
      INSERT INTO "Users" (
        name, email, username, "passwordHash", role, status, 
        "forcePasswordChange", "isFirstLogin", "createdAt", "updatedAt"
      ) VALUES (
        'Super Admin', 'superadmin@eeep.com', 'superadmin', $1, 'superadmin', 'active',
        false, false, NOW(), NOW()
      )
    `, { bind: [passwordHash] });

    // Get the created user ID
    const [newUser] = await sequelize.query('SELECT id FROM "Users" WHERE username = \'superadmin\'');
    const userId = newUser[0].id;

    // Create admin record
    await sequelize.query(`
      INSERT INTO "Admins" ("userId", "adminType", "createdAt", "updatedAt")
      VALUES ($1, 'superadmin', NOW(), NOW())
    `, { bind: [userId] });

    res.json({
      success: true,
      message: 'Superadmin created successfully',
      credentials: {
        username: 'superadmin',
        password: 'admin123'
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===========================================
// TEST ROUTE FOR DEBUGGING
// ===========================================
app.get('/test-auth', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Auth route test successful',
    availableRoutes: [
      'POST /api/auth/login',
      'POST /api/auth/register',
      'GET /api/auth/me'
    ]
  });
});

// ===========================================
// API ROUTES
// ===========================================

// PUBLIC ROUTES (No authentication required)
app.use('/api/public', publicRoutes);

// Authentication Routes
app.use('/api/auth', authRoutes);

// User Management Routes
app.use('/api/users', userRoutes);

// Exam Routes
app.use('/api/exams', examRoutes);

// Material Routes
app.use('/api/materials', materialRoutes);

// Dashboard Routes
app.use('/api/dashboard', dashboardRoutes);

// Subject Routes
app.use('/api/subjects', subjectRoutes);

// Notification Routes
app.use('/api/notifications', notificationRoutes);

// UNIFIED ADMIN ROUTES (Super Admin + Sub Admin)
app.use('/api/admin', adminRoutes);

// Teacher Routes
app.use('/api/teacher', teacherRoutes);

// School Routes
app.use('/api/school', schoolRoutes);

// Student Routes
app.use('/api/student', studentRoutes);

// FEEDBACK ROUTES (Private feedback - admin only)
app.use('/api/feedback', feedbackRoutes);

// LIVE SESSION ROUTES (Real-time classes)
app.use('/api/live-sessions', liveSessionRoutes);

// ===========================================
// API INFO ENDPOINT
// ===========================================
app.get('/api', (req, res) => {
  res.json({
    success: true,
    data: {
      name: 'EEEP API',
      version: '1.0.0',
      endpoints: {
        public: '/api/public',
        auth: '/api/auth',
        users: '/api/users',
        exams: '/api/exams',
        materials: '/api/materials',
        dashboard: '/api/dashboard',
        subjects: '/api/subjects',
        notifications: '/api/notifications',
        admin: '/api/admin',
        teacher: '/api/teacher',
        school: '/api/school',
        student: '/api/student',
        feedback: '/api/feedback',
        liveSessions: '/api/live-sessions',
        health: '/health'
      }
    }
  });
});

// ===========================================
// ERROR HANDLING
// ===========================================
app.use(notFound);
app.use(errorHandler);

// ===========================================
// SOCKET.IO for Real-time Chat & Live Sessions
// ===========================================
io.on('connection', (socket) => {
  logger.info(`🔌 Client connected: ${socket.id}`);

  // ===========================================
  // PRIVATE CHAT EVENTS
  // ===========================================

  socket.on('join-chat', (userId) => {
    socket.join(`user-${userId}`);
    logger.info(`👤 User ${userId} joined their chat room`);
  });

  socket.on('send-message', (data) => {
    io.to(`user-${data.userId}`).emit('new-message', data);
  });

  socket.on('leave-chat', (userId) => {
    socket.leave(`user-${userId}`);
    logger.info(`👤 User ${userId} left their chat room`);
  });

  // ===========================================
  // LIVE SESSION EVENTS (Basic)
  // ===========================================

  socket.on('join-live-session', (sessionId) => {
    socket.join(`session-${sessionId}`);
    logger.info(`🎥 Client ${socket.id} joined live session ${sessionId}`);
    io.to(`session-${sessionId}`).emit('participant-joined', {
      sessionId,
      timestamp: new Date().toISOString()
    });
  });

  socket.on('leave-live-session', (sessionId) => {
    socket.leave(`session-${sessionId}`);
    logger.info(`🎥 Client ${socket.id} left live session ${sessionId}`);
    io.to(`session-${sessionId}`).emit('participant-left', {
      sessionId,
      timestamp: new Date().toISOString()
    });
  });

  socket.on('live-session-message', (data) => {
    io.to(`session-${data.sessionId}`).emit('live-session-message', {
      message: data.message,
      sender: data.sender,
      timestamp: new Date().toISOString()
    });
  });

  socket.on('raise-hand', (data) => {
    io.to(`session-${data.sessionId}`).emit('hand-raised', {
      studentName: data.studentName,
      timestamp: new Date().toISOString()
    });
  });

  socket.on('share-screen', (data) => {
    io.to(`session-${data.sessionId}`).emit('screen-shared', {
      streamId: data.streamId,
      teacherName: data.teacherName,
      timestamp: new Date().toISOString()
    });
  });

  // ===========================================
  // TEACHING SESSION EVENTS (PDF/Video Sync)
  // ===========================================

  // Teacher joins teaching session
  socket.on('teacher-join-session', (sessionId) => {
    socket.join(`teaching-${sessionId}`);
    logger.info(`👨‍🏫 Teacher joined teaching session: ${sessionId}`);
  });

  // Student joins teaching session
  socket.on('student-join-session', (sessionId) => {
    socket.join(`teaching-${sessionId}`);
    logger.info(`👨‍🎓 Student joined teaching session: ${sessionId}`);
    // Send current state to new student
    if (globalTeachingState[sessionId]) {
      socket.emit('sync-teaching-state', globalTeachingState[sessionId]);
    }
  });

  // Teacher shares PDF
  socket.on('share-pdf', (data) => {
    const { sessionId, pdfUrl, pageNumber, totalPages, fileName } = data;
    globalTeachingState[sessionId] = {
      type: 'pdf',
      pdfUrl,
      pageNumber,
      totalPages,
      fileName,
      timestamp: Date.now()
    };
    io.to(`teaching-${sessionId}`).emit('pdf-shared', {
      pdfUrl,
      pageNumber,
      totalPages,
      fileName
    });
    logger.info(`📄 Teacher shared PDF: ${fileName}, Page: ${pageNumber} in session ${sessionId}`);
  });

  // Teacher changes PDF page
  socket.on('pdf-page-change', (data) => {
    const { sessionId, pageNumber } = data;
    if (globalTeachingState[sessionId]) {
      globalTeachingState[sessionId].pageNumber = pageNumber;
    }
    io.to(`teaching-${sessionId}`).emit('pdf-page-changed', { pageNumber });
    logger.info(`📄 Teacher changed to page ${pageNumber} in session ${sessionId}`);
  });

  // Teacher shares video
  socket.on('share-video', (data) => {
    const { sessionId, videoUrl, currentTime, isPlaying, videoType } = data;
    globalTeachingState[sessionId] = {
      type: 'video',
      videoUrl,
      currentTime,
      isPlaying,
      videoType,
      timestamp: Date.now()
    };
    io.to(`teaching-${sessionId}`).emit('video-shared', {
      videoUrl,
      currentTime,
      isPlaying,
      videoType
    });
    logger.info(`🎥 Teacher shared video in session ${sessionId}`);
  });

  // Teacher controls video (play/pause/seek)
  socket.on('video-control', (data) => {
    const { sessionId, action, currentTime } = data;
    if (globalTeachingState[sessionId]) {
      if (action === 'play') globalTeachingState[sessionId].isPlaying = true;
      if (action === 'pause') globalTeachingState[sessionId].isPlaying = false;
      if (currentTime !== undefined) globalTeachingState[sessionId].currentTime = currentTime;
    }
    io.to(`teaching-${sessionId}`).emit('video-sync', { action, currentTime });
    logger.info(`🎥 Video control: ${action} in session ${sessionId}`);
  });

  // Teacher draws on whiteboard
  socket.on('draw-action', (data) => {
    const { sessionId, action, x, y, color, lineWidth } = data;
    io.to(`teaching-${sessionId}`).emit('draw-sync', {
      action,
      x,
      y,
      color,
      lineWidth
    });
  });

  // Teacher clears whiteboard
  socket.on('clear-whiteboard', (sessionId) => {
    io.to(`teaching-${sessionId}`).emit('whiteboard-cleared');
    logger.info(`🎨 Whiteboard cleared in session ${sessionId}`);
  });

  // Teacher sends message to students
  socket.on('teacher-message', (data) => {
    const { sessionId, message, teacherName } = data;
    io.to(`teaching-${sessionId}`).emit('teacher-message', {
      message,
      teacherName,
      timestamp: Date.now()
    });
  });

  // Student asks question
  socket.on('student-question', (data) => {
    const { sessionId, question, studentName } = data;
    io.to(`teaching-${sessionId}`).emit('student-question', {
      question,
      studentName,
      timestamp: Date.now()
    });
    logger.info(`❓ Question from ${studentName} in session ${sessionId}`);
  });

  // ===========================================
  // DISCONNECT
  // ===========================================

  socket.on('disconnect', () => {
    logger.info(`🔌 Client disconnected: ${socket.id}`);
  });
});

// ===========================================
// DATABASE CONNECTION with Retry
// ===========================================
const connectWithRetry = async (retries = 5, delay = 5000) => {
  for (let i = 0; i < retries; i++) {
    try {
      await connectDatabase();
      console.log('✅ Database connected successfully');
      return true;
    } catch (error) {
      console.log(`❌ Database connection failed (attempt ${i + 1}/${retries}):`, error.message);
      if (i < retries - 1) {
        console.log(`⏳ Retrying in ${delay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  return false;
};

// ===========================================
// START SERVER
// ===========================================
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    const dbConnected = await connectWithRetry();

    if (!dbConnected) {
      console.error('❌ Failed to connect to database after multiple attempts');
      console.log('⚠️ Starting server without database connection...');
    }

    if (process.env.NODE_ENV === 'development') {
      try {
        await sequelize.sync({ alter: false, force: false });
        logger.info('📦 Database synced successfully');
      } catch (syncError) {
        logger.error('📦 Database sync failed:', syncError.message);
      }
    }

    server.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📚 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`🔗 API: http://localhost:${PORT}/api`);
      logger.info(`🌐 Public API: http://localhost:${PORT}/api/public`);
      logger.info(`❤️ Health: http://localhost:${PORT}/health`);
      logger.info(`🌍 CORS enabled for: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
      logger.info(`💾 Database: ${dbConnected ? '✅ Connected' : '❌ Disconnected'}`);
      logger.info(`📝 Feedback: http://localhost:${PORT}/api/feedback`);
      logger.info(`🎥 Live Sessions: http://localhost:${PORT}/api/live-sessions`);
      logger.info(`📄 PDF Viewer: X-Frame-Options disabled for iframe embedding`);

      if (process.env.NODE_ENV === 'development') {
        console.log('\n' + '='.repeat(70));
        console.log('📋 AVAILABLE API ENDPOINTS:');
        console.log('='.repeat(70));

        console.log('\n🌐 PUBLIC ROUTES (No Auth):');
        console.log('   GET    /api/public/schools');
        console.log('   GET    /api/public/schools/:id');
        console.log('   GET    /api/public/subjects');
        console.log('   GET    /api/public/subjects/:id');
        console.log('   GET    /api/public/exams');
        console.log('   GET    /api/public/exams/:id');
        console.log('   GET    /api/public/materials');
        console.log('   GET    /api/public/info');
        console.log('   GET    /api/public/health');

        console.log('\n🔐 AUTH:');
        console.log('   POST   /api/auth/login');
        console.log('   POST   /api/auth/register');
        console.log('   POST   /api/auth/logout');
        console.log('   GET    /api/auth/me');
        console.log('   POST   /api/auth/change-password');
        console.log('   POST   /api/auth/forgot-password');
        console.log('   POST   /api/auth/reset-password');

        console.log('\n👥 USERS:');
        console.log('   GET    /api/users');
        console.log('   GET    /api/users/pending');
        console.log('   POST   /api/users/:id/approve');
        console.log('   POST   /api/users/:id/reject');

        console.log('\n📚 EXAMS:');
        console.log('   GET    /api/exams');
        console.log('   GET    /api/exams/teacher');
        console.log('   GET    /api/exams/student');
        console.log('   POST   /api/exams');
        console.log('   POST   /api/exams/:id/questions');
        console.log('   POST   /api/exams/:id/start');
        console.log('   POST   /api/exams/attempts/:attemptId/submit');
        console.log('   GET    /api/exams/:id/result');

        console.log('\n📄 MATERIALS:');
        console.log('   GET    /api/materials');
        console.log('   GET    /api/materials/teacher');
        console.log('   GET    /api/materials/student');
        console.log('   POST   /api/materials/upload');
        console.log('   GET    /api/materials/:id/view');
        console.log('   GET    /api/materials/:id/download');

        console.log('\n📝 FEEDBACK (Private):');
        console.log('   POST   /api/feedback/submit (Student)');
        console.log('   GET    /api/feedback/all (Admin)');
        console.log('   DELETE /api/feedback/:id (Admin)');

        console.log('\n🎥 LIVE SESSIONS:');
        console.log('   ===== TEACHER ROUTES =====');
        console.log('   POST   /api/live-sessions (Create session)');
        console.log('   GET    /api/live-sessions/teacher (Get my sessions)');
        console.log('   PUT    /api/live-sessions/:sessionId/start (Start session)');
        console.log('   PUT    /api/live-sessions/:sessionId/end (End session)');
        console.log('   PUT    /api/live-sessions/:sessionId/cancel (Cancel session)');
        console.log('   GET    /api/live-sessions/:sessionId/participants (Get participants)');
        console.log('   PUT    /api/live-sessions/:sessionId (Update session)');
        console.log('   DELETE /api/live-sessions/:sessionId (Delete session)');
        console.log('   ===== STUDENT ROUTES =====');
        console.log('   GET    /api/live-sessions/student/available (Get available sessions)');
        console.log('   GET    /api/live-sessions/student/ongoing (Get ongoing sessions)');
        console.log('   GET    /api/live-sessions/student/joined (Get joined sessions)');
        console.log('   POST   /api/live-sessions/:sessionId/join (Join session)');
        console.log('   POST   /api/live-sessions/:sessionId/leave (Leave session)');

        console.log('\n🏫 SCHOOL:');
        console.log('   GET    /api/school/profile');
        console.log('   GET    /api/school/student-list');
        console.log('   POST   /api/school/upload-student-list');
        console.log('   GET    /api/school/model-exams');
        console.log('   POST   /api/school/model-exams');

        console.log('\n👨‍🏫 TEACHER:');
        console.log('   GET    /api/teacher/profile');
        console.log('   GET    /api/teacher/exams');
        console.log('   GET    /api/teacher/materials');
        console.log('   GET    /api/teacher/received-exams');
        console.log('   GET    /api/teacher/messages');
        console.log('   PUT    /api/teacher/review-exam/:examId');
        console.log('   GET    /api/teacher/stats');
        console.log('   GET    /api/teacher/student-feedback');
        console.log('   POST   /api/teacher/respond-to-feedback');

        console.log('\n👑 ADMIN (Unified - Super + Sub):');
        console.log('   GET    /api/admin/stats');
        console.log('   GET    /api/admin/students');
        console.log('   POST   /api/admin/students/:id/approve');
        console.log('   GET    /api/admin/teachers');
        console.log('   POST   /api/admin/teachers');
        console.log('   GET    /api/admin/schools');
        console.log('   POST   /api/admin/schools');
        console.log('   GET    /api/admin/subadmins (Super only)');
        console.log('   POST   /api/admin/subadmins (Super only)');
        console.log('   GET    /api/admin/received-files');
        console.log('   POST   /api/admin/process-file/:fileId');
        console.log('   GET    /api/admin/messages');
        console.log('   POST   /api/admin/send-message');
        console.log('   GET    /api/admin/profile');
        console.log('   PUT    /api/admin/profile');

        console.log('\n👨‍🎓 STUDENT ROUTES:');
        console.log('   GET    /api/student/dashboard');
        console.log('   GET    /api/student/exams');
        console.log('   GET    /api/student/exams/:id');
        console.log('   POST   /api/student/exams/:id/start');
        console.log('   POST   /api/student/exams/:id/submit');
        console.log('   GET    /api/student/exams/:id/result');
        console.log('   GET    /api/student/materials');
        console.log('   GET    /api/student/quizzes');
        console.log('   GET    /api/student/teachers');
        console.log('   POST   /api/student/send-feedback-to-teacher');
        console.log('   GET    /api/student/my-feedback');

        console.log('\n🔧 WEBSOCKET EVENTS (Socket.IO):');
        console.log('   join-chat - Join personal chat room');
        console.log('   send-message - Send private message');
        console.log('   join-live-session - Join a live session room');
        console.log('   leave-live-session - Leave a live session');
        console.log('   live-session-message - Send message in live session');
        console.log('   raise-hand - Raise hand in live session');
        console.log('   share-screen - Share screen in live session');
        console.log('');
        console.log('   📚 TEACHING SESSION EVENTS:');
        console.log('   teacher-join-session - Teacher joins teaching session');
        console.log('   student-join-session - Student joins teaching session');
        console.log('   share-pdf - Share PDF with students');
        console.log('   pdf-page-change - Sync PDF page number');
        console.log('   share-video - Share video');
        console.log('   video-control - Play/Pause/Seek video');
        console.log('   draw-action - Draw on whiteboard');
        console.log('   clear-whiteboard - Clear whiteboard');
        console.log('   teacher-message - Send message to all students');
        console.log('   student-question - Student asks question');

        console.log('\n🔧 PDF VIEWER CONFIGURATION:');
        console.log('   ✅ X-Frame-Options: DISABLED (allows iframe embedding)');
        console.log('   ✅ CSP: RELAXED for development');
        console.log('   ✅ Static files: CORS enabled for PDFs');

        console.log('\n' + '='.repeat(70));
        console.log('✅ Server ready!');
        console.log('='.repeat(70) + '\n');
      }
    });
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// ===========================================
// GRACEFUL SHUTDOWN
// ===========================================
const gracefulShutdown = async (signal) => {
  logger.info(`📥 ${signal} received, shutting down gracefully`);
  server.close(() => {
    logger.info('🔒 HTTP server closed');
    sequelize.close().then(() => {
      logger.info('💾 Database connection closed');
      process.exit(0);
    }).catch((err) => {
      logger.error('❌ Error closing database connection:', err);
      process.exit(1);
    });
  });
  setTimeout(() => {
    logger.error('❌ Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  logger.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  if (process.env.NODE_ENV !== 'production') process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error('❌ Uncaught Exception:', error);
  if (process.env.NODE_ENV !== 'production') process.exit(1);
});

startServer();

module.exports = { app, server, io };