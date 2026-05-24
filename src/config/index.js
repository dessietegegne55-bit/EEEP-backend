// backend/src/config/index.js

require('dotenv').config();

module.exports = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',

  database: {
    name: process.env.DB_NAME || 'eeep_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development',
    // CamelCase naming convention
    define: {
      underscored: false,
      timestamps: true,
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
      freezeTableName: true,
    },
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },

  cors: {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000'],
    credentials: true,
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  email: {
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
    from: process.env.EMAIL_FROM || 'noreply@eeep.com',
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY,
  },

  upload: {
    maxSize: parseInt(process.env.UPLOAD_MAX_SIZE) || 10 * 1024 * 1024, // 10MB
    allowedTypes: process.env.UPLOAD_ALLOWED_TYPES
      ? process.env.UPLOAD_ALLOWED_TYPES.split(',')
      : ['image/jpeg', 'image/png', 'application/pdf', 'video/mp4'],
    uploadDir: process.env.UPLOAD_DIR || 'uploads',
  },

  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  backendUrl: process.env.BACKEND_URL || 'http://localhost:5000',

  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'development' ? 1000 : 100,
  },
};