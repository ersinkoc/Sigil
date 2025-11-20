/**
 * Sigil Configuration
 * Define your database adapter here
 */

// Example PostgreSQL adapter
// You'll need to install 'pg' separately: npm install pg

// import pg from 'pg';
// const { Pool } = pg;

// const pool = new Pool({
//   host: 'localhost',
//   port: 5432,
//   database: 'mydb',
//   user: 'postgres',
//   password: 'password',
// });

// const adapter = {
//   async connect() {
//     // Connection is handled by the pool
//   },
//   async disconnect() {
//     await pool.end();
//   },
//   async query(sql) {
//     const result = await pool.query(sql);
//     return result.rows;
//   },
//   async transaction(queries) {
//     const client = await pool.connect();
//     try {
//       await client.query('BEGIN');
//       for (const sql of queries) {
//         await client.query(sql);
//       }
//       await client.query('COMMIT');
//     } catch (error) {
//       await client.query('ROLLBACK');
//       throw error;
//     } finally {
//       client.release();
//     }
//   },
// };

export default {
  adapter: null, // Replace with your adapter implementation
  migrationsPath: './migrations',
  ledgerPath: './.sigil_ledger.json',
};
