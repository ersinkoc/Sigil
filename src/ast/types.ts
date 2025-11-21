/**
 * AST Type Definitions for Sigil DSL
 * Represents the structure of parsed .sigl files
 */

export type TokenType =
  | 'MODEL'
  | 'IDENTIFIER'
  | 'TYPE'
  | 'DECORATOR'
  | 'LPAREN'
  | 'RPAREN'
  | 'LBRACE'
  | 'RBRACE'
  | 'COMMA'
  | 'DOT'
  | 'STRING'
  | 'NUMBER'
  | 'COMMENT'
  | 'RAW_SQL'
  | 'NEWLINE'
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

export interface DecoratorNode {
  name: string; // e.g., 'pk', 'unique', 'default', 'ref', 'onDelete'
  args?: string[]; // e.g., ['admin', 'guest'] for Enum, ['User.id'] for @ref
}

export interface ColumnNode {
  name: string; // e.g., 'id', 'email'
  type: string; // e.g., 'Serial', 'VarChar', 'Int'
  typeArgs?: string[]; // e.g., ['255'] for VarChar(255)
  decorators: DecoratorNode[]; // e.g., [@pk, @unique]
}

export interface ModelNode {
  name: string; // e.g., 'User', 'Post'
  columns: ColumnNode[];
}

export interface RawSqlNode {
  sql: string;
}

export interface SchemaAST {
  models: ModelNode[];
  rawSql: RawSqlNode[];
}

/**
 * Database Adapter Interface
 * Must be implemented by users for their specific database
 */
export interface DbAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  query(sql: string): Promise<any[]>;
  transaction(queries: string[]): Promise<void>;
}

/**
 * Ledger Entry
 * Tracks applied migrations
 */
export interface LedgerEntry {
  filename: string;
  hash: string;
  appliedAt: string;
  batch: number;
}

export interface Ledger {
  migrations: LedgerEntry[];
  currentBatch: number;
}

/**
 * FIX BUG-044: Add proper type for schema introspectors
 * All introspectors must implement this interface
 */
export interface SchemaIntrospector {
  introspect(schema?: string): Promise<string>;
}

/**
 * Configuration
 * FIX CRITICAL-1: Added file size validation options
 */
export interface SigilConfig {
  adapter: DbAdapter;
  generator?: SqlGenerator; // FIX BUG-045: Changed from any to SqlGenerator
  migrationsPath?: string;
  ledgerPath?: string;

  // FIX CRITICAL-1: File size validation (DoS prevention)
  /** Maximum size for a single migration file in bytes (default: 5MB) */
  maxMigrationFileSize?: number;
  /** Maximum total size for all migration files in bytes (default: 50MB) */
  maxTotalMigrationsSize?: number;
  /** Enable/disable file size validation (default: true) */
  enableFileSizeValidation?: boolean;
}

/**
 * SQL Generator interface
 * All generators must implement this interface
 */
export interface SqlGenerator {
  generateUp(ast: SchemaAST): string[];
  generateDown(ast: SchemaAST): string[];
}

/**
 * Custom Error Types
 */
export class SigilError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SigilError';
  }
}

export class IntegrityError extends SigilError {
  constructor(message: string) {
    super(message);
    this.name = 'IntegrityError';
  }
}

export class ParseError extends SigilError {
  constructor(message: string, line?: number, column?: number) {
    const location = line !== undefined && column !== undefined
      ? ` at line ${line}, column ${column}`
      : '';
    super(`Parse error${location}: ${message}`);
    this.name = 'ParseError';
  }
}

export class GeneratorError extends SigilError {
  constructor(message: string) {
    super(message);
    this.name = 'GeneratorError';
  }
}
