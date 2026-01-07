// Test API endpoints without needing curl
const http = require('http');

// Replace with your actual JWT token after logging in
const JWT_TOKEN = 'YOUR_JWT_TOKEN_HERE';

function makeRequest(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(body);
        }
      });
    });
    
    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function testAPIs() {
  console.log('========================================');
  console.log('Testing MyBank AI API Endpoints');
  console.log('========================================\n');

  // Test 1: Login to get JWT token
  console.log('[1] Testing Login...');
  try {
    const loginResult = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }, {
      email: 'alice@example.com',
      password: 'user'
    });
    
    console.log('✅ Login Result:', loginResult);
    
    if (loginResult.token) {
      const token = loginResult.token;
      console.log('📝 Token:', token.substring(0, 20) + '...\n');
      
      // Test 2: Income Prediction
      console.log('[2] Testing Income Prediction...');
      const incomeResult = await makeRequest({
        hostname: 'localhost',
        port: 5000,
        path: '/predictions/income',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      console.log('✅ Income Prediction:', incomeResult);
      console.log('');
      
      // Test 3: Fraud Check
      console.log('[3] Testing Fraud Detection...');
      const fraudResult = await makeRequest({
        hostname: 'localhost',
        port: 5000,
        path: '/transactions/fraud-check',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }, {
        fromAccountId: 1,
        amount: 10000,
        toRib: 'TN00000000000000000002'
      });
      console.log('✅ Fraud Check:', fraudResult);
      console.log('');
      
      // Test 4: Normal transaction fraud check
      console.log('[4] Testing Normal Transaction Fraud Check...');
      const normalFraudResult = await makeRequest({
        hostname: 'localhost',
        port: 5000,
        path: '/transactions/fraud-check',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }, {
        fromAccountId: 1,
        amount: 500,
        toRib: 'TN00000000000000000002'
      });
      console.log('✅ Normal Transaction Check:', normalFraudResult);
      
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  console.log('\n========================================');
  console.log('Tests Complete!');
  console.log('========================================');
}

// Run tests
testAPIs();