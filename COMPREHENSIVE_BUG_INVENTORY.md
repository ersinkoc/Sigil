# Comprehensive Bug Inventory - Sigil Repository
**Date**: 2025-11-20
**Analyst**: Claude Code Comprehensive Analysis
**Total Bugs Identified**: 25 (combining new discoveries with remaining bugs from previous analysis)

---

## Bug Summary by Severity

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 5 | To Fix |
| HIGH | 8 | To Fix |
| MEDIUM | 8 | To Fix |
| LOW | 4 | To Fix |
| **TOTAL** | **25** | **All Pending Fix** |

---

## CRITICAL BUGS (5)

### BUG-021: SQL Injection in Model Names (PostgreSQL Generator)
- **File**: `src/generators/postgres.ts:46, 38`
- **Severity**: CRITICAL
- **Category**: Security - SQL Injection
- **Description**: Model names are directly interpolated into CREATE TABLE and DROP TABLE statements without escaping
- **Vulnerable Code**:
  ```typescript
  lines.push(`CREATE TABLE "${model.name}" (`);
  statements.push(`DROP TABLE IF EXISTS "${model.name}" CASCADE;`);
  ```
- **Attack Vector**: Malicious model name like `User"; DROP TABLE passwords; --`
- **Impact**: Complete database compromise
- **Fix**: Use proper SQL identifier escaping for model names

### BUG-022: SQL Injection in Model Names (MySQL Generator)
- **File**: `src/generators/mysql.ts:47, 39`
- **Severity**: CRITICAL
- **Category**: Security - SQL Injection
- **Description**: Same as BUG-021 but for MySQL generator
- **Vulnerable Code**:
  ```typescript
  lines.push(`CREATE TABLE \`${model.name}\` (`);
  statements.push(`DROP TABLE IF EXISTS \`${model.name}\`;`);
  ```
- **Impact**: Complete database compromise
- **Fix**: Use proper SQL identifier escaping for model names

### BUG-023: SQL Injection in Model Names (SQLite Generator)
- **File**: `src/generators/sqlite.ts:52, 44`
- **Severity**: CRITICAL
- **Category**: Security - SQL Injection
- **Description**: Same as BUG-021 but for SQLite generator
- **Vulnerable Code**:
  ```typescript
  lines.push(`CREATE TABLE "${model.name}" (`);
  statements.push(`DROP TABLE IF EXISTS "${model.name}";`);
  ```
- **Impact**: Complete database compromise
- **Fix**: Use proper SQL identifier escaping for model names

### BUG-024: SQL Injection in Enum Values (All Generators)
- **File**: `src/generators/postgres.ts:200`, `src/generators/mysql.ts:208`, `src/generators/sqlite.ts:141`
- **Severity**: CRITICAL
- **Category**: Security - SQL Injection
- **Description**: Enum values are not escaped, allowing SQL injection through enum type arguments
- **Vulnerable Code**:
  ```typescript
  const values = args.map((v) => `'${v}'`).join(', ');
  ```
- **Attack Vector**: Enum value like `admin' OR '1'='1`
- **Impact**: SQL injection, data manipulation
- **Fix**: Properly escape single quotes in enum values

### BUG-012: Parser Token Array Overflow
- **File**: `src/ast/parser.ts:252`
- **Severity**: CRITICAL
- **Category**: Functional - Array Bounds
- **Description**: `peek()` method accesses tokens array without bounds checking
- **Vulnerable Code**:
  ```typescript
  private peek(): Token {
    return this.tokens[this.current];
  }
  ```
- **Impact**: Application crash on malformed input
- **Fix**: Add bounds checking to return safe EOF token

---

## HIGH PRIORITY BUGS (8)

### BUG-025: SQL Injection in Default Values (All Generators)
- **File**: `src/generators/postgres.ts:229`, `src/generators/mysql.ts:238`, `src/generators/sqlite.ts:217`
- **Severity**: HIGH
- **Category**: Security - SQL Injection
- **Description**: String default values are not escaped for single quotes
- **Vulnerable Code**:
  ```typescript
  return `'${value}'`; // No escaping for embedded quotes
  ```
- **Attack Vector**: Default value like `'; DROP TABLE users; --`
- **Impact**: SQL injection
- **Fix**: Escape single quotes by doubling them: `value.replace(/'/g, "''")`

### BUG-026: SQL Injection in Foreign Key References
- **File**: `src/generators/postgres.ts:251`, `src/generators/mysql.ts:260`, `src/generators/sqlite.ts:241`
- **Severity**: HIGH
- **Category**: Security - SQL Injection
- **Description**: Referenced table and column names not escaped
- **Vulnerable Code**:
  ```typescript
  let fk = `FOREIGN KEY ("${columnName}") REFERENCES "${refTable}"("${refColumn}")`;
  ```
- **Impact**: SQL injection through foreign key references
- **Fix**: Validate and escape table/column names

### BUG-011: Lexer Column Position Off-by-One
- **File**: `src/ast/lexer.ts:272`
- **Severity**: HIGH
- **Category**: Functional - Logic Error
- **Description**: Column calculation for tokens is incorrect
- **Code**:
  ```typescript
  column: column ?? this.column - value.length
  ```
- **Impact**: Inaccurate error messages pointing to wrong column
- **Fix**: Correct column calculation logic

### BUG-027: JSON Parse Crash in Ledger
- **File**: `src/engine/ledger.ts:26`
- **Severity**: HIGH
- **Category**: Functional - Error Handling
- **Description**: No error handling for corrupted JSON in ledger file
- **Vulnerable Code**:
  ```typescript
  this.ledger = JSON.parse(content);
  ```
- **Impact**: Application crash on corrupted ledger file
- **Fix**: Add try-catch with meaningful error message

### BUG-013: CLI Timestamp Format Invalid on Windows
- **File**: `src/utils/formatting.ts` (timestamp generation)
- **Severity**: HIGH
- **Category**: Cross-Platform Compatibility
- **Description**: Timestamp format may use invalid characters for Windows filenames
- **Impact**: Migration creation fails on Windows
- **Fix**: Use Windows-safe timestamp format

### BUG-014: MySQL Charset Hardcoded
- **File**: `src/generators/mysql.ts:64`
- **Severity**: HIGH
- **Category**: Configuration
- **Description**: Character set and collation are hardcoded
- **Code**:
  ```typescript
  lines.push(') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
  ```
- **Impact**: Cannot use different character sets
- **Fix**: Make charset/collation configurable

### BUG-019: Missing Null Checks in Generators
- **File**: Multiple generator files
- **Severity**: HIGH
- **Category**: Type Safety
- **Description**: Decorator args accessed without null checking
- **Example**: `decorator.args[0]` without checking if args exists
- **Impact**: Runtime errors with malformed decorators
- **Fix**: Add proper null/undefined checks

### BUG-028: No Validation for Decorator Arguments
- **File**: All generator files
- **Severity**: HIGH
- **Category**: Input Validation
- **Description**: Decorator arguments are not validated (BUG-018 from previous report)
- **Impact**: Invalid SQL generated from bad decorator args
- **Fix**: Validate decorator argument types and values

---

## MEDIUM PRIORITY BUGS (8)

### BUG-015: SQLite Enum CHECK Constraint Quote Escaping
- **File**: `src/generators/sqlite.ts:141`
- **Severity**: MEDIUM
- **Category**: SQL Generation
- **Description**: Enum values with quotes not properly escaped in CHECK constraints
- **Impact**: Syntax errors for enums with special characters
- **Fix**: Escape quotes in enum values

### BUG-029: No Validation for onDelete Actions
- **File**: All generators
- **Severity**: MEDIUM
- **Category**: Input Validation
- **Description**: onDelete decorator values not validated against valid SQL actions
- **Code**: Accepts any string, should validate against: CASCADE, SET NULL, SET DEFAULT, RESTRICT, NO ACTION
- **Impact**: Invalid SQL generated
- **Fix**: Validate onDelete values

### BUG-030: Char Type Without Arguments
- **File**: `src/generators/postgres.ts:157`
- **Severity**: MEDIUM
- **Category**: SQL Generation
- **Description**: `CHAR` without length is non-standard and may fail in some databases
- **Impact**: SQL compatibility issues
- **Fix**: Default to CHAR(1) like MySQL generator does

### BUG-009: Introspector Default Value Parsing Loses Type Info
- **File**: All introspector files
- **Severity**: MEDIUM
- **Category**: Functional - Data Loss
- **Description**: When introspecting databases, default values are converted to strings losing type information
- **Impact**: Re-generated migrations may have incorrect default value types
- **Fix**: Preserve type information during introspection

### BUG-031: No Validation for Reference Format
- **File**: All generators `parseReference()` methods
- **Severity**: MEDIUM
- **Category**: Input Validation
- **Description**: Reference format validated but table/column names not validated as valid SQL identifiers
- **Impact**: Invalid references could generate invalid SQL
- **Fix**: Validate table and column names are valid identifiers

### BUG-032: Missing Error Context in Generator Errors
- **File**: All generator files
- **Severity**: MEDIUM
- **Category**: Error Handling
- **Description**: GeneratorErrors don't include which model/column caused the error
- **Impact**: Difficult to debug schema errors
- **Fix**: Include model and column context in error messages

### BUG-033: Numeric/Decimal Without Arguments
- **File**: `src/generators/postgres.ts:181`, `src/generators/mysql.ts:188`
- **Severity**: MEDIUM
- **Category**: SQL Generation
- **Description**: NUMERIC without precision/scale has database-dependent defaults
- **Impact**: Inconsistent numeric precision across databases
- **Fix**: Require or default precision/scale explicitly

### BUG-020: Complex Constraints Not Introspected
- **File**: All introspector files
- **Severity**: MEDIUM
- **Category**: Feature Gap
- **Description**: Multi-column constraints, check constraints, and partial indexes not introspected
- **Impact**: Incomplete schema introspection
- **Fix**: Extend introspection to capture complex constraints

---

## LOW PRIORITY BUGS (4)

### BUG-034: No Logging for SQL Execution
- **File**: `src/engine/runner.ts`
- **Severity**: LOW
- **Category**: Observability
- **Description**: No logging of actual SQL statements being executed
- **Impact**: Difficult to debug migration issues
- **Fix**: Add optional verbose logging

### BUG-035: No Dry-Run Mode
- **File**: `src/cli.ts`, `src/engine/runner.ts`
- **Severity**: LOW
- **Category**: Feature Gap
- **Description**: No way to see what SQL would be executed without actually running it
- **Impact**: Risk of running wrong migrations
- **Fix**: Add --dry-run flag to preview migrations

### BUG-016: Error Stack Trace Loss
- **File**: Custom error classes in `src/ast/types.ts`
- **Severity**: LOW
- **Category**: Error Handling
- **Description**: Custom errors don't preserve original stack trace when wrapping other errors
- **Impact**: Difficult to debug root causes
- **Fix**: Preserve cause chain in custom errors

### BUG-036: No Transaction Rollback on Partial Failure
- **File**: `src/engine/runner.ts:100-120`
- **Severity**: LOW
- **Category**: Error Handling (Mitigated by transaction support)
- **Description**: While individual migrations run in transactions, if multiple migrations in a batch succeed then one fails, the successful ones remain applied but aren't recorded in ledger (already mitigated by BUG-004 fix)
- **Status**: Already mitigated by atomic batch recording
- **Impact**: Minimal due to existing fix
- **Recommendation**: Document this behavior

---

## Previously Fixed Bugs (From Previous Report) - Verified

✅ BUG-001: SQL Injection in Introspectors (FIXED)
✅ BUG-002: Invalid PostgreSQL CHECK Constraint (FIXED)
✅ BUG-003: Ledger Batch Calculation Edge Case (FIXED)
✅ BUG-004: Missing Atomicity in Batch Recording (FIXED)
✅ BUG-005: Race Condition in Batch Number Assignment (FIXED)
✅ BUG-006: Boolean Default Case Sensitivity (FIXED)
✅ BUG-007: VarChar Without Arguments (FIXED)
✅ BUG-010: Path Traversal in Migration Names (FIXED)
✅ BUG-017: Empty Model Validation (FIXED)

---

## Fix Priority Order

1. **Phase 1 - CRITICAL** (5 bugs): BUG-021, 022, 023, 024, 012
2. **Phase 2 - HIGH** (8 bugs): BUG-025, 026, 011, 027, 013, 014, 019, 028
3. **Phase 3 - MEDIUM** (8 bugs): BUG-015, 029, 030, 009, 031, 032, 033, 020
4. **Phase 4 - LOW** (4 bugs): BUG-034, 035, 016, 036

---

## Estimated Impact

- **Security Risk**: CRITICAL - 5 SQL injection vulnerabilities
- **Stability Risk**: HIGH - 3 crash vulnerabilities
- **Correctness Risk**: MEDIUM - 8 SQL generation issues
- **Usability Risk**: LOW - 4 UX improvements needed

**Recommendation**: Fix all CRITICAL and HIGH priority bugs immediately before any production use.
