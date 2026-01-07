const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const bcrypt = require('bcryptjs');

exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Find admin by email
    const admin = await Admin.findOne({ where: { email } });
    console.log('Login attempt for email:', email);

    if (!admin) {
      console.log('Login attempt failed: Admin not found for email', email);
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    console.log('Provided password:', password);
    console.log('Stored hashed password:', admin.password);

    // ✅ CORRECT: Use bcrypt.compare() to verify the password
    const isMatch = await bcrypt.compare(password, admin.password);
    console.log('Password match result:', isMatch);

    if (!isMatch) {
      console.log('Login attempt failed: Incorrect password for email', email);
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: admin.id, email: admin.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    console.log('Login successful for:', email);
    res.json({ token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};