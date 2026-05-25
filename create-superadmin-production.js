const https = require('https');

console.log('🔧 Creating superadmin user in production database...');
console.log('URL: https://eeep-server.onrender.com/create-superadmin');
console.log('');

const data = JSON.stringify({});

const options = {
    hostname: 'eeep-server.onrender.com',
    port: 443,
    path: '/create-superadmin',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
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
            console.log('\n📊 RESULT:');
            console.log('='.repeat(50));

            if (parsed.success) {
                console.log('✅ SUCCESS! Superadmin created');
                console.log('Username:', parsed.credentials?.username);
                console.log('Password:', parsed.credentials?.password);
                console.log('\n🎯 Now you can login at:');
                console.log('https://eeep-app.vercel.app/auth/admin-login');
            } else {
                console.log('❌ FAILED:', parsed.message || parsed.error);
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

req.write(data);
req.end();