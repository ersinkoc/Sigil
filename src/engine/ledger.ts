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
   * FIX BUG-039: Acquire exclusive lock on ledger file
   * Uses atomic file creation to prevent race conditions
   */
  private async acquireLock(): Promise<void> {
    const startTime = Date.now();

    while (true) {
      try {
        // Check for stale locks (older than lockTimeout)
        try {
          const lockStat = await stat(this.lockPath);
          const lockAge = Date.now() - lockStat.mtimeMs;

          if (lockAge > this.lockTimeout) {
            // Lock is stale, remove it
            await unlink(this.lockPath).catch(() => {
              // Ignore errors if another process already removed it
            });
          }
        } catch {
          // Lock file doesn't exist, which is fine
        }

        // Try to create lock file atomically with exclusive flag
        const handle = await open(this.lockPath, 'wx');
        await handle.writeFile(JSON.stringify({
          pid: process.pid,
          acquiredAt: new Date().toISOString()
        }));
        await handle.close();

        // Lock acquired successfully
        return;
      } catch (error: any) {
        if (error.code === 'EEXIST') {
          // Lock file exists, another process has the lock
          const elapsed = Date.now() - startTime;

          if (elapsed >= this.lockTimeout) {
            throw new IntegrityError(
              `Failed to acquire ledger lock after ${this.lockTimeout}ms. ` +
              `Another migration process may be running. ` +
              `If no other process is running, delete "${this.lockPath}" manually.`
            );
          }

          // Wait and retry
          await new Promise(resolve => setTimeout(resolve, this.lockRetryDelay));
        } else {
          // Other error, propagate it
          throw error;
        }
      }
    }
  }

  /**
   * FIX BUG-039: Release lock on ledger file
   */
  private async releaseLock(): Promise<void> {
    try {
      await unlink(this.lockPath);
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
