const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/orders',
});

const db = {
  async query(text, params) {
    const result = await pool.query(text, params);
    return result.rows;
  },

  async execute(text, params) {
    await pool.query(text, params);
  },

  async scalar(text, params) {
    const result = await pool.query(text, params);
    return result.rows[0] || null;
  },
};

module.exports = db;
