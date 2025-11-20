/**
 * Sigil - Zero-Dependency Database Schema Management Tool
 * Main exports for programmatic usage
 */

// AST and Types
export * from './ast/types.js';
export { Lexer } from './ast/lexer.js';
export { Parser } from './ast/parser.js';

// Generators
export { SqlGenerator } from './generators/base.js';
export { PostgresGenerator } from './generators/postgres.js';
export { MySQLGenerator } from './generators/mysql.js';
export { SQLiteGenerator } from './generators/sqlite.js';

// Engine
export { LedgerManager } from './engine/ledger.js';
export { MigrationRunner } from './engine/runner.js';
export { PostgresIntrospector } from './engine/introspector.js';

// Utilities
export { c } from './utils/colors.js';
export * from './utils/formatting.js';
