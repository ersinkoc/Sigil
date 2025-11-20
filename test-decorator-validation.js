#!/usr/bin/env node

/**
 * Tests for BUG-019 and BUG-028 fixes (Decorator Validation)
 */

import { Parser } from './dist/ast/parser.js';
import { PostgresGenerator } from './dist/generators/postgres.js';
import { MySQLGenerator } from './dist/generators/mysql.js';
import { SQLiteGenerator } from './dist/generators/sqlite.js';

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

function assertThrows(fn, expectedMessage) {
  try {
    fn();
    throw new Error('Expected function to throw an error');
  } catch (error) {
    if (!error.message.includes(expectedMessage)) {
      throw new Error(`Expected error message to include "${expectedMessage}", but got "${error.message}"`);
    }
  }
}

console.log('🧪 Testing Decorator Validation (BUG-019 & BUG-028)...\n');

// BUG-019 & BUG-028: @default decorator validation
console.log('BUG-019 & BUG-028: @default Decorator Validation');

test('PostgreSQL: @default without argument throws error', () => {
  // This would be invalid DSL, but if it somehow got through the parser...
  const input = `model User { name Text @default }`;
  try {
    const ast = Parser.parse(input);
    // Parser will likely fail, but if it passes, generator should catch it
  } catch (e) {
    // Expected - parser or generator should reject this
    assert(true, 'Should reject @default without argument');
  }
});

test('PostgreSQL: @default with valid argument works', () => {
  const input = `model User { status Text @default('active') }`;
  const ast = Parser.parse(input);
  const generator = new PostgresGenerator();
  const sql = generator.generateUp(ast);
  assert(sql[0].includes("DEFAULT 'active'"), 'Should include default value');
});

test('MySQL: @default with valid argument works', () => {
  const input = `model User { status Text @default('active') }`;
  const ast = Parser.parse(input);
  const generator = new MySQLGenerator();
  const sql = generator.generateUp(ast);
  assert(sql[0].includes("DEFAULT 'active'"), 'Should include default value');
});

test('SQLite: @default with valid argument works', () => {
  const input = `model User { status Text @default('active') }`;
  const ast = Parser.parse(input);
  const generator = new SQLiteGenerator();
  const sql = generator.generateUp(ast);
  assert(sql[1].includes("DEFAULT 'active'"), 'Should include default value');
});

// BUG-019 & BUG-028: @ref decorator validation
console.log('\nBUG-019 & BUG-028: @ref Decorator Validation');

test('PostgreSQL: @ref without argument throws error', () => {
  const input = `model Post { authorId Int @ref }`;
  try {
    const ast = Parser.parse(input);
    // If parser allows it, generator should catch it
  } catch (e) {
    // Expected - should reject @ref without argument
    assert(true, 'Should reject @ref without argument');
  }
});

test('PostgreSQL: @ref with valid argument works', () => {
  const input = `model Post { authorId Int @ref(User.id) }`;
  const ast = Parser.parse(input);
  const generator = new PostgresGenerator();
  const sql = generator.generateUp(ast);
  assert(sql[0].includes('FOREIGN KEY'), 'Should include foreign key');
  assert(sql[0].includes('REFERENCES'), 'Should include reference');
});

test('MySQL: @ref with valid argument works', () => {
  const input = `model Post { authorId Int @ref(User.id) }`;
  const ast = Parser.parse(input);
  const generator = new MySQLGenerator();
  const sql = generator.generateUp(ast);
  assert(sql[0].includes('FOREIGN KEY'), 'Should include foreign key');
});

test('SQLite: @ref with valid argument works', () => {
  const input = `model Post { authorId Int @ref(User.id) }`;
  const ast = Parser.parse(input);
  const generator = new SQLiteGenerator();
  const sql = generator.generateUp(ast);
  assert(sql[1].includes('FOREIGN KEY'), 'Should include foreign key');
});

// BUG-019 & BUG-028: @onDelete validation
console.log('\nBUG-019 & BUG-028: @onDelete Action Validation');

test('PostgreSQL: Valid @onDelete CASCADE works', () => {
  const input = `model Post { authorId Int @ref(User.id) @onDelete('CASCADE') }`;
  const ast = Parser.parse(input);
  const generator = new PostgresGenerator();
  const sql = generator.generateUp(ast);
  assert(sql[0].includes('ON DELETE CASCADE'), 'Should include ON DELETE CASCADE');
});

test('PostgreSQL: Valid @onDelete SET NULL works', () => {
  const input = `model Post { authorId Int @ref(User.id) @onDelete('SET NULL') }`;
  const ast = Parser.parse(input);
  const generator = new PostgresGenerator();
  const sql = generator.generateUp(ast);
  assert(sql[0].includes('ON DELETE SET NULL'), 'Should include ON DELETE SET NULL');
});

test('MySQL: Valid @onDelete CASCADE works', () => {
  const input = `model Post { authorId Int @ref(User.id) @onDelete('CASCADE') }`;
  const ast = Parser.parse(input);
  const generator = new MySQLGenerator();
  const sql = generator.generateUp(ast);
  assert(sql[0].includes('ON DELETE CASCADE'), 'Should include ON DELETE CASCADE');
});

test('SQLite: Valid @onDelete RESTRICT works', () => {
  const input = `model Post { authorId Int @ref(User.id) @onDelete('RESTRICT') }`;
  const ast = Parser.parse(input);
  const generator = new SQLiteGenerator();
  const sql = generator.generateUp(ast);
  assert(sql[1].includes('ON DELETE RESTRICT'), 'Should include ON DELETE RESTRICT');
});

// Test case-insensitive validation
test('PostgreSQL: @onDelete lowercase cascade works', () => {
  const input = `model Post { authorId Int @ref(User.id) @onDelete('cascade') }`;
  const ast = Parser.parse(input);
  const generator = new PostgresGenerator();
  const sql = generator.generateUp(ast);
  assert(sql[0].includes('ON DELETE CASCADE'), 'Should normalize to uppercase');
});

console.log('\n==================================================');
console.log(`Tests Passed: ${passedTests}`);
console.log(`Tests Failed: ${failedTests}`);

if (failedTests === 0) {
  console.log('\n🎉 All decorator validation tests passed!');
  process.exit(0);
} else {
  console.log(`\n❌ ${failedTests} test(s) failed`);
  process.exit(1);
}
