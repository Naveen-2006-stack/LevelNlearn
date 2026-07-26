import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function run() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3307,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'levelnlearn',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  try {
    console.log('Adding imageUrl column to Question table...');
    await pool.query("ALTER TABLE `Question` ADD COLUMN `imageUrl` VARCHAR(255) NULL");
    console.log('Successfully added imageUrl column.');
  } catch (error: any) {
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('Column imageUrl already exists.');
    } else {
      console.error('Failed to add column:', error);
    }
  } finally {
    await pool.end();
  }
}

run();
