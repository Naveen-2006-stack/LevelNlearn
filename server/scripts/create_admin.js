const path = require('path');
(async () => {
  try {
    require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
    const mysql = require('mysql2/promise');
    const bcrypt = require('bcryptjs');
    const { v4: uuidv4 } = require('uuid');

    const DB_HOST = process.env.DB_HOST || 'localhost';
    const DB_PORT = process.env.DB_PORT || '3306';
    const DB_USER = process.env.DB_USER || 'root';
    const DB_PASSWORD = process.env.DB_PASSWORD || '';
    const DB_NAME = process.env.DB_NAME || 'levelnlearn';

    const ADMIN_EMAIL = 'quizsrm@gmail.com';
    const ADMIN_PASSWORD = '112233';

    const hashed = await bcrypt.hash(ADMIN_PASSWORD, 10);

    const conn = await mysql.createConnection({
      host: DB_HOST,
      port: Number(DB_PORT),
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
    });

    const [rows] = await conn.execute('SELECT id FROM `User` WHERE email = ?', [ADMIN_EMAIL]);

    if (Array.isArray(rows) && rows.length > 0) {
      console.log('Existing user found — updating password, role, and verification.');
      await conn.execute(
        'UPDATE `User` SET password = ?, role = ?, emailVerified = CURRENT_TIMESTAMP, verificationToken = NULL, verificationTokenExpiry = NULL, resetToken = NULL, resetTokenExpiry = NULL WHERE email = ?',
        [hashed, 'TEACHER', ADMIN_EMAIL]
      );
    } else {
      console.log('No existing user — creating admin user.');
      const id = uuidv4();
      await conn.execute(
        'INSERT INTO `User` (id, name, email, password, role, emailVerified) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
        [id, 'QuizSrm Admin', ADMIN_EMAIL, hashed, 'TEACHER']
      );
    }

    console.log('Admin user configured:', ADMIN_EMAIL);
    await conn.end();
  } catch (err) {
    console.error('Error creating/updating admin user:', err);
    process.exit(1);
  }
})();
