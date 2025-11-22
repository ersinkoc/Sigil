/**
 * SQL Identifier Escaping Utilities
 * Provides safe escaping for SQL identifiers to prevent SQL injection
 * FIX LOW-1: Extracted magic numbers to named constants
 */

import { SigilError } from '../ast/types.js';

/**
 * FIX LOW-1: Database-specific identifier length limits
 * PostgreSQL: 63 characters (NAMEDATALEN - 1)
 * MySQL: 64 characters
 * SQLite: 256 characters
 * Oracle: 30 characters (128 in 12.2+)
 *
 * Using PostgreSQL's limit as default for maximum compatibility
 */
export const MAX_IDENTIFIER_LENGTH_POSTGRES = 63;
export const MAX_IDENTIFIER_LENGTH_MYSQL = 64;
export const MAX_IDENTIFIER_LENGTH_SQLITE = 256;
export const MAX_IDENTIFIER_LENGTH_DEFAULT = MAX_IDENTIFIER_LENGTH_POSTGRES;

/**
 * Validates and escapes a SQL identifier (schema, table, column name)
 * Prevents SQL injection by ensuring identifier contains only safe characters
 *
 * @param identifier - The identifier to validate and escape
 * @param type - Type of identifier for error messages
 * @param maxLength - Maximum allowed length (default: PostgreSQL limit of 63)
 * @returns Safely escaped identifier
 * @throws SigilError if identifier contains dangerous characters
 */
export function escapeSqlIdentifier(
  identifier: string,
  type: string = 'identifier',
  maxLength: number = MAX_IDENTIFIER_LENGTH_DEFAULT
): string {
  if (!identifier || typeof identifier !== 'string') {
    throw new SigilError(`Invalid ${type}: must be a non-empty string`);
  }

  // Trim whitespace
  identifier = identifier.trim();

  // Check for empty after trim
  if (identifier.length === 0) {
    throw new SigilError(`Invalid ${type}: cannot be empty`);
  }

  // Check for dangerous characters that could indicate SQL injection
  // Allow: letters, numbers, underscores, hyphens, dots (for qualified names)
  // Disallow: quotes, semicolons, backslash, forward slash, asterisk, hash
  const dangerousPattern = /[;'"\\/*#]/;
  if (dangerousPattern.test(identifier)) {
    throw new SigilError(
      `Invalid ${type}: "${identifier}" contains dangerous characters. ` +
      `Identifiers can only contain letters, numbers, underscores, hyphens, and dots.`
    );
  }

  // NOTE: SQL keyword detection removed as security control (CRITICAL-3 fix)
  // Escaping provides sufficient protection against SQL injection
  // Users can use SQL keywords as identifiers - they will be properly escaped

  // Validate format: must start with letter or underscore
  if (!/^[a-zA-Z_]/.test(identifier)) {
    throw new SigilError(
      `Invalid ${type}: "${identifier}" must start with a letter or underscore`
    );
  }

  // Validate overall format
  // Allow: alphanumeric, underscore, hyphen, and dot (for qualified names like schema.table)
  if (!/^[a-zA-Z_][a-zA-Z0-9_.\-]*$/.test(identifier)) {
    throw new SigilError(
      `Invalid ${type}: "${identifier}" contains invalid characters. ` +
      `Use only letters, numbers, underscores, hyphens, and dots.`
    );
  }

  // FIX LOW-1: Check length using configurable max (prevent extremely long identifiers)
  if (identifier.length > maxLength) {
    throw new SigilError(
      `Invalid ${type}: "${identifier}" is too long. Maximum length is ${maxLength} characters.`
    );
  }

  return identifier;
}

/**
 * Escapes a PostgreSQL identifier by wrapping in double quotes and escaping internal quotes
 *
 * @param identifier - The identifier to escape
 * @returns Quoted and escaped identifier safe for PostgreSQL
 */
export function escapePostgresIdentifier(identifier: string): string {
  // First validate the identifier
  const validated = escapeSqlIdentifier(identifier, 'PostgreSQL identifier');

  // Escape any double quotes in the identifier by doubling them
  const escaped = validated.replace(/"/g, '""');

  // Wrap in double quotes
  return `"${escaped}"`;
}

/**
 * Escapes a MySQL identifier by wrapping in backticks and escaping internal backticks
 *
 * @param identifier - The identifier to escape
 * @returns Quoted and escaped identifier safe for MySQL
 */
export function escapeMySQLIdentifier(identifier: string): string {
  // First validate the identifier
  const validated = escapeSqlIdentifier(identifier, 'MySQL identifier');

  // Escape any backticks in the identifier by doubling them
  const escaped = validated.replace(/`/g, '``');

  // Wrap in backticks
  return `\`${escaped}\``;
}

/**
 * Escapes a string literal for use in SQL queries
 * Prevents SQL injection in string values
 *
 * @param value - The string value to escape
 * @returns Safely escaped string literal
 */
export function escapeSqlStringLiteral(value: string): string {
  if (typeof value !== 'string') {
    throw new SigilError('Value must be a string');
  }

  // Escape single quotes by doubling them (SQL standard)
  const escaped = value.replace(/'/g, "''");

  // Wrap in single quotes
  return `'${escaped}'`;
}
