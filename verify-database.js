// verify-database.js - Check what data the server is actually reading
const mysql = require('mysql2/promise');
require('dotenv').config();

async function verifyDatabase() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: 'mybankdb1', // Same as your server.js
    waitForConnections: true,
    connectionLimit: 10,
  });

  try {
    console.log('\n🔍 Checking Database Connection...\n');
    
    // Check which database we're connected to
    const [dbInfo] = await pool.query('SELECT DATABASE() as currentDB');
    console.log(`✅ Connected to database: ${dbInfo[0].currentDB}\n`);
    
    // Get bob@example.com user info
    console.log('📋 Checking bob@example.com user data:\n');
    const [users] = await pool.query(
      'SELECT id, firstName, lastName, email, PASSWORD FROM users WHERE email = ?',
      ['bob@example.com']
    );
    
    if (users.length === 0) {
      console.log('❌ User bob@example.com NOT FOUND in database!');
      console.log('   This means the server is looking in the wrong database.\n');
    } else {
      const user = users[0];
      console.log(`ID: ${user.id}`);
      console.log(`Name: ${user.firstName} ${user.lastName}`);
      console.log(`Email: ${user.email}`);
      console.log(`Password Hash: ${user.PASSWORD ? user.PASSWORD.substring(0, 20) + '...' : 'NULL/EMPTY'}`);
      console.log(`Password Valid: ${user.PASSWORD && (user.PASSWORD.startsWith('$2a$') || user.PASSWORD.startsWith('$2b$')) ? 'YES ✅' : 'NO ❌'}`);
      console.log();
      
      if (!user.PASSWORD) {
        console.log('⚠️  PASSWORD field is NULL or empty in database!');
        console.log('   Need to run fix-passwords.js script\n');
      } else if (!user.PASSWORD.startsWith('$2a$') && !user.PASSWORD.startsWith('$2b$')) {
        console.log('⚠️  PASSWORD is not a valid bcrypt hash!');
        console.log('   Need to run fix-passwords.js script\n');
      } else {
        console.log('✅ Password hash looks valid!');
        console.log('   You should be able to login with password: "user"\n');
      }
    }
    
    // List all databases available
    console.log('📂 Available databases on this MySQL server:');
    const [databases] = await pool.query('SHOW DATABASES');
    databases.forEach(db => {
      console.log(`   - ${db.Database}`);
    });
    console.log();
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

console.log('\n🔧 Database Verification Script\n');
console.log('================================');
verifyDatabase();