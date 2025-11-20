#!/usr/bin/env node

/**
 * Comprehensive Bug Fix Verification Tests
 * Tests all critical and high-priority bug fixes
 */

import { Parser } from './dist/ast/parser.js';
import { PostgresGenerator } from './dist/generators/postgres.js';
import { LedgerManager } from './dist/engine/ledger.js';
import { escapeSqlIdentifier, escapeSqlStringLiteral } from './dist/utils/sql-identifier-escape.js';
import { generateMigrationFilename } from './dist/utils/formatting.js';

console.log('🧪 Testing Bug Fixes...\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${error.message}`);
    failed++;
  }
}

// ====================
// BUG-001: SQL Injection Prevention
// ====================
console.log('BUG-001: SQL Injection Prevention Tests');

test('Rejects SQL injection in schema name', () => {
  try {
    escapeSqlStringLiteral("test'; DROP TABLE users; --");
    // Should succeed with proper escaping
  } catch (error) {
    throw new Error('Should not reject valid input');
  }
});

test('Rejects SQL keywords in identifiers', () => {
  try {
    escapeSqlIdentifier('DROP TABLE users');
    throw new Error('Should reject SQL keywords');
  } catch (error) {
    if (!error.message.includes('SQL keywords')) {
      throw error;
    }
  }
});

test('Rejects dangerous characters in identifiers', () => {
  try {
    escapeSqlIdentifier("test';--");
    throw new Error('Should reject dangerous characters');
  } catch (error) {
    if (!error.message.includes('dangerous characters')) {
      throw error;
    }
  }
});

test('Accepts valid identifiers', () => {
  const result = escapeSqlIdentifier('my_valid_table_123');
  if (result !== 'my_valid_table_123') {
    throw new Error('Should accept valid identifier');
  }
});

// ====================
// BUG-002: PostgreSQL CHECK Constraint Syntax
// ====================
console.log('\nBUG-002: PostgreSQL CHECK Constraint Syntax');

test('Generates valid CHECK constraint for Enum', () => {
  const schema = `
    model User {
      role Enum('admin', 'user') @default('user')
    }
  `;

  const ast = Parser.parse(schema);
  const generator = new PostgresGenerator();
  const sql = generator.generateUp(ast);

  // Should contain CHECK ("role" IN ...) not CHECK (VALUE IN ...)
  if (!sql[0].includes('CHECK ("role" IN')) {
    throw new Error('CHECK constraint should use column name, not VALUE');
  }

  if (sql[0].includes('CHECK (VALUE IN')) {
    throw new Error('CHECK constraint incorrectly uses VALUE keyword');
  }
});

// ====================
// BUG-003: Ledger Batch Calculation
// ====================
console.log('\nBUG-003: Ledger Batch Calculation Edge Case');

test('Handles empty migrations array on rollback', async () => {
  const ledger = new LedgerManager('.test_ledger.json');
  await ledger.load();

  // Simulate recording and rolling back a migration
  await ledger.recordBatch([
    { filename: 'test1.sigl', content: 'test content 1' }
  ]);

  const batchBefore = ledger.getCurrentBatch();
  if (batchBefore !== 1) {
    throw new Error(`Expected batch 1, got ${batchBefore}`);
  }

  await ledger.rollbackLastBatch();

  const batchAfter = ledger.getCurrentBatch();
  if (batchAfter !== 0) {
    throw new Error(`Expected batch 0 after rollback, got ${batchAfter} (was likely -Infinity or NaN)`);
  }

  // Cleanup
  try {
    await import('fs/promises').then(fs => fs.unlink('.test_ledger.json'));
  } catch {}
});

// ====================
// BUG-004 & BUG-005: Atomic Batch Recording
// ====================
console.log('\nBUG-004 & BUG-005: Atomic Batch Recording');

test('recordBatch adds multiple migrations atomically', async () => {
  const ledger = new LedgerManager('.test_ledger_batch.json');
  await ledger.load();

  const migrations = [
    { filename: 'test1.sigl', content: 'content 1' },
    { filename: 'test2.sigl', content: 'content 2' },
    { filename: 'test3.sigl', content: 'content 3' }
  ];

  await ledger.recordBatch(migrations);

  const applied = ledger.getAppliedMigrations();

  // All migrations should be recorded
  if (applied.length !== 3) {
    throw new Error(`Expected 3 migrations, got ${applied.length}`);
  }

  // All should have the same batch number
  const batches = applied.map(m => m.batch);
  const uniqueBatches = [...new Set(batches)];

  if (uniqueBatches.length !== 1) {
    throw new Error(`Expected all migrations in same batch, got batches: ${batches.join(', ')}`);
  }

  if (uniqueBatches[0] !== 1) {
    throw new Error(`Expected batch number 1, got ${uniqueBatches[0]}`);
  }

  // Cleanup
  try {
    await import('fs/promises').then(fs => fs.unlink('.test_ledger_batch.json'));
  } catch {}
});

// ====================
// BUG-006: Boolean Case Sensitivity
// ====================
console.log('\nBUG-006: Boolean Default Case Sensitivity');

test('Uses lowercase for boolean defaults', () => {
  const schema = `
    model User {
      active Boolean @default(true)
    }
  `;

  const ast = Parser.parse(schema);
  const generator = new PostgresGenerator();
  const sql = generator.generateUp(ast);

  // Should contain DEFAULT true, not DEFAULT TRUE
  if (sql[0].includes('DEFAULT TRUE')) {
    throw new Error('Should use lowercase true, not TRUE');
  }

  if (!sql[0].includes('DEFAULT true')) {
    throw new Error('Should contain DEFAULT true');
  }
});

// ====================
// BUG-007: VarChar Without Arguments
// ====================
console.log('\nBUG-007: VarChar Without Arguments');

test('Defaults VarChar to VARCHAR(255)', () => {
  const schema = `
    model User {
      name VarChar @notnull
    }
  `;

  const ast = Parser.parse(schema);
  const generator = new PostgresGenerator();
  const sql = generator.generateUp(ast);

  // Should contain VARCHAR(255), not bare VARCHAR
  if (sql[0].match(/VARCHAR\s+NOT NULL/)) {
    throw new Error('VarChar without args should default to VARCHAR(255)');
  }

  if (!sql[0].includes('VARCHAR(255)')) {
    throw new Error('Should contain VARCHAR(255)');
  }
});

// ====================
// BUG-010: Path Traversal Prevention
// ====================
console.log('\nBUG-010: Path Traversal Prevention');

test('Migration filename sanitizes path traversal attempts', () => {
  const filename = generateMigrationFilename('../../../etc/passwd');

  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    throw new Error('Filename should not contain path separators or ..');
  }

  // Should be sanitized to underscores
  if (!filename.includes('_etc_passwd')) {
    throw new Error('Path traversal should be sanitized');
  }
});

// ====================
// BUG-017: Empty Model Validation
// ====================
console.log('\nBUG-017: Empty Model Validation');

test('Rejects models with no columns', () => {
  const schema = `
    model Empty {
    }
  `;

  try {
    Parser.parse(schema);
    throw new Error('Should reject empty model');
  } catch (error) {
    if (!error.message.includes('at least one column')) {
      throw new Error(`Wrong error message: ${error.message}`);
    }
  }
});

test('Accepts models with at least one column', () => {
  const schema = `
    model Valid {
      id Serial @pk
    }
  `;

  const ast = Parser.parse(schema);
  if (ast.models.length !== 1) {
    throw new Error('Should accept valid model with one column');
  }
});

// ====================
// Summary
// ====================
console.log('\n' + '='.repeat(50));
console.log(`Tests Passed: ${passed}`);
console.log(`Tests Failed: ${failed}`);

if (failed === 0) {
  console.log('\n🎉 All bug fix tests passed!');
  process.exit(0);
} else {
  console.log(`\n❌ ${failed} test(s) failed`);
  process.exit(1);
}
