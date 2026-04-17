const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('render.com')
    ? { rejectUnauthorized: false }
    : false,
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reminders (
      id SERIAL PRIMARY KEY,
      phone_number TEXT NOT NULL,
      reminder_time TIMESTAMPTZ NOT NULL,
      message TEXT,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS verified_phones (
      phone_number TEXT PRIMARY KEY,
      verification_code TEXT,
      code_expires_at TIMESTAMPTZ,
      verified_at TIMESTAMPTZ
    )
  `);

  console.log('Database tables ready');
}

async function createReminder(phoneNumber, reminderTime, message) {
  const result = await pool.query(
    `INSERT INTO reminders (phone_number, reminder_time, message)
     VALUES ($1, $2, $3) RETURNING *`,
    [phoneNumber, reminderTime, message || null]
  );
  return result.rows[0];
}

async function getPendingReminders() {
  const result = await pool.query(
    `SELECT * FROM reminders WHERE status = 'pending' ORDER BY reminder_time`
  );
  return result.rows;
}

async function deleteReminder(id) {
  const result = await pool.query(
    `UPDATE reminders SET status = 'cancelled' WHERE id = $1 AND status = 'pending' RETURNING *`,
    [id]
  );
  return result.rows[0];
}

async function markFired(id) {
  await pool.query(
    `UPDATE reminders SET status = 'fired' WHERE id = $1`,
    [id]
  );
}

// Verification helpers
async function saveVerificationCode(phoneNumber, code, expiresAt) {
  await pool.query(
    `INSERT INTO verified_phones (phone_number, verification_code, code_expires_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (phone_number) DO UPDATE
     SET verification_code = $2, code_expires_at = $3, verified_at = NULL`,
    [phoneNumber, code, expiresAt]
  );
}

async function checkVerificationCode(phoneNumber, code) {
  const result = await pool.query(
    `SELECT * FROM verified_phones
     WHERE phone_number = $1 AND verification_code = $2 AND code_expires_at > NOW()`,
    [phoneNumber, code]
  );
  if (result.rows.length === 0) return false;

  await pool.query(
    `UPDATE verified_phones SET verified_at = NOW(), verification_code = NULL WHERE phone_number = $1`,
    [phoneNumber]
  );
  return true;
}

async function isPhoneVerified(phoneNumber) {
  const result = await pool.query(
    `SELECT verified_at FROM verified_phones WHERE phone_number = $1 AND verified_at IS NOT NULL`,
    [phoneNumber]
  );
  return result.rows.length > 0;
}

module.exports = {
  pool,
  initDb,
  createReminder,
  getPendingReminders,
  deleteReminder,
  markFired,
  saveVerificationCode,
  checkVerificationCode,
  isPhoneVerified,
};
