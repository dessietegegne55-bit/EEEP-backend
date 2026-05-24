require('dotenv').config();
const { sendPasswordResetEmail } = require('./src/services/emailService');

const test = async () => {
    console.log('Testing password reset email...');

    const result = await sendPasswordResetEmail(
        'dessietegegne55@gmail.com',  // your email
        'Dessie',                      // first name
        'test-token-12345',            // fake token
        'superadmin'                   // role
    );

    console.log('Result:', result);
};

test();