const { sequelize } = require('./src/config/database');

(async () => {
    try {
        await sequelize.authenticate();
        console.log('✅ Database connected');

        // Check if ContactMessages table exists
        const [result] = await sequelize.query('SELECT COUNT(*) FROM "ContactMessages"');
        console.log('📊 ContactMessages table count:', result[0].count);

        // List all tables with Contact in name
        const [tables] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE '%Contact%'
    `);
        console.log('📋 Tables with Contact in name:', tables);

        // Try to insert a test contact message
        const [insertResult] = await sequelize.query(`
      INSERT INTO "ContactMessages" (name, email, subject, message, status, "createdAt")
      VALUES ('Test User', 'test@example.com', 'Test Subject', 'Test message content', 'unread', NOW())
      RETURNING id
    `);
        console.log('✅ Test contact message inserted with ID:', insertResult[0].id);

        // Count again
        const [countAfter] = await sequelize.query('SELECT COUNT(*) FROM "ContactMessages"');
        console.log('📊 ContactMessages table count after insert:', countAfter[0].count);

        // Clean up test data
        await sequelize.query('DELETE FROM "ContactMessages" WHERE email = $1', { bind: ['test@example.com'] });
        console.log('🧹 Test data cleaned up');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('Full error:', error);
        process.exit(1);
    }
})();