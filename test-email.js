// backend/test-email.js
require('dotenv').config();
const { sendEmail, testEmailConnection } = require('./src/services/emailService');

const testEmail = async () => {
    console.log('🔍 Testing email connection...');
    const isConnected = await testEmailConnection();

    if (!isConnected) {
        console.log('❌ Email connection failed. Check your credentials.');
        return;
    }

    console.log('📧 Sending test email...');
    const result = await sendEmail({
        to: 'systemseeep@gmail.com', // Send to yourself
        subject: 'Test Email from EEEP',
        html: '<h1>✅ Success!</h1><p>Email is working with App Password!</p><p>Your App Password: tokiqxrsgictfwas</p>'
    });

    console.log('Result:', result);
};

testEmail();