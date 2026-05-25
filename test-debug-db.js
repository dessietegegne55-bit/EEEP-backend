const https = require('https');

console.log('🔍 Checking which database the backend is connected to...');
console.log('URL: https://eeep-server.onrender.com/debug-db');
console.log('');

const options = {
    hostname: 'eeep-server.onrender.com',
    port: 443,
    path: '/debug-db',
    method: 'GET'
};

const req = https.request(options, (res) => {
    console.log(`Status Code: ${res.statusCode}`);

    let responseBody = '';
    res.on('data', (chunk) => {
        responseBody += chunk;
    });

    res.on('end', () => {
        console.log('Raw Response:', responseBody);

        try {
            const parsed = JSON.parse(responseBody);
            console.log('\n📊 DATABASE INFO:');
            console.log('='.repeat(50));
            console.log('Database Name:', parsed.database?.db_name || 'Unknown');
            console.log('Total Users:', parsed.user_count || 'Unknown');
            console.log('Environment:', parsed.env || 'Unknown');

            if (parsed.superadmin) {
                console.log('\n👑 SUPERADMIN INFO:');
                console.log('Username:', parsed.superadmin.username);
                console.log('Email:', parsed.superadmin.email);
                console.log('Password Hash Length:', parsed.superadmin.hash_len);

                if (parsed.superadmin.hash_len < 50) {
                    console.log('❌ PASSWORD HASH IS TRUNCATED!');
                    console.log('   Expected length: ~60 characters');
                    console.log('   Actual length:', parsed.superadmin.hash_len);
                } else {
                    console.log('✅ Password hash length looks correct');
                }
            } else {
                console.log('❌ No superadmin user found!');
            }

            if (parsed.error) {
                console.log('❌ Database Error:', parsed.error);
            }

        } catch (e) {
            console.log('❌ Could not parse JSON response');
            console.log('Response:', responseBody);
        }
    });
});

req.on('error', (error) => {
    console.error('❌ Request Error:', error);
});

req.end();