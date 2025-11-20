/**
 * Example Sigil Configuration
 * Copy this file to your project root as sigil.config.js and modify as needed
 */

// Example PostgreSQL adapter using the 'pg' library
// Install it with: npm install pg

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'mydb',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
});

const adapter = {
  async connect() {
    // Connection is managed by the pool
    console.log('Database pool ready');
  },

  async disconnect() {
    await pool.end();
    console.log('Database pool closed');
  },

  async query(sql) {
    const result = await pool.query(sql);
    return result.rows;
  },

  async transaction(queries) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const sql of queries) {
        await client.query(sql);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },
};

export default {
  adapter,
  migrationsPath: './migrations',
  ledgerPath: './.sigil_ledger.json',
};
