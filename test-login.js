const https = require('https');

const data = JSON.stringify({
    username: 'superadmin',
    password: 'admin123'
});

const options = {
    hostname: 'eeep-server.onrender.com',
    port: 443,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

console.log('🔍 Testing login with credentials:');
console.log('Username: superadmin');
console.log('Password: admin123');
console.log('URL: https://eeep-server.onrender.com/api/auth/login');
console.log('');

const req = https.request(options, (res) => {
    console.log(`Status Code: ${res.statusCode}`);
    console.log(`Headers:`, res.headers);

    let responseBody = '';
    res.on('data', (chunk) => {
        responseBody += chunk;
    });

    res.on('end', () => {
        console.log('Response Body:', responseBody);

        try {
            const parsed = JSON.parse(responseBody);
            console.log('Parsed Response:', JSON.stringify(parsed, null, 2));

            if (parsed.success) {
                console.log('✅ LOGIN SUCCESSFUL!');
                console.log('User Role:', parsed.data?.user?.role);
                console.log('User Status:', parsed.data?.user?.status);
            } else {
                console.log('❌ LOGIN FAILED!');
                console.log('Error:', parsed.error);
            }
        } catch (e) {
            console.log('❌ Could not parse JSON response');
        }
    });
});

req.on('error', (error) => {
    console.error('❌ Request Error:', error);
});

req.write(data);
req.end();