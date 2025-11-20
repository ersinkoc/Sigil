/**
 * Ledger: Tracks applied migrations and ensures integrity
 * Uses SHA-256 hashing to detect changes in migration files
 */

import { readFile, writeFile, access } from 'fs/promises';
import { createHash } from 'crypto';
import { Ledger, LedgerEntry, IntegrityError } from '../ast/types.js';

export class LedgerManager {
  private ledgerPath: string;
  private ledger: Ledger;

  constructor(ledgerPath: string = '.sigil_ledger.json') {
    this.ledgerPath = ledgerPath;
    this.ledger = { migrations: [], currentBatch: 0 };
  }

  /**
   * Load the ledger from disk
   */
  async load(): Promise<void> {
    try {
      await access(this.ledgerPath);
      const content = await readFile(this.ledgerPath, 'utf-8');
      this.ledger = JSON.parse(content);
    } catch (error) {
      // If file doesn't exist, start with empty ledger
      this.ledger = { migrations: [], currentBatch: 0 };
    }
  }

  /**
   * Save the ledger to disk
   */
  async save(): Promise<void> {
    const content = JSON.stringify(this.ledger, null, 2);
    await writeFile(this.ledgerPath, content, 'utf-8');
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
   * Remove migrations from the last batch
   */
  async rollbackLastBatch(): Promise<void> {
    if (this.ledger.currentBatch === 0) {
      return;
    }

    this.ledger.migrations = this.ledger.migrations.filter(
      (m) => m.batch !== this.ledger.currentBatch
    );

    this.ledger.currentBatch = Math.max(
      0,
      ...this.ledger.migrations.map((m) => m.batch)
    );

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
}
