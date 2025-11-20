/**
 * Demo: Test Sigil with all database generators
 * This script parses .sigl files and shows SQL for PostgreSQL, MySQL, and SQLite
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Parser } from '../dist/ast/parser.js';
import { PostgresGenerator } from '../dist/generators/postgres.js';
import { MySQLGenerator } from '../dist/generators/mysql.js';
import { SQLiteGenerator } from '../dist/generators/sqlite.js';
import { c } from '../dist/utils/colors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log(c.bold('\n🎯 Testing Sigil Multi-Database Support\n'));
console.log(c.dim('Demonstrating PostgreSQL, MySQL, and SQLite SQL generation\n'));
console.log('='.repeat(80) + '\n');

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

// Initialize generators
const generators = {
  'PostgreSQL': new PostgresGenerator(),
  'MySQL': new MySQLGenerator(),
  'SQLite': new SQLiteGenerator(),
};

// Process first migration only for demo (to keep output manageable)
const file = files[0];
const filePath = join(migrationsDir, file);
const content = readFileSync(filePath, 'utf-8');

console.log(c.bold(`📄 Migration: ${c.cyan(file)}`));
console.log(c.dim('─'.repeat(80)));

try {
  // Parse the .sigl file
  const ast = Parser.parse(content);

  console.log(c.green(`✓ Parsed successfully`));
  console.log(c.dim(`  Models: ${ast.models.length} (${ast.models.map(m => m.name).join(', ')})`));
  console.log(c.dim(`  Raw SQL statements: ${ast.rawSql.length}`));
  console.log('');

  // Test each generator
  for (const [dbName, generator] of Object.entries(generators)) {
    console.log('='.repeat(80));
    console.log(c.bold(`\n🗄️  ${dbName}`));
    console.log(c.dim('─'.repeat(80)));

    try {
      const upSql = generator.generateUp(ast);
      const downSql = generator.generateDown(ast);

      console.log(c.bold('\n🔼 UP Migration:'));
      console.log(c.dim('─'.repeat(80)));
      upSql.forEach((sql, i) => {
        console.log(c.yellow(`-- Statement ${i + 1}:`));
        console.log(sql);
        console.log('');
      });

      console.log(c.bold('🔽 DOWN Migration:'));
      console.log(c.dim('─'.repeat(80)));
      downSql.forEach((sql, i) => {
        console.log(c.yellow(`-- Statement ${i + 1}:`));
        console.log(sql);
        console.log('');
      });

    } catch (error) {
      console.log(c.red(`✗ Error generating SQL: ${error.message}`));
    }
  }

} catch (error) {
  console.log(c.red(`✗ Parse Error: ${error.message}`));
  if (error.line) {
    console.log(c.dim(`  at line ${error.line}, column ${error.column}`));
  }
}

console.log('='.repeat(80));
console.log(c.green('\n✓ Multi-database test completed!'));
console.log(c.bold('\n📊 Key Differences Summary:\n'));

console.log(c.cyan('PostgreSQL:'));
console.log('  • SERIAL for auto-increment');
console.log('  • CHECK constraints with VALUE IN for enums');
console.log('  • Native BOOLEAN type');
console.log('  • JSONB support');
console.log('  • Double quotes for identifiers');

console.log(c.cyan('\nMySQL:'));
console.log('  • INT AUTO_INCREMENT for auto-increment');
console.log('  • Native ENUM type');
console.log('  • BOOLEAN maps to TINYINT(1)');
console.log('  • JSON (no JSONB)');
console.log('  • Backticks for identifiers');
console.log('  • ENGINE=InnoDB with UTF8MB4 charset');

console.log(c.cyan('\nSQLite:'));
console.log('  • INTEGER PRIMARY KEY AUTOINCREMENT');
console.log('  • Dynamic typing (most types → TEXT/INTEGER/REAL)');
console.log('  • CHECK constraints for enums');
console.log('  • BOOLEAN as INTEGER (0/1)');
console.log('  • PRAGMA foreign_keys = ON required');
console.log('  • Double quotes for identifiers');

console.log(c.dim('\nNote: This is a dry-run. No actual database operations were performed.\n'));
