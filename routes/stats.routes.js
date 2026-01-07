const express = require('express');
const router = express.Router();

/**
 * GLOBAL OVERVIEW
 */
router.get('/overview', async (req, res) => {
  try {
    const db = req.db;

    const [[users]] = await db.query('SELECT COUNT(*) total FROM users');
    const [[accounts]] = await db.query('SELECT COUNT(*) total FROM accounts');
    const [[transactions]] = await db.query('SELECT COUNT(*) total FROM transactions');
    const [[cards]] = await db.query('SELECT COUNT(*) total FROM cards');
    const [[fraud]] = await db.query('SELECT COUNT(*) total FROM fraud_alerts');

    res.json({
      users: users.total,
      accounts: accounts.total,
      transactions: transactions.total,
      cards: cards.total,
      fraudAlerts: fraud.total
    });
  } catch (err) {
    console.error('Stats overview error:', err);
    res.status(500).json({ message: 'Stats error' });
  }
});

/**
 * TOTAL BALANCE
 */
router.get('/balance', async (req, res) => {
  try {
    const [[result]] = await req.db.query(
      'SELECT SUM(balance) totalBalance FROM accounts'
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Stats error' });
  }
});

/**
 * TRANSACTIONS BY TYPE
 * (incoming / outgoing)
 */
router.get('/transactions-by-type', async (req, res) => {
  try {
    const [rows] = await req.db.query(`
      SELECT 
        CASE 
          WHEN fromAccountId IS NULL THEN 'CREDIT'
          ELSE 'DEBIT'
        END AS type,
        COUNT(*) total
      FROM transactions
      GROUP BY type
    `);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Stats error' });
  }
});

/**
 * TRANSACTIONS PER DAY
 */
router.get('/transactions-per-day', async (req, res) => {
  try {
    const [rows] = await req.db.query(`
      SELECT DATE(createdAt) day, COUNT(*) total
      FROM transactions
      GROUP BY day
      ORDER BY day
    `);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Stats error' });
  }
});

/**
 * TRANSFER REQUEST STATUS
 */
router.get('/transfer-status', async (req, res) => {
  try {
    const [rows] = await req.db.query(`
      SELECT status, COUNT(*) total
      FROM transfer_requests
      GROUP BY status
    `);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Stats error' });
  }
});

module.exports = router;
