const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

async function fixPasswords() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'mybankdb1'
  });

  try {
    // Hash the password 'user'
    const hashedPassword = await bcrypt.hash('user', 10);
    
    console.log('Generated hash for password "user":', hashedPassword);

    // Update Alice
    await connection.query(
      'UPDATE users SET password = ? WHERE email = ?',
      [hashedPassword, 'alice@example.com']
    );
    console.log('✅ Updated alice@example.com');

    // Update Bob
    await connection.query(
      'UPDATE users SET password = ? WHERE email = ?',
      [hashedPassword, 'bob@example.com']
    );
    console.log('✅ Updated bob@example.com');

    // Verify
    const [users] = await connection.query(
      'SELECT id, email, password FROM users WHERE email IN (?, ?)',
      ['alice@example.com', 'bob@example.com']
    );

    console.log('\n📋 Updated users:');
    users.forEach(user => {
      console.log(`- ${user.email}: ${user.password.substring(0, 20)}...`);
    });

    // Test the password
    console.log('\n🔐 Testing password verification...');
    const testPassword = 'user';
    const isMatch = await bcrypt.compare(testPassword, hashedPassword);
    console.log(`Password "user" matches hash: ${isMatch ? '✅ YES' : '❌ NO'}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await connection.end();
  }
}

fixPasswords();