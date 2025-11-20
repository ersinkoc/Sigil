# Sigil Bug Analysis Report
**Date**: 2025-11-20
**Analyzer**: Comprehensive Repository Bug Analysis System
**Repository**: Sigil - Zero-Dependency Database Schema Management Tool

## Executive Summary
- **Total Bugs Found**: 20
- **Critical**: 3
- **High**: 5
- **Medium**: 8
- **Low**: 4

## Critical Findings

### BUG-001: SQL Injection Vulnerability in All Introspectors
**Severity**: CRITICAL
**Category**: Security
**File(s)**:
- `src/engine/introspector.ts:62, 95, 130`
- `src/engine/mysql-introspector.ts:61, 97, 120`
- `src/engine/sqlite-introspector.ts:110, 117`

**Description**:
All three database introspectors (PostgreSQL, MySQL, SQLite) use direct string interpolation to build SQL queries with user-provided input (schema names, database names, table names). This creates a critical SQL injection vulnerability.

**Current Behavior**:
```typescript
// PostgreSQL Introspector - Line 62
const query = `
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = '${schema}'  // VULNERABLE TO SQL INJECTION
    AND table_type = 'BASE TABLE'
  ORDER BY table_name;
`;
```

**Expected Behavior**:
Should use parameterized queries or proper escaping/validation of user input.

**Impact Assessment**:
- **User Impact**: Attacker can execute arbitrary SQL, potentially reading sensitive data, modifying database structure, or escalating privileges
- **System Impact**: Complete database compromise
- **Business Impact**: Data breach, compliance violations, reputational damage

**Reproduction Steps**:
1. Call `sigil pull` with a malicious schema name: `sigil pull "public'; DROP TABLE users; --"`
2. The constructed query becomes: `WHERE table_schema = 'public'; DROP TABLE users; --'`
3. SQL injection executes, dropping the users table

**Verification Method**:
```typescript
// Test with SQL injection payload
const maliciousSchema = "public'; DROP TABLE test; --";
await introspector.introspect(maliciousSchema);
// Query executed: WHERE table_schema = 'public'; DROP TABLE test; --'
```

---

### BUG-002: Invalid CHECK Constraint Syntax in PostgreSQL Generator
**Severity**: CRITICAL
**Category**: Functional
**File(s)**: `src/generators/postgres.ts:200`

**Description**:
The PostgreSQL generator creates invalid CHECK constraint syntax for ENUM types. It uses the keyword `VALUE` which doesn't exist in PostgreSQL CHECK constraints, instead of using the actual column name.

**Current Behavior**:
```typescript
case 'Enum':
  if (args && args.length > 0) {
    const values = args.map((v) => `'${v}'`).join(', ');
    return `VARCHAR(50) CHECK (VALUE IN (${values}))`; // WRONG: VALUE doesn't exist
  }
  throw new GeneratorError('Enum type requires values');
```

**Generated SQL (INVALID)**:
```sql
"role" VARCHAR(50) CHECK (VALUE IN ('admin', 'user')) DEFAULT 'user'
```

**Expected Behavior**:
```sql
"role" VARCHAR(50) CHECK ("role" IN ('admin', 'user')) DEFAULT 'user'
```

**Impact Assessment**:
- **User Impact**: Migration fails with PostgreSQL syntax error
- **System Impact**: All migrations with ENUM types fail
- **Business Impact**: Blocks deployment, requires manual intervention

**Reproduction Steps**:
1. Create a migration with an Enum field: `role Enum('admin', 'user')`
2. Run `sigil up`
3. PostgreSQL returns: `ERROR: column "value" does not exist`

---

### BUG-003: Ledger Batch Calculation Fails When Empty
**Severity**: HIGH
**Category**: Functional / Edge Case
**File(s)**: `src/engine/ledger.ts:127-130`

**Description**:
When rolling back the last batch of migrations and the migrations array becomes empty, the `Math.max` function with spread operator on an empty array returns `-Infinity` instead of `0`, causing incorrect batch tracking.

**Current Behavior**:
```typescript
async rollbackLastBatch(): Promise<void> {
  if (this.ledger.currentBatch === 0) {
    return;
  }

  this.ledger.migrations = this.ledger.migrations.filter(
    (m) => m.batch !== this.ledger.currentBatch
  );

  // BUG: If migrations array is now empty, ...migrations.map() spreads nothing
  // Math.max(0, ) returns -Infinity when spread is empty
  this.ledger.currentBatch = Math.max(
    0,
    ...this.ledger.migrations.map((m) => m.batch)
  );

  await this.save();
}
```

**Expected Behavior**:
Should safely handle empty migrations array and set currentBatch to 0.

**Impact Assessment**:
- **User Impact**: Ledger corruption, migrations tracking broken
- **System Impact**: Subsequent migrations may fail or apply incorrectly
- **Business Impact**: Data integrity issues

**Verification Method**:
```typescript
// Test case
const ledger = new LedgerManager();
await ledger.load();
// Apply one migration batch
await ledger.recordMigration('test.sigl', 'content');
// Roll it back (migrations array becomes empty)
await ledger.rollbackLastBatch();
// currentBatch should be 0, but might be -Infinity or NaN
console.log(ledger.getCurrentBatch()); // Expected: 0
```

---

## High Priority Bugs

### BUG-004: Missing Atomicity in Migration Batch Recording
**Severity**: HIGH
**Category**: Functional
**File(s)**: `src/engine/runner.ts:98-115`, `src/engine/ledger.ts:98-112`

**Description**:
The migration runner records each migration in the ledger immediately after execution, but doesn't rollback ledger entries if a subsequent migration in the same batch fails. This leaves the system in an inconsistent state.

**Current Behavior**:
```typescript
for (const filename of pendingFiles) {
  const migration = migrations.find((m) => m.filename === filename);
  if (!migration) continue;

  const ast = Parser.parse(migration.content);
  const sqlStatements = this.generator.generateUp(ast);

  await this.adapter.transaction(sqlStatements); // SQL transaction

  // Records immediately - no rollback if next migration fails!
  await this.ledger.recordMigration(migration.filename, migration.content);

  applied.push(filename);
}
```

**Expected Behavior**:
Should either:
1. Record all migrations in the batch only after all succeed
2. Rollback ledger entries if any migration in batch fails
3. Use a two-phase commit approach

**Impact Assessment**:
- **User Impact**: Inconsistent migration state, difficult to recover
- **System Impact**: Manual intervention required to fix ledger
- **Business Impact**: Deployment failures, downtime

---

### BUG-005: Race Condition in Concurrent Migration Recording
**Severity**: HIGH
**Category**: Functional
**File(s)**: `src/engine/ledger.ts:98-112`

**Description**:
The `recordMigration` method increments the batch number based on current state, but doesn't handle concurrent calls correctly. Multiple migrations in the same batch could get different batch numbers.

**Current Behavior**:
```typescript
async recordMigration(filename: string, content: string): Promise<void> {
  const hash = LedgerManager.computeHash(content);
  const appliedAt = new Date().toISOString();

  const entry: LedgerEntry = {
    filename,
    hash,
    appliedAt,
    batch: this.ledger.currentBatch + 1, // Race condition: reads current, adds 1
  };

  this.ledger.migrations.push(entry);
  this.ledger.currentBatch = entry.batch; // Updates current

  await this.save(); // Async save - race window
}
```

**Impact Assessment**:
- **User Impact**: Incorrect batch tracking
- **System Impact**: Rollback may affect wrong migrations
- **Business Impact**: Data integrity issues

---

### BUG-006: Boolean Default Value Case Sensitivity Issue
**Severity**: MEDIUM
**Category**: Functional
**File(s)**: `src/generators/postgres.ts:215-216`

**Description**:
The generator converts boolean default values to uppercase (`TRUE`/`FALSE`), but PostgreSQL prefers lowercase. While PostgreSQL accepts both, this inconsistency can cause issues with case-sensitive string comparisons.

**Current Behavior**:
```typescript
if (value.toLowerCase() === 'true' || value.toLowerCase() === 'false') {
  return value.toUpperCase(); // Returns 'TRUE' or 'FALSE'
}
```

**Expected Behavior**:
```typescript
return value.toLowerCase(); // Returns 'true' or 'false'
```

---

### BUG-007: VarChar Without Arguments Returns Invalid SQL
**Severity**: MEDIUM
**Category**: Edge Case
**File(s)**: `src/generators/postgres.ts:150`

**Description**:
When VarChar type is used without specifying length, the generator returns `VARCHAR` without a size, which may not be valid in all database contexts.

**Current Behavior**:
```typescript
case 'VarChar':
  if (args && args.length > 0) {
    return `VARCHAR(${args[0]})`;
  }
  return 'VARCHAR'; // Missing size - may be invalid
```

**Expected Behavior**:
Should either require size or default to a reasonable value (e.g., VARCHAR(255)).

---

### BUG-008: SQL Injection in getTables Methods
**Severity**: HIGH
**Category**: Security
**File(s)**:
- `src/engine/introspector.ts:106`
- `src/engine/mysql-introspector.ts:109`

**Description**:
The `getColumns` and `getConstraints` methods also use string interpolation for table names, creating additional SQL injection vectors.

---

## Medium Priority Bugs

### BUG-009: Introspector Default Value Parsing Loses Type Information
**Severity**: MEDIUM
**Category**: Functional
**File(s)**: `src/engine/introspector.ts:314-315`

**Description**:
The `parseDefaultValue` method wraps numeric values in quotes, converting them to strings in the DSL.

**Current Behavior**:
```typescript
// Handle numbers
if (/^-?\d+(\.\d+)?$/.test(value.trim())) {
  return `'${value.trim()}'`; // Wraps number in quotes!
}
```

**Expected Behavior**:
Should return numeric values without quotes to preserve type.

---

### BUG-010: Missing Input Validation for Migration Names
**Severity**: MEDIUM
**Category**: Security
**File(s)**: `src/cli.ts:180-200`, `src/utils/formatting.ts:43-55`

**Description**:
Migration name sanitization doesn't validate for path traversal attacks or excessive length.

**Current Behavior**:
```typescript
export function generateMigrationFilename(name: string): string {
  // ...
  const safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return `${timestamp}_${safeName}.sigl`;
}
```

**Vulnerability**:
Input like `../../../../etc/passwd` gets sanitized to `_etc_passwd.sigl` but doesn't prevent directory traversal in join operations.

---

### BUG-011: Lexer Column Position Tracking Off-By-One
**Severity**: LOW
**Category**: Functional
**File(s)**: `src/ast/lexer.ts:68-70, 277-279`

**Description**:
Column tracking may be off by one after newlines due to reset/increment timing.

---

### BUG-012: Parser Doesn't Guard Against Token Array Overflow
**Severity**: LOW
**Category**: Edge Case
**File(s)**: `src/ast/parser.ts:224-229`

**Description**:
`advance()` increments current without bounds checking.

---

### BUG-013: CLI Timestamp Format Invalid on Windows
**Severity**: LOW
**Category**: Cross-Platform
**File(s)**: `src/cli.ts:342`

**Description**:
Uses colons in filenames which are invalid on Windows.

---

### BUG-014: MySQL Generator Hardcodes Charset
**Severity**: LOW
**Category**: Code Quality
**File(s)**: `src/generators/mysql.ts:64`

**Description**:
Hardcodes UTF8MB4 charset without allowing configuration.

---

### BUG-015: SQLite Enum CHECK Constraint May Have Quote Issues
**Severity**: MEDIUM
**Category**: Functional
**File(s)**: `src/generators/sqlite.ts:140-143`

**Description**:
Double-quoted column names in CHECK constraints may conflict with string literals.

---

### BUG-016: Error Message Loses Stack Trace in CLI
**Severity**: LOW
**Category**: Error Handling
**File(s)**: `src/cli.ts:418-419`

**Description**:
Config loading errors lose original stack trace.

---

### BUG-017: Missing Validation for Empty Model
**Severity**: MEDIUM
**Category**: Edge Case
**File(s)**: `src/ast/parser.ts:63-86`

**Description**:
Parser allows models with zero columns, which generates invalid SQL.

---

### BUG-018: Decorator Args Not Validated
**Severity**: MEDIUM
**Category**: Validation
**File(s)**: `src/ast/parser.ts:165-214`

**Description**:
Parser doesn't validate decorator arguments match expected format.

---

### BUG-019: Missing Null Checks in Generator Methods
**Severity**: MEDIUM
**Category**: Edge Case
**File(s)**: Multiple generator files

**Description**:
Various generator methods don't validate column.typeArgs exists before accessing.

---

### BUG-020: Introspector Doesn't Handle Complex Constraints
**Severity**: LOW
**Category**: Functional
**File(s)**: All introspector files

**Description**:
Introspectors don't handle composite keys, multi-column constraints, or complex CHECK constraints.

---

## Priority Matrix

| Bug ID | Severity | User Impact | Fix Complexity | Order |
|--------|----------|-------------|----------------|-------|
| BUG-001 | CRITICAL | HIGH | MEDIUM | 1 |
| BUG-002 | CRITICAL | HIGH | LOW | 2 |
| BUG-003 | HIGH | MEDIUM | LOW | 3 |
| BUG-004 | HIGH | MEDIUM | MEDIUM | 4 |
| BUG-005 | HIGH | LOW | MEDIUM | 5 |
| BUG-008 | HIGH | HIGH | MEDIUM | 6 |
| BUG-006 | MEDIUM | LOW | LOW | 7 |
| BUG-007 | MEDIUM | LOW | LOW | 8 |
| BUG-009 | MEDIUM | LOW | LOW | 9 |
| BUG-010 | MEDIUM | MEDIUM | LOW | 10 |
| BUG-015 | MEDIUM | LOW | MEDIUM | 11 |
| BUG-017 | MEDIUM | LOW | LOW | 12 |
| BUG-018 | MEDIUM | LOW | MEDIUM | 13 |
| BUG-019 | MEDIUM | LOW | MEDIUM | 14 |
| BUG-011 | LOW | LOW | LOW | 15 |
| BUG-012 | LOW | LOW | LOW | 16 |
| BUG-013 | LOW | LOW | LOW | 17 |
| BUG-014 | LOW | LOW | LOW | 18 |
| BUG-016 | LOW | LOW | LOW | 19 |
| BUG-020 | LOW | LOW | HIGH | 20 |

## Dependencies
- BUG-002 should be fixed before comprehensive integration tests
- BUG-001 is independent and highest priority
- BUG-003, BUG-004, BUG-005 are related to ledger/runner interaction
