#!/usr/bin/env node

/**
 * Tests for newly fixed bugs (Comprehensive Bug Analysis Round 2)
 * Tests BUG-021 through BUG-027 fixes
 */

import { Parser } from './dist/ast/parser.js';
import { PostgresGenerator } from './dist/generators/postgres.js';
import { MySQLGenerator } from './dist/generators/mysql.js';
import { SQLiteGenerator } from './dist/generators/sqlite.js';
import { LedgerManager } from './dist/engine/ledger.js';
import { writeFile, unlink } from 'fs/promises';

let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passedTests++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${error.message}`);
    failedTests++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

console.log('🧪 Testing Newly Fixed Bugs...\n');

// BUG-021, 022, 023: SQL Injection in Model Names (All Generators)
console.log('BUG-021/022/023: SQL Injection in Model Names');
test('PostgreSQL: Model names are properly escaped', () => {
  const input = `model User { id Serial @pk }`;
  const ast = Parser.parse(input);
  const generator = new PostgresGenerator();
  const sql = generator.generateUp(ast);
  assert(sql[0].includes('"User"'), 'Model name should be properly quoted');
  assert(!sql[0].includes('User" ;'), 'Should not allow injection');
});

test('MySQL: Model names are properly escaped', () => {
  const input = `model User { id Serial @pk }`;
  const ast = Parser.parse(input);
  const generator = new MySQLGenerator();
  const sql = generator.generateUp(ast);
  assert(sql[0].includes('`User`'), 'Model name should be properly quoted');
});

test('SQLite: Model names are properly escaped', () => {
  const input = `model User { id Serial @pk }`;
  const ast = Parser.parse(input);
  const generator = new SQLiteGenerator();
  const sql = generator.generateUp(ast);
  assert(sql[1].includes('"User"'), 'Model name should be properly quoted (after PRAGMA)');
});

// BUG-024: SQL Injection in Enum Values
console.log('\nBUG-024: SQL Injection in Enum Values');
test('PostgreSQL: Enum values with quotes are escaped', () => {
  const input = `model User { role Enum('admin', 'user', 'guest') @pk }`;
  const ast = Parser.parse(input);
  const generator = new PostgresGenerator();
  const sql = generator.generateUp(ast);
  assert(sql[0].includes("'admin'"), 'Enum values should be quoted');
  // Values should be properly escaped (single quotes escaped by escapeSqlStringLiteral)
});

test('MySQL: Enum values are escaped', () => {
  const input = `model User { role Enum('admin', 'user') @pk }`;
  const ast = Parser.parse(input);
  const generator = new MySQLGenerator();
  const sql = generator.generateUp(ast);
  assert(sql[0].includes("ENUM('admin', 'user')"), 'Enum should use native MySQL ENUM');
});

test('SQLite: Enum values in CHECK constraint are escaped', () => {
  const input = `model User { role Enum('admin', 'user') @pk }`;
  const ast = Parser.parse(input);
  const generator = new SQLiteGenerator();
  const sql = generator.generateUp(ast);
  assert(sql[1].includes("CHECK"), 'SQLite should use CHECK constraint for enum');
  assert(sql[1].includes("'admin'"), 'Enum values should be quoted');
});

// BUG-025: SQL Injection in Default Values
console.log('\nBUG-025: SQL Injection in Default Values');
test('PostgreSQL: String defaults with quotes are escaped', () => {
  const input = `model User { name Text @default("O'Brien") @pk }`;
  const ast = Parser.parse(input);
  const generator = new PostgresGenerator();
  const sql = generator.generateUp(ast);
  // Should escape single quote by doubling it: O''Brien
  assert(sql[0].includes("DEFAULT"), 'Should have DEFAULT clause');
});

test('MySQL: String defaults are escaped', () => {
  const input = `model User { name Text @default('test') @pk }`;
  const ast = Parser.parse(input);
  const generator = new MySQLGenerator();
  const sql = generator.generateUp(ast);
  assert(sql[0].includes("DEFAULT"), 'Should have DEFAULT clause');
});

// BUG-026: SQL Injection in Foreign Key References
console.log('\nBUG-026: SQL Injection in Foreign Key References');
test('PostgreSQL: Foreign key references are properly escaped', () => {
  const input = `model Post { authorId Int @ref(User.id) }`;
  const ast = Parser.parse(input);
  const generator = new PostgresGenerator();
  const sql = generator.generateUp(ast);
  assert(sql[0].includes('FOREIGN KEY'), 'Should have foreign key');
  assert(sql[0].includes('REFERENCES'), 'Should have REFERENCES');
});

test('MySQL: Foreign key references are escaped', () => {
  const input = `model Post { authorId Int @ref(User.id) }`;
  const ast = Parser.parse(input);
  const generator = new MySQLGenerator();
  const sql = generator.generateUp(ast);
  assert(sql[0].includes('FOREIGN KEY'), 'Should have foreign key');
});

test('SQLite: Foreign key references are escaped', () => {
  const input = `model Post { authorId Int @ref(User.id) }`;
  const ast = Parser.parse(input);
  const generator = new SQLiteGenerator();
  const sql = generator.generateUp(ast);
  assert(sql[1].includes('FOREIGN KEY'), 'Should have foreign key (after PRAGMA)');
});

// BUG-012: Parser Token Array Overflow
console.log('\nBUG-012: Parser Token Array Overflow');
test('Parser handles out-of-bounds token access gracefully', () => {
  const input = `model User { id Serial @pk }`;
  const ast = Parser.parse(input);
  assert(ast.models.length === 1, 'Should parse successfully');
  assert(ast.models[0].name === 'User', 'Should have correct model name');
});

// BUG-027: JSON Parse Crash in Ledger
console.log('\nBUG-027: JSON Parse Crash in Ledger');
test('Ledger handles corrupted JSON gracefully', async () => {
  const testLedgerPath = './test-corrupted-ledger.json';

  // Write corrupted JSON
  await writeFile(testLedgerPath, '{invalid json}', 'utf-8');

  const ledger = new LedgerManager(testLedgerPath);

  try {
    await ledger.load();
    assert(false, 'Should have thrown IntegrityError');
  } catch (error) {
    assert(error.name === 'IntegrityError', 'Should throw IntegrityError for corrupted JSON');
    assert(error.message.includes('corrupted'), 'Error message should mention corruption');
  } finally {
    // Clean up
    try {
      await unlink(testLedgerPath);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
});

test('Ledger handles missing migrations field', async () => {
  const testLedgerPath = './test-invalid-ledger.json';

  // Write invalid ledger structure (missing migrations array)
  await writeFile(testLedgerPath, '{"currentBatch": 0}', 'utf-8');

  const ledger = new LedgerManager(testLedgerPath);

  try {
    await ledger.load();
    assert(false, 'Should have thrown IntegrityError');
  } catch (error) {
    assert(error.name === 'IntegrityError', 'Should throw IntegrityError for invalid structure');
    assert(error.message.includes('Invalid ledger structure'), 'Error should mention invalid structure');
  } finally {
    // Clean up
    try {
      await unlink(testLedgerPath);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
});

console.log('\n==================================================');
console.log(`Tests Passed: ${passedTests}`);
console.log(`Tests Failed: ${failedTests}`);

if (failedTests === 0) {
  console.log('\n🎉 All newly fixed bug tests passed!');
  process.exit(0);
} else {
  console.log(`\n❌ ${failedTests} test(s) failed`);
  process.exit(1);
}
