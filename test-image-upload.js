// Test script to verify image upload endpoint
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

async function testImageUpload() {
    try {
        // You need to replace these values:
        const TOKEN = 'YOUR_TEACHER_TOKEN_HERE'; // Get from localStorage in browser
        const EXAM_ID = 1; // Use an existing exam ID

        // Create a test image file
        const testImagePath = path.join(__dirname, 'uploads', 'id-photos', 'idphoto-1779282904346-159730039.jpeg');

        if (!fs.existsSync(testImagePath)) {
            console.error('❌ Test image not found at:', testImagePath);
            return;
        }

        const formData = new FormData();
        formData.append('questionImage', fs.createReadStream(testImagePath));

        console.log('📤 Uploading test image...');
        console.log('📤 Exam ID:', EXAM_ID);
        console.log('📤 Image path:', testImagePath);

        const response = await fetch(`http://localhost:5000/api/exams/${EXAM_ID}/question-image`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${TOKEN}`,
                ...formData.getHeaders()
            },
            body: formData
        });

        console.log('📥 Response status:', response.status);

        const data = await response.json();
        console.log('📥 Response data:', JSON.stringify(data, null, 2));

        if (data.success) {
            console.log('✅ Upload successful!');
            console.log('✅ Image URL:', data.data.imageUrl);
        } else {
            console.error('❌ Upload failed:', data.error);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

console.log('='.repeat(50));
console.log('IMAGE UPLOAD TEST');
console.log('='.repeat(50));
console.log('');
console.log('INSTRUCTIONS:');
console.log('1. Login as a teacher in the browser');
console.log('2. Open browser console and run: localStorage.getItem("token")');
console.log('3. Copy the token and paste it in this file (TOKEN variable)');
console.log('4. Update EXAM_ID with an existing exam ID');
console.log('5. Run: node backend/test-image-upload.js');
console.log('');
console.log('='.repeat(50));
console.log('');

// Uncomment to run the test:
// testImageUpload();
