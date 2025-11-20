# Sigil

[![npm version](https://img.shields.io/npm/v/sigil.svg)](https://www.npmjs.com/package/sigil)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-success.svg)](package.json)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**A Zero-Dependency, AST-Based Database Schema Management Tool**

Sigil is a revolutionary database migration tool that rejects the complexity of modern ORMs in favor of a native, zero-dependency approach using a custom declarative DSL (Domain Specific Language).

## Features

- **Zero Runtime Dependencies**: Only uses Node.js built-ins (`fs`, `path`, `crypto`, etc.)
- **Multi-Database Support**: PostgreSQL, MySQL/MariaDB, and SQLite generators included
- **Custom DSL**: Write schema definitions in `.sigl` files with a clean, intuitive syntax
- **AST-Based**: Proper compiler pipeline (Lexer → Parser → AST → CodeGen)
- **Database Agnostic**: Core logic is pure; database interaction via adapter pattern
- **Two-Way Sync**: Apply migrations (Up) AND reverse-engineer existing databases (Introspection)
- **Integrity Checking**: SHA-256 hashing ensures migration files haven't been tampered with
- **Transaction Support**: All migrations run in transactions for safety

## Installation

```bash
npm install -g sigil
```

Or use it in your project:

```bash
npm install --save-dev sigil
```

## Quick Start

### 1. Initialize a new Sigil project

```bash
sigil init
```

This creates:
- `migrations/` directory for your schema files
- `sigil.config.js` configuration file

### 2. Configure your database adapter

Edit `sigil.config.js` to set up your database connection:

```javascript
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'mydb',
  user: 'postgres',
  password: 'password',
});

const adapter = {
  async connect() {},
  async disconnect() {
    await pool.end();
  },
  async query(sql) {
    const result = await pool.query(sql);
    return result.rows;
  },
  async transaction(queries) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const sql of queries) {
        await client.query(sql);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },
};

export default {
  adapter,
  migrationsPath: './migrations',
  ledgerPath: './.sigil_ledger.json',
};
```

### 3. Create your first migration

```bash
sigil create users
```

This generates a timestamped file like `migrations/20240101120000_users.sigl`.

### 4. Edit the migration file

```sigl
# Define user table
model User {
  id        Serial        @pk
  email     VarChar(255)  @unique @notnull
  username  VarChar(50)   @unique @notnull
  password  VarChar(255)  @notnull
  role      Enum('admin', 'user', 'guest') @default('user')
  isActive  Boolean       @default(true)
  createdAt Timestamp     @default(now)
}
```

### 5. Apply the migration

```bash
sigil up
```

### 6. Check migration status

```bash
sigil status
```

## The Sigil DSL Syntax

Sigil uses `.sigl` files with a custom syntax designed for clarity and expressiveness.

### Model Definition

```sigl
model TableName {
  columnName  ColumnType  @decorator1 @decorator2
}
```

### Supported Types

- **Integers**: `Serial`, `Int`, `BigInt`, `SmallInt`
- **Strings**: `VarChar(n)`, `Char(n)`, `Text`
- **Boolean**: `Boolean`
- **Dates/Times**: `Timestamp`, `Date`, `Time`
- **Decimals**: `Decimal(p,s)`, `Numeric(p,s)`, `Real`, `DoublePrecision`
- **JSON**: `Json`, `Jsonb`
- **UUID**: `Uuid`
- **Enums**: `Enum('value1', 'value2', ...)`

### Decorators

| Decorator | Description | Example |
|-----------|-------------|---------|
| `@pk` | Primary key | `id Serial @pk` |
| `@unique` | Unique constraint | `email VarChar(255) @unique` |
| `@notnull` | NOT NULL constraint | `name Text @notnull` |
| `@default(value)` | Default value | `active Boolean @default(true)` |
| `@ref(Table.column)` | Foreign key | `userId Int @ref(User.id)` |
| `@onDelete(action)` | Foreign key delete action | `@ref(User.id) @onDelete('cascade')` |

### Special Values

- `now` - Maps to `CURRENT_TIMESTAMP`
- `true`/`false` - Boolean literals
- Strings must be quoted: `'value'`

### Raw SQL Escape Hatch

For operations not covered by the DSL, prefix lines with `>`:

```sigl
> CREATE INDEX idx_users_email ON "User"("email");
> CREATE VIEW active_users AS SELECT * FROM "User" WHERE "isActive" = true;
```

### Complete Example

```sigl
# Blog schema

model User {
  id        Serial        @pk
  email     VarChar(255)  @unique @notnull
  username  VarChar(50)   @unique @notnull
  createdAt Timestamp     @default(now)
}

model Post {
  id          Serial        @pk
  title       VarChar(200)  @notnull
  content     Text
  authorId    Int           @ref(User.id) @onDelete('cascade')
  published   Boolean       @default(false)
  createdAt   Timestamp     @default(now)
}

# Create index for better query performance
> CREATE INDEX idx_posts_author ON "Post"("authorId");
```

## CLI Commands

### `sigil init`

Initialize a new Sigil project. Creates:
- `migrations/` directory
- `sigil.config.js` configuration file

### `sigil create <name>`

Create a new migration file with a timestamped filename.

**Example:**
```bash
sigil create add_users_table
# Creates: migrations/20240101120000_add_users_table.sigl
```

### `sigil up`

Apply all pending migrations. Migrations are executed in chronological order based on their filename timestamps.

### `sigil down`

Rollback the last batch of migrations. Automatically generates DROP statements from your schema definitions.

### `sigil status`

Show the current state of migrations:
- Applied migrations
- Pending migrations
- Current batch number

### `sigil pull [schema]`

Introspect an existing database and generate `.sigl` files. This is the "reverse engineering" feature.

**Example:**
```bash
sigil pull public
# Generates migrations/2024-01-01_introspected.sigl
```

### `sigil help`

Display help information.

### `sigil version`

Display version information.

## Architecture

Sigil follows a clean, modular architecture:

### Compiler Pipeline

```
.sigl file → Lexer → Tokens → Parser → AST → Generator → SQL
```

1. **Lexer** (`src/ast/lexer.ts`): Tokenizes input into meaningful chunks
2. **Parser** (`src/ast/parser.ts`): Builds an Abstract Syntax Tree
3. **Generator** (`src/generators/postgres.ts`): Converts AST to SQL (both UP and DOWN)

### State Management

The **Ledger** (`src/engine/ledger.ts`) tracks applied migrations in `.sigil_ledger.json`:
- Stores SHA-256 hash of migration content
- Validates that applied migrations haven't been modified
- Manages batch numbers for rollbacks

### Migration Execution

The **Runner** (`src/engine/runner.ts`) orchestrates the entire migration flow:
- Loads migration files
- Validates integrity
- Executes SQL in transactions
- Updates the ledger

### Introspection

The **Introspector** (`src/engine/introspector.ts`) reverse-engineers databases:
- Queries `information_schema` tables
- Maps SQL types back to Sigil types
- Generates formatted `.sigl` files

## Database Adapter Interface

Sigil is database-agnostic through the adapter pattern. Implement this interface for your database:

```typescript
interface DbAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  query(sql: string): Promise<any[]>;
  transaction(queries: string[]): Promise<void>;
}
```

### PostgreSQL Example

```javascript
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ /* config */ });

const adapter = {
  async connect() {},
  async disconnect() {
    await pool.end();
  },
  async query(sql) {
    const result = await pool.query(sql);
    return result.rows;
  },
  async transaction(queries) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const sql of queries) {
        await client.query(sql);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },
};
```

### MySQL Example

```javascript
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'password',
  database: 'mydb',
});

const adapter = {
  async connect() {},
  async disconnect() {
    await pool.end();
  },
  async query(sql) {
    const [rows] = await pool.query(sql);
    return rows;
  },
  async transaction(queries) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const sql of queries) {
        await connection.query(sql);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },
};

export default {
  adapter,
  generator: new MySQLGenerator(), // Use MySQLGenerator for MySQL
  migrationsPath: './migrations',
  ledgerPath: './.sigil_ledger.json',
};
```

### SQLite Example

```javascript
import Database from 'better-sqlite3';

const db = new Database('./mydb.sqlite');

const adapter = {
  async connect() {
    // Enable foreign keys
    db.pragma('foreign_keys = ON');
  },
  async disconnect() {
    db.close();
  },
  async query(sql) {
    // For SELECT queries
    if (sql.trim().toUpperCase().startsWith('SELECT')) {
      return db.prepare(sql).all();
    }
    // For other queries
    db.prepare(sql).run();
    return [];
  },
  async transaction(queries) {
    const transaction = db.transaction(() => {
      for (const sql of queries) {
        db.prepare(sql).run();
      }
    });
    transaction();
  },
};

export default {
  adapter,
  generator: new SQLiteGenerator(), // Use SQLiteGenerator for SQLite
  migrationsPath: './migrations',
  ledgerPath: './.sigil_ledger.json',
};
```

## Multi-Database Support

Sigil provides dedicated SQL generators for different database systems, each optimized for the target database's specific syntax and features:

### Database-Specific Features

| Feature | PostgreSQL | MySQL | SQLite |
|---------|-----------|-------|--------|
| **Auto-increment** | `SERIAL` | `INT AUTO_INCREMENT` | `INTEGER PRIMARY KEY AUTOINCREMENT` |
| **Enums** | CHECK constraint | Native `ENUM` type | CHECK constraint |
| **Booleans** | Native `BOOLEAN` | `BOOLEAN` (TINYINT) | `INTEGER` (0/1) |
| **JSON** | `JSON`, `JSONB` | `JSON` | `TEXT` (stored as JSON string) |
| **Timestamps** | `TIMESTAMP` | `TIMESTAMP` | `TEXT` (ISO8601) |
| **Identifiers** | Double quotes `"table"` | Backticks `` `table` `` | Double quotes `"table"` |
| **Foreign Keys** | Native support + CASCADE | Native support + CASCADE | Native support (needs PRAGMA) |
| **Character Sets** | UTF-8 default | UTF8MB4 with collation | UTF-8 default |

### Choosing the Right Generator

When configuring Sigil, import and use the appropriate generator:

```javascript
// For PostgreSQL
import { PostgresGenerator } from 'sigil';
generator: new PostgresGenerator()

// For MySQL/MariaDB
import { MySQLGenerator } from 'sigil';
generator: new MySQLGenerator()

// For SQLite
import { SQLiteGenerator } from 'sigil';
generator: new SQLiteGenerator()
```

The same `.sigl` files work across all databases - Sigil automatically generates the correct SQL syntax for each platform.

## Programmatic Usage

You can also use Sigil programmatically:

```typescript
import {
  Parser,
  PostgresGenerator,
  MySQLGenerator,
  SQLiteGenerator,
  MigrationRunner
} from 'sigil';

// Parse a .sigl file
const ast = Parser.parse(`
  model User {
    id    Serial  @pk
    email Text    @unique
  }
`);

// Generate SQL for different databases
const postgresGen = new PostgresGenerator();
const mysqlGen = new MySQLGenerator();
const sqliteGen = new SQLiteGenerator();

const postgresSQL = postgresGen.generateUp(ast);
const mysqlSQL = mysqlGen.generateUp(ast);
const sqliteSQL = sqliteGen.generateUp(ast);

console.log(postgresSQL);
// [
//   'CREATE TABLE "User" (\n  "id" SERIAL PRIMARY KEY,\n  "email" TEXT UNIQUE\n);'
// ]

console.log(mysqlSQL);
// [
//   'CREATE TABLE `User` (\n  `id` INT AUTO_INCREMENT PRIMARY KEY,\n  `email` TEXT UNIQUE\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;'
// ]

// Run migrations programmatically
const runner = new MigrationRunner({
  adapter: myAdapter,
  generator: new PostgresGenerator(), // or MySQLGenerator(), SQLiteGenerator()
  migrationsPath: './migrations',
});

await runner.up();
```

## Error Handling

Sigil provides clear, actionable error messages:

### Integrity Errors

If a migration file is modified after being applied:

```
✗ Migration file "20240101_users.sigl" has been modified!
  This file was applied on 2024-01-01T12:00:00Z and must not be changed.
  Expected hash: abc123...
  Current hash: def456...
```

### Parse Errors

If your `.sigl` file has syntax errors:

```
✗ Parse error at line 5, column 10: Expected column type
```

### Configuration Errors

If your adapter isn't configured:

```
✗ Database adapter not configured.
  Please edit sigil.config.js and provide an adapter.
```

## Project Structure

```
src/
├── ast/
│   ├── types.ts       # AST interfaces and error types
│   ├── lexer.ts       # Tokenizer
│   └── parser.ts      # AST builder
├── generators/
│   ├── base.ts        # SQL generator interface
│   └── postgres.ts    # PostgreSQL generator
├── engine/
│   ├── ledger.ts      # Migration state management
│   ├── runner.ts      # Migration orchestration
│   └── introspector.ts # Database reverse engineering
├── utils/
│   ├── colors.ts      # ANSI color codes
│   └── formatting.ts  # String formatting helpers
├── index.ts           # Main exports
└── cli.ts             # CLI entry point
```

## Development

### Build

```bash
npm run build
```

### Watch Mode

```bash
npm run dev
```

### Link for Local Development

```bash
npm link
sigil --help
```

## Philosophy

Sigil is built on these core principles:

1. **Zero Bloat**: No runtime dependencies. Ever.
2. **Proper Parsing**: No regex hacks. Use a real compiler pipeline.
3. **Type Safety**: Strict TypeScript with no `any`.
4. **Integrity**: Cryptographic hashing ensures migrations are immutable.
5. **Simplicity**: The DSL should be intuitive and readable.
6. **Database Agnostic**: Core logic is pure; adapters handle DB specifics.

## Comparison with Other Tools

| Feature | Sigil | Knex | Prisma | TypeORM |
|---------|-------|------|--------|---------|
| Runtime Dependencies | 0 | ~20 | ~50 | ~100 |
| Custom DSL | ✓ | ✗ | ✓ | ✗ |
| AST-Based | ✓ | ✗ | ✓ | ✗ |
| Two-Way Sync | ✓ | ✗ | ✓ | ✗ |
| Integrity Checking | ✓ | ✗ | ✗ | ✗ |
| Database Agnostic | ✓ | ✓ | ✓ | ✓ |
| Transaction Support | ✓ | ✓ | ✓ | ✓ |

## Roadmap

- [x] PostgreSQL support
- [x] MySQL/MariaDB support
- [x] SQLite support
- [ ] Column alterations (ALTER TABLE)
- [ ] Index management
- [ ] Enum type management
- [ ] Migration squashing
- [ ] Dry-run mode
- [ ] Parallel migrations
- [ ] Migration testing utilities

## Contributing

Contributions are welcome! Please ensure:

1. No new runtime dependencies
2. Strict TypeScript (no `any`)
3. Tests for new features
4. Documentation updates

## License

MIT

## Credits

Built with Node.js built-ins and determination to avoid dependency bloat.

---

**Sigil**: Schema management, redefined.