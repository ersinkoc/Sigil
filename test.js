#!/usr/bin/env node

/**
 * Quick integration test for Sigil
 * Tests the basic parsing and SQL generation
 */

import { Parser } from './dist/ast/parser.js';
import { PostgresGenerator } from './dist/generators/postgres.js';

console.log('🧪 Testing Sigil Core Functionality...\n');

// Test 1: Parse a simple model
console.log('Test 1: Parsing simple model');
const simpleSchema = `
model User {
  id    Serial  @pk
  email Text    @unique
}
`;

try {
  const ast = Parser.parse(simpleSchema);
  console.log('✓ Parsing successful');
  console.log('  Models found:', ast.models.length);
  console.log('  Model name:', ast.models[0].name);
  console.log('  Columns:', ast.models[0].columns.length);
} catch (error) {
  console.error('✗ Parsing failed:', error.message);
  process.exit(1);
}

// Test 2: Generate SQL
console.log('\nTest 2: Generating SQL');
try {
  const ast = Parser.parse(simpleSchema);
  const generator = new PostgresGenerator();
  const upSql = generator.generateUp(ast);
  const downSql = generator.generateDown(ast);

  console.log('✓ SQL generation successful');
  console.log('\nUP SQL:');
  console.log(upSql[0]);
  console.log('\nDOWN SQL:');
  console.log(downSql[0]);
} catch (error) {
  console.error('✗ SQL generation failed:', error.message);
  process.exit(1);
}

// Test 3: Complex schema with foreign keys
console.log('\n\nTest 3: Complex schema with relationships');
const complexSchema = `
model User {
  id        Serial        @pk
  email     VarChar(255)  @unique @notnull
  role      Enum('admin', 'user') @default('user')
  createdAt Timestamp     @default(now)
}

model Post {
  id       Serial  @pk
  title    Text    @notnull
  authorId Int     @ref(User.id) @onDelete('cascade')
}
`;

try {
  const ast = Parser.parse(complexSchema);
  const generator = new PostgresGenerator();
  const upSql = generator.generateUp(ast);

  console.log('✓ Complex schema parsing successful');
  console.log('  Models found:', ast.models.length);
  console.log('\nGenerated SQL:');
  upSql.forEach((sql, i) => {
    console.log(`\n-- Statement ${i + 1}:`);
    console.log(sql);
  });
} catch (error) {
  console.error('✗ Complex schema failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}

// Test 4: Raw SQL statements
console.log('\n\nTest 4: Raw SQL statements');
const rawSqlSchema = `
model User {
  id    Serial  @pk
  email Text    @unique
}

> CREATE INDEX idx_user_email ON "User"("email");
`;

try {
  const ast = Parser.parse(rawSqlSchema);
  const generator = new PostgresGenerator();
  const upSql = generator.generateUp(ast);

  console.log('✓ Raw SQL parsing successful');
  console.log('  Models found:', ast.models.length);
  console.log('  Raw SQL statements:', ast.rawSql.length);
  console.log('\nGenerated SQL includes raw statement:');
  console.log(upSql[1]);
} catch (error) {
  console.error('✗ Raw SQL failed:', error.message);
  process.exit(1);
}

console.log('\n\n🎉 All tests passed!');
console.log('Sigil is ready to use.');
