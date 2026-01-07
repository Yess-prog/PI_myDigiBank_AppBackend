// ==================== controllers/userController.js ====================
const bcrypt = require('bcryptjs');

// Helper function to generate avatar color
const getRandomColor = () => {
  const colors = ['#2563eb', '#16a34a', '#ea580c', '#dc2626', '#7c3aed', '#0891b2'];
  return colors[Math.floor(Math.random() * colors.length)];
};

// Helper function to get initials
const getInitials = (firstName, lastName) => {
  return (firstName[0] + lastName[0]).toUpperCase();
};

// Helper function to generate user ID
const generateUserId = (id) => {
  return `USR-${1000 + id}`;
};

// Helper function to determine status based on balance
const getStatus = (balance) => {
  if (balance >= 1000) return 'Active';
  if (balance > 0) return 'Pending';
  return 'Inactive';
};

// Helper function to determine role
const getRole = (balance) => {
  if (balance >= 5000) return 'Admin';
  if (balance >= 2000) return 'Manager';
  return 'User';
};

// Get all users
exports.getUsers = async (req, res) => {
  try {
    const [rows] = await req.db.query(`
      SELECT 
        u.id,
        u.firstName,
        u.lastName,
        u.email,
        COALESCE(a.balance, 0) as balance,
        DATE_FORMAT(u.createdAt, '%b %d, %Y') as joinDate,
        u.createdAt as createdAt
      FROM users u
      LEFT JOIN accounts a ON u.id = a.userId
      ORDER BY u.createdAt DESC
    `);

    const transformedUsers = rows.map(user => ({
      id: user.id,
      userId: generateUserId(user.id),
      name: `${user.firstName} ${user.lastName}`,
      firstName: user.firstName,
      lastName: user.lastName,
      initials: getInitials(user.firstName, user.lastName),
      email: user.email,
      balance: parseFloat(user.balance),
      role: getRole(user.balance),
      status: getStatus(user.balance),
      avatarColor: getRandomColor(),
      joinDate: user.joinDate,
      createdAt: user.createdAt,
      selected: false
    }));

    res.status(200).json({
      success: true,
      count: transformedUsers.length,
      data: transformedUsers
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users',
      error: error.message
    });
  }
};

// Get user by ID
exports.getUserById = async (req, res) => {
  try {
    const [rows] = await req.db.query(
      `SELECT 
        u.id,
        u.firstName,
        u.lastName,
        u.email,
        COALESCE(a.balance, 0) as balance,
        u.createdAt
      FROM users u
      LEFT JOIN accounts a ON u.id = a.userId
      WHERE u.id = ?`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = rows[0];
    const transformedUser = {
      id: user.id,
      userId: generateUserId(user.id),
      name: `${user.firstName} ${user.lastName}`,
      firstName: user.firstName,
      lastName: user.lastName,
      initials: getInitials(user.firstName, user.lastName),
      email: user.email,
      balance: parseFloat(user.balance),
      role: getRole(user.balance),
      status: getStatus(user.balance),
      avatarColor: getRandomColor(),
      joinDate: user.createdAt,
      createdAt: user.createdAt
    };

    res.status(200).json({
      success: true,
      data: transformedUser
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user',
      error: error.message
    });
  }
};

// Create new user
exports.createUser = async (req, res) => {
  try {
    const { firstName, lastName, email, password, phone } = req.body;

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'First name, last name, email, and password are required'
      });
    }

    const [existing] = await req.db.query(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await req.db.query(
      `INSERT INTO users (firstName, lastName, email, PASSWORD, phone, status, createdAt) 
       VALUES (?, ?, ?, ?, ?, 'active', NOW())`,
      [firstName, lastName, email, hashedPassword, phone || null]
    );

    // Create default account for user
    await req.db.query(
      `INSERT INTO accounts (userId, type, balance, currency, rib) 
       VALUES (?, 'Courant', 0.00, 'DT', ?)`,
      [result.insertId, `TN${String(result.insertId).padStart(20, '0')}`]
    );

    const [newUser] = await req.db.query(
      `SELECT 
        u.id,
        u.firstName,
        u.lastName,
        u.email,
        COALESCE(a.balance, 0) as balance,
        u.createdAt
      FROM users u
      LEFT JOIN accounts a ON u.id = a.userId
      WHERE u.id = ?`,
      [result.insertId]
    );

    const user = newUser[0];
    const transformedUser = {
      id: user.id,
      userId: generateUserId(user.id),
      name: `${user.firstName} ${user.lastName}`,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      balance: parseFloat(user.balance),
      role: getRole(user.balance),
      status: getStatus(user.balance),
      createdAt: user.createdAt
    };

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: transformedUser
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating user',
      error: error.message
    });
  }
};

// Update user
exports.updateUser = async (req, res) => {
  try {
    const { firstName, lastName, email } = req.body;

    const [existing] = await req.db.query(
      'SELECT id FROM users WHERE id = ?',
      [req.params.id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    let updateFields = [];
    let updateValues = [];

    if (firstName) {
      updateFields.push('firstName = ?');
      updateValues.push(firstName);
    }
    if (lastName) {
      updateFields.push('lastName = ?');
      updateValues.push(lastName);
    }
    if (email) {
      updateFields.push('email = ?');
      updateValues.push(email);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    updateValues.push(req.params.id);

    await req.db.query(
      `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    const [updatedUser] = await req.db.query(
      `SELECT 
        u.id,
        u.firstName,
        u.lastName,
        u.email,
        COALESCE(a.balance, 0) as balance
      FROM users u
      LEFT JOIN accounts a ON u.id = a.userId
      WHERE u.id = ?`,
      [req.params.id]
    );

    const user = updatedUser[0];
    const transformedUser = {
      id: user.id,
      userId: generateUserId(user.id),
      name: `${user.firstName} ${user.lastName}`,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      balance: parseFloat(user.balance),
      role: getRole(user.balance),
      status: getStatus(user.balance)
    };

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: transformedUser
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating user',
      error: error.message
    });
  }
};

// Delete user
exports.deleteUser = async (req, res) => {
  try {
    const [result] = await req.db.query(
      'DELETE FROM users WHERE id = ?',
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting user',
      error: error.message
    });
  }
};

// Update user status (based on balance)
exports.updateUserStatus = async (req, res) => {
  try {
    const { balance } = req.body;

    if (balance === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Balance is required to update status'
      });
    }

    // Update account balance
    const [result] = await req.db.query(
      'UPDATE accounts SET balance = ? WHERE userId = ?',
      [balance, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'User account not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'User status updated successfully',
      data: {
        id: parseInt(req.params.id),
        balance: parseFloat(balance),
        status: getStatus(balance),
        role: getRole(balance)
      }
    });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating user status',
      error: error.message
    });
  }
};

// Search users
exports.searchUsers = async (req, res) => {
  try {
    const query = `%${req.params.query}%`;

    const [rows] = await req.db.query(
      `SELECT 
        u.id,
        u.firstName,
        u.lastName,
        u.email,
        COALESCE(a.balance, 0) as balance,
        u.createdAt
      FROM users u
      LEFT JOIN accounts a ON u.id = a.userId
      WHERE u.firstName LIKE ? OR u.lastName LIKE ? OR u.email LIKE ?
      ORDER BY u.createdAt DESC`,
      [query, query, query]
    );

    const transformedUsers = rows.map(user => ({
      id: user.id,
      userId: generateUserId(user.id),
      name: `${user.firstName} ${user.lastName}`,
      firstName: user.firstName,
      lastName: user.lastName,
      initials: getInitials(user.firstName, user.lastName),
      email: user.email,
      balance: parseFloat(user.balance),
      role: getRole(user.balance),
      status: getStatus(user.balance),
      avatarColor: getRandomColor()
    }));

    res.status(200).json({
      success: true,
      count: transformedUsers.length,
      data: transformedUsers
    });
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({
      success: false,
      message: 'Error searching users',
      error: error.message
    });
  }
};

// Get user statistics
exports.getUserStats = async (req, res) => {
  try {
    const [stats] = await req.db.query(`
      SELECT 
        COUNT(DISTINCT u.id) as totalUsers,
        SUM(CASE WHEN COALESCE(a.balance, 0) >= 1000 THEN 1 ELSE 0 END) as activeUsers,
        SUM(CASE WHEN COALESCE(a.balance, 0) > 0 AND COALESCE(a.balance, 0) < 1000 THEN 1 ELSE 0 END) as pendingUsers,
        SUM(CASE WHEN COALESCE(a.balance, 0) = 0 THEN 1 ELSE 0 END) as inactiveUsers,
        SUM(COALESCE(a.balance, 0)) as totalBalance,
        AVG(COALESCE(a.balance, 0)) as averageBalance
      FROM users u
      LEFT JOIN accounts a ON u.id = a.userId
    `);

    res.status(200).json({
      success: true,
      data: {
        totalUsers: stats[0].totalUsers || 0,
        activeUsers: stats[0].activeUsers || 0,
        pendingUsers: stats[0].pendingUsers || 0,
        inactiveUsers: stats[0].inactiveUsers || 0,
        totalBalance: parseFloat(stats[0].totalBalance || 0),
        averageBalance: parseFloat(stats[0].averageBalance || 0)
      }
    });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user statistics',
      error: error.message
    });
  }
};

// Update balance only
exports.updateBalance = async (req, res) => {
  try {
    const { balance } = req.body;

    if (balance === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Balance is required'
      });
    }

    const [result] = await req.db.query(
      'UPDATE accounts SET balance = ? WHERE userId = ?',
      [balance, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'User account not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Balance updated successfully',
      data: {
        id: parseInt(req.params.id),
        balance: parseFloat(balance),
        status: getStatus(balance),
        role: getRole(balance)
      }
    });
  } catch (error) {
    console.error('Error updating balance:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating balance',
      error: error.message
    });
  }
};