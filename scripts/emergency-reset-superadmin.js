// backend/scripts/emergency-reset-superadmin.js
// EMERGENCY RESET UTILITY - Only for system lockout situations
// MUST be run from server with direct database access

const bcrypt = require('bcryptjs');
const { sequelize } = require('../src/config/database');
const readline = require('readline');
const authConfig = require('../config/auth.config');

// Create CLI interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

// Generate random temporary password
const generateTempPassword = () => {
    const random = Math.random().toString(36).substring(2, 14);
    return `${authConfig.EMERGENCY.PASSWORD_PREFIX}${random}`;
};

// Ensure audit table exists
const ensureAuditTable = async () => {
    try {
        await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "PasswordResetAudit" (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER,
        "resetBy" VARCHAR(100),
        "resetMethod" VARCHAR(50),
        "resetReason" TEXT,
        "approvingManager" VARCHAR(100),
        "ipAddress" VARCHAR(50),
        "tempPasswordUsed" BOOLEAN DEFAULT false,
        "resetAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        console.log('✅ Audit table verified');
    } catch (error) {
        console.log('⚠️ Could not create audit table:', error.message);
    }
};

const emergencyReset = async () => {
    console.log('\n' + '='.repeat(70));
    console.log('🚨 EMERGENCY SUPER ADMIN RESET UTILITY 🚨');
    console.log('='.repeat(70));

    console.log('\n⚠️  WARNING:');
    console.log('   - This script should ONLY be used in EMERGENCIES');
    console.log('   - Bypasses all normal authentication');
    console.log('   - All actions are logged for audit');
    console.log('   - Use normal "Forgot Password" first');
    console.log('   - THIS IS A LAST RESORT TOOL\n');

    const confirmEmergency = await question('🔐 Type "EMERGENCY" to confirm you understand: ');

    if (confirmEmergency !== 'EMERGENCY') {
        console.log('\n❌ Emergency reset cancelled.');
        rl.close();
        process.exit(0);
    }

    // STEP 1: Authorization
    console.log('\n📋 STEP 1: Authorization Required');
    console.log('─'.repeat(50));

    const name = await question('👤 Your full name: ');
    const role = await question('💼 Your role (System Admin/DevOps/DBA): ');
    const reason = await question('📝 Reason for emergency reset: ');
    const approver = await question('✅ Approving manager name: ');

    // STEP 2: List current Super Admins
    console.log('\n📋 STEP 2: Current Super Admins');
    console.log('─'.repeat(50));

    const [superAdmins] = await sequelize.query(`
    SELECT u.id, u.username, u.email, u.name, u."fatherName", u."grandfatherName", u.status, a."adminType"
    FROM "Users" u
    LEFT JOIN "Admins" a ON a."userId" = u.id
    WHERE u.role = 'superadmin'
    ORDER BY u.id ASC
  `);

    if (superAdmins.length === 0) {
        console.log('❌ No Super Admins found in database!');
        await ensureAuditTable();
        await sequelize.query(`
      INSERT INTO "PasswordResetAudit" ("resetBy", "resetMethod", "resetReason", "approvingManager")
      VALUES ($1, 'emergency', $2, $3)
    `, { bind: [name, 'Attempted reset but no Super Admins found', approver] });
        rl.close();
        process.exit(1);
    }

    console.log('\nCurrent Super Admins:');
    superAdmins.forEach((admin, index) => {
        const fullName = [admin.name, admin.fatherName, admin.grandfatherName]
            .filter(Boolean)
            .join(' ');
        console.log(`   ${index + 1}. ${admin.username} - ${fullName} - ${admin.email} (${admin.status})`);
    });

    // STEP 3: Select which Super Admin to reset
    console.log('\n📋 STEP 3: Select Admin to Reset');
    console.log('─'.repeat(50));

    const selection = await question('Select number to reset (or "all" for all, or "new" to create new): ');

    let adminIdsToReset = [];
    let createNew = false;

    if (selection === 'all') {
        adminIdsToReset = superAdmins.map(a => a.id);
        console.log(`\n⚠️  Will reset ALL ${adminIdsToReset.length} Super Admins!`);
    } else if (selection === 'new') {
        createNew = true;
        console.log('\n📝 Will create a NEW Super Admin instead of resetting.');
    } else {
        const index = parseInt(selection) - 1;
        if (index >= 0 && index < superAdmins.length) {
            adminIdsToReset = [superAdmins[index].id];
        } else {
            console.log('❌ Invalid selection!');
            rl.close();
            process.exit(1);
        }
    }

    const finalConfirm = await question('\n🔐 Type "RESET" to proceed: ');
    if (finalConfirm !== 'RESET') {
        console.log('\n❌ Emergency reset cancelled.');
        rl.close();
        process.exit(0);
    }

    // STEP 4: Create audit table if needed
    await ensureAuditTable();

    const tempPasswords = [];
    const ipAddress = 'CLI_SCRIPT';

    // STEP 5: Reset existing admins or create new
    if (createNew) {
        console.log('\n📋 STEP 4: Creating New Super Admin');
        console.log('─'.repeat(50));

        const newName = await question('👤 New Super Admin Name: ');
        const newFatherName = await question('👤 Father Name: ');
        const newGrandfatherName = await question('👤 Grandfather Name: ');
        const newEmail = await question('📧 Email: ');
        const newUsername = await question('👤 Username (optional, auto from email): ') || newEmail.split('@')[0];
        const newTempPassword = await question('🔑 Temporary Password (or leave blank for auto): ') || generateTempPassword();

        const hashedPassword = await bcrypt.hash(newTempPassword, authConfig.PASSWORD_HASH_ROUNDS);

        try {
            const [newUser] = await sequelize.query(`
        INSERT INTO "Users" ("name", "fatherName", "grandfatherName", email, username, "passwordHash", role, status, "forcePasswordChange", "isFirstLogin", "createdAt")
        VALUES ($1, $2, $3, $4, $5, $6, 'superadmin', 'active', true, true, NOW())
        RETURNING id, username
      `, { bind: [newName, newFatherName, newGrandfatherName, newEmail, newUsername, hashedPassword] });

            await sequelize.query(`
        INSERT INTO "Admins" ("userId", "adminType", "createdAt")
        VALUES ($1, 'superadmin', NOW())
      `, { bind: [newUser[0].id] });

            const fullName = [newName, newFatherName, newGrandfatherName]
                .filter(Boolean)
                .join(' ');

            tempPasswords.push({
                username: newUser[0].username,
                email: newEmail,
                name: fullName,
                tempPassword: newTempPassword,
                action: 'created'
            });

            await sequelize.query(`
        INSERT INTO "PasswordResetAudit" ("userId", "resetBy", "resetMethod", "resetReason", "approvingManager", "ipAddress")
        VALUES ($1, $2, 'emergency_create', $3, $4, $5)
      `, { bind: [newUser[0].id, name, reason, approver, ipAddress] });

            console.log(`   ✅ Created new Super Admin: ${newUsername}`);
        } catch (error) {
            console.error('❌ Failed to create new Super Admin:', error.message);
        }

    } else {
        console.log('\n📋 STEP 4: Resetting Passwords');
        console.log('─'.repeat(50));

        for (const adminId of adminIdsToReset) {
            const tempPassword = generateTempPassword();
            const hashedPassword = await bcrypt.hash(tempPassword, authConfig.PASSWORD_HASH_ROUNDS);

            await sequelize.query(`
        UPDATE "Users" 
        SET "passwordHash" = $1,
            "forcePasswordChange" = true,
            "isFirstLogin" = true,
            "updatedAt" = NOW()
        WHERE id = $2 AND role = 'superadmin'
      `, { bind: [hashedPassword, adminId] });

            // Get admin details with full name
            const [admin] = await sequelize.query(`
        SELECT username, email, name, "fatherName", "grandfatherName" FROM "Users" WHERE id = $1
      `, { bind: [adminId] });

            const fullName = [admin[0].name, admin[0].fatherName, admin[0].grandfatherName]
                .filter(Boolean)
                .join(' ');

            tempPasswords.push({
                username: admin[0].username,
                email: admin[0].email,
                name: fullName,
                tempPassword: tempPassword,
                action: 'reset'
            });

            // Log to audit table
            await sequelize.query(`
        INSERT INTO "PasswordResetAudit" ("userId", "resetBy", "resetMethod", "resetReason", "approvingManager", "ipAddress")
        VALUES ($1, $2, 'emergency_reset', $3, $4, $5)
      `, { bind: [adminId, name, reason, approver, ipAddress] });

            console.log(`   ✅ Reset for: ${admin[0].username}`);
        }
    }

    // STEP 6: Display results
    console.log('\n📋 RESULTS');
    console.log('='.repeat(70));

    tempPasswords.forEach(admin => {
        console.log(`\n${admin.action === 'created' ? '🆕 NEW ADMIN' : '🔄 RESET ADMIN'}:`);
        console.log(`   Name: ${admin.name}`);
        console.log(`   Username: ${admin.username}`);
        console.log(`   Email: ${admin.email}`);
        console.log(`   🔑 TEMPORARY PASSWORD: ${admin.tempPassword}`);
        console.log(`   ⚠️  MUST change password on first login!`);
    });

    // STEP 7: Instructions
    console.log('\n📋 NEXT STEPS');
    console.log('─'.repeat(50));
    console.log(`
1. Give temporary password ONLY to authorized person
2. Admin MUST login IMMEDIATELY at: http://localhost:3000/auth/admin-login
3. System will FORCE password change
4. Create a NEW strong password
5. Old temporary password will stop working
6. Create additional Super Admins to prevent future lockouts
  `);

    // STEP 8: Audit summary
    console.log('\n📋 AUDIT SUMMARY');
    console.log('─'.repeat(50));
    console.log(`✅ Reset performed by: ${name} (${role})`);
    console.log(`✅ Reason: ${reason}`);
    console.log(`✅ Approved by: ${approver}`);
    console.log(`✅ ${tempPasswords.length} Super Admin(s) processed`);
    console.log(`✅ Timestamp: ${new Date().toLocaleString()}`);
    console.log(`✅ Audit log created in PasswordResetAudit table`);

    console.log('\n' + '='.repeat(70));
    console.log('✅ EMERGENCY RESET COMPLETE');
    console.log('='.repeat(70));
    console.log('\n📌 IMPORTANT: Store these passwords securely and delete this console log!\n');

    rl.close();
    await sequelize.close();
};

// Run the script
const run = async () => {
    try {
        await sequelize.authenticate();
        console.log('✅ Connected to database');
        await emergencyReset();
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        process.exit(1);
    }
};

run();