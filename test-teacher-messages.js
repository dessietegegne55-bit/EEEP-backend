// Test script for Teacher Message System
const { sequelize } = require('./src/config/database');

(async () => {
    try {
        console.log('🔍 Testing Teacher Message System...');

        // 1. Check database connection
        await sequelize.authenticate();
        console.log('✅ Database connected');

        // 2. Check if Notification table exists
        const [tables] = await sequelize.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'Notifications'
        `);

        if (tables.length === 0) {
            console.log('❌ Notifications table does not exist');
            return;
        }
        console.log('✅ Notifications table exists');

        // 3. Check table structure
        const [columns] = await sequelize.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'Notifications'
            ORDER BY ordinal_position
        `);

        console.log('📋 Notifications table columns:');
        columns.forEach(col => {
            console.log(`   ${col.column_name} (${col.data_type}) ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
        });

        // 4. Check if ContactMessages table exists
        const [contactTables] = await sequelize.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'ContactMessages'
        `);

        if (contactTables.length === 0) {
            console.log('❌ ContactMessages table does not exist - running setup...');

            // Try to create the table using the model
            const { ContactMessage } = require('./src/models');
            await ContactMessage.sync({ force: false });
            console.log('✅ ContactMessages table created');
        } else {
            console.log('✅ ContactMessages table exists');
        }

        // 5. Test teacher message endpoints
        console.log('\n🔍 Teacher Message Endpoints:');
        console.log('1. GET /api/teacher/students - Get teacher\'s students');
        console.log('2. GET /api/teacher/school - Get teacher\'s school');
        console.log('3. GET /api/teacher/admins - Get all admins');
        console.log('4. POST /api/teacher/send-message - Send message to students');
        console.log('5. POST /api/teacher/send-to-school - Send message to school');
        console.log('6. POST /api/teacher/send-to-admin - Send message to admin');

        // 6. Test data insertion
        console.log('\n🔍 Testing data insertion...');

        // Check if we have any teachers
        const [teachers] = await sequelize.query('SELECT COUNT(*) FROM "Teachers"');
        console.log(`📊 Total teachers: ${teachers[0].count}`);

        // Check if we have any students
        const [students] = await sequelize.query('SELECT COUNT(*) FROM "Students"');
        console.log(`📊 Total students: ${students[0].count}`);

        // Check if we have any admins
        const [admins] = await sequelize.query(`
            SELECT COUNT(*) 
            FROM "Users" u
            JOIN "Admins" a ON u.id = a."userId"
            WHERE u.role IN ('superadmin', 'subadmin')
        `);
        console.log(`📊 Total admins: ${admins[0].count}`);

        // 7. Test SQL queries used in controller
        console.log('\n🔍 Testing SQL queries...');

        // Test getTeacherStudents query
        try {
            const [testStudents] = await sequelize.query(`
                SELECT DISTINCT 
                    s.id, s."userId", s."idNumber", s."gradeLevel", s."department", s."sex",
                    u."firstName" as name, u."fatherName", u."grandfatherName", u.email
                FROM "Students" s
                JOIN "Users" u ON s."userId" = u.id
                JOIN "ExamAttempts" ea ON s.id = ea."studentId"
                JOIN "Exams" e ON ea."examId" = e.id
                WHERE e.subject = $1
                LIMIT 5
            `, { bind: ['Mathematics'] }); // Using a sample subject

            console.log(`✅ getTeacherStudents query works. Sample students: ${testStudents.length}`);
        } catch (error) {
            console.error('❌ getTeacherStudents query failed:', error.message);
        }

        console.log('\n✅ Teacher message system test completed');
        console.log('💡 Note: Actual endpoint testing requires authentication');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('Full error:', error);
        process.exit(1);
    }
})();