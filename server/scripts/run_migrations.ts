import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function runMigrations() {
  console.log('Connecting to database...');
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
    console.log('1. Adding ADMIN to User role ENUM...');
    await pool.query("ALTER TABLE `User` MODIFY `role` ENUM('TEACHER', 'STUDENT', 'ADMIN') NOT NULL DEFAULT 'STUDENT'");

    console.log('2. Adding isGhost column...');
    try {
      await pool.query("ALTER TABLE `User` ADD COLUMN `isGhost` TINYINT(1) NOT NULL DEFAULT 0");
    } catch (e: any) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('Column isGhost already exists, skipping.');
      } else {
        throw e;
      }
    }

    console.log('3. Modifying LiveSession foreign key constraint...');
    try {
      // It might be named differently or already dropped
      await pool.query("ALTER TABLE `LiveSession` DROP FOREIGN KEY `fk_livesession_teacher`");
    } catch (e: any) {
      console.log('Foreign key might already be dropped or missing, skipping drop.');
    }
    
    try {
      await pool.query(`
        ALTER TABLE \`LiveSession\` 
        ADD CONSTRAINT \`fk_livesession_teacher\` 
        FOREIGN KEY (\`teacherId\`) REFERENCES \`User\` (\`id\`) 
        ON DELETE CASCADE ON UPDATE CASCADE
      `);
    } catch (e: any) {
       console.log('Foreign key might already exist, skipping add.');
    }

    console.log('4. Creating Feedback table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`Feedback\` (
        \`id\`          VARCHAR(36)  NOT NULL,
        \`userId\`      VARCHAR(36)  NOT NULL,
        \`rating\`      INT          NOT NULL,
        \`message\`     TEXT         NOT NULL,
        \`createdAt\`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        KEY \`idx_feedback_userId\` (\`userId\`),

        CONSTRAINT \`fk_feedback_user\`
          FOREIGN KEY (\`userId\`) REFERENCES \`User\` (\`id\`)
          ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log('5. Promoting user to ADMIN...');
    const [result] = await pool.query<mysql.ResultSetHeader>(
      "UPDATE `User` SET `role` = 'ADMIN' WHERE `email` IN ('quizsrm@gmai.com', 'quizsrm@gmail.com')"
    );
    console.log(`Updated ${result.affectedRows} user(s) to ADMIN.`);

    console.log('6. Adding mode column to LiveSession...');
    try {
      await pool.query("ALTER TABLE `LiveSession` ADD COLUMN `mode` ENUM('NORMAL', 'UNANIMOUS') NOT NULL DEFAULT 'NORMAL'");
    } catch (e: any) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('Column mode already exists, skipping.');
      } else { throw e; }
    }

    console.log('7. Adding consentAt column to Participant...');
    try {
      await pool.query("ALTER TABLE `Participant` ADD COLUMN `consentAt` DATETIME NULL DEFAULT NULL");
    } catch (e: any) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('Column consentAt already exists, skipping.');
      } else { throw e; }
    }

    console.log('8. Adding regNo column to User...');
    try {
      await pool.query("ALTER TABLE `User` ADD COLUMN `regNo` VARCHAR(20) NULL DEFAULT NULL");
    } catch (e: any) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('Column regNo already exists, skipping.');
      } else { throw e; }
    }

    console.log('9. Adding unique index on StudentResponse (participantId, questionId) to prevent duplicate submissions...');
    try {
      await pool.query("ALTER TABLE `StudentResponse` ADD UNIQUE KEY `uq_response_participant_question` (`participantId`, `questionId`)");
    } catch (e: any) {
      if (e.code === 'ER_DUP_KEYNAME') {
        console.log('Unique key uq_response_participant_question already exists, skipping.');
      } else { throw e; }
    }

    console.log('All done!');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await pool.end();
  }
}

runMigrations();
