// backend/test-gemini.js
require('dotenv').config();

async function testGemini() {
  console.log('🔍 Testing Google Gemini API...');

  const API_KEY = process.env.GEMINI_API_KEY;

  if (!API_KEY) {
    console.error('❌ API key not found');
    return;
  }

  console.log('API Key found:', API_KEY.substring(0, 15) + '...');

  // Use the correct model from your available list
  const model = 'gemini-2.0-flash';

  console.log(`\n📡 Trying model: ${model}...`);

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: 'Say hello in one sentence' }]
        }]
      })
    });

    const data = await response.json();

    if (data.candidates && data.candidates[0]) {
      console.log('✅ Success!');
      console.log('Response:', data.candidates[0].content.parts[0].text);
    } else {
      console.log('❌ Error:', data.error?.message || data);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testGemini();