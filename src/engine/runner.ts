/**
 * Runner: Orchestrates migration execution
 * Manages the flow of parsing, generating SQL, and executing migrations
 */

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { DbAdapter, SigilError, SigilConfig } from '../ast/types.js';
import { Parser } from '../ast/parser.js';
import { SqlGenerator } from '../generators/base.js';
import { LedgerManager } from './ledger.js';
import {
  validateFileSize,
  validateTotalSize,
  DEFAULT_MAX_MIGRATION_FILE_SIZE,
  DEFAULT_MAX_TOTAL_MIGRATIONS_SIZE,
} from '../utils/file-validator.js';
import { validateConnection } from '../utils/connection-validator.js';

export interface RunnerOptions {
  adapter: DbAdapter;
  generator: SqlGenerator;
  migrationsPath: string;
  ledgerPath?: string;
  config?: SigilConfig; // FIX CRITICAL-1: Add config for file size validation
}

export interface MigrationFile {
  filename: string;
  filepath: string;
  content: string;
}

export class MigrationRunner {
  private adapter: DbAdapter;
  private generator: SqlGenerator;
  private migrationsPath: string;
  private ledger: LedgerManager;
  private config?: SigilConfig; // FIX CRITICAL-1: Store config

  constructor(options: RunnerOptions) {
    this.adapter = options.adapter;
    this.generator = options.generator;
    this.migrationsPath = options.migrationsPath;
    this.ledger = new LedgerManager(options.ledgerPath);
    this.config = options.config; // FIX CRITICAL-1: Store config
  }

  /**
   * Load all migration files from the migrations directory
   * FIX CRITICAL-1: Added file size validation to prevent DoS attacks
   */
  async loadMigrationFiles(): Promise<MigrationFile[]> {
    try {
      const files = await readdir(this.migrationsPath);
      const siglFiles = files
        .filter((f) => f.endsWith('.sigl'))
        .sort(); // Sort to ensure chronological order

      // FIX CRITICAL-1: Check if file size validation is enabled
      const enableValidation = this.config?.enableFileSizeValidation ?? true;
      const maxFileSize = this.config?.maxMigrationFileSize ?? DEFAULT_MAX_MIGRATION_FILE_SIZE;
      const maxTotalSize = this.config?.maxTotalMigrationsSize ?? DEFAULT_MAX_TOTAL_MIGRATIONS_SIZE;

      const filepaths = siglFiles.map(f => join(this.migrationsPath, f));

      // FIX CRITICAL-1: Validate total size of all migrations
      if (enableValidation) {
        await validateTotalSize(filepaths, maxTotalSize);
      }

      const migrations: MigrationFile[] = [];

      for (const filename of siglFiles) {
        const filepath = join(this.migrationsPath, filename);

        // FIX CRITICAL-1: Validate individual file size before reading
        if (enableValidation) {
          await validateFileSize(filepath, maxFileSize);
        }

        const content = await readFile(filepath, 'utf-8');
        migrations.push({ filename, filepath, content });
      }

      return migrations;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new SigilError(
          `Migrations directory not found: ${this.migrationsPath}`
        );
      }
      throw error;
    }
  }

  /**
   * Run pending migrations (UP)
   * FIX CRITICAL-4: Added ledger write validation to prevent inconsistent state
   */
  async up(): Promise<{ applied: string[]; skipped: string[] }> {
    await this.ledger.load();
    const migrations = await this.loadMigrationFiles();

    // Create a map of migrations for integrity validation
    const migrationMap = new Map(
      migrations.map((m) => [m.filename, m.content])
    );

    // Validate integrity of previously applied migrations
    await this.ledger.validateIntegrity(migrationMap);

    // Get pending migrations
    const pendingFiles = this.ledger.getPendingMigrations(
      migrations.map((m) => m.filename)
    );

    if (pendingFiles.length === 0) {
      return { applied: [], skipped: [] };
    }

    // FIX CRITICAL-4: Validate ledger write capability BEFORE executing migrations
    // This prevents the scenario where migrations succeed but ledger update fails
    await this.ledger.validateWriteCapability();

    const applied: string[] = [];
    // FIX BUG-004: Collect all migrations to record, only save to ledger after all succeed
    const migrationsToRecord: { filename: string; content: string }[] = [];

    // FIX BUG-042: Move connect() inside try block to ensure disconnect() is called on failure
    try {
      // FIX CRITICAL-6: Validate connection with retry logic and health check
      await validateConnection(this.adapter, {
        maxRetries: 3,
        baseDelay: 1000
      });

      for (const filename of pendingFiles) {
        const migration = migrations.find((m) => m.filename === filename);

        // FIX BUG-037: Throw error for missing migration files instead of silently skipping
        if (!migration) {
          throw new SigilError(
            `Migration file "${filename}" is missing but expected to be applied. ` +
            `This file may have been deleted from the migrations directory. ` +
            `Ensure all migration files are present before running migrations.`
          );
        }

        // Parse the migration file
        const ast = Parser.parse(migration.content);

        // Generate SQL
        const sqlStatements = this.generator.generateUp(ast);

        // Execute in transaction
        await this.adapter.transaction(sqlStatements);

        // Collect migration for batch recording (don't record yet)
        migrationsToRecord.push({
          filename: migration.filename,
          content: migration.content,
        });

        applied.push(filename);
      }

      // FIX BUG-004 & CRITICAL-4: Record all migrations in the batch atomically after all succeeded
      if (migrationsToRecord.length > 0) {
        try {
          await this.ledger.recordBatch(migrationsToRecord);
        } catch (ledgerError) {
          // FIX CRITICAL-4: Enhanced error message for ledger write failures
          const errorMessage = [
            '',
            '🚨 CRITICAL: Migrations executed successfully but failed to update ledger!',
            '',
            `Error: ${(ledgerError as Error).message}`,
            '',
            '⚠️  DATABASE STATE:',
            `   - ${migrationsToRecord.length} migration(s) were applied to the database`,
            `   - Ledger file was NOT updated`,
            '   - This creates an inconsistent state',
            '',
            '📋 APPLIED MIGRATIONS (not recorded):',
            ...migrationsToRecord.map(m => `   - ${m.filename}`),
            '',
            '🔧 RECOVERY STEPS:',
            '1. DO NOT run migrations again - they are already applied to the database',
            '2. Manually update the ledger file or use a recovery tool',
            '3. Verify database schema matches the applied migrations',
            '4. Fix the ledger write issue (permissions, disk space, etc.)',
            '',
            'For assistance, check the documentation on ledger recovery.',
          ].join('\n');

          const enhancedError = new SigilError(errorMessage);
          (enhancedError as any).cause = ledgerError;
          (enhancedError as any).appliedMigrations = migrationsToRecord.map(m => m.filename);
          throw enhancedError;
        }
      }
    } finally {
      await this.adapter.disconnect();
    }

    const allFiles = migrations.map((m) => m.filename);
    const skipped = allFiles.filter((f) => !pendingFiles.includes(f));

    return { applied, skipped };
  }

  /**
   * Rollback last batch of migrations (DOWN)
   * FIX CRITICAL-4: Added ledger write validation to prevent inconsistent state
   */
  async down(): Promise<{ rolledBack: string[] }> {
    await this.ledger.load();
    const migrations = await this.loadMigrationFiles();

    // Get migrations from last batch
    const lastBatch = this.ledger.getLastBatchMigrations();

    if (lastBatch.length === 0) {
      return { rolledBack: [] };
    }

    // FIX CRITICAL-4: Validate ledger write capability BEFORE executing rollbacks
    await this.ledger.validateWriteCapability();

    const rolledBack: string[] = [];

    // FIX BUG-042: Move connect() inside try block to ensure disconnect() is called on failure
    try {
      // FIX CRITICAL-6: Validate connection with retry logic
      await validateConnection(this.adapter, {
        maxRetries: 3,
        baseDelay: 1000
      });

      for (const entry of lastBatch) {
        const migration = migrations.find((m) => m.filename === entry.filename);
        if (!migration) {
          throw new SigilError(
            `Cannot rollback: migration file "${entry.filename}" not found`
          );
        }

        // Parse the migration file
        const ast = Parser.parse(migration.content);

        // Generate DOWN SQL
        const sqlStatements = this.generator.generateDown(ast);

        // Execute in transaction
        await this.adapter.transaction(sqlStatements);

        rolledBack.push(entry.filename);
      }

      // FIX CRITICAL-4: Update ledger with enhanced error handling
      try {
        await this.ledger.rollbackLastBatch();
      } catch (ledgerError) {
        // FIX CRITICAL-4: Enhanced error message for ledger write failures during rollback
        const errorMessage = [
          '',
          '🚨 CRITICAL: Rollbacks executed successfully but failed to update ledger!',
          '',
          `Error: ${(ledgerError as Error).message}`,
          '',
          '⚠️  DATABASE STATE:',
          `   - ${rolledBack.length} migration(s) were rolled back in the database`,
          `   - Ledger file was NOT updated`,
          '   - This creates an inconsistent state',
          '',
          '📋 ROLLED BACK MIGRATIONS (not removed from ledger):',
          ...rolledBack.map(m => `   - ${m}`),
          '',
          '🔧 RECOVERY STEPS:',
          '1. DO NOT run rollback again - migrations are already rolled back',
          '2. Manually update the ledger file to remove these migrations',
          '3. Verify database schema matches the current state',
          '4. Fix the ledger write issue (permissions, disk space, etc.)',
          '',
          'For assistance, check the documentation on ledger recovery.',
        ].join('\n');

        const enhancedError = new SigilError(errorMessage);
        (enhancedError as any).cause = ledgerError;
        (enhancedError as any).rolledBackMigrations = rolledBack;
        throw enhancedError;
      }
    } finally {
      await this.adapter.disconnect();
    }

    return { rolledBack };
  }

  /**
   * Get migration status
   */
  async status(): Promise<{
    applied: string[];
    pending: string[];
    currentBatch: number;
  }> {
    await this.ledger.load();
    const migrations = await this.loadMigrationFiles();

    const allFilenames = migrations.map((m) => m.filename);
    const applied = this.ledger.getAppliedMigrations().map((m) => m.filename);
    const pending = this.ledger.getPendingMigrations(allFilenames);
    const currentBatch = this.ledger.getCurrentBatch();

    return { applied, pending, currentBatch };
  }
}
