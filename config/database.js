// backend/config/database.js
// Database configuration for PostgreSQL connection

const { Sequelize } = require('sequelize');
require('dotenv').config();

// Database configuration from environment variables
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'eeep_db',
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    dialect: 'postgres',

    // Logging configuration
    logging: process.env.NODE_ENV === 'development' ? console.log : false,

    // Connection pool settings
    pool: {
        max: 10,           // Maximum number of connections
        min: 0,            // Minimum number of connections
        acquire: 60000,    // Maximum time (ms) to acquire connection
        idle: 10000        // Maximum time (ms) connection can be idle
    },

    // Retry configuration for connection failures
    retry: {
        max: 3,
        match: [
            /SequelizeConnectionError/,
            /SequelizeConnectionRefusedError/,
            /SequelizeHostNotFoundError/,
            /SequelizeHostNotReachableError/,
            /SequelizeInvalidConnectionError/,
            /SequelizeConnectionTimedOutError/,
            /TimeoutError/,
            /ECONNRESET/,
            /ETIMEDOUT/
        ]
    },

    // Model definitions
    define: {
        underscored: false,      // Use camelCase instead of snake_case
        timestamps: true,        // Add createdAt and updatedAt
        createdAt: 'createdAt',
        updatedAt: 'updatedAt',
        freezeTableName: true,   // Prevent table name pluralization
        paranoid: false          // Don't soft delete
    },

    // Dialect specific options
    dialectOptions: {
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000,
        // SSL configuration (enable in production)
        ssl: process.env.DB_SSL === 'true' ? {
            require: true,
            rejectUnauthorized: false
        } : false
    },

    // Timezone settings
    timezone: '+00:00',
    keepDefaultTimezone: true
};

// Create Sequelize instance
const sequelize = new Sequelize(
    dbConfig.database,
    dbConfig.username,
    dbConfig.password,
    {
        host: dbConfig.host,
        port: dbConfig.port,
        dialect: dbConfig.dialect,
        logging: dbConfig.logging,
        pool: dbConfig.pool,
        retry: dbConfig.retry,
        define: dbConfig.define,
        dialectOptions: dbConfig.dialectOptions,
        timezone: dbConfig.timezone
    }
);

// Test database connection
const testConnection = async () => {
    try {
        await sequelize.authenticate();
        console.log('✅ Database connection established successfully');
        console.log(`   📍 Host: ${dbConfig.host}:${dbConfig.port}`);
        console.log(`   📊 Database: ${dbConfig.database}`);
        return true;
    } catch (error) {
        console.error('❌ Unable to connect to database:', error.message);
        console.error('   Please check:');
        console.error('   1. PostgreSQL is running');
        console.error('   2. Database credentials are correct');
        console.error('   3. Database exists');
        throw error;
    }
};

// Sync database schema (development only)
const syncDatabase = async (options = {}) => {
    const { force = false, alter = false } = options;

    if (force && process.env.NODE_ENV === 'production') {
        throw new Error('Cannot force sync database in production!');
    }

    try {
        await sequelize.sync({ force, alter });
        console.log(`✅ Database synced (force: ${force}, alter: ${alter})`);
    } catch (error) {
        console.error('❌ Database sync failed:', error.message);
        throw error;
    }
};

// Close database connection
const closeConnection = async () => {
    try {
        await sequelize.close();
        console.log('✅ Database connection closed');
    } catch (error) {
        console.error('❌ Error closing database connection:', error.message);
    }
};

module.exports = {
    sequelize,
    testConnection,
    syncDatabase,
    closeConnection,
    dbConfig
};