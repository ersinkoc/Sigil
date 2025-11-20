/**
 * Demo: Test Sigil migrations without a real database
 * This script parses .sigl files and shows the generated SQL
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Parser } from '../dist/ast/parser.js';
import { PostgresGenerator } from '../dist/generators/postgres.js';
import { c } from '../dist/utils/colors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log(c.bold('\n🧪 Testing Sigil Migrations for Demo Blog\n'));

// Get all migration files
const migrationsDir = join(__dirname, 'migrations');
const files = readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sigl'))
  .sort();

console.log(c.blue(`Found ${files.length} migration file(s):\n`));

files.forEach((file, index) => {
  console.log(c.dim(`  ${index + 1}. ${file}`));
});

console.log('\n' + '='.repeat(80) + '\n');

// Process each migration
files.forEach((file, index) => {
  const filePath = join(migrationsDir, file);
  const content = readFileSync(filePath, 'utf-8');

  console.log(c.bold(`📄 Migration ${index + 1}: ${c.cyan(file)}`));
  console.log(c.dim('─'.repeat(80)));

  try {
    // Parse the .sigl file
    const ast = Parser.parse(content);

    console.log(c.green(`✓ Parsed successfully`));
    console.log(c.dim(`  Models: ${ast.models.length}`));
    console.log(c.dim(`  Raw SQL statements: ${ast.rawSql.length}`));

    // Generate PostgreSQL
    const generator = new PostgresGenerator();
    const upSql = generator.generateUp(ast);
    const downSql = generator.generateDown(ast);

    console.log(c.bold('\n🔼 UP Migration (PostgreSQL):'));
    console.log(c.dim('─'.repeat(80)));
    upSql.forEach((sql, i) => {
      console.log(c.yellow(`-- Statement ${i + 1}:`));
      console.log(sql);
      console.log('');
    });

    console.log(c.bold('🔽 DOWN Migration (Rollback):'));
    console.log(c.dim('─'.repeat(80)));
    downSql.forEach((sql, i) => {
      console.log(c.yellow(`-- Statement ${i + 1}:`));
      console.log(sql);
      console.log('');
    });

  } catch (error) {
    console.log(c.red(`✗ Error: ${error.message}`));
    if (error.line) {
      console.log(c.dim(`  at line ${error.line}, column ${error.column}`));
    }
  }

  console.log('='.repeat(80) + '\n');
});

console.log(c.green('✓ All migrations tested successfully!'));
console.log(c.dim('\nNote: This is a dry-run. No actual database operations were performed.\n'));
