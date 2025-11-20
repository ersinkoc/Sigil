#!/usr/bin/env node

/**
 * Tests for BUG-033: Numeric/Decimal Type Defaults
 * Verifies consistent precision/scale defaults across generators
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

console.log('🧪 Testing BUG-033: Numeric/Decimal Type Defaults...\n');

// Test schema with various Numeric/Decimal configurations
const testSchemaNoArgs = `
model Product {
  id     Serial   @pk
  price  Numeric  @notnull
}
`;

const testSchemaOneArg = `
model Product {
  id     Serial      @pk
  price  Numeric(10) @notnull
}
`;

const testSchemaTwoArgs = `
model Product {
  id     Serial         @pk
  price  Numeric(10, 2) @notnull
}
`;

const testSchemaDecimal = `
model Product {
  id     Serial   @pk
  price  Decimal  @notnull
}
`;

// Test PostgreSQL generator
console.log('PostgreSQL Generator');

test('PostgreSQL: Numeric without args defaults to NUMERIC(10, 2)', () => {
  const ast = Parser.parse(testSchemaNoArgs);
  const generator = new PostgresGenerator();
  const sql = generator.generateUp(ast);

  assert(
    sql[0].includes('NUMERIC(10, 2)'),
    'Should default to NUMERIC(10, 2)'
  );

  assert(
    !sql[0].match(/\sNUMERIC\s/),
    'Should not have bare NUMERIC'
  );
});

test('PostgreSQL: Numeric with one arg uses NUMERIC(n)', () => {
  const ast = Parser.parse(testSchemaOneArg);
  const generator = new PostgresGenerator();
  const sql = generator.generateUp(ast);

  assert(
    sql[0].includes('NUMERIC(10)'),
    'Should use NUMERIC(10) with single argument'
  );
});

test('PostgreSQL: Numeric with two args uses NUMERIC(p, s)', () => {
  const ast = Parser.parse(testSchemaTwoArgs);
  const generator = new PostgresGenerator();
  const sql = generator.generateUp(ast);

  assert(
    sql[0].includes('NUMERIC(10, 2)'),
    'Should use NUMERIC(10, 2) with both arguments'
  );
});

test('PostgreSQL: Decimal without args defaults to NUMERIC(10, 2)', () => {
  const ast = Parser.parse(testSchemaDecimal);
  const generator = new PostgresGenerator();
  const sql = generator.generateUp(ast);

  assert(
    sql[0].includes('NUMERIC(10, 2)'),
    'Decimal should also default to NUMERIC(10, 2)'
  );
});

// Test MySQL generator
console.log('\nMySQL Generator');

test('MySQL: Numeric without args defaults to DECIMAL(10, 2)', () => {
  const ast = Parser.parse(testSchemaNoArgs);
  const generator = new MySQLGenerator();
  const sql = generator.generateUp(ast);

  assert(
    sql[0].includes('DECIMAL(10, 2)'),
    'Should default to DECIMAL(10, 2)'
  );
});

test('MySQL: Numeric with one arg uses DECIMAL(n)', () => {
  const ast = Parser.parse(testSchemaOneArg);
  const generator = new MySQLGenerator();
  const sql = generator.generateUp(ast);

  assert(
    sql[0].includes('DECIMAL(10)'),
    'Should use DECIMAL(10) with single argument'
  );
});

test('MySQL: Numeric with two args uses DECIMAL(p, s)', () => {
  const ast = Parser.parse(testSchemaTwoArgs);
  const generator = new MySQLGenerator();
  const sql = generator.generateUp(ast);

  assert(
    sql[0].includes('DECIMAL(10, 2)'),
    'Should use DECIMAL(10, 2) with both arguments'
  );
});

test('MySQL: Decimal without args defaults to DECIMAL(10, 2)', () => {
  const ast = Parser.parse(testSchemaDecimal);
  const generator = new MySQLGenerator();
  const sql = generator.generateUp(ast);

  assert(
    sql[0].includes('DECIMAL(10, 2)'),
    'Decimal should also default to DECIMAL(10, 2)'
  );
});

// Test SQLite generator (maps to REAL)
console.log('\nSQLite Generator');

test('SQLite: Numeric maps to REAL', () => {
  const ast = Parser.parse(testSchemaNoArgs);
  const generator = new SQLiteGenerator();
  const sql = generator.generateUp(ast);

  // SQLite CREATE statement is at index 1 (0 is PRAGMA)
  assert(
    sql[1].includes('REAL'),
    'Should map Numeric to REAL in SQLite'
  );
});

test('SQLite: Decimal maps to REAL', () => {
  const ast = Parser.parse(testSchemaDecimal);
  const generator = new SQLiteGenerator();
  const sql = generator.generateUp(ast);

  assert(
    sql[1].includes('REAL'),
    'Should map Decimal to REAL in SQLite'
  );
});

// Test consistency across generators
console.log('\nCross-Generator Consistency');

test('PostgreSQL and MySQL have same default precision/scale', () => {
  const ast = Parser.parse(testSchemaNoArgs);

  const pgGen = new PostgresGenerator();
  const pgSQL = pgGen.generateUp(ast)[0];

  const mysqlGen = new MySQLGenerator();
  const mysqlSQL = mysqlGen.generateUp(ast)[0];

  // Both should have (10, 2)
  const hasSameDefaults =
    pgSQL.match(/NUMERIC\(10,\s*2\)/) !== null &&
    mysqlSQL.match(/DECIMAL\(10,\s*2\)/) !== null;

  assert(
    hasSameDefaults,
    'PostgreSQL NUMERIC and MySQL DECIMAL should both default to (10, 2)'
  );
});

test('Explicit args produce consistent results', () => {
  const ast = Parser.parse(testSchemaTwoArgs);

  const pgGen = new PostgresGenerator();
  const pgSQL = pgGen.generateUp(ast)[0];

  const mysqlGen = new MySQLGenerator();
  const mysqlSQL = mysqlGen.generateUp(ast)[0];

  // Both should use (10, 2)
  assert(
    pgSQL.includes('NUMERIC(10, 2)') && mysqlSQL.includes('DECIMAL(10, 2)'),
    'Explicit args should produce consistent precision/scale'
  );
});

// Test edge cases
console.log('\nEdge Cases');

test('Large precision values are preserved', () => {
  const schema = `model Product { price Numeric(20, 4) }`;
  const ast = Parser.parse(schema);

  const pgGen = new PostgresGenerator();
  const pgSQL = pgGen.generateUp(ast)[0];

  assert(
    pgSQL.includes('NUMERIC(20, 4)'),
    'Should preserve large precision values'
  );
});

test('Zero scale is valid', () => {
  const schema = `model Product { price Numeric(10, 0) }`;
  const ast = Parser.parse(schema);

  const pgGen = new PostgresGenerator();
  const pgSQL = pgGen.generateUp(ast)[0];

  assert(
    pgSQL.includes('NUMERIC(10, 0)'),
    'Should allow zero scale'
  );
});

test('Single precision arg works', () => {
  const schema = `model Product { price Numeric(5) }`;
  const ast = Parser.parse(schema);

  const pgGen = new PostgresGenerator();
  const pgSQL = pgGen.generateUp(ast)[0];

  assert(
    pgSQL.includes('NUMERIC(5)'),
    'Should preserve single precision argument'
  );
});

console.log('\n==================================================');
console.log(`Tests Passed: ${passedTests}`);
console.log(`Tests Failed: ${failedTests}`);

if (failedTests === 0) {
  console.log('\n🎉 All numeric/decimal default tests passed!');
  console.log('✅ BUG-033 FIXED: Numeric types now have consistent defaults');
  process.exit(0);
} else {
  console.log(`\n❌ ${failedTests} test(s) failed`);
  process.exit(1);
}
