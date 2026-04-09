// backend/src/db/index.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://clipflow:clipflow_secret@localhost:5432/clipflow',
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === 'development') {
    console.log('executed query', { text: text.substring(0, 80), duration, rows: res.rowCount });
  }
  return res;
}

module.exports = { pool, query };
