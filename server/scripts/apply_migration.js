const fs = require('fs');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node apply_migration.js <path-to-sql-file>');
    process.exit(2);
  }

  const sql = fs.readFileSync(file, 'utf8');

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'levelnlearn',
    multipleStatements: true,
  });

  try {
    console.log('Applying migration:', file);
    const statements = sql;
    await conn.query(statements);
    console.log('Migration applied successfully.');
    await conn.end();
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    await conn.end();
    process.exit(1);
  }
}

main();
