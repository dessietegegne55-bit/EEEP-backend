// backend/src/config/database.js
// FIXED FOR NEON DEPLOYMENT - SSL support

const { Sequelize } = require('sequelize');
require('dotenv').config();

// Check if we're in production (Render/Neon)
const isProduction = process.env.NODE_ENV === 'production';
const databaseUrl = process.env.DATABASE_URL;

let sequelize;

if (databaseUrl && isProduction) {
  // PRODUCTION - Use Neon connection string with SSL
  console.log('📦 Running in PRODUCTION mode with Neon database');
  sequelize = new Sequelize(databaseUrl, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false  // Required for Neon
      }
    },
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  });
} else {
  // DEVELOPMENT - Local PostgreSQL
  console.log('💻 Running in DEVELOPMENT mode with local database');
  sequelize = new Sequelize(
    process.env.DB_NAME || 'eeep_db',
    process.env.DB_USER || 'postgres',
    process.env.DB_PASSWORD || 'postgres',
    {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      dialect: 'postgres',
      logging: process.env.NODE_ENV === 'development' ? console.log : false,
      define: {
        underscored: false,
        timestamps: true,
        createdAt: 'createdAt',
        updatedAt: 'updatedAt',
        freezeTableName: true,
      },
      pool: {
        max: 10,
        min: 0,
        acquire: 60000,
        idle: 10000,
      }
    }
  );
}

const connectDatabase = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully');
    return true;
  } catch (error) {
    console.error('❌ Unable to connect to database:', error.message);
    throw error;
  }
};

module.exports = {
  sequelize,
  connectDatabase,
};