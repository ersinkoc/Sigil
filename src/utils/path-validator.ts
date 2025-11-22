/**
 * Path Validation Utilities
 * Prevents path traversal attacks with comprehensive validation
 * FIX: CRITICAL-5 - Enhanced path traversal prevention
 */

import { resolve, join, sep } from 'path';
import { lstatSync } from 'fs';
import { SigilError } from '../ast/types.js';

/**
 * Validation result for migration names
 */
export interface ValidationResult {
  sanitized: string;
  safe: true;
}

/**
 * Decodes URL-encoded strings multiple times to prevent double-encoding attacks
 *
 * @param input - The potentially encoded string
 * @returns Fully decoded string
 */
function decodeMultipleTimes(input: string): string {
  let decoded = input;
  let previous = '';
  let iterations = 0;
  const maxIterations = 5; // Prevent infinite loops

  // Keep decoding until no more changes or max iterations reached
  while (decoded !== previous && iterations < maxIterations) {
    previous = decoded;
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      // If decoding fails, stop
      break;
    }
    iterations++;
  }

  return decoded;
}

/**
 * Normalizes Unicode characters to prevent Unicode-based bypasses
 *
 * @param input - The string to normalize
 * @returns Normalized string in NFC form
 */
function normalizeUnicode(input: string): string {
  // Normalize to NFC (Canonical Decomposition, followed by Canonical Composition)
  return input.normalize('NFC');
}

/**
 * Validates a migration name for safe filesystem usage
 *
 * Prevents:
 * - Path traversal (../, ..\)
 * - URL encoding bypasses (%2F, %252F)
 * - Unicode bypasses (／, ＼)
 * - Special characters
 * - Overly long names
 *
 * @param name - The migration name to validate
 * @returns Validation result with sanitized name
 * @throws SigilError if name is invalid
 */
export function validateMigrationName(name: string): ValidationResult {
  if (!name || typeof name !== 'string') {
    throw new SigilError('Migration name must be a non-empty string');
  }

  // Step 1: Decode URL encoding (multiple times for double-encoding)
  let decoded = decodeMultipleTimes(name);

  // Step 2: Unicode normalization
  decoded = normalizeUnicode(decoded);

  // Step 3: Trim whitespace
  decoded = decoded.trim();

  // Step 4: Check for empty after processing
  if (decoded.length === 0) {
    throw new SigilError('Migration name cannot be empty');
  }

  // Step 5: Character whitelist check
  // Only allow: a-z, A-Z, 0-9, underscore, hyphen
  if (!/^[a-zA-Z0-9_-]+$/.test(decoded)) {
    throw new SigilError(
      `Invalid migration name: "${name}". ` +
      `Only alphanumeric characters, underscores, and hyphens are allowed.`
    );
  }

  // Step 6: Length check (prevent extremely long filenames)
  if (decoded.length > 100) {
    throw new SigilError(
      `Migration name too long: "${name}". ` +
      `Maximum length is 100 characters (current: ${decoded.length}).`
    );
  }

  // Step 7: Must start with alphanumeric character
  if (!/^[a-zA-Z0-9]/.test(decoded)) {
    throw new SigilError(
      `Migration name must start with a letter or number: "${name}"`
    );
  }

  return {
    sanitized: decoded,
    safe: true,
  };
}

/**
 * Validates a migration file path to prevent path traversal attacks
 *
 * Uses canonicalization to ensure the resolved path stays within
 * the migrations directory.
 *
 * @param name - The migration name
 * @param migrationsDir - The migrations directory path
 * @returns Validated absolute file path
 * @throws SigilError if path validation fails
 */
export function validateMigrationPath(
  name: string,
  migrationsDir: string
): string {
  // Step 1: Validate the name
  const { sanitized } = validateMigrationName(name);

  // Step 2: Build the proposed path
  const filename = `${sanitized}.sigl`;
  const proposedPath = join(migrationsDir, filename);

  // Step 3: Canonicalize both paths
  const resolvedProposed = resolve(proposedPath);
  const resolvedMigrationsDir = resolve(migrationsDir);

  // Step 4: Verify the resolved path starts with migrations directory
  // This prevents path traversal via symlinks or .. sequences
  if (!resolvedProposed.startsWith(resolvedMigrationsDir + sep)) {
    throw new SigilError(
      `Path traversal detected: "${name}". ` +
      `Migration files must be created within the migrations directory.`
    );
  }

  // Step 5: Additional safety - Check for symlinks in the path
  try {
    // Check if the parent directory is a symlink
    const parentDir = resolve(migrationsDir);
    const stats = lstatSync(parentDir);

    if (stats.isSymbolicLink()) {
      throw new SigilError(
        `Symlinks are not allowed in the migrations path: "${migrationsDir}"`
      );
    }
  } catch (error) {
    // If directory doesn't exist yet, that's fine
    // lstatSync will throw ENOENT
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      // Re-throw if it's a different error (like symlink detection)
      throw error;
    }
  }

  // Step 6: Prevent absolute path injection (Windows: C:\, Unix: /)
  if (name.includes(':') || name.startsWith('/') || name.startsWith('\\')) {
    throw new SigilError(
      `Absolute paths are not allowed in migration names: "${name}"`
    );
  }

  // Step 7: Prevent UNC paths (Windows network paths: \\server\share)
  if (name.startsWith('\\\\') || name.startsWith('//')) {
    throw new SigilError(
      `Network paths are not allowed in migration names: "${name}"`
    );
  }

  return resolvedProposed;
}

/**
 * Validates that a file path is within an allowed directory
 * Generic version for other use cases beyond migrations
 *
 * @param filePath - The file path to validate
 * @param allowedDir - The allowed directory
 * @returns True if path is safe
 * @throws SigilError if path is outside allowed directory
 */
export function validatePathWithinDirectory(
  filePath: string,
  allowedDir: string
): boolean {
  const resolvedFile = resolve(filePath);
  const resolvedDir = resolve(allowedDir);

  if (!resolvedFile.startsWith(resolvedDir + sep)) {
    throw new SigilError(
      `Path "${filePath}" is outside allowed directory "${allowedDir}"`
    );
  }

  return true;
}
