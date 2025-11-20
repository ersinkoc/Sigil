#!/usr/bin/env node

/**
 * CLI: Command-line interface for Sigil
 * Handles user commands and orchestrates the migration workflow
 */

import { writeFile, mkdir, access } from 'fs/promises';
import { join, resolve } from 'path';
import { pathToFileURL } from 'url';
import { SigilConfig, SigilError } from './ast/types.js';
import { PostgresGenerator } from './generators/postgres.js';
import { MigrationRunner } from './engine/runner.js';
import { PostgresIntrospector } from './engine/introspector.js';
import { c } from './utils/colors.js';
import {
  generateMigrationFilename,
  createMigrationTemplate,
  formatTable,
  pluralize,
} from './utils/formatting.js';

class SigilCLI {
  private args: string[];
  private command: string;
  private commandArgs: string[];

  constructor(args: string[]) {
    this.args = args;
    this.command = args[0] || 'help';
    this.commandArgs = args.slice(1);
  }

  async run(): Promise<void> {
    try {
      switch (this.command) {
        case 'init':
          await this.init();
          break;

        case 'create':
          await this.create();
          break;

        case 'up':
          await this.up();
          break;

        case 'down':
          await this.down();
          break;

        case 'status':
          await this.status();
          break;

        case 'pull':
          await this.pull();
          break;

        case 'help':
        case '--help':
        case '-h':
          this.showHelp();
          break;

        case 'version':
        case '--version':
        case '-v':
          this.showVersion();
          break;

        default:
          console.log(c.error(`Unknown command: ${this.command}`));
          console.log(`Run ${c.cyan('sigil help')} for usage information.`);
          process.exit(1);
      }
    } catch (error) {
      if (error instanceof SigilError) {
        console.log(c.error(error.message));
        process.exit(1);
      }
      throw error;
    }
  }

  /**
   * Initialize a new Sigil project
   */
  private async init(): Promise<void> {
    console.log(c.bold('Initializing Sigil project...'));

    // Create migrations directory
    const migrationsPath = resolve(process.cwd(), 'migrations');
    try {
      await mkdir(migrationsPath, { recursive: true });
      console.log(c.success(`Created migrations directory: ${c.dim('migrations/')}`));
    } catch (error) {
      console.log(c.warning('Migrations directory already exists'));
    }

    // Create config file
    const configPath = resolve(process.cwd(), 'sigil.config.js');

    const configContent = `/**
 * Sigil Configuration
 * Define your database adapter here
 */

// Example PostgreSQL adapter
// You'll need to install 'pg' separately: npm install pg

// import pg from 'pg';
// const { Pool } = pg;

// const pool = new Pool({
//   host: 'localhost',
//   port: 5432,
//   database: 'mydb',
//   user: 'postgres',
//   password: 'password',
// });

// const adapter = {
//   async connect() {
//     // Connection is handled by the pool
//   },
//   async disconnect() {
//     await pool.end();
//   },
//   async query(sql) {
//     const result = await pool.query(sql);
//     return result.rows;
//   },
//   async transaction(queries) {
//     const client = await pool.connect();
//     try {
//       await client.query('BEGIN');
//       for (const sql of queries) {
//         await client.query(sql);
//       }
//       await client.query('COMMIT');
//     } catch (error) {
//       await client.query('ROLLBACK');
//       throw error;
//     } finally {
//       client.release();
//     }
//   },
// };

export default {
  adapter: null, // Replace with your adapter implementation
  migrationsPath: './migrations',
  ledgerPath: './.sigil_ledger.json',
};
`;

    try {
      await access(configPath);
      console.log(c.warning('Config file already exists: sigil.config.js'));
    } catch {
      await writeFile(configPath, configContent, 'utf-8');
      console.log(c.success(`Created config file: ${c.dim('sigil.config.js')}`));
    }

    console.log();
    console.log(c.bold('Next steps:'));
    console.log(`  1. Edit ${c.cyan('sigil.config.js')} and configure your database adapter`);
    console.log(`  2. Run ${c.cyan('sigil create <name>')} to create your first migration`);
    console.log(`  3. Run ${c.cyan('sigil up')} to apply migrations`);
  }

  /**
   * Create a new migration file
   */
  private async create(): Promise<void> {
    const name = this.commandArgs[0];

    if (!name) {
      throw new SigilError('Migration name is required. Usage: sigil create <name>');
    }

    const config = await this.loadConfig();
    const migrationsPath = resolve(process.cwd(), config.migrationsPath || './migrations');

    // Ensure migrations directory exists
    await mkdir(migrationsPath, { recursive: true });

    const filename = generateMigrationFilename(name);
    const filepath = join(migrationsPath, filename);

    const template = createMigrationTemplate(name);
    await writeFile(filepath, template, 'utf-8');

    console.log(c.success(`Created migration: ${c.cyan(filename)}`));
    console.log(c.dim(`  Location: ${filepath}`));
  }

  /**
   * Apply pending migrations
   */
  private async up(): Promise<void> {
    const config = await this.loadConfig();
    this.validateConfig(config);

    console.log(c.bold('Running migrations...'));

    const runner = new MigrationRunner({
      adapter: config.adapter!,
      generator: new PostgresGenerator(),
      migrationsPath: resolve(process.cwd(), config.migrationsPath || './migrations'),
      ledgerPath: config.ledgerPath,
    });

    const { applied, skipped } = await runner.up();

    if (applied.length === 0) {
      console.log(c.info('No pending migrations to apply'));
      return;
    }

    console.log();
    console.log(c.success(`Applied ${applied.length} ${pluralize('migration', applied.length)}:`));
    for (const filename of applied) {
      console.log(`  ${c.green('✓')} ${filename}`);
    }

    if (skipped.length > 0) {
      console.log();
      console.log(c.dim(`Skipped ${skipped.length} already applied ${pluralize('migration', skipped.length)}`));
    }
  }

  /**
   * Rollback last batch of migrations
   */
  private async down(): Promise<void> {
    const config = await this.loadConfig();
    this.validateConfig(config);

    console.log(c.bold('Rolling back migrations...'));

    const runner = new MigrationRunner({
      adapter: config.adapter!,
      generator: new PostgresGenerator(),
      migrationsPath: resolve(process.cwd(), config.migrationsPath || './migrations'),
      ledgerPath: config.ledgerPath,
    });

    const { rolledBack } = await runner.down();

    if (rolledBack.length === 0) {
      console.log(c.info('No migrations to rollback'));
      return;
    }

    console.log();
    console.log(c.success(`Rolled back ${rolledBack.length} ${pluralize('migration', rolledBack.length)}:`));
    for (const filename of rolledBack) {
      console.log(`  ${c.green('✓')} ${filename}`);
    }
  }

  /**
   * Show migration status
   */
  private async status(): Promise<void> {
    const config = await this.loadConfig();
    this.validateConfig(config);

    const runner = new MigrationRunner({
      adapter: config.adapter!,
      generator: new PostgresGenerator(),
      migrationsPath: resolve(process.cwd(), config.migrationsPath || './migrations'),
      ledgerPath: config.ledgerPath,
    });

    const { applied, pending, currentBatch } = await runner.status();

    console.log(c.bold('Migration Status'));
    console.log();

    if (applied.length === 0 && pending.length === 0) {
      console.log(c.info('No migrations found'));
      return;
    }

    console.log(`Current batch: ${c.cyan(currentBatch.toString())}`);
    console.log();

    if (applied.length > 0) {
      console.log(c.green(`Applied (${applied.length}):`));
      for (const filename of applied) {
        console.log(`  ${c.green('✓')} ${filename}`);
      }
      console.log();
    }

    if (pending.length > 0) {
      console.log(c.yellow(`Pending (${pending.length}):`));
      for (const filename of pending) {
        console.log(`  ${c.dim('○')} ${filename}`);
      }
    } else {
      console.log(c.success('All migrations are up to date'));
    }
  }

  /**
   * Pull schema from database
   */
  private async pull(): Promise<void> {
    const config = await this.loadConfig();
    this.validateConfig(config);

    const schema = this.commandArgs[0] || 'public';

    console.log(c.bold(`Introspecting database schema: ${c.cyan(schema)}`));

    const introspector = new PostgresIntrospector(config.adapter!);
    const dsl = await introspector.introspect(schema);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const filename = `${timestamp}_introspected.sigl`;
    const migrationsPath = resolve(process.cwd(), config.migrationsPath || './migrations');

    await mkdir(migrationsPath, { recursive: true });

    const filepath = join(migrationsPath, filename);
    await writeFile(filepath, dsl, 'utf-8');

    console.log();
    console.log(c.success(`Generated schema file: ${c.cyan(filename)}`));
    console.log(c.dim(`  Location: ${filepath}`));
  }

  /**
   * Show help information
   */
  private showHelp(): void {
    console.log(c.bold('Sigil - Zero-Dependency Database Schema Management'));
    console.log();
    console.log(c.bold('Usage:'));
    console.log(`  ${c.cyan('sigil')} ${c.yellow('<command>')} ${c.dim('[options]')}`);
    console.log();
    console.log(c.bold('Commands:'));
    console.log(`  ${c.cyan('init')}              Initialize a new Sigil project`);
    console.log(`  ${c.cyan('create')} ${c.yellow('<name>')}     Create a new migration file`);
    console.log(`  ${c.cyan('up')}                Apply pending migrations`);
    console.log(`  ${c.cyan('down')}              Rollback last batch of migrations`);
    console.log(`  ${c.cyan('status')}            Show migration status`);
    console.log(`  ${c.cyan('pull')} ${c.dim('[schema]')}     Pull schema from database (default: public)`);
    console.log(`  ${c.cyan('help')}              Show this help message`);
    console.log(`  ${c.cyan('version')}           Show version information`);
    console.log();
    console.log(c.bold('Examples:'));
    console.log(`  ${c.dim('$')} sigil init`);
    console.log(`  ${c.dim('$')} sigil create add_users_table`);
    console.log(`  ${c.dim('$')} sigil up`);
    console.log(`  ${c.dim('$')} sigil status`);
    console.log(`  ${c.dim('$')} sigil pull public`);
  }

  /**
   * Show version information
   */
  private showVersion(): void {
    console.log('Sigil v1.0.0');
  }

  /**
   * Load configuration file
   */
  private async loadConfig(): Promise<SigilConfig> {
    const configPath = resolve(process.cwd(), 'sigil.config.js');

    try {
      await access(configPath);
    } catch {
      throw new SigilError(
        `Config file not found. Run ${c.cyan('sigil init')} to create one.`
      );
    }

    try {
      const configUrl = pathToFileURL(configPath).href;
      const module = await import(configUrl);
      return module.default;
    } catch (error) {
      throw new SigilError(`Failed to load config file: ${(error as Error).message}`);
    }
  }

  /**
   * Validate configuration
   */
  private validateConfig(config: SigilConfig): void {
    if (!config.adapter) {
      throw new SigilError(
        'Database adapter not configured. Please edit sigil.config.js and provide an adapter.'
      );
    }
  }
}

// Main execution
const args = process.argv.slice(2);
const cli = new SigilCLI(args);

cli.run().catch((error) => {
  console.error(c.error('Unexpected error:'));
  console.error(error);
  process.exit(1);
});
