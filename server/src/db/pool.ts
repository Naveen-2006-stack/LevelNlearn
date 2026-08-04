import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL || `postgresql://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || ''}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'postgres'}`;

const pgPool = new pg.Pool({
  connectionString,
  ssl: connectionString.includes('supabase') || connectionString.includes('co') ? { rejectUnauthorized: false } : undefined
});

export const pool = {
  async query<T = any>(sql: string, params?: any[]): Promise<[T[], any]> {
    // 1. Replace MySQL backticks `...` with Postgres double quotes "..."
    let finalSql = sql.replace(/`/g, '"');

    // 2. Wrap table names in double quotes if not already quoted (prevents collisions with reserved keywords like User)
    const tableNames = [
      'User', 'Account', 'Session', 'VerificationToken', 
      'Quiz', 'Question', 'LiveSession', 'Participant', 
      'StudentResponse', 'Violation', 'Feedback'
    ];
    for (const table of tableNames) {
      const regex = new RegExp(`(?<!")\\b${table}\\b(?!")`, 'g');
      finalSql = finalSql.replace(regex, `"${table}"`);
    }

    // 3. Wrap camelCase column names in double quotes (prevents case folding to lowercase in PostgreSQL)
    finalSql = finalSql.replace(/(?<!")\b([a-z]+[A-Z][a-zA-Z]*)\b(?!")/g, '"$1"');

    // 4. Replace MySQL parameter placeholders '?' with PostgreSQL '$1', '$2', etc.
    let paramCount = 0;
    finalSql = finalSql.replace(/\?/g, () => {
      paramCount++;
      return `$${paramCount}`;
    });

    try {
      const res = await pgPool.query(finalSql, params);
      return [res.rows as unknown as T[], null];
    } catch (error) {
      console.error('[DB Query Error]', { sql, finalSql, params, error });
      throw error;
    }
  },

  async end() {
    await pgPool.end();
  }
};
