/**
 * File Validation Utilities
 * Prevents resource exhaustion via file size validation
 * FIX: CRITICAL-1 - File size validation for DoS prevention
 */

import { stat } from 'fs/promises';
import { SigilError } from '../ast/types.js';

/**
 * Default file size limits (in bytes)
 */
export const DEFAULT_MAX_MIGRATION_FILE_SIZE = 5 * 1024 * 1024; // 5MB
export const DEFAULT_MAX_TOTAL_MIGRATIONS_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * File size validation error
 */
export class FileSizeError extends SigilError {
  constructor(
    message: string,
    public filePath: string,
    public actualSize: number,
    public maxSize: number
  ) {
    super(message);
    this.name = 'FileSizeError';
  }
}

/**
 * Gets the size of a file in bytes
 *
 * @param filePath - Path to the file
 * @returns File size in bytes
 * @throws SigilError if file cannot be accessed
 */
export async function getFileSize(filePath: string): Promise<number> {
  try {
    const stats = await stat(filePath);
    return stats.size;
  } catch (error) {
    throw new SigilError(
      `Cannot get file size for "${filePath}": ${(error as Error).message}`
    );
  }
}

/**
 * Validates that a file is within the size limit
 *
 * @param filePath - Path to the file
 * @param maxSize - Maximum allowed size in bytes
 * @returns File size if valid
 * @throws FileSizeError if file exceeds limit
 */
export async function validateFileSize(
  filePath: string,
  maxSize: number
): Promise<number> {
  const fileSize = await getFileSize(filePath);

  if (fileSize > maxSize) {
    const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
    const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(2);

    throw new FileSizeError(
      `Migration file too large: "${filePath}"\n` +
      `  File size: ${fileSizeMB}MB\n` +
      `  Maximum allowed: ${maxSizeMB}MB\n\n` +
      `This limit prevents resource exhaustion attacks. If you need to increase the limit,\n` +
      `add 'maxMigrationFileSize' to your sigil.config.js file.`,
      filePath,
      fileSize,
      maxSize
    );
  }

  return fileSize;
}

/**
 * Validates the total size of multiple files
 *
 * @param filePaths - Array of file paths
 * @param maxTotalSize - Maximum allowed total size in bytes
 * @returns Total size of all files
 * @throws FileSizeError if total exceeds limit
 */
export async function validateTotalSize(
  filePaths: string[],
  maxTotalSize: number
): Promise<number> {
  let totalSize = 0;
  const fileSizes: { path: string; size: number }[] = [];

  // Calculate total size
  for (const filePath of filePaths) {
    const size = await getFileSize(filePath);
    totalSize += size;
    fileSizes.push({ path: filePath, size });
  }

  if (totalSize > maxTotalSize) {
    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
    const maxTotalSizeMB = (maxTotalSize / (1024 * 1024)).toFixed(2);

    // Find the largest files for the error message
    const largestFiles = fileSizes
      .sort((a, b) => b.size - a.size)
      .slice(0, 5)
      .map(f => `  - ${f.path}: ${(f.size / (1024 * 1024)).toFixed(2)}MB`)
      .join('\n');

    throw new FileSizeError(
      `Total migration files size exceeds limit\n` +
      `  Total size: ${totalSizeMB}MB\n` +
      `  Maximum allowed: ${maxTotalSizeMB}MB\n` +
      `  Number of files: ${filePaths.length}\n\n` +
      `Largest files:\n${largestFiles}\n\n` +
      `Consider archiving old migrations or increasing 'maxTotalMigrationsSize'\n` +
      `in your sigil.config.js file.`,
      '<multiple files>',
      totalSize,
      maxTotalSize
    );
  }

  return totalSize;
}

/**
 * Formats bytes to human-readable format
 *
 * @param bytes - Number of bytes
 * @returns Formatted string (e.g., "1.5 MB")
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
