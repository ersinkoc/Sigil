# Contributing to Sigil

First off, thank you for considering contributing to Sigil! It's people like you that make Sigil such a great tool.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Enhancements](#suggesting-enhancements)
  - [Pull Requests](#pull-requests)
- [Development Setup](#development-setup)
- [Style Guidelines](#style-guidelines)
  - [Git Commit Messages](#git-commit-messages)
  - [TypeScript Style Guide](#typescript-style-guide)
  - [Documentation Style Guide](#documentation-style-guide)
- [Project Philosophy](#project-philosophy)

## Code of Conduct

This project and everyone participating in it is governed by the [Sigil Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues to avoid duplicates. When you create a bug report, include as many details as possible:

**Use the bug report template** when creating an issue.

Include:
- **Clear title** - Describe the problem succinctly
- **Steps to reproduce** - Detailed steps to reproduce the behavior
- **Expected behavior** - What you expected to happen
- **Actual behavior** - What actually happened
- **Environment** - OS, Node.js version, Sigil version, database type
- **Additional context** - Screenshots, error messages, logs

**Example:**
```
Title: MySQL introspector fails on ENUM columns with special characters

Steps to reproduce:
1. Create a MySQL table with ENUM('value-with-dash')
2. Run sigil pull mydb --database mysql
3. See error

Expected: Should handle ENUM values with special characters
Actual: Parser error thrown

Environment:
- OS: Ubuntu 22.04
- Node.js: v20.10.0
- Sigil: v1.0.0
- Database: MySQL 8.0
```

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. Before creating an enhancement suggestion:

1. Check if there's already an issue for it
2. Check the [roadmap](README.md#roadmap) to see if it's planned
3. Consider if it aligns with the project philosophy (zero dependencies, simplicity)

When creating an enhancement suggestion, include:

- **Use case** - Why would this be useful?
- **Proposed solution** - How should it work?
- **Alternatives considered** - What other approaches did you think about?
- **Additional context** - Examples, mockups, code snippets

### Pull Requests

The process:

1. **Fork the repo** and create your branch from `main`
2. **Follow the development setup** instructions below
3. **Make your changes** following the style guidelines
4. **Add tests** if applicable
5. **Ensure the build passes** (`npm run build`)
6. **Write a clear commit message** following our guidelines
7. **Submit a pull request** using the template

**Pull Request Guidelines:**

- Keep PRs focused - one feature/fix per PR
- Update documentation if needed
- Add examples for new features
- Reference related issues
- Be responsive to review feedback

## Development Setup

### Prerequisites

- Node.js >= 18.0.0
- Git

### Setup Steps

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/Sigil.git
cd Sigil

# Install dependencies (dev dependencies only)
npm install

# Build the project
npm run build

# Run tests
node test.js
```

### Project Structure

```
Sigil/
├── src/
│   ├── ast/           # Lexer, Parser, Type definitions
│   ├── generators/    # SQL generators (PostgreSQL, MySQL, SQLite)
│   ├── engine/        # Migration runner, Ledger, Introspectors
│   ├── utils/         # Colors, Formatting utilities
│   ├── index.ts       # Main exports
│   └── cli.ts         # CLI entry point
├── examples/          # Real-world schema examples
├── demo-blog/         # Demo application
└── test.js           # Integration tests
```

### Running Locally

```bash
# Watch mode during development
npm run dev

# Build
npm run build

# Test the CLI
node dist/cli.js help
```

### Testing Your Changes

```bash
# Run existing tests
node test.js

# Test with demo-blog
cd demo-blog
node test-all-generators.js

# Test CLI commands
node ../dist/cli.js init
node ../dist/cli.js create test_migration
```

## Style Guidelines

### Git Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

**Format:**
```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, no logic change)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**

```
feat(cli): add --dry-run flag for migrations

Allows users to see what SQL will be executed without
actually running the migrations.

Closes #42
```

```
fix(mysql): handle ENUM values with special characters

The MySQL introspector was failing when ENUM columns
contained values with dashes or other special characters.
Now properly escapes these values.

Fixes #123
```

```
docs(readme): add MySQL adapter example

Added complete MySQL adapter configuration example
with connection pool setup.
```

### TypeScript Style Guide

**General Rules:**

- Use **strict TypeScript** - no `any` unless absolutely necessary
- Use **interfaces** for object shapes
- Use **types** for unions and complex types
- Prefer **const** over let
- Use **async/await** over raw promises
- Use **template literals** for string interpolation

**Naming Conventions:**

```typescript
// Classes: PascalCase
class MySQLGenerator {}

// Interfaces: PascalCase with 'I' prefix optional
interface ColumnInfo {}

// Functions/methods: camelCase
function mapTypeToSigil() {}

// Constants: UPPER_SNAKE_CASE
const DEFAULT_TIMEOUT = 5000;

// Private members: camelCase with underscore prefix
private _adapter: DbAdapter;
```

**Code Example:**

```typescript
// Good
export class PostgresGenerator implements SqlGenerator {
  generateUp(ast: SchemaAST): string[] {
    const statements: string[] = [];

    for (const model of ast.models) {
      statements.push(this.generateCreateTable(model));
    }

    return statements;
  }

  private generateCreateTable(model: ModelNode): string {
    // Implementation
  }
}

// Avoid
export class PostgresGenerator {
  generateUp(ast: any): any {
    let statements = [];
    ast.models.forEach(function(model) {
      statements.push(this.generateCreateTable(model));
    });
    return statements;
  }
}
```

**Error Handling:**

```typescript
// Use custom error classes
throw new GeneratorError(`Unknown type: ${type}`);

// Not generic errors
throw new Error('Something went wrong');
```

**Imports:**

```typescript
// Use explicit imports
import { Parser } from './ast/parser.js';
import { PostgresGenerator } from './generators/postgres.js';

// Include .js extension for ESM compatibility
```

### Documentation Style Guide

**Code Comments:**

```typescript
/**
 * Generate CREATE TABLE statement for a model
 *
 * @param model - The model AST node
 * @returns SQL CREATE TABLE statement
 */
private generateCreateTable(model: ModelNode): string {
  // Implementation
}
```

**README Updates:**

- Use clear, concise language
- Include code examples
- Use tables for comparisons
- Add emojis sparingly (✓, ✗, 📦, 🚀)
- Test all code snippets

**Example Schemas:**

- Add comments explaining the purpose
- Use realistic field names
- Show best practices
- Include indexes where appropriate

## Project Philosophy

When contributing, keep these principles in mind:

### 1. Zero Runtime Dependencies

Sigil should **only** use Node.js built-ins. No external runtime dependencies.

**Allowed:**
- `fs`, `path`, `crypto`, `util`, etc. (Node.js built-ins)

**Not Allowed:**
- `chalk`, `yargs`, `lodash`, etc. (npm packages)

**Exception:** Dev dependencies for building/testing are fine.

### 2. Database Agnostic Core

The core AST and parser should be database-agnostic. Database-specific logic goes in generators and introspectors.

```typescript
// Good: Pure AST
interface ModelNode {
  name: string;
  columns: ColumnNode[];
}

// Bad: Database-specific in AST
interface ModelNode {
  name: string;
  columns: ColumnNode[];
  postgresOptions?: any; // Don't do this
}
```

### 3. Simplicity Over Features

Prefer simple, understandable code over clever abstractions. If a feature adds significant complexity, consider if it's truly necessary.

**Good:**
```typescript
function mapType(type: string): string {
  switch (type) {
    case 'Serial': return 'SERIAL';
    case 'Int': return 'INTEGER';
    default: throw new Error(`Unknown type: ${type}`);
  }
}
```

**Overengineered:**
```typescript
const TYPE_MAP = new Map([...]);
class TypeMapper {
  constructor(private strategy: TypeMappingStrategy) {}
  map(type: Type): MappedType {
    return this.strategy.transform(type);
  }
}
```

### 4. Clear Error Messages

Users should immediately understand what went wrong and how to fix it.

**Good:**
```typescript
throw new SigilError(
  `Migration file "20240101_users.sigl" has been modified!\n` +
  `This file was applied on 2024-01-01 and must not be changed.\n` +
  `To make changes, create a new migration.`
);
```

**Bad:**
```typescript
throw new Error('Hash mismatch');
```

### 5. Performance is Secondary to Correctness

Correctness and safety first. Optimize only when there's a demonstrated need.

- Use transactions for safety
- Validate before executing
- Integrity checks are non-negotiable

## Questions?

Feel free to ask questions by:
- Opening a discussion on GitHub
- Commenting on an issue
- Reaching out to maintainers

Thank you for contributing to Sigil! 🎉
