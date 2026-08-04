const mysql = require('mysql2/promise');
require('dotenv').config();
async function run() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'levelnlearn',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306,
  });
  try {
    await pool.query('ALTER TABLE Participant ADD COLUMN regNo VARCHAR(20) NULL');
    console.log('Added regNo to Participant');
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') {
      console.log('regNo already exists in Participant');
    } else {
      console.error(e);
    }
  }
  process.exit(0);
}
run();