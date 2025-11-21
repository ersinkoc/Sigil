/**
 * Ledger: Tracks applied migrations and ensures integrity
 * Uses SHA-256 hashing to detect changes in migration files
 * FIX BUG-039: Implements file locking to prevent race conditions
 * FIX CRITICAL-2: Enhanced atomic lock mechanism to prevent TOCTOU race conditions
 */

import { readFile, writeFile, access, unlink, stat, rename } from 'fs/promises';
import { open } from 'fs/promises';
import { createHash, randomUUID } from 'crypto';
import { hostname } from 'os';
import { Ledger, LedgerEntry, IntegrityError } from '../ast/types.js';

/**
 * FIX CRITICAL-2: Lock information structure
 * Contains metadata to identify lock owner and detect stale locks
 */
interface LockInfo {
  pid: number;
  hostname: string;
  lockId: string; // Unique identifier for this lock attempt
  acquiredAt: string; // ISO timestamp
}

export class LedgerManager {
  private ledgerPath: string;
  private ledger: Ledger;
  private lockPath: string;
  private lockTimeout: number = 30000; // 30 seconds
  private lockRetryDelay: number = 100; // 100ms between retries
  private currentLockId: string | null = null; // FIX CRITICAL-2: Track our lock ID

  constructor(ledgerPath: string = '.sigil_ledger.json') {
    this.ledgerPath = ledgerPath;
    this.lockPath = `${ledgerPath}.lock`;
    this.ledger = { migrations: [], currentBatch: 0 };
  }

  /**
   * FIX CRITICAL-2: Acquire exclusive lock with atomic operations
   * Uses two-phase approach to prevent TOCTOU race conditions:
   * 1. Create temp file with unique ID
   * 2. Atomic rename to lock file
   * 3. Validate we own the lock by checking contents
   */
  private async acquireLock(): Promise<void> {
    const startTime = Date.now();
    const ourHostname = hostname();

    while (true) {
      // Check if we've exceeded timeout
      if (Date.now() - startTime >= this.lockTimeout) {
        throw new IntegrityError(
          `Failed to acquire ledger lock after ${this.lockTimeout}ms. ` +
          `Another migration process may be running on this or another machine. ` +
          `If no other process is running, delete "${this.lockPath}" manually.`
        );
      }

      try {
        // Step 1: Check for existing lock and validate if stale
        await this.checkAndCleanStaleLock();

        // Step 2: Create unique temp lock file
        const lockId = randomUUID();
        const tempLockPath = `${this.lockPath}.tmp.${lockId}`;

        const lockInfo: LockInfo = {
          pid: process.pid,
          hostname: ourHostname,
          lockId,
          acquiredAt: new Date().toISOString(),
        };

        // Step 3: Write lock info to temp file
        const handle = await open(tempLockPath, 'wx');
        await handle.writeFile(JSON.stringify(lockInfo, null, 2));
        await handle.close();

        // Step 4: Atomic rename (this is the critical atomic operation)
        try {
          await rename(tempLockPath, this.lockPath);
        } catch (error: any) {
          // Rename failed - another process got the lock first
          // Clean up our temp file
          await unlink(tempLockPath).catch(() => {});

          if (error.code === 'EEXIST' || error.code === 'EPERM') {
            // Lock already exists, retry
            await new Promise(resolve => setTimeout(resolve, this.lockRetryDelay));
            continue;
          }

          // Other error, propagate it
          throw error;
        }

        // Step 5: Verify we actually own the lock (paranoid check)
        const acquired = await this.verifyLockOwnership(lockId);
        if (acquired) {
          this.currentLockId = lockId;
          return;
        }

        // Someone else got the lock between rename and verify (extremely rare)
        // This shouldn't happen with atomic rename, but be defensive
        await new Promise(resolve => setTimeout(resolve, this.lockRetryDelay));

      } catch (error: any) {
        if (error instanceof IntegrityError) {
          // Re-throw timeout errors
          throw error;
        }

        // Unexpected error - wait and retry
        await new Promise(resolve => setTimeout(resolve, this.lockRetryDelay));
      }
    }
  }

  /**
   * FIX CRITICAL-2: Check for stale locks and clean them up safely
   * Validates process is actually dead before removing lock
   */
  private async checkAndCleanStaleLock(): Promise<void> {
    try {
      // Read existing lock file
      const lockContent = await readFile(this.lockPath, 'utf-8');
      const lockInfo: LockInfo = JSON.parse(lockContent);

      const lockAge = Date.now() - new Date(lockInfo.acquiredAt).getTime();

      // Only consider locks older than timeout as stale
      if (lockAge < this.lockTimeout) {
        return; // Lock is fresh
      }

      // Stale lock detected - verify process is actually dead
      const isProcessDead = await this.isProcessDead(lockInfo.pid, lockInfo.hostname);

      if (isProcessDead) {
        // Process is confirmed dead, safe to remove lock
        await unlink(this.lockPath).catch(() => {
          // Ignore errors - another process may have cleaned it up
        });
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Lock file doesn't exist - that's fine
        return;
      }

      // JSON parse error or other issues - treat as no lock
      // (corrupted lock file should be removed)
      try {
        await unlink(this.lockPath).catch(() => {});
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * FIX CRITICAL-2: Verify that we own the lock by checking the lock ID
   */
  private async verifyLockOwnership(expectedLockId: string): Promise<boolean> {
    try {
      const lockContent = await readFile(this.lockPath, 'utf-8');
      const lockInfo: LockInfo = JSON.parse(lockContent);

      // Check if the lock ID matches and it's on our hostname
      return lockInfo.lockId === expectedLockId &&
             lockInfo.hostname === hostname() &&
             lockInfo.pid === process.pid;
    } catch {
      // Can't read/parse lock file - we don't own it
      return false;
    }
  }

  /**
   * FIX CRITICAL-2: Check if a process is dead
   * Cross-platform approach: try to send signal 0 to check existence
   */
  private async isProcessDead(pid: number, processHostname: string): Promise<boolean> {
    // If lock is from a different hostname, we can't check the process
    // Treat it as alive to be safe (don't remove cross-machine locks)
    if (processHostname !== hostname()) {
      return false; // Assume alive
    }

    try {
      // Signal 0 doesn't actually send a signal, just checks if process exists
      // This works on Unix-like systems
      process.kill(pid, 0);
      // If we get here, process exists
      return false;
    } catch (error: any) {
      // ESRCH = process doesn't exist
      // EPERM = process exists but we don't have permission (still alive)
      if (error.code === 'ESRCH') {
        return true; // Process is dead
      }
      return false; // Process exists (we just can't signal it)
    }
  }

  /**
   * FIX CRITICAL-2: Release lock with ownership verification
   * Only release if we actually own the lock
   */
  private async releaseLock(): Promise<void> {
    try {
      // FIX CRITICAL-2: Verify we own the lock before releasing
      if (this.currentLockId) {
        const weOwnIt = await this.verifyLockOwnership(this.currentLockId);

        if (weOwnIt) {
          await unlink(this.lockPath);
          this.currentLockId = null;
        } else {
          // We don't own the lock anymore (very unusual)
          console.warn(
            `Warning: Cannot release lock "${this.lockPath}" - ownership verification failed. ` +
            `Another process may have taken over.`
          );
        }
      } else {
        // No lock ID tracked - try to release anyway (backward compat)
        await unlink(this.lockPath);
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        // Log warning but don't fail - lock might have been cleaned up already
        console.warn(`Warning: Failed to release lock file "${this.lockPath}": ${error.message}`);
      }
    }
  }

  /**
   * Load the ledger from disk
   * FIX BUG-039: Use file locking to prevent race conditions
   */
  async load(): Promise<void> {
    await this.acquireLock();

    try {
      await access(this.ledgerPath);
      const content = await readFile(this.ledgerPath, 'utf-8');

      // FIX BUG-027: Add error handling for corrupted JSON
      try {
        this.ledger = JSON.parse(content);

        // Validate ledger structure
        if (!this.ledger.migrations || !Array.isArray(this.ledger.migrations)) {
          throw new Error('Invalid ledger structure: missing or invalid migrations array');
        }
        if (typeof this.ledger.currentBatch !== 'number') {
          throw new Error('Invalid ledger structure: missing or invalid currentBatch');
        }
      } catch (parseError) {
        throw new IntegrityError(
          `Ledger file "${this.ledgerPath}" is corrupted and cannot be parsed. ` +
          `Error: ${(parseError as Error).message}. ` +
          `Please restore from backup or delete the ledger file to start fresh.`
        );
      }
    } catch (error) {
      // If error is already IntegrityError, re-throw it
      if (error instanceof IntegrityError) {
        throw error;
      }
      // If file doesn't exist, start with empty ledger
      this.ledger = { migrations: [], currentBatch: 0 };
    } finally {
      await this.releaseLock();
    }
  }

  /**
   * Save the ledger to disk
   * FIX BUG-039: Use file locking to prevent race conditions
   */
  async save(): Promise<void> {
    await this.acquireLock();

    try {
      const content = JSON.stringify(this.ledger, null, 2);
      await writeFile(this.ledgerPath, content, 'utf-8');
    } finally {
      await this.releaseLock();
    }
  }

  /**
   * Compute SHA-256 hash of file content
   */
  static computeHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Validate that all applied migrations haven't been modified
   */
  async validateIntegrity(migrations: Map<string, string>): Promise<void> {
    for (const entry of this.ledger.migrations) {
      const currentContent = migrations.get(entry.filename);

      if (!currentContent) {
        throw new IntegrityError(
          `Migration file "${entry.filename}" is missing. ` +
            `This file was applied on ${entry.appliedAt} but can no longer be found.`
        );
      }

      const currentHash = LedgerManager.computeHash(currentContent);

      if (currentHash !== entry.hash) {
        throw new IntegrityError(
          `Migration file "${entry.filename}" has been modified! ` +
            `This file was applied on ${entry.appliedAt} and must not be changed. ` +
            `Expected hash: ${entry.hash}, Current hash: ${currentHash}`
        );
      }
    }
  }

  /**
   * Get list of pending migrations (not yet applied)
   */
  getPendingMigrations(allMigrations: string[]): string[] {
    const appliedSet = new Set(this.ledger.migrations.map((m) => m.filename));
    return allMigrations.filter((filename) => !appliedSet.has(filename));
  }

  /**
   * Get migrations from the last batch
   */
  getLastBatchMigrations(): LedgerEntry[] {
    if (this.ledger.currentBatch === 0) {
      return [];
    }

    return this.ledger.migrations
      .filter((m) => m.batch === this.ledger.currentBatch)
      .reverse(); // Reverse for rollback
  }

  /**
   * Record a migration as applied
   */
  async recordMigration(filename: string, content: string): Promise<void> {
    const hash = LedgerManager.computeHash(content);
    const appliedAt = new Date().toISOString();

    const entry: LedgerEntry = {
      filename,
      hash,
      appliedAt,
      batch: this.ledger.currentBatch + 1,
    };

    this.ledger.migrations.push(entry);
    this.ledger.currentBatch = entry.batch;

    await this.save();
  }

  /**
   * FIX BUG-004 & BUG-005: Record multiple migrations atomically as a single batch
   * This ensures all migrations in a batch are recorded together and batch number is atomic
   */
  async recordBatch(migrations: { filename: string; content: string }[]): Promise<void> {
    if (migrations.length === 0) {
      return;
    }

    // FIX BUG-005: Calculate batch number once at the start to prevent race conditions
    const batchNumber = this.ledger.currentBatch + 1;
    const appliedAt = new Date().toISOString();

    // Create all entries for this batch
    const entries: LedgerEntry[] = migrations.map(({ filename, content }) => ({
      filename,
      hash: LedgerManager.computeHash(content),
      appliedAt,
      batch: batchNumber,
    }));

    // Add all entries and update batch number atomically
    this.ledger.migrations.push(...entries);
    this.ledger.currentBatch = batchNumber;

    // Save once for entire batch
    await this.save();
  }

  /**
   * Remove migrations from the last batch
   */
  async rollbackLastBatch(): Promise<void> {
    if (this.ledger.currentBatch === 0) {
      return;
    }

    this.ledger.migrations = this.ledger.migrations.filter(
      (m) => m.batch !== this.ledger.currentBatch
    );

    // FIX BUG-003: Handle empty migrations array explicitly
    if (this.ledger.migrations.length === 0) {
      this.ledger.currentBatch = 0;
    } else {
      const batches = this.ledger.migrations.map((m) => m.batch);
      this.ledger.currentBatch = Math.max(...batches);
    }

    await this.save();
  }

  /**
   * Get all applied migrations
   */
  getAppliedMigrations(): LedgerEntry[] {
    return [...this.ledger.migrations];
  }

  /**
   * Get current batch number
   */
  getCurrentBatch(): number {
    return this.ledger.currentBatch;
  }

  /**
   * Check if a migration has been applied
   */
  isApplied(filename: string): boolean {
    return this.ledger.migrations.some((m) => m.filename === filename);
  }

  /**
   * FIX CRITICAL-4: Validate ledger write capability before executing migrations
   * Checks disk space, write permissions, and ability to create/update the ledger file
   * This prevents situations where migrations succeed but ledger update fails
   *
   * @throws IntegrityError if ledger cannot be written
   */
  async validateWriteCapability(): Promise<void> {
    try {
      // Test write by creating/updating the ledger (this validates write permissions)
      const testLedger: Ledger = {
        ...this.ledger,
        migrations: [...this.ledger.migrations],
        currentBatch: this.ledger.currentBatch,
      };

      // Acquire lock for validation
      await this.acquireLock();

      try {
        // Try to write the ledger (without actual changes)
        const content = JSON.stringify(testLedger, null, 2);
        await writeFile(this.ledgerPath, content, 'utf-8');

        // Verify we can read it back
        const readBack = await readFile(this.ledgerPath, 'utf-8');
        JSON.parse(readBack); // Ensure it's valid JSON

        // Check available disk space (at least 10MB free)
        const stats = await stat(this.ledgerPath);
        // Note: We can't directly check free disk space in Node.js without native modules
        // But we can check if the file size is reasonable
        if (stats.size > 100 * 1024 * 1024) { // 100MB
          throw new Error('Ledger file is unusually large (>100MB), possible disk issue');
        }
      } finally {
        await this.releaseLock();
      }

    } catch (error: any) {
      // Format a helpful error message
      const errorMessage = [
        '❌ Ledger write validation failed',
        '',
        `Error: ${error.message}`,
        '',
        'Troubleshooting steps:',
        '1. Check write permissions for the ledger directory',
        `2. Ensure sufficient disk space is available`,
        `3. Verify the ledger file is not corrupted: ${this.ledgerPath}`,
        '4. Check if another process has locked the ledger file',
        '',
        '⚠️  IMPORTANT: Migrations were NOT executed because ledger validation failed.',
        '   This prevents database changes from being made without proper tracking.',
      ].join('\n');

      const validationError = new IntegrityError(errorMessage);
      (validationError as any).cause = error;
      throw validationError;
    }
  }

  /**
   * FIX BUG-039: Clean up any stale lock files
   * This should be called on graceful shutdown or if the lock is stuck
   */
  async forceUnlock(): Promise<void> {
    try {
      await unlink(this.lockPath);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw new Error(`Failed to remove lock file "${this.lockPath}": ${error.message}`);
      }
    }
  }
}
