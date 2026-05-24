// backend/config/auth.config.js
// Shared authentication configuration for all scripts

module.exports = {
    // Password settings
    PASSWORD_MIN_LENGTH: 8,
    PASSWORD_HASH_ROUNDS: 12,
    PASSWORD_MAX_ATTEMPTS: 5,
    ACCOUNT_LOCKOUT_MINUTES: 30,

    // Default Super Admin (ONLY for initial setup - documented in README)
    DEFAULT_SUPER_ADMIN: {
        name: 'Super',
        fatherName: 'System',
        grandfatherName: 'Administrator',
        username: 'superadmin',
        email: 'superadmin@eeep.com',
        tempPassword: 'SuperAdmin@123',
        role: 'superadmin',
        adminType: 'superadmin',
        status: 'active',
        forcePasswordChange: true,
        isFirstLogin: true
    },

    // Emergency reset settings
    EMERGENCY: {
        PASSWORD_PREFIX: 'TempReset@',
        PASSWORD_LENGTH: 16,
        RESET_TOKEN_EXPIRY_HOURS: 1,
        MAX_EMERGENCY_RESETS_PER_DAY: 3
    },

    // Token settings
    JWT: {
        ACCESS_TOKEN_EXPIRY: '7d',
        REFRESH_TOKEN_EXPIRY: '30d'
    },

    // Session settings
    SESSION: {
        TIMEOUT_MINUTES: 60,
        MAX_CONCURRENT_SESSIONS: 3
    },

    // Password complexity rules
    PASSWORD_COMPLEXITY: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: {
            superadmin: true,
            subadmin: true,
            school: false,
            teacher: false,
            student: false
        }
    },

    // Role hierarchy (for authorization)
    ROLE_HIERARCHY: {
        superadmin: 100,
        subadmin: 80,
        school: 60,
        teacher: 40,
        student: 20
    },

    // Audit logging
    AUDIT: {
        logPasswordChanges: true,
        logFailedLogins: true,
        logEmergencyResets: true,
        retentionDays: 365
    }
};