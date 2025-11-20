# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-01-XX

### Added

#### Core Features
- Zero-dependency database schema management tool
- Custom `.sigl` DSL with 30 data types
- AST-based compiler (Lexer → Parser → AST → Generator)
- SHA-256 integrity checking for migration files
- Transaction-based migration execution
- Batch management for grouped rollbacks
- Adapter pattern for database abstraction

#### Multi-Database Support
- **PostgreSQL** generator and introspector
- **MySQL/MariaDB** generator and introspector
- **SQLite** generator and introspector
- Database-specific type mapping and syntax
- Runtime database selection via `--database` flag

#### DSL Features
- Model definitions with clean syntax
- 30+ data types (Serial, Int, VarChar, Text, Boolean, Timestamp, Enum, etc.)
- Decorators: `@pk`, `@unique`, `@notnull`, `@default()`, `@ref()`, `@onDelete()`
- Foreign key relationships with cascade actions
- Enum types with inline value definitions
- Raw SQL escape hatch with `>` prefix
- Comment support with `#`

#### CLI Commands
- `sigil init` - Initialize new project
- `sigil create <name>` - Create timestamped migration file
- `sigil up` - Apply pending migrations
- `sigil down` - Rollback last batch
- `sigil status` - Show migration status
- `sigil pull [schema]` - Introspect database and generate .sigl file
- `sigil help` - Display help information
- `sigil version` - Show version

#### CLI Options
- `--database, -d <type>` - Specify database type (postgres, mysql, sqlite)
- Runtime generator selection
- Config file generator support

#### Generators
- **PostgreSQL**: SERIAL, native BOOLEAN, JSONB, CHECK constraints for enums
- **MySQL**: INT AUTO_INCREMENT, native ENUM type, InnoDB engine, UTF8MB4
- **SQLite**: INTEGER AUTOINCREMENT, dynamic typing, PRAGMA foreign_keys

#### Introspectors
- **PostgreSQL**: information_schema queries for full schema extraction
- **MySQL**: information_schema with ENUM value extraction
- **SQLite**: PRAGMA commands for schema introspection
- Automatic type mapping from SQL to Sigil DSL
- Foreign key relationship detection
- Constraint and index extraction

#### Examples
- Blog application (simple) - Users, Posts, Comments, Tags
- E-Commerce platform (complex) - 20+ tables with orders, products, reviews
- Multi-Tenant SaaS - Tenant isolation, subscriptions, projects
- Social Media platform - Posts, DMs, followers, hashtags, notifications

#### Documentation
- Comprehensive README (800+ lines)
- Examples README with design patterns
- CONTRIBUTING guide
- CODE_OF_CONDUCT
- Multi-database comparison tables
- Full API documentation
- Real-world usage examples

#### Project Infrastructure
- Strict TypeScript configuration
- ESM module support
- Zero runtime dependencies
- Dev dependencies only (@types/node, typescript)
- Integration tests
- Git-based version control

### Changed
- N/A (Initial release)

### Deprecated
- N/A (Initial release)

### Removed
- N/A (Initial release)

### Fixed
- N/A (Initial release)

### Security
- SHA-256 hashing for migration file integrity
- Transaction rollback on errors
- SQL injection prevention in introspectors (parameterized queries recommended)
- No credential storage in config files (user-provided adapters)

---

## Release Notes

### What's New in 1.0.0

Sigil is a revolutionary database migration tool that rejects the complexity of modern ORMs in favor of a native, zero-dependency approach using a custom declarative DSL.

**Key Highlights:**

🎯 **Zero Dependencies** - Only uses Node.js built-ins. No external runtime dependencies.

🗄️ **Multi-Database** - Full support for PostgreSQL, MySQL/MariaDB, and SQLite with the same DSL.

🔄 **Two-Way Sync** - Write migrations (DSL → SQL) AND reverse-engineer databases (DB → DSL).

🔐 **Integrity Checking** - SHA-256 hashing ensures migration files haven't been tampered with.

⚡ **AST-Based** - Proper compiler pipeline, not regex replacements.

📦 **Production Ready** - Transaction support, batch management, comprehensive error handling.

**Migration Example:**

```sigl
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
```

Generates correct SQL for PostgreSQL, MySQL, or SQLite automatically!

**Usage:**

```bash
# Initialize
sigil init

# Create migration
sigil create add_users

# Apply migrations
sigil up

# With specific database
sigil up --database mysql

# Reverse-engineer existing database
sigil pull mydb --database mysql
```

---

## [Unreleased]

### Planned Features
- Column alterations (ALTER TABLE support)
- Index management in DSL
- Enum type management (ALTER TYPE)
- Migration squashing
- Dry-run mode (`--dry-run` flag)
- Parallel migration execution
- Migration testing utilities
- MariaDB-specific optimizations
- PostgreSQL-specific features (JSONB operators, arrays)

---

## Version History

- **1.0.0** - Initial release with full multi-database support

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
