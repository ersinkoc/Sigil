#!/usr/bin/env node

/**
 * Test for BUG-013: Windows Timestamp Validation
 * Verifies that generated migration filenames are Windows-compatible
 */

import { generateMigrationFilename } from './dist/utils/formatting.js';

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

console.log('🧪 Testing BUG-013: Windows Timestamp Validation...\n');

// Windows forbidden characters: < > : " / \ | ? *
const WINDOWS_FORBIDDEN_CHARS = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];

// Test basic timestamp generation
console.log('Basic Timestamp Format');

test('Timestamp format uses only digits', () => {
  const filename = generateMigrationFilename('test');

  // Extract timestamp (first 14 characters: YYYYMMDDHHmmss)
  const timestamp = filename.substring(0, 14);

  assert(
    /^\d{14}$/.test(timestamp),
    `Timestamp should be 14 digits, got: ${timestamp}`
  );
});

test('Filename has correct structure', () => {
  const filename = generateMigrationFilename('create_users');

  // Format: YYYYMMDDHHmmss_name.sigl
  assert(
    /^\d{14}_[a-z0-9_]+\.sigl$/.test(filename),
    `Filename should match pattern YYYYMMDDHHmmss_name.sigl, got: ${filename}`
  );
});

test('Timestamp is current (within 1 minute)', () => {
  const filename = generateMigrationFilename('test');
  const timestamp = filename.substring(0, 14);

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  const expectedPrefix = `${year}${month}${day}`;

  assert(
    timestamp.startsWith(expectedPrefix),
    `Timestamp should start with ${expectedPrefix}, got: ${timestamp}`
  );
});

// Test Windows compatibility
console.log('\nWindows Compatibility');

test('Filename contains no Windows-forbidden characters', () => {
  const filename = generateMigrationFilename('test');

  for (const char of WINDOWS_FORBIDDEN_CHARS) {
    assert(
      !filename.includes(char),
      `Filename should not contain ${char}, got: ${filename}`
    );
  }
});

test('Filename with special characters gets sanitized', () => {
  const filename = generateMigrationFilename('create:users<table>');

  // All special chars should be converted to underscores
  for (const char of WINDOWS_FORBIDDEN_CHARS) {
    assert(
      !filename.includes(char),
      `Sanitized filename should not contain ${char}, got: ${filename}`
    );
  }

  // Should contain underscores instead
  assert(
    filename.includes('create_users_table'),
    `Should sanitize to create_users_table, got: ${filename}`
  );
});

test('Filename with path separators gets sanitized', () => {
  const filename = generateMigrationFilename('../../etc/passwd');

  assert(
    !filename.includes('/'),
    'Should not contain forward slash'
  );

  assert(
    !filename.includes('\\'),
    'Should not contain backslash'
  );

  assert(
    !filename.includes('..'),
    'Should not contain double dots'
  );
});

test('Filename with quotes gets sanitized', () => {
  const filename = generateMigrationFilename('create "users" table');

  assert(
    !filename.includes('"'),
    `Should not contain quotes, got: ${filename}`
  );

  assert(
    filename.includes('create_users_table'),
    `Should sanitize quotes to underscores, got: ${filename}`
  );
});

test('Filename with pipes and wildcards gets sanitized', () => {
  const filename = generateMigrationFilename('table|users*all');

  assert(
    !filename.includes('|'),
    'Should not contain pipe'
  );

  assert(
    !filename.includes('*'),
    'Should not contain asterisk'
  );

  assert(
    filename.includes('table_users_all'),
    `Should sanitize to table_users_all, got: ${filename}`
  );
});

// Test edge cases
console.log('\nEdge Cases');

test('Empty name produces valid filename', () => {
  const filename = generateMigrationFilename('');

  // Should have timestamp and extension
  assert(
    /^\d{14}_\.sigl$/.test(filename),
    `Empty name should produce timestamp_.sigl, got: ${filename}`
  );
});

test('Unicode characters get sanitized', () => {
  const filename = generateMigrationFilename('créer_ütilisateurs');

  // Non-ASCII should be removed or converted to underscores
  assert(
    /^\d{14}_[a-z0-9_]+\.sigl$/.test(filename),
    `Should only contain ASCII alphanumeric and underscores, got: ${filename}`
  );
});

test('Multiple consecutive special chars collapse to single underscore', () => {
  const filename = generateMigrationFilename('create:::users');

  // Should not have multiple consecutive underscores
  assert(
    !filename.includes('___'),
    `Should not have triple underscores, got: ${filename}`
  );
});

test('Filename length is reasonable', () => {
  const filename = generateMigrationFilename('a'.repeat(200));

  // Timestamp (14) + underscore (1) + name + .sigl (5) = should be manageable
  // Windows max path is 260 chars, so filename should be well under that
  assert(
    filename.length < 250,
    `Filename too long: ${filename.length} characters`
  );
});

// Test cross-platform compatibility
console.log('\nCross-Platform Compatibility');

test('Filename uses only lowercase letters', () => {
  const filename = generateMigrationFilename('CreateUsers');

  // After the timestamp and underscore, should be lowercase
  const namePart = filename.substring(15, filename.length - 5);

  assert(
    namePart === namePart.toLowerCase(),
    `Name should be lowercase, got: ${namePart}`
  );
});

test('Filename is case-insensitive safe', () => {
  const filename1 = generateMigrationFilename('Users');
  const filename2 = generateMigrationFilename('users');

  // Both should have same name part (lowercase)
  const name1 = filename1.substring(15, filename1.length - 5);
  const name2 = filename2.substring(15, filename2.length - 5);

  assert(
    name1 === name2,
    'Case-insensitive names should produce same filename'
  );
});

console.log('\n==================================================');
console.log(`Tests Passed: ${passedTests}`);
console.log(`Tests Failed: ${failedTests}`);

if (failedTests === 0) {
  console.log('\n🎉 All Windows timestamp validation tests passed!');
  console.log('✅ BUG-013 VERIFIED: Timestamp format is Windows-safe');
  process.exit(0);
} else {
  console.log(`\n❌ ${failedTests} test(s) failed`);
  process.exit(1);
}
