/**
 * Runner: Orchestrates migration execution
 * Manages the flow of parsing, generating SQL, and executing migrations
 */

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { DbAdapter, SigilError } from '../ast/types.js';
import { Parser } from '../ast/parser.js';
import { SqlGenerator } from '../generators/base.js';
import { LedgerManager } from './ledger.js';

export interface RunnerOptions {
  adapter: DbAdapter;
  generator: SqlGenerator;
  migrationsPath: string;
  ledgerPath?: string;
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

  constructor(options: RunnerOptions) {
    this.adapter = options.adapter;
    this.generator = options.generator;
    this.migrationsPath = options.migrationsPath;
    this.ledger = new LedgerManager(options.ledgerPath);
  }

  /**
   * Load all migration files from the migrations directory
   */
  async loadMigrationFiles(): Promise<MigrationFile[]> {
    try {
      const files = await readdir(this.migrationsPath);
      const siglFiles = files
        .filter((f) => f.endsWith('.sigl'))
        .sort(); // Sort to ensure chronological order

      const migrations: MigrationFile[] = [];

      for (const filename of siglFiles) {
        const filepath = join(this.migrationsPath, filename);
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

    const applied: string[] = [];
    // FIX BUG-004: Collect all migrations to record, only save to ledger after all succeed
    const migrationsToRecord: { filename: string; content: string }[] = [];

    // FIX BUG-042: Move connect() inside try block to ensure disconnect() is called on failure
    try {
      // Connect to database
      await this.adapter.connect();
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

      // FIX BUG-004: Record all migrations in the batch atomically after all succeeded
      if (migrationsToRecord.length > 0) {
        await this.ledger.recordBatch(migrationsToRecord);
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
   */
  async down(): Promise<{ rolledBack: string[] }> {
    await this.ledger.load();
    const migrations = await this.loadMigrationFiles();

    // Get migrations from last batch
    const lastBatch = this.ledger.getLastBatchMigrations();

    if (lastBatch.length === 0) {
      return { rolledBack: [] };
    }

    const rolledBack: string[] = [];

    // FIX BUG-042: Move connect() inside try block to ensure disconnect() is called on failure
    try {
      // Connect to database
      await this.adapter.connect();
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

      // Update ledger
      await this.ledger.rollbackLastBatch();
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
