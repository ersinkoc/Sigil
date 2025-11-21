# Sigil TypeScript Codebase - NEW BUG ANALYSIS REPORT
## Bugs NOT Yet Fixed (Beyond BUG-033)

---

## BUG-035: CLI Database Flag Missing Argument Silently Ignored
**Location:** `/home/user/Sigil/src/cli.ts`, lines 446-468  
**Severity:** MEDIUM  
**Category:** Logic Error / Error Handling

### Description
If a user provides the `--database` or `-d` flag without an argument value, the flag is silently ignored and PostgreSQL is used as the default instead of raising an error.

### Evidence
```typescript
// Line 446-450
const dbFlagIndex = this.commandArgs.findIndex(arg =>
  arg === '--database' || arg === '-d'
);

if (dbFlagIndex !== -1 && this.commandArgs[dbFlagIndex + 1]) {
  const dbType = this.commandArgs[dbFlagIndex + 1].toLowerCase();
  // ...
}
// If flag exists but no value follows, the entire block is skipped silently
```

### Reproduction Case
```bash
sigil up --database
# Expected: Error message asking for database type
# Actual: Silently uses PostgreSQL without warning about missing argument
```

### Recommended Fix
Add explicit validation:
```typescript
if (dbFlagIndex !== -1) {
  if (!this.commandArgs[dbFlagIndex + 1]) {
    throw new SigilError(
      `Database flag requires a value. Usage: --database <type>`
    );
  }
  const dbType = this.commandArgs[dbFlagIndex + 1].toLowerCase();
  // ... rest of the logic
}
```

---

## BUG-036: Reference Validation Too Strict for Hyphenated Identifiers
**Location:** `/home/user/Sigil/src/generators/postgres.ts`, `/generators/mysql.ts`, `/generators/sqlite.ts` - lines 279, 287, etc.  
**Severity:** HIGH  
**Category:** Type Safety / Validation Mismatch

### Description
The `parseReference()` function validates table and column names in `@ref()` decorators using the regex `^[a-zA-Z_][a-zA-Z0-9_]*$`, which REJECTS hyphens. However, `escapeSqlIdentifier()` in `sql-identifier-escape.ts` allows hyphens with the regex `^[a-zA-Z_][a-zA-Z0-9_.\-]*$`. This creates a validation inconsistency.

### Evidence
```typescript
// postgres.ts lines 279-283
if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
  throw new GeneratorError(
    `Invalid table name in reference "${ref}": "${table}" is not a valid SQL identifier...`
  );
}

// sql-identifier-escape.ts line 59
if (!/^[a-zA-Z_][a-zA-Z0-9_.\-]*$/.test(identifier)) {
  // Allows hyphens!
}
```

### Reproduction Case
```sql
model User {
  id Serial @pk
}

model Post {
  user_id Int @ref(User-Post.id)
}
```
The above will fail at generation time because `parseReference()` rejects the hyphenated table name "User-Post", even though SQL identifiers can contain hyphens when properly quoted.

### Impact
- Users cannot use `@ref` decorators with hyphenated table or column names
- Tables created via introspection with hyphens cannot be referenced

### Recommended Fix
Update `parseReference()` validation to match `escapeSqlIdentifier()`:
```typescript
if (!/^[a-zA-Z_][a-zA-Z0-9_\-]*$/.test(table)) {
  throw new GeneratorError(...);
}
if (!/^[a-zA-Z_][a-zA-Z0-9_\-]*$/.test(column)) {
  throw new GeneratorError(...);
}
```
Note: Dots should still be excluded here since they're used as separators.

---

## BUG-037: Missing Migration File Silently Skipped Instead of Error
**Location:** `/home/user/Sigil/src/engine/runner.ts`, lines 100-102  
**Severity:** HIGH  
**Category:** Error Handling / Data Integrity

### Description
When running migrations, if a migration file is deleted after being recorded in the ledger, the missing file is silently skipped with a `continue` statement instead of throwing an error. This could lead to data inconsistency.

### Evidence
```typescript
// runner.ts lines 100-102
for (const filename of pendingFiles) {
  const migration = migrations.find((m) => m.filename === filename);
  if (!migration) continue;  // ← Silently skips!
```

### Scenario
1. Migration "2024010101_create_users.sigl" is applied and recorded in ledger
2. File is accidentally deleted from migrations directory
3. User runs `sigil status` - shows migration as applied
4. User manually deletes ledger entry thinking it failed
5. User runs `sigil up` - file is missing but silently skipped
6. Database and ledger are now out of sync

### Recommended Fix
Throw an error instead:
```typescript
const migration = migrations.find((m) => m.filename === filename);
if (!migration) {
  throw new SigilError(
    `Migration file "${filename}" is missing but was recorded in the ledger. ` +
    `File was applied on ${/* get from ledger */} and must not be deleted.`
  );
}
```

---

## BUG-038: Truncate Function Incorrect for Small maxLength
**Location:** `/home/user/Sigil/src/utils/formatting.ts`, lines 113-118  
**Severity:** LOW  
**Category:** Edge Case / Off-by-One Error

### Description
The `truncate()` function doesn't handle cases where `maxLength < 3`. When truncating, it subtracts 3 from maxLength to make room for "...", but if maxLength is small, the output can be longer than requested.

### Evidence
```typescript
// formatting.ts lines 113-118
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 3) + '...';
}

// Issue: if maxLength = 2 and text = "hello"
// text.slice(0, 2-3) = text.slice(0, -1) = "hell"
// Result: "hell..." (7 chars) vs expected ≤ 2 chars
```

### Reproduction Case
```typescript
truncate("hello", 2);   // Returns "hell..." (7 chars) - WRONG
truncate("test", 3);    // Returns "..." (3 chars) - OK
truncate("abc", 5);     // Returns "ab..." (5 chars) - OK
```

### Recommended Fix
```typescript
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  if (maxLength <= 3) {
    return text.slice(0, maxLength);
  }
  return text.slice(0, maxLength - 3) + '...';
}
```

---

## BUG-039: CRITICAL - Race Condition in Ledger with No File Locking
**Location:** `/home/user/Sigil/src/engine/ledger.ts` (all methods), `/engine/runner.ts`  
**Severity:** CRITICAL  
**Category:** Concurrency / Race Condition

### Description
The ledger manager uses simple file read/write without any locking mechanism. If two migration processes run concurrently, they could both read the same ledger state, apply the same migrations, and then overwrite each other's ledger updates. This can cause severe data corruption.

### Evidence
```typescript
// ledger.ts - No locking mechanism
async load(): Promise<void> {
  const content = await readFile(this.ledgerPath, 'utf-8');
  this.ledger = JSON.parse(content);
}

async save(): Promise<void> {
  const content = JSON.stringify(this.ledger, null, 2);
  await writeFile(this.ledgerPath, content, 'utf-8');
}
```

### Attack Scenario
```
Time T1: Process A reads ledger (batch 1, migrations: [m1, m2])
Time T2: Process B reads ledger (batch 1, migrations: [m1, m2])
Time T3: Process A applies m3, writes ledger (batch 2, migrations: [m1, m2, m3])
Time T4: Process B applies m4, writes ledger (batch 2, migrations: [m1, m2, m4])
         ↑ Overwrites Process A's m3!

Result: m3 was executed in DB but not recorded. m4 recorded but m3 missing.
```

### Recommended Fix
Implement file locking:
```typescript
import lockfile from 'proper-lockfile';

async load(): Promise<void> {
  const release = await lockfile.lock(this.ledgerPath, { 
    retries: 3, 
    stale: 30000 
  });
  try {
    const content = await readFile(this.ledgerPath, 'utf-8');
    this.ledger = JSON.parse(content);
  } finally {
    await release();
  }
}

async save(): Promise<void> {
  const release = await lockfile.lock(this.ledgerPath);
  try {
    const content = JSON.stringify(this.ledger, null, 2);
    await writeFile(this.ledgerPath, content, 'utf-8');
  } finally {
    await release();
  }
}
```

Or document that migrations MUST be run sequentially.

---

## BUG-040: Duplicate Decorators Allowed, Generates Invalid SQL
**Location:** `/home/user/Sigil/src/ast/parser.ts` (parseColumn), all generators  
**Severity:** MEDIUM  
**Category:** Validation / Parser

### Description
The parser allows duplicate decorators on a single column (e.g., `@pk @pk`, `@default('a') @default('b')`), which would generate invalid or incorrect SQL with duplicate clauses.

### Evidence
```typescript
// parser.ts lines 112-115 - Decorators collected without deduplication
const decorators: DecoratorNode[] = [];
while (this.check('DECORATOR')) {
  decorators.push(this.parseDecorator());
}

// generators/postgres.ts lines 89-151
for (const decorator of column.decorators) {
  switch (decorator.name) {
    case 'pk':
      parts.push('PRIMARY KEY');  // Could be added multiple times!
      break;
    case 'default':
      parts.push(`DEFAULT ${value}`);  // Could appear twice!
      break;
  }
}
```

### Reproduction Case
```sql
model User {
  id Serial @pk @pk
  status VarChar(50) @default('active') @default('inactive')
  created Timestamp @notnull @notnull
}
```

Generated SQL:
```sql
CREATE TABLE "User" (
  "id" SERIAL PRIMARY KEY PRIMARY KEY,  -- ← Invalid: duplicate PRIMARY KEY
  "status" VARCHAR(50) DEFAULT 'active' DEFAULT 'inactive',  -- ← Invalid: duplicate DEFAULT
  "created" TIMESTAMP NOT NULL NOT NULL  -- ← Invalid: duplicate NOT NULL
);
```

### Recommended Fix
Add deduplication in parser or generator:
```typescript
// Option 1: Track which decorators were seen
const seenDecorators = new Set<string>();
const decorators: DecoratorNode[] = [];
while (this.check('DECORATOR')) {
  const decorator = this.parseDecorator();
  if (seenDecorators.has(decorator.name)) {
    throw new ParseError(`Duplicate decorator @${decorator.name}`, ...);
  }
  seenDecorators.add(decorator.name);
  decorators.push(decorator);
}
```

---

## BUG-041: Decorators Accept Wrong Number of Arguments Silently
**Location:** All generators (postgres.ts, mysql.ts, sqlite.ts)  
**Severity:** MEDIUM  
**Category:** Validation / Type Safety

### Description
Decorators that don't expect arguments (like `@pk`, `@unique`, `@notnull`) silently accept arguments and ignore them. This can confuse users who expect arguments to have an effect.

### Evidence
In all generators, the decorator switch statement allows any decorator to have any arguments without validation:
```typescript
case 'pk':
  parts.push('PRIMARY KEY');  // Arguments ignored
  break;

case 'unique':
  parts.push('UNIQUE');  // Arguments ignored
  break;

case 'notnull':
  parts.push('NOT NULL');  // Arguments ignored
  break;
```

### Reproduction Case
```sql
model User {
  id Serial @pk(my_pk)
  email VarChar(100) @unique('test')
  created Timestamp @notnull('reason')
}
```

All arguments are silently ignored, which could confuse users who expect them to work.

### Recommended Fix
Add validation in generator:
```typescript
case 'pk':
  if (decorator.args && decorator.args.length > 0) {
    throw new GeneratorError(
      `@pk decorator on column "${modelName}.${column.name}" ` +
      `does not accept arguments, but ${decorator.args.length} were provided`
    );
  }
  parts.push('PRIMARY KEY');
  break;
```

---

## BUG-042: Missing Adapter Connection Close on connect() Failure
**Location:** `/home/user/Sigil/src/engine/runner.ts` lines 93, 151; introspector files  
**Severity:** MEDIUM  
**Category:** Resource Management / Error Handling

### Description
If `adapter.connect()` throws an error, the subsequent `adapter.disconnect()` in the finally block is never called because the try-finally wrapping is incorrect. The `connect()` call is outside the try block, so errors during connection are not caught by the finally handler.

### Evidence
```typescript
// runner.ts lines 93-127 (up method)
await this.adapter.connect();  // ← Outside try block!

const applied: string[] = [];
const migrationsToRecord: { filename: string; content: string }[] = [];

try {
  for (const filename of pendingFiles) {
    // ... process migrations
  }
  if (migrationsToRecord.length > 0) {
    await this.ledger.recordBatch(migrationsToRecord);
  }
} finally {
  await this.adapter.disconnect();  // ← Never called if connect() fails!
}
```

Same issue in:
- `/engine/runner.ts` lines 151-180 (down method)
- `/engine/introspector.ts` lines 37-52
- `/engine/mysql-introspector.ts` lines 39-55
- `/engine/sqlite-introspector.ts` lines 51-67

### Impact
If a database connection fails, the connection might remain open or in an invalid state, causing:
- Resource leaks (open file handles, sockets)
- Blocking future connection attempts
- Database locks

### Recommended Fix
Move `connect()` into the try block:
```typescript
try {
  await this.adapter.connect();  // ← Now inside try block
  
  for (const filename of pendingFiles) {
    // ... process migrations
  }
  
  if (migrationsToRecord.length > 0) {
    await this.ledger.recordBatch(migrationsToRecord);
  }
} finally {
  await this.adapter.disconnect();  // ← Now properly called
}
```

---

## BUG-043: onDelete Decorator Without ref Silently Ignored
**Location:** All generators (postgres.ts, mysql.ts, sqlite.ts) - switch statement in generateColumn()  
**Severity:** MEDIUM  
**Category:** Semantic / Usage Error

### Description
The `@onDelete` decorator should only be used with `@ref` decorators to specify cascade behavior. However, if `@onDelete` appears without `@ref`, it's silently ignored via a no-op `break` statement instead of throwing an error.

### Evidence
```typescript
// All generators have this pattern:
case 'onDelete':
  break;  // ← Silently do nothing!

// The actual onDelete handling only happens inside @ref processing:
case 'ref':
  const onDelete = this.findOnDelete(column.decorators);  // Searches all decorators
  // ... use onDelete
  break;
```

### Reproduction Case
```sql
model Post {
  comment_id Int @onDelete(CASCADE)
  // Missing @ref! But no error is thrown
}
```

### Impact
- User expects the onDelete behavior but it's ignored
- No error message alerts them to the problem
- Silent failures are hard to debug

### Recommended Fix
```typescript
case 'onDelete':
  // Check if there's a @ref decorator
  const hasRef = column.decorators.some(d => d.name === 'ref');
  if (!hasRef) {
    throw new GeneratorError(
      `@onDelete decorator on column "${modelName}.${column.name}" ` +
      `requires a @ref decorator to be applied first (e.g., @ref(Table.column) @onDelete(CASCADE))`
    );
  }
  // If it has @ref, it will be handled there, so just skip here
  break;
```

---

## SUMMARY TABLE

| Bug # | Location | Severity | Category | Issue |
|-------|----------|----------|----------|-------|
| 035 | cli.ts | MEDIUM | Logic Error | Missing database flag value silently ignored |
| 036 | generators/*.ts | HIGH | Validation | Reference validation rejects hyphens |
| 037 | runner.ts | HIGH | Data Integrity | Missing migration file silently skipped |
| 038 | formatting.ts | LOW | Edge Case | Truncate function incorrect for small sizes |
| 039 | ledger.ts | **CRITICAL** | **Race Condition** | **No file locking - concurrent migrations can corrupt data** |
| 040 | runner.ts, introspector.ts | MEDIUM | Resource Leak | Connection not closed on connect() failure |
| 041 | parser.ts, generators/*.ts | MEDIUM | Validation | Duplicate decorators allowed |
| 042 | generators/*.ts | MEDIUM | Validation | Decorators with wrong args silently ignored |
| 043 | generators/*.ts | MEDIUM | Semantic Error | @onDelete without @ref silently ignored |

---

## CRITICAL FINDINGS

**BUG-039** is the most severe - it's a critical race condition that could cause data corruption in production. Any shared or multi-process environment could experience:
- Duplicate migrations being applied
- Lost migrations in ledger
- Database and ledger becoming out of sync
- Data integrity violations

Recommend immediate implementation of file locking or documentation requiring sequential migration execution.

