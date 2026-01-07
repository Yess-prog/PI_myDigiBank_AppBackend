// fix-passwords.js - Run this script once to fix existing users
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function fixPasswords() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'mybankdb1',
  });

  try {
    console.log('🔍 Checking users with invalid passwords...');
    
    // Get all users
    const [users] = await pool.query('SELECT id, email, password FROM users');
    
    console.log(`Found ${users.length} users`);
    
    for (const user of users) {
      // Check if password is null or not a proper bcrypt hash
      if (!user.password || !user.password.startsWith('$2a$') && !user.password.startsWith('$2b$')) {
        console.log(`⚠️  User ${user.email} has invalid password`);
        
        // Set default password "user" for all users without valid passwords
        const defaultPassword = 'user';
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);
        
        await pool.query(
          'UPDATE users SET password = ? WHERE id = ?',
          [hashedPassword, user.id]
        );
        
        console.log(`✅ Fixed password for ${user.email} (new password: "${defaultPassword}")`);
      } else {
        console.log(`✓ User ${user.email} has valid password`);
      }
    }
    
    console.log('\n✅ All passwords fixed!');
    console.log('Users can now login with password: "user"');
    
  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    await pool.end();
  }
}

fixPasswords();