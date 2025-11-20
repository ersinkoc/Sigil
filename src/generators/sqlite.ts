/**
 * SQLite SQL Generator
 * Converts Sigil AST to SQLite DDL statements
 */

import {
  SchemaAST,
  ModelNode,
  ColumnNode,
  DecoratorNode,
  GeneratorError,
} from '../ast/types.js';
import { SqlGenerator } from './base.js';
import { escapePostgresIdentifier, escapeSqlStringLiteral } from '../utils/sql-identifier-escape.js';

export class SQLiteGenerator implements SqlGenerator {
  generateUp(ast: SchemaAST): string[] {
    const statements: string[] = [];

    // Enable foreign keys (SQLite specific)
    statements.push('PRAGMA foreign_keys = ON;');

    // Generate CREATE TABLE statements for each model
    for (const model of ast.models) {
      statements.push(this.generateCreateTable(model));
    }

    // Add raw SQL statements
    for (const raw of ast.rawSql) {
      statements.push(raw.sql);
    }

    return statements;
  }

  generateDown(ast: SchemaAST): string[] {
    const statements: string[] = [];

    // Enable foreign keys
    statements.push('PRAGMA foreign_keys = ON;');

    // Generate DROP TABLE statements in reverse order
    for (let i = ast.models.length - 1; i >= 0; i--) {
      const model = ast.models[i];
      // FIX BUG-023: Use safe identifier escaping for model names
      const tableName = escapePostgresIdentifier(model.name);
      statements.push(`DROP TABLE IF EXISTS ${tableName};`);
    }

    return statements;
  }

  private generateCreateTable(model: ModelNode): string {
    const lines: string[] = [];
    // FIX BUG-023: Use safe identifier escaping for model names
    const tableName = escapePostgresIdentifier(model.name);
    lines.push(`CREATE TABLE ${tableName} (`);

    const columnDefs: string[] = [];
    const constraints: string[] = [];

    for (const column of model.columns) {
      const { columnDef, constraint } = this.generateColumn(column);
      columnDefs.push(columnDef);
      if (constraint) {
        constraints.push(constraint);
      }
    }

    // Combine column definitions and constraints
    const allDefs = [...columnDefs, ...constraints];
    lines.push(allDefs.map((def) => `  ${def}`).join(',\n'));

    lines.push(');');

    return lines.join('\n');
  }

  private generateColumn(
    column: ColumnNode
  ): { columnDef: string; constraint: string | null } {
    const parts: string[] = [];

    // FIX BUG-026: Use safe identifier escaping for column names
    const columnName = escapePostgresIdentifier(column.name);
    parts.push(columnName);

    // Column type
    const typeInfo = this.mapType(column.type, column.typeArgs);
    parts.push(typeInfo.type);

    let constraint: string | null = null;

    // Process decorators
    for (const decorator of column.decorators) {
      switch (decorator.name) {
        case 'pk':
          // For INTEGER PRIMARY KEY, SQLite auto-increments
          // For other types, just add PRIMARY KEY
          if (column.type === 'Serial' || column.type === 'Int') {
            parts.push('PRIMARY KEY AUTOINCREMENT');
          } else {
            parts.push('PRIMARY KEY');
          }
          break;

        case 'unique':
          parts.push('UNIQUE');
          break;

        case 'notnull':
          parts.push('NOT NULL');
          break;

        case 'default':
          // FIX BUG-019 & BUG-028: Validate decorator arguments
          if (!decorator.args || decorator.args.length === 0) {
            throw new GeneratorError(
              `@default decorator on column "${column.name}" requires a default value argument`
            );
          }
          if (decorator.args.length > 1) {
            throw new GeneratorError(
              `@default decorator on column "${column.name}" accepts only one argument, got ${decorator.args.length}`
            );
          }
          const defaultValue = this.formatDefaultValue(decorator.args[0]);
          parts.push(`DEFAULT ${defaultValue}`);
          break;

        case 'ref':
          // FIX BUG-019 & BUG-028: Validate decorator arguments
          if (!decorator.args || decorator.args.length === 0) {
            throw new GeneratorError(
              `@ref decorator on column "${column.name}" requires a reference argument (e.g., @ref(Table.column))`
            );
          }
          if (decorator.args.length > 1) {
            throw new GeneratorError(
              `@ref decorator on column "${column.name}" accepts only one argument, got ${decorator.args.length}`
            );
          }
          const ref = this.parseReference(decorator.args[0]);
          const onDelete = this.findOnDelete(column.decorators);
          const fkConstraint = this.generateForeignKey(
            column.name,
            ref.table,
            ref.column,
            onDelete
          );
          constraint = fkConstraint;
          break;

        // onDelete is handled with @ref
        case 'onDelete':
          break;

        default:
          throw new GeneratorError(`Unknown decorator: @${decorator.name}`);
      }
    }

    // Add CHECK constraint for Enum types
    if (column.type === 'Enum' && column.typeArgs && column.typeArgs.length > 0) {
      // FIX BUG-024 & BUG-015: Escape enum values to prevent SQL injection
      const values = column.typeArgs.map((v) => escapeSqlStringLiteral(v)).join(', ');
      const safeColumnName = escapePostgresIdentifier(column.name);
      parts.push(`CHECK (${safeColumnName} IN (${values}))`);
    }

    return {
      columnDef: parts.join(' '),
      constraint,
    };
  }

  private mapType(
    type: string,
    _args?: string[] // SQLite uses dynamic typing, args not needed
  ): { type: string } {
    switch (type) {
      case 'Serial':
      case 'Int':
      case 'BigInt':
      case 'SmallInt':
        return { type: 'INTEGER' };

      case 'VarChar':
      case 'Char':
      case 'Text':
        return { type: 'TEXT' };

      case 'Boolean':
        return { type: 'INTEGER' }; // 0 or 1

      case 'Timestamp':
      case 'Date':
      case 'Time':
        return { type: 'TEXT' }; // ISO8601 strings

      case 'Decimal':
      case 'Numeric':
      case 'Real':
      case 'DoublePrecision':
        return { type: 'REAL' };

      case 'Json':
      case 'Jsonb':
        return { type: 'TEXT' }; // Store JSON as text

      case 'Uuid':
        return { type: 'TEXT' };

      case 'Enum':
        // Enum is TEXT type; CHECK constraint is added in generateColumn
        return { type: 'TEXT' };

      default:
        throw new GeneratorError(`Unknown type: ${type}`);
    }
  }

  private formatDefaultValue(value: string): string {
    // Handle special keywords
    if (value.toLowerCase() === 'now') {
      return "CURRENT_TIMESTAMP";
    }

    if (value.toLowerCase() === 'true') {
      return '1';
    }

    if (value.toLowerCase() === 'false') {
      return '0';
    }

    // Handle numbers
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      return value;
    }

    // FIX BUG-025: Use safe string literal escaping for default values
    return escapeSqlStringLiteral(value);
  }

  private parseReference(ref: string): { table: string; column: string } {
    const parts = ref.split('.');
    if (parts.length !== 2) {
      throw new GeneratorError(
        `Invalid reference format: ${ref}. Expected Table.column`
      );
    }

    // FIX BUG-031: Validate table and column names are valid SQL identifiers
    const table = parts[0].trim();
    const column = parts[1].trim();

    // Validate table name
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
      throw new GeneratorError(
        `Invalid table name in reference "${ref}": "${table}" is not a valid SQL identifier. ` +
        `Table names must start with a letter or underscore and contain only letters, numbers, and underscores.`
      );
    }

    // Validate column name
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column)) {
      throw new GeneratorError(
        `Invalid column name in reference "${ref}": "${column}" is not a valid SQL identifier. ` +
        `Column names must start with a letter or underscore and contain only letters, numbers, and underscores.`
      );
    }

    return { table, column };
  }

  private findOnDelete(decorators: DecoratorNode[]): string | undefined {
    const onDeleteDecorator = decorators.find((d) => d.name === 'onDelete');
    if (!onDeleteDecorator) {
      return undefined;
    }

    // FIX BUG-019 & BUG-028: Validate onDelete decorator arguments
    if (!onDeleteDecorator.args || onDeleteDecorator.args.length === 0) {
      throw new GeneratorError(
        '@onDelete decorator requires an action argument (CASCADE, SET NULL, SET DEFAULT, RESTRICT, NO ACTION)'
      );
    }

    const action = onDeleteDecorator.args[0].toUpperCase();
    const validActions = ['CASCADE', 'SET NULL', 'SET DEFAULT', 'RESTRICT', 'NO ACTION'];

    if (!validActions.includes(action)) {
      throw new GeneratorError(
        `@onDelete action "${onDeleteDecorator.args[0]}" is invalid. ` +
        `Must be one of: ${validActions.join(', ')}`
      );
    }

    return onDeleteDecorator.args[0];
  }

  private generateForeignKey(
    columnName: string,
    refTable: string,
    refColumn: string,
    onDelete?: string
  ): string {
    // FIX BUG-026: Use safe identifier escaping for foreign key references
    const safeColumnName = escapePostgresIdentifier(columnName);
    const safeRefTable = escapePostgresIdentifier(refTable);
    const safeRefColumn = escapePostgresIdentifier(refColumn);

    let fk = `FOREIGN KEY (${safeColumnName}) REFERENCES ${safeRefTable}(${safeRefColumn})`;

    if (onDelete) {
      const action = onDelete.toUpperCase();
      fk += ` ON DELETE ${action}`;
    }

    return fk;
  }
}
