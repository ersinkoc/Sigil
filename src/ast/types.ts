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
 * FIX MEDIUM-1: Added logging configuration
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

  // FIX MEDIUM-1: Logging configuration (Audit trail)
  logging?: {
    /** Enable console output (default: true) */
    console?: boolean;
    /** File path for JSON logs (default: null, disabled) */
    file?: string | null;
    /** Minimum log level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SECURITY' (default: 'INFO') */
    level?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SECURITY';
    /** Enable security audit logging (default: true) */
    auditTrail?: boolean;
  };

  // FIX MEDIUM-3: Configurable lock timeout
  /** Lock timeout in milliseconds (default: 30000ms / 30s) */
  lockTimeout?: number;
  /** Lock retry delay in milliseconds (default: 100ms) */
  lockRetryDelay?: number;

  // FIX LOW-4: Performance metrics hooks
  /** Optional performance metrics callback for monitoring and telemetry */
  metrics?: {
    /**
     * Called when a migration completes (success or failure)
     * @param event - Metric event data
     */
    onMigrationComplete?: (event: MigrationMetricEvent) => void | Promise<void>;
    /**
     * Called when a rollback completes (success or failure)
     * @param event - Metric event data
     */
    onRollbackComplete?: (event: RollbackMetricEvent) => void | Promise<void>;
    /**
     * Called when lock acquisition succeeds
     * @param event - Metric event data
     */
    onLockAcquired?: (event: LockMetricEvent) => void | Promise<void>;
  };
}

/**
 * FIX LOW-4: Metric event for migration operations
 */
export interface MigrationMetricEvent {
  /** Migration filename */
  filename: string;
  /** Operation: 'up' or 'down' */
  operation: 'up' | 'down';
  /** Duration in milliseconds */
  duration: number;
  /** Number of SQL statements executed */
  sqlStatements: number;
  /** Whether the operation succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Batch number */
  batch: number;
}

/**
 * FIX LOW-4: Metric event for rollback operations
 */
export interface RollbackMetricEvent {
  /** Total migrations rolled back */
  count: number;
  /** Total duration in milliseconds */
  duration: number;
  /** Batch number that was rolled back */
  batch: number;
  /** Whether the operation succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * FIX LOW-4: Metric event for lock operations
 */
export interface LockMetricEvent {
  /** Lock file path */
  lockPath: string;
  /** Time taken to acquire lock in milliseconds */
  duration: number;
  /** Number of retry attempts */
  retries: number;
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
 * FIX LOW-2: Documented error handling hierarchy
 *
 * Error Hierarchy:
 * - SigilError (base): General errors in Sigil operations
 *   - IntegrityError: Migration integrity violations (hash mismatch, missing files, ledger corruption, lock failures)
 *   - ParseError: Syntax errors in .sigl migration files
 *   - GeneratorError: SQL generation failures
 *
 * Usage Guidelines:
 * - Catch SigilError to handle all Sigil-specific errors
 * - Catch specific subtypes (IntegrityError, ParseError) for targeted handling
 * - All errors include descriptive messages with context
 * - IntegrityError and ParseError may have additional properties (cause, line, column)
 *
 * Examples:
 *   try {
 *     await runner.up();
 *   } catch (error) {
 *     if (error instanceof IntegrityError) {
 *       // Handle ledger/migration integrity issues
 *     } else if (error instanceof ParseError) {
 *       // Handle syntax errors in migration files
 *     } else if (error instanceof SigilError) {
 *       // Handle other Sigil errors
 *     }
 *   }
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
