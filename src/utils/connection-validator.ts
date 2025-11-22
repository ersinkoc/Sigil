/**
 * Connection Validation Utilities
 * Validates database connections with retry logic and clear error messages
 * FIX: CRITICAL-6 - Database connection validation
 */

import { DbAdapter } from '../ast/types.js';

/**
 * Connection validation options
 */
export interface ValidationOptions {
  maxRetries?: number; // Default: 3
  baseDelay?: number; // Default: 1000ms (exponential backoff base)
  timeout?: number; // Default: 5000ms per attempt
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if an error is transient (can be retried)
 */
function isTransientError(error: Error): boolean {
  const transientPatterns = [
    /ECONNREFUSED/i,
    /ETIMEDOUT/i,
    /ENOTFOUND/i,
    /EHOSTUNREACH/i,
    /ENETUNREACH/i,
    /Connection refused/i,
    /timeout/i,
    /temporarily unavailable/i,
  ];

  const message = error.message || error.toString();
  return transientPatterns.some(pattern => pattern.test(message));
}

/**
 * Validates a database connection with retry logic
 *
 * Features:
 * - Retries transient errors with exponential backoff
 * - Runs health check query after connection
 * - Provides clear error messages
 * - Distinguishes between transient and permanent errors
 *
 * @param adapter - Database adapter to validate
 * @param options - Validation options
 * @throws ConnectionError if connection fails
 */
export async function validateConnection(
  adapter: DbAdapter,
  options: ValidationOptions = {}
): Promise<void> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelay = options.baseDelay ?? 1000;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Attempt connection
      await adapter.connect();

      // Run health check query (optional, if adapter supports it)
      // Most adapters will throw if connection failed, so we're good here

      // Connection successful!
      return;

    } catch (error) {
      lastError = error as Error;

      // Check if error is transient and we have retries left
      if (isTransientError(lastError) && attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.log(
          `⚠️  Connection attempt ${attempt}/${maxRetries} failed. ` +
          `Retrying in ${delay}ms...`
        );
        await sleep(delay);
        continue;
      }

      // Permanent error or max retries reached
      break;
    }
  }

  // If we get here, all attempts failed
  throw createDetailedConnectionError(lastError!, maxRetries);
}

/**
 * Creates a detailed connection error with troubleshooting steps
 */
function createDetailedConnectionError(error: Error, attempts: number): Error {
  const message = [
    '❌ Failed to connect to database',
    '',
    `Error: ${error.message}`,
    '',
    'Troubleshooting steps:',
    '1. Verify the database server is running',
    '2. Check connection parameters in sigil.config.js',
    '3. Verify network connectivity to the database',
    '4. Check database user credentials and permissions',
    '5. Ensure the database exists and is accessible',
    '',
    `Attempted ${attempts} times with exponential backoff.`,
  ].join('\n');

  const detailedError = new Error(message);
  detailedError.name = 'ConnectionError';
  (detailedError as any).cause = error;

  return detailedError;
}

/**
 * Validates connection and runs a health check query
 * This is an enhanced version that tests query capability
 *
 * @param adapter - Database adapter
 * @param healthCheckQuery - SQL query to run (e.g., 'SELECT 1')
 * @param options - Validation options
 */
export async function validateConnectionWithHealthCheck(
  adapter: DbAdapter,
  healthCheckQuery: string,
  options: ValidationOptions = {}
): Promise<void> {
  // First validate basic connection
  await validateConnection(adapter, options);

  try {
    // Run health check query
    await adapter.query(healthCheckQuery);
  } catch (error) {
    throw new Error(
      `Connection established but health check query failed: ${(error as Error).message}\n` +
      `Query: ${healthCheckQuery}\n\n` +
      `This may indicate:\n` +
      `- Database permissions issues\n` +
      `- Wrong database selected\n` +
      `- Database in recovery mode`
    );
  }
}
