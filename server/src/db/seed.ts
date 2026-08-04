import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { pool } from './pool.js';
import dotenv from 'dotenv';

dotenv.config();

async function seed() {
  const email = 'demo@srmist.edu.in';
  const password = 'password123';
  const name = 'Demo Teacher';

  const [existing] = await pool.query<any[]>('SELECT id FROM User WHERE email = ?', [email]);
  if ((existing as any[]).length > 0) {
    console.log('Demo account already exists:', email);
    await pool.end();
    return;
  }

  const id = uuidv4();
  const hashed = await bcrypt.hash(password, 10);
  await pool.query(
    'INSERT INTO User (id, name, email, password, role, emailVerified) VALUES (?, ?, ?, ?, ?, ?)',
    [id, name, email, hashed, 'TEACHER', new Date()]
  );
  console.log(`Created demo account: ${email} / ${password}`);
  await pool.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
