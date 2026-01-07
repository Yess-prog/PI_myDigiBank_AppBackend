const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
require('dotenv').config();
const statsRoutes = require('./routes/stats.routes');
const usersRouter = require('./routes/users');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

const app = express();
const PORT = 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'mySuperSecretKey123';


// ✅ FIXED: Allow ALL origins for mobile
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(bodyParser.json());

// MySQL Connection Pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'mybankdb',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test database connection
pool.getConnection()
  .then(connection => {
    console.log('✅ MySQL Database Connected');
    connection.release();
  })
  .catch(err => {
    console.error('❌ MySQL Connection Error:', err);
  });

// Make pool available to routes
app.use((req, res, next) => {
  req.db = pool;
  next();
});

function getPythonCommand() {
  const platform = os.platform();
  
  if (platform === 'win32') {
    // Windows: try 'python' first, then 'python3', then 'py'
    return 'python';
  } else {
    // Linux/Mac: use 'python3'
    return 'python3';
  }
}

const PYTHON_CMD = getPythonCommand();
/**
 * Execute Python script and return result
 * @param {string} scriptName - Name of Python script (e.g., 'fraud_detection/fraud_detector.py')
 * @param {object} data - Data to pass to Python script
 * @returns {Promise<object>} - Result from Python script
 */
function executePythonScript(scriptName, data) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'ai_modules', scriptName);
    const dataJson = JSON.stringify(data);
    
    console.log(`🐍 Executing Python script: ${scriptPath}`);
    console.log(`📦 Input data length: ${dataJson.length} chars`);
    
    // Spawn Python process with the correct command
    const python = spawn(PYTHON_CMD, [scriptPath, dataJson]);
    
    let resultData = '';
    let errorData = '';
    
    // Collect stdout
    python.stdout.on('data', (data) => {
      resultData += data.toString();
    });
    
    // Collect stderr
    python.stderr.on('data', (data) => {
      errorData += data.toString();
      console.error('Python stderr:', data.toString());
    });
    
    // Handle process completion
    python.on('close', (code) => {
      console.log(`🐍 Python script exited with code: ${code}`);
      
      if (code !== 0) {
        console.error('❌ Python script error:', errorData);
        reject(new Error(`Python script exited with code ${code}: ${errorData}`));
        return;
      }
      
      try {
        console.log('📤 Python output:', resultData.substring(0, 200));
        const result = JSON.parse(resultData);
        resolve(result);
      } catch (e) {
        console.error('❌ Failed to parse Python output:', resultData);
        reject(new Error('Invalid JSON response from Python script'));
      }
    });
    
    // Handle errors
    python.on('error', (error) => {
      console.error('❌ Failed to start Python process:', error);
      reject(error);
    });
  });
}
function testPythonAvailability() {
  const { execSync } = require('child_process');
  try {
    const pythonVersion = execSync(`${PYTHON_CMD} --version`, { encoding: 'utf8' });
    console.log(`✅ Python found: ${pythonVersion.trim()}`);
    return true;
  } catch (error) {
    console.error(`❌ Python not found! Command '${PYTHON_CMD}' failed.`);
    console.error('   Please install Python or add it to your PATH');
    console.error('   Windows: https://www.python.org/downloads/');
    return false;
  }
}

// Add this to your server startup (before app.listen)
console.log('\n🔍 Checking Python installation...');
testPythonAvailability();


// ==================== AUTH MIDDLEWARE ====================
const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: 'Invalid token' });
    }
    req.userId = decoded.id;
    next();
  });
};

// ==================== TEST ROUTE ====================
app.get('/test', (req, res) => {
  res.json({
    status: 'Server is running! ✅',
    timestamp: new Date(),
    availableRoutes: {
      mobile: {
        auth: ['POST /auth/login', 'POST /auth/register'],
        accounts: ['GET /accounts'],
        transactions: ['GET /transactions', 'POST /transactions/transfer'],
        cards: ['GET /cards'],
        users: ['GET /users/profile', 'GET /users/email/:email']
      },
      web: {
        auth: ['POST /api/auth/login (admins table)'],
        users: ['GET /api/users/getUsers', 'POST /api/users/create', 'PUT /api/users/update/:id', 'DELETE /api/users/delete/:id'],
        stats: ['GET /api/stats/overview', 'GET /api/stats/balance']
      }
    }
  });
});

// ==================== AUTH ROUTES (MOBILE - users table) ====================
// ==================== AUTH ROUTES (MOBILE - users table) ====================
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  console.log('🔥 Mobile Login attempt:', email);

  try {
    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        message: 'Email and password are required'
      });
    }

    const [users] = await pool.query(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      console.log('❌ User not found:', email);
      return res.status(401).json({
        message: 'Invalid email or password'
      });
    }

    const user = users[0];
    
    // ✅ Check if password exists in database
    if (!user.password) {
      console.error('❌ User has no password set in database:', email);
      return res.status(500).json({
        message: 'Account configuration error. Please contact support.'
      });
    }

    // ✅ Validate that it's a proper bcrypt hash
    if (!user.password.startsWith('$2a$') && !user.password.startsWith('$2b$')) {
      console.error('❌ Invalid password hash format for user:', email);
      return res.status(500).json({
        message: 'Account configuration error. Please contact support.'
      });
    }
    
    // ✅ Compare plain password with stored hash
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      console.log('❌ Invalid password for:', email);
      return res.status(401).json({
        message: 'Invalid email or password'
      });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('✅ Mobile Login successful:', email);

    res.json({
      message: 'Login successful',
      token: token,
      userId: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email
    });

  } catch (err) {
    console.error('❌ Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});
/**
 * Execute Python script and return result
 * @param {string} scriptName - Name of Python script
 * @param {object} data - Data to pass to Python script
 * @returns {Promise<object>} - Result from Python script
 */
function executePythonScript(scriptName, data) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'ai_modules', scriptName);
    const dataJson = JSON.stringify(data);
    
    console.log(`🐍 Executing: ${scriptName}`);
    
    // Use 'python' for Windows, 'python3' for Linux/Mac
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    
    // Spawn Python process
    const python = spawn(pythonCmd, [scriptPath, dataJson]);
    
    let resultData = '';
    let errorData = '';
    
    // Collect stdout
    python.stdout.on('data', (data) => {
      resultData += data.toString();
    });
    
    // Collect stderr
    python.stderr.on('data', (data) => {
      errorData += data.toString();
    });
    
    // Handle process completion
    python.on('close', (code) => {
      if (code !== 0) {
        console.error(`❌ Python script error (code ${code}):`, errorData);
        reject(new Error(`Python script exited with code ${code}: ${errorData}`));
        return;
      }
      
      try {
        const result = JSON.parse(resultData);
        console.log(`✅ Python script success: ${scriptName}`);
        resolve(result);
      } catch (e) {
        console.error('❌ Failed to parse Python output:', resultData);
        reject(new Error('Invalid JSON response from Python script'));
      }
    });
    
    // Handle errors
    python.on('error', (error) => {
      console.error('❌ Failed to start Python process:', error);
      reject(error);
    });
  });
}
app.post('/transactions/fraud-check', verifyToken, async (req, res) => {
  try {
    console.log('🔍 Fraud check request for user:', req.userId);
    
    const { fromAccountId, amount, toRib } = req.body;
    
    // Verify account belongs to user
    const [accounts] = await pool.query(
      'SELECT id FROM accounts WHERE id = ? AND userId = ?',
      [fromAccountId, req.userId]
    );
    
    if (accounts.length === 0) {
      return res.status(404).json({ message: 'Account not found' });
    }
    
    // Get user's transaction history (last 30 days)
    const [userHistory] = await pool.query(
      `SELECT amount, createdAt, description
       FROM transactions 
       WHERE (fromAccountId = ? OR toAccountId = ?)
       AND createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       ORDER BY createdAt DESC
       LIMIT 50`,
      [fromAccountId, fromAccountId]
    );
    
    // Prepare transaction data for AI
    const transactionData = {
      transaction: {
        amount: amount,
        toRib: toRib,
        createdAt: new Date().toISOString()
      },
      userHistory: userHistory
    };
    
    // Call Python AI module
    try {
      const aiResult = await executePythonScript(
        'fraud_detection/fraud_detector.py',
        transactionData
      );
      
      if (aiResult.success) {
        console.log(`✅ Fraud check complete: Risk=${aiResult.risk_score}, Fraud=${aiResult.is_fraud}`);
        
        // If high risk, create alert in database
        if (aiResult.is_fraud || aiResult.risk_score > 0.8) {
          await pool.query(
            `INSERT INTO fraud_alerts (userId, transactionData, riskScore, reason, status, createdAt)
             VALUES (?, ?, ?, ?, 'pending', NOW())`,
            [
              req.userId,
              JSON.stringify(transactionData.transaction),
              aiResult.risk_score,
              aiResult.reason
            ]
          );
          console.log('⚠️ High-risk transaction alert created');
        }
        
        res.json({
          success: true,
          risk_score: aiResult.risk_score,
          is_fraud: aiResult.is_fraud,
          reason: aiResult.reason,
          confidence: aiResult.confidence,
          allow_transaction: !aiResult.is_fraud,
          features: aiResult.features
        });
        
      } else {
        throw new Error(aiResult.error || 'Fraud detection failed');
      }
      
    } catch (aiError) {
      console.error('❌ AI fraud detection error:', aiError.message);
      
      // FALLBACK: Simple rule-based check
      const avgAmount = userHistory.length > 0 
        ? userHistory.reduce((sum, t) => sum + parseFloat(t.amount), 0) / userHistory.length 
        : 0;
      
      const isHighAmount = avgAmount > 0 && amount > avgAmount * 3;
      const isVeryLarge = amount > 5000;
      
      const risk_score = isHighAmount || isVeryLarge ? 0.7 : 0.2;
      const is_fraud = risk_score > 0.8;
      
      res.json({
        success: true,
        risk_score: risk_score,
        is_fraud: is_fraud,
        reason: isHighAmount ? 'Amount significantly higher than usual' : 'Normal transaction',
        confidence: 0.5,
        allow_transaction: !is_fraud,
        fallback: true
      });
    }
    
  } catch (err) {
    console.error('❌ Fraud check error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});
// ==================== AUTH ROUTES (WEB ADMIN - admins table) ====================

app.get('/predictions/income', verifyToken, async (req, res) => {
  try {
    console.log('🔮 Income prediction request for user:', req.userId);
    
    // Get user's account
    const [accounts] = await pool.query(
      'SELECT id FROM accounts WHERE userId = ?',
      [req.userId]
    );

    if (accounts.length === 0) {
      return res.json({
        currentIncome: 0,
        transactionCount: 0,
        next7Days: 0,
        next14Days: 0,
        next30Days: 0,
        confidence: 0,
        pattern: 'no_account',
        averageMonthlyIncome: 0
      });
    }

    const accountId = accounts[0].id;

    // Get incoming transactions (last 90 days) - ONLY INCOMING (toAccountId matches)
    const [transactions] = await pool.query(
      `SELECT amount, createdAt 
       FROM transactions 
       WHERE toAccountId = ? 
       AND createdAt >= DATE_SUB(NOW(), INTERVAL 90 DAY)
       ORDER BY createdAt DESC`,
      [accountId]
    );

    if (transactions.length === 0) {
      return res.json({
        currentIncome: 0,
        transactionCount: 0,
        next7Days: 0,
        next14Days: 0,
        next30Days: 0,
        confidence: 20,
        pattern: 'no_data',
        averageMonthlyIncome: 0
      });
    }

    // ✅ CALL PYTHON AI MODULE
    try {
      const aiResult = await executePythonScript(
        'income_prediction/income_predictor.py',
        { transactions }
      );
      
      if (aiResult.success) {
        console.log('✅ AI Prediction successful:', aiResult.pattern);
        res.json({
          currentIncome: aiResult.currentIncome,
          transactionCount: aiResult.transactionCount,
          next7Days: aiResult.next7Days,
          next14Days: aiResult.next14Days,
          next30Days: aiResult.next30Days,
          confidence: aiResult.confidence,
          pattern: aiResult.pattern,
          averageMonthlyIncome: aiResult.averageMonthlyIncome
        });
      } else {
        throw new Error(aiResult.error || 'AI prediction failed');
      }
      
    } catch (aiError) {
      console.error('❌ AI prediction error, falling back to simple calculation:', aiError.message);
      
      // FALLBACK: Use existing simple calculation
      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const currentMonthIncome = transactions
        .filter(t => new Date(t.createdAt) >= currentMonthStart)
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);

      const totalIncome = transactions.reduce((sum, t) => sum + parseFloat(t.amount), 0);
      const daysOfData = Math.min(90, Math.ceil((now - new Date(transactions[transactions.length - 1].createdAt)) / (1000 * 60 * 60 * 24)));
      const avgDailyIncome = totalIncome / (daysOfData || 1);

      res.json({
        currentIncome: parseFloat(currentMonthIncome.toFixed(2)),
        transactionCount: transactions.length,
        next7Days: parseFloat((avgDailyIncome * 7).toFixed(2)),
        next14Days: parseFloat((avgDailyIncome * 14).toFixed(2)),
        next30Days: parseFloat((avgDailyIncome * 30).toFixed(2)),
        confidence: 60,
        pattern: 'stable',
        averageMonthlyIncome: parseFloat((avgDailyIncome * 30).toFixed(2))
      });
    }

  } catch (err) {
    console.error('❌ Prediction error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});


app.post('/auth/register', async (req, res) => {
  const { firstName, lastName, email, password, phone } = req.body;

  try {
    const [existing] = await pool.query(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existing.length > 0) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      `INSERT INTO users (firstName, lastName, email, password, phone, status, createdAt) 
       VALUES (?, ?, ?, ?, ?, 'active', NOW())`,
      [firstName, lastName, email, hashedPassword, phone || null]
    );

    
    

    const token = jwt.sign(
      { id: result.insertId, email: email },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'Registration successful',
      token: token,
      userId: result.insertId,
      firstName: firstName,
      lastName: lastName,
      email: email
    });

  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/cards/add', verifyToken, async (req, res) => {
  const { cardHolderName, cardNumber, expiryMonth, expiryYear, cvv } = req.body;

  try {
    // Validation
    if (!cardHolderName || !cardNumber || !expiryMonth || !expiryYear || !cvv) {
      return res.status(400).json({ message: 'All card fields are required' });
    }

    // Validate card number (should be 16 digits)
    if (!/^\d{16}$/.test(cardNumber)) {
      return res.status(400).json({ message: 'Invalid card number format (must be 16 digits)' });
    }

    // Validate expiry month (1-12)
    if (expiryMonth < 1 || expiryMonth > 12) {
      return res.status(400).json({ message: 'Invalid expiry month (must be 1-12)' });
    }

    // Validate expiry year (must be in the future)
    const currentYear = new Date().getFullYear() % 100; // Get last 2 digits
    const currentMonth = new Date().getMonth() + 1;
    
    if (expiryYear < currentYear || (expiryYear === currentYear && expiryMonth < currentMonth)) {
      return res.status(400).json({ message: 'Card has expired' });
    }

    // Validate CVV (3 digits)
    if (!/^\d{3}$/.test(cvv)) {
      return res.status(400).json({ message: 'Invalid CVV (must be 3 digits)' });
    }

    // Determine card type based on first digit
    const firstDigit = cardNumber[0];
    let cardType = 'Unknown';
    if (firstDigit === '4') {
      cardType = 'Visa';
    } else if (firstDigit === '5') {
      cardType = 'Mastercard';
    } else if (firstDigit === '3') {
      cardType = 'American Express';
    } else if (firstDigit === '6') {
      cardType = 'Discover';
    }

    // Get last 4 digits for masking
    const cardLast4 = cardNumber.slice(-4);
    
    // Create masked card number (show first 4 and last 4)
    const cardMask = `${cardNumber.slice(0, 4)} **** **** ${cardLast4}`;

    // In production, you should:
    // 1. Encrypt the full card number
    // 2. Never store CVV
    // 3. Use a payment processor (Stripe, PayPal)
    // 4. Comply with PCI DSS standards
    
    // For demo purposes, we'll store a hashed version
    const crypto = require('crypto');
    const cardHash = crypto.createHash('sha256').update(cardNumber).digest('hex');

    // Convert 2-digit year to 4-digit year
    const fullYear = expiryYear < 50 ? 2000 + expiryYear : 1900 + expiryYear;

    // Insert card into database
    const [result] = await pool.query(
      `INSERT INTO cards 
       (userId, cardHolderName, cardLast4, cardMask, cardType, cardHash, expiryMonth, expiryYear, status, createdAt) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW())`,
      [req.userId, cardHolderName, cardLast4, cardMask, cardType, cardHash, expiryMonth, fullYear]
    );

    console.log('✅ Card added successfully for user:', req.userId);

    res.status(201).json({
      message: 'Card added successfully',
      cardId: result.insertId,
      cardLast4: cardLast4,
      cardType: cardType
    });

  } catch (err) {
    console.error('❌ Add card error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});


// ==================== USER ROUTES (MOBILE) ====================
app.get('/users/profile', verifyToken, async (req, res) => {
  try {
    const [users] = await pool.query(
      'SELECT id, firstName, lastName, email, phone, status, createdAt FROM users WHERE id = ?',
      [req.userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(users[0]);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/users/email/:email', verifyToken, async (req, res) => {
  try {
    const [users] = await pool.query(
      'SELECT id, firstName, lastName, email, phone, status, createdAt FROM users WHERE email = ?',
      [req.params.email]
    );

    if (users.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(users[0]);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ==================== ACCOUNT ROUTES ====================
app.get('/accounts', verifyToken, async (req, res) => {
  try {
    const [accounts] = await pool.query(
      'SELECT * FROM accounts WHERE userId = ?',
      [req.userId]
    );

    res.json(accounts);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/accounts/:accountId', verifyToken, async (req, res) => {
  try {
    const [accounts] = await pool.query(
      'SELECT * FROM accounts WHERE id = ? AND userId = ?',
      [req.params.accountId, req.userId]
    );

    if (accounts.length === 0) {
      return res.status(404).json({ message: 'Account not found' });
    }

    res.json(accounts[0]);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/accounts/user/:userId', verifyToken, async (req, res) => {
  try {
    const [accounts] = await pool.query(
      'SELECT * FROM accounts WHERE userId = ?',
      [req.params.userId]
    );

    res.json(accounts);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ==================== CARD ROUTES ====================
// ==================== REPLACE YOUR EXISTING GET /cards ENDPOINT ====================
// This version includes better logging to debug the issue

app.get('/cards', verifyToken, async (req, res) => {
  try {
    console.log('📇 Fetching cards for user:', req.userId);
    
    // Query cards directly by userId (simpler and more reliable)
    const [cards] = await pool.query(
      `SELECT 
        c.id,
        c.userId,
        c.cardHolderName,
        c.cardLast4,
        c.cardMask,
        c.cardType,
        c.expiryMonth,
        c.expiryYear,
        c.status,
        c.createdAt
       FROM cards c
       WHERE c.userId = ?
       ORDER BY c.createdAt DESC`,
      [req.userId]
    );

    console.log(`✅ Found ${cards.length} cards for user ${req.userId}`);
    
    if (cards.length > 0) {
      console.log('📋 First card details:', {
        id: cards[0].id,
        cardHolderName: cards[0].cardHolderName,
        cardLast4: cards[0].cardLast4,
        cardType: cards[0].cardType,
        status: cards[0].status
      });
    }

    res.json(cards);
    
  } catch (err) {
    console.error('❌ Error fetching cards:', err);
    res.status(500).json({ 
      message: 'Server error',
      error: err.message 
    });
  }
});
// ==================== TRANSACTION ROUTES ====================
app.get('/transactions', verifyToken, async (req, res) => {
  try {
    const [transactions] = await pool.query(
      `SELECT t.* FROM transactions t
       INNER JOIN accounts a ON (t.fromAccountId = a.id OR t.toAccountId = a.id)
       WHERE a.userId = ?
       ORDER BY t.createdAt DESC
       LIMIT 50`,
      [req.userId]
    );

    res.json(transactions);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/transactions/transfer', verifyToken, async (req, res) => {
  const { fromAccountId, toRib, amount, description } = req.body;

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Verify sender account belongs to user
    const [senderAccounts] = await connection.query(
      'SELECT * FROM accounts WHERE id = ? AND userId = ?',
      [fromAccountId, req.userId]
    );

    if (senderAccounts.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Sender account not found' });
    }

    const senderAccount = senderAccounts[0];

    if (senderAccount.balance < amount) {
      await connection.rollback();
      return res.status(400).json({ message: 'Insufficient funds' });
    }
     try {
      const [userHistory] = await connection.query(
        `SELECT amount, createdAt, description
         FROM transactions 
         WHERE (fromAccountId = ? OR toAccountId = ?)
         AND createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
         ORDER BY createdAt DESC
         LIMIT 50`,
        [fromAccountId, fromAccountId]
      );
      
      const fraudCheckData = {
        transaction: {
          amount: amount,
          toRib: toRib,
          createdAt: new Date().toISOString()
        },
        userHistory: userHistory
      };
      
      const fraudResult = await executePythonScript(
        'fraud_detection/fraud_detector.py',
        fraudCheckData
      );
      
      if (fraudResult.is_fraud || fraudResult.risk_score > 0.85) {
        await connection.rollback();
        
        // Save alert
        await pool.query(
          `INSERT INTO fraud_alerts (userId, transactionData, riskScore, reason, status, createdAt)
           VALUES (?, ?, ?, ?, 'blocked', NOW())`,
          [
            req.userId,
            JSON.stringify(fraudCheckData.transaction),
            fraudResult.risk_score,
            fraudResult.reason
          ]
        );
        
        return res.status(403).json({ 
          message: 'Transaction blocked due to fraud suspicion',
          risk_score: fraudResult.risk_score,
          reason: fraudResult.reason
        });
      }
      
      console.log(`✅ Fraud check passed: Risk=${fraudResult.risk_score}`);
      
    } catch (fraudError) {
      console.warn('⚠️ Fraud check failed, proceeding with transaction:', fraudError.message);
      // Continue with transaction even if fraud check fails
    }


    // Find recipient by RIB
    const [recipientAccounts] = await connection.query(
      'SELECT * FROM accounts WHERE rib = ?',
      [toRib]
    );

    if (recipientAccounts.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Recipient account not found' });
    }

    const recipientAccount = recipientAccounts[0];


    // Update balances
    await connection.query(
      'UPDATE accounts SET balance = balance - ? WHERE id = ?',
      [amount, fromAccountId]
    );

    await connection.query(
      'UPDATE accounts SET balance = balance + ? WHERE id = ?',
      [amount, recipientAccount.id]
    );

    // Create transaction record
    const [result] = await connection.query(
      `INSERT INTO transactions (fromAccountId, toAccountId, amount, description, createdAt) 
       VALUES (?, ?, ?, ?, NOW())`,
      [fromAccountId, recipientAccount.id, amount, description || null]
    );

    await connection.commit();

    res.json({
      message: 'Transfer successful',
      transactionId: result.insertId,
      amount: amount,
      toRib: toRib
    });

  } catch (err) {
    await connection.rollback();
    console.error('Transfer error:', err);
    res.status(500).json({ message: 'Transfer failed' });
  } finally {
    connection.release();
  }
});

app.get('/fraud-alerts', verifyToken, async (req, res) => {
  try {
    const [alerts] = await pool.query(
      `SELECT id, transactionData, riskScore, reason, status, createdAt, resolvedAt
       FROM fraud_alerts
       WHERE userId = ?
       ORDER BY createdAt DESC
       LIMIT 20`,
      [req.userId]
    );
    
    res.json(alerts);
    
  } catch (err) {
    console.error('Error fetching fraud alerts:', err);
    res.status(500).json({ message: 'Server error' });
  }
});
// ==================== AUTH ROUTES (WEB ADMIN - admins table) ====================
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  console.log('ðŸ”¥ Web Admin Login attempt:', email);

  try {
    // Check in admins table instead of users table
    const [admins] = await pool.query(
      'SELECT * FROM admins WHERE email = ?',
      [email]
    );

    if (admins.length === 0) {
      console.log('âŒ Admin not found:', email);
      return res.status(401).json({
        message: 'Invalid email or password'
      });
    }

    const admin = admins[0];

    // Compare password with hashed password in database
    const isMatch = await bcrypt.compare(password, admin.password);

    if (!isMatch) {
      console.log('âŒ Invalid password for admin:', email);
      return res.status(401).json({
        message: 'Invalid email or password'
      });
    }

    const token = jwt.sign(
      { id: admin.id, email: admin.email, isAdmin: true },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('âœ… Web Admin Login successful:', email);

    res.json({
      token: token
    });

  } catch (err) {
    console.error('âŒ Admin login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/fraud-alerts/all', async (req, res) => {
  try {
    const [alerts] = await pool.query(
      `SELECT 
        fa.id,
        fa.userId,
        CONCAT(u.firstName, ' ', u.lastName) as userName,
        u.email as userEmail,
        fa.transactionData,
        fa.riskScore,
        fa.reason,
        fa.status,
        fa.createdAt,
        fa.resolvedAt
       FROM fraud_alerts fa
       INNER JOIN users u ON fa.userId = u.id
       ORDER BY fa.createdAt DESC
       LIMIT 100`
    );
    
    res.json(alerts);
    
  } catch (err) {
    console.error('Error fetching all fraud alerts:', err);
    res.status(500).json({ message: 'Server error' });
  }
});
// ==================== WEB ADMIN ROUTES ====================

// ==================== TRANSFER REQUEST ROUTES (FIXED) ====================

// GET pending transfer requests for the logged-in user
// ==================== TRANSFER REQUEST ROUTES (FIXED) ====================

// GET pending transfer requests for the logged-in user
app.get('/notifications/transfer-requests', verifyToken, async (req, res) => {
  try {
    console.log('📥 Fetching transfer requests for user:', req.userId);
    
    // In your DB structure:
    // - fromUserId = person requesting money (will RECEIVE)
    // - toUserId = person being asked (will SEND)
    // So when user logs in, they see requests where they are the "toUserId"
    
    const [requests] = await pool.query(
      `SELECT 
        tr.id,
        CONCAT(requester.firstName, ' ', requester.lastName) as senderName,
        requester.email as senderEmail,
        tr.fromAccountId,
        tr.toAccountId,
        tr.amount,
        tr.description,
        DATE_FORMAT(tr.createdAt, '%Y-%m-%dT%H:%i:%s') as createdAt,
        tr.status
       FROM transfer_requests tr
       INNER JOIN users requester ON tr.fromUserId = requester.id
       WHERE tr.toUserId = ? AND tr.status = 'pending'
       ORDER BY tr.createdAt DESC`,
      [req.userId]
    );

    console.log(`✅ Found ${requests.length} pending transfer requests`);
    
    // Always return an array, even if empty
    res.json(requests || []);
    
  } catch (err) {
    console.error('❌ Error fetching transfer requests:', err);
    res.status(500).json({ 
      message: 'Server error',
      error: err.message 
    });
  }
});
// ACCEPT transfer request (FIXED)
// REPLACE the accept endpoint in server.js with this FIXED version:

app.post('/notifications/transfer-requests/:requestId/accept', verifyToken, async (req, res) => {
  const connection = await pool.getConnection();

  try {
    console.log(`📥 Accepting transfer request ${req.params.requestId} by user ${req.userId}`);
    
    await connection.beginTransaction();

    // Get request details
    const [requests] = await connection.query(
      `SELECT tr.* 
       FROM transfer_requests tr
       WHERE tr.id = ? AND tr.status = 'pending'`,
      [req.params.requestId]
    );

    if (requests.length === 0) {
      await connection.rollback();
      console.log('❌ Request not found or already processed');
      return res.status(404).json({ message: 'Request not found or already processed' });
    }

    const request = requests[0];
    
    // 🔍 DEBUG: Log the request details
    console.log('📋 Request details:', {
      requestId: request.id,
      fromUserId: request.fromUserId,
      toUserId: request.toUserId,
      fromAccountId: request.fromAccountId,
      toAccountId: request.toAccountId,
      amount: request.amount,
      loggedInUser: req.userId
    });

    // Verify the logged-in user is the toUserId (person being asked to send money)
    if (request.toUserId !== req.userId) {
      await connection.rollback();
      console.log('❌ Unauthorized: User is not the recipient of this request');
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // ✅ FIX: Get ALL accounts for the logged-in user to find the right one
    const [userAccounts] = await connection.query(
      'SELECT id, balance, type FROM accounts WHERE userId = ?',
      [req.userId]
    );

    if (userAccounts.length === 0) {
      await connection.rollback();
      console.log('❌ No accounts found for user');
      return res.status(404).json({ message: 'No accounts found' });
    }

    // 🔍 DEBUG: Log all user accounts
    console.log('💰 User accounts:', userAccounts);

    // ✅ CRITICAL FIX: Convert strings to numbers for comparison
    const requestAmount = parseFloat(request.amount);
    
    // Find the account that should send money (could be any of user's accounts)
    // Use the first account with sufficient balance, or the primary account
    let senderAccount = userAccounts.find(acc => parseFloat(acc.balance) >= requestAmount);
    
    if (!senderAccount) {
      // If no account has enough, use the first account and show proper error
      senderAccount = userAccounts[0];
      await connection.rollback();
      console.log(`❌ Insufficient funds: best account has ${senderAccount.balance}, needs ${requestAmount}`);
      return res.status(400).json({ message: 'Insufficient funds' });
    }

    console.log(`✅ Using account ${senderAccount.id} with balance ${senderAccount.balance} for amount ${requestAmount}`);

    // ✅ FIX: Also verify the receiving account exists
    const [receiverAccounts] = await connection.query(
      'SELECT id, userId FROM accounts WHERE id = ?',
      [request.fromAccountId]
    );

    if (receiverAccounts.length === 0) {
      await connection.rollback();
      console.log('❌ Receiver account not found');
      return res.status(404).json({ message: 'Receiver account not found' });
    }

    console.log(`💰 Processing transfer: ${requestAmount} from account ${senderAccount.id} to account ${request.fromAccountId}`);

    // Deduct from sender (person accepting = person sending money)
    await connection.query(
      'UPDATE accounts SET balance = balance - ? WHERE id = ?',
      [requestAmount, senderAccount.id]
    );

    // Add to receiver (person who requested = person receiving money)
    await connection.query(
      'UPDATE accounts SET balance = balance + ? WHERE id = ?',
      [requestAmount, request.fromAccountId]
    );

    // Create transaction record
    await connection.query(
      `INSERT INTO transactions (fromAccountId, toAccountId, amount, description, createdAt) 
       VALUES (?, ?, ?, ?, NOW())`,
      [senderAccount.id, request.fromAccountId, requestAmount, request.description || 'Transfer request accepted']
    );

    // Update request status to accepted
    await connection.query(
      "UPDATE transfer_requests SET status = 'accepted', respondedAt = NOW() WHERE id = ?",
      [req.params.requestId]
    );

    await connection.commit();
    
    console.log('✅ Transfer request accepted successfully');

    res.json({
      message: 'Transfer request accepted',
      amount: requestAmount
    });

  } catch (err) {
    await connection.rollback();
    console.error('❌ Error accepting transfer request:', err);
    res.status(500).json({ 
      message: 'Server error',
      error: err.message 
    });
  } finally {
    connection.release();
  }
});
// REJECT transfer request (FIXED)
app.post('/notifications/transfer-requests/:requestId/reject', verifyToken, async (req, res) => {
  try {
    console.log(`📥 Rejecting transfer request ${req.params.requestId} by user ${req.userId}`);
    
    // Update the request where the logged-in user is the toUserId (person being asked)
    const [result] = await pool.query(
      `UPDATE transfer_requests 
       SET status = 'rejected', respondedAt = NOW()
       WHERE id = ? AND toUserId = ? AND status = 'pending'`,
      [req.params.requestId, req.userId]
    );

    if (result.affectedRows === 0) {
      console.log('❌ Request not found or unauthorized');
      return res.status(404).json({ message: 'Request not found or already processed' });
    }

    console.log('✅ Transfer request rejected successfully');
    res.json({ message: 'Transfer request rejected' });

  } catch (err) {
    console.error('❌ Error rejecting transfer request:', err);
    res.status(500).json({ 
      message: 'Server error',
      error: err.message 
    });
  }
});
app.post('/transactions/request', verifyToken, async (req, res) => {
  const { toUserId, fromAccountId, toAccountId, amount, description } = req.body;

  try {
    // Verify sender owns the account
    const [accounts] = await pool.query(
      'SELECT * FROM accounts WHERE id = ? AND userId = ?',
      [fromAccountId, req.userId]
    );

    if (accounts.length === 0) {
      return res.status(404).json({ message: 'Account not found' });
    }

    // Create transfer request
    const [result] = await pool.query(
      `INSERT INTO transfer_requests (fromUserId, toUserId, fromAccountId, toAccountId, amount, description, status, createdAt) 
       VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW())`,
      [req.userId, toUserId, fromAccountId, toAccountId, amount, description || null]
    );

    res.status(201).json({
      message: 'Transfer request created',
      requestId: result.insertId
    });

  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ==================== WEB ADMIN ROUTES (WITH /api prefix) ====================
// Mount users router with /api prefix for web admin
app.use('/api/users', usersRouter);

// Mount stats router (already has /api prefix)
app.use('/api/stats', statsRoutes);

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ✅ Listen on all interfaces
app.listen(5000, '0.0.0.0', () => {
  console.log('\n🚀 ================================');
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📱 Mobile access: http://localhost:${PORT}`);
  console.log(`💻 Web admin: http://localhost:${PORT}/api`);
  console.log(`🧪 Test endpoint: http://localhost:${PORT}/test`);
  console.log('\n📋 Login Credentials:');
  console.log('   Admin: admin@example.com / admin123');
  console.log('   User: alice@example.com / user');
  console.log('================================\n');
  
console.log('\n🤖 AI Modules:');
console.log('   ✅ Fraud Detection: Python + ML');
console.log('   ✅ Income Prediction: Prophet + Time Series');
console.log('================================\n');
});