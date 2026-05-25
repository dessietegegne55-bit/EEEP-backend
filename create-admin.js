// backend/create-admin.js
// Simple script to create super admin

const bcrypt = require('bcryptjs');
const { sequelize } = require('./src/config/database');

const createSuperAdmin = async () => {
    try {
        console.log('🔗 Connecting to database...');
        await sequelize.authenticate();
        console.log('✅ Database connected');

        // Create super admin
        const password = 'SuperAdmin@123';
        const hashedPassword = await bcrypt.hash(password, 10);

        const [user, created] = await sequelize.query(`
      INSERT INTO "Users" (
        "name", "fatherName", "grandfatherName", 
        "email", "username", "passwordHash", 
        "role", "status", "forcePasswordChange", "isFirstLogin",
        "createdAt", "updatedAt"
      ) VALUES (
        'System', 'Administrator', 'EEEP',
        'admin@eeep.com', 'superadmin', $1,
        'superadmin', 'active', false, false,
        NOW(), NOW()
      )
      ON CONFLICT ("email") DO UPDATE SET
        "passwordHash" = EXCLUDED."passwordHash",
        "updatedAt" = NOW()
      RETURNING id, username, email
    `, { bind: [hashedPassword] });

        console.log('✅ Super Admin Created/Updated:');
        console.log('   Username: superadmin');
        console.log('   Email: admin@eeep.com');
        console.log('   Password: SuperAdmin@123');
        console.log('');
        console.log('🔗 Login at: https://eeep-app.vercel.app/auth/admin-login');

        await sequelize.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
};

createSuperAdmin();