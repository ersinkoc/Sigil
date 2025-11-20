#!/usr/bin/env node

/**
 * Tests for BUG-014: MySQL Charset Configuration
 */

import { Parser } from './dist/ast/parser.js';
import { MySQLGenerator } from './dist/generators/mysql.js';

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

console.log('🧪 Testing BUG-014: MySQL Charset Configuration...\n');

const testSchema = `
model User {
  id    Serial  @pk
  name  Text    @notnull
}
`;

// Test default configuration (backward compatibility)
console.log('Default Configuration (Backward Compatibility)');

test('MySQL: Default charset is utf8mb4', () => {
  const ast = Parser.parse(testSchema);
  const generator = new MySQLGenerator(); // No options
  const sql = generator.generateUp(ast);
  assert(sql[0].includes('CHARSET=utf8mb4'), 'Should use utf8mb4 by default');
});

test('MySQL: Default collation is utf8mb4_unicode_ci', () => {
  const ast = Parser.parse(testSchema);
  const generator = new MySQLGenerator();
  const sql = generator.generateUp(ast);
  assert(sql[0].includes('COLLATE=utf8mb4_unicode_ci'), 'Should use utf8mb4_unicode_ci by default');
});

test('MySQL: Default engine is InnoDB', () => {
  const ast = Parser.parse(testSchema);
  const generator = new MySQLGenerator();
  const sql = generator.generateUp(ast);
  assert(sql[0].includes('ENGINE=InnoDB'), 'Should use InnoDB by default');
});

// Test custom configuration
console.log('\nCustom Configuration');

test('MySQL: Custom charset latin1 works', () => {
  const ast = Parser.parse(testSchema);
  const generator = new MySQLGenerator({ charset: 'latin1' });
  const sql = generator.generateUp(ast);
  assert(sql[0].includes('CHARSET=latin1'), 'Should use custom charset latin1');
});

test('MySQL: Custom collation latin1_swedish_ci works', () => {
  const ast = Parser.parse(testSchema);
  const generator = new MySQLGenerator({
    charset: 'latin1',
    collation: 'latin1_swedish_ci'
  });
  const sql = generator.generateUp(ast);
  assert(sql[0].includes('COLLATE=latin1_swedish_ci'), 'Should use custom collation');
  assert(sql[0].includes('CHARSET=latin1'), 'Should use custom charset');
});

test('MySQL: Custom engine MyISAM works', () => {
  const ast = Parser.parse(testSchema);
  const generator = new MySQLGenerator({ engine: 'MyISAM' });
  const sql = generator.generateUp(ast);
  assert(sql[0].includes('ENGINE=MyISAM'), 'Should use custom engine MyISAM');
});

test('MySQL: All custom options work together', () => {
  const ast = Parser.parse(testSchema);
  const generator = new MySQLGenerator({
    engine: 'MyISAM',
    charset: 'latin1',
    collation: 'latin1_swedish_ci'
  });
  const sql = generator.generateUp(ast);
  assert(sql[0].includes('ENGINE=MyISAM'), 'Should use custom engine');
  assert(sql[0].includes('CHARSET=latin1'), 'Should use custom charset');
  assert(sql[0].includes('COLLATE=latin1_swedish_ci'), 'Should use custom collation');
});

test('MySQL: Partial custom options work (only charset)', () => {
  const ast = Parser.parse(testSchema);
  const generator = new MySQLGenerator({ charset: 'utf8' });
  const sql = generator.generateUp(ast);
  assert(sql[0].includes('CHARSET=utf8'), 'Should use custom charset');
  assert(sql[0].includes('ENGINE=InnoDB'), 'Should use default engine');
  assert(sql[0].includes('COLLATE=utf8mb4_unicode_ci'), 'Should use default collation');
});

// Test real-world scenarios
console.log('\nReal-World Scenarios');

test('MySQL: UTF-8 (old) configuration', () => {
  const ast = Parser.parse(testSchema);
  const generator = new MySQLGenerator({
    charset: 'utf8',
    collation: 'utf8_general_ci'
  });
  const sql = generator.generateUp(ast);
  assert(sql[0].includes('CHARSET=utf8'), 'Should support older UTF-8');
  assert(sql[0].includes('COLLATE=utf8_general_ci'), 'Should support general collation');
});

test('MySQL: utf8mb4_bin collation for case-sensitive', () => {
  const ast = Parser.parse(testSchema);
  const generator = new MySQLGenerator({
    collation: 'utf8mb4_bin'
  });
  const sql = generator.generateUp(ast);
  assert(sql[0].includes('COLLATE=utf8mb4_bin'), 'Should support binary collation');
});

console.log('\n==================================================');
console.log(`Tests Passed: ${passedTests}`);
console.log(`Tests Failed: ${failedTests}`);

if (failedTests === 0) {
  console.log('\n🎉 All MySQL configuration tests passed!');
  process.exit(0);
} else {
  console.log(`\n❌ ${failedTests} test(s) failed`);
  process.exit(1);
}
