/**
 * PostgreSQL SQL Generator
 * Converts Sigil AST to PostgreSQL DDL statements
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

export class PostgresGenerator implements SqlGenerator {
  generateUp(ast: SchemaAST): string[] {
    const statements: string[] = [];

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

    // Generate DROP TABLE statements in reverse order
    for (let i = ast.models.length - 1; i >= 0; i--) {
      const model = ast.models[i];
      // FIX BUG-021: Use safe identifier escaping for model names
      const tableName = escapePostgresIdentifier(model.name);
      statements.push(`DROP TABLE IF EXISTS ${tableName} CASCADE;`);
    }

    return statements;
  }

  private generateCreateTable(model: ModelNode): string {
    const lines: string[] = [];
    // FIX BUG-021: Use safe identifier escaping for model names
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

    // Column type (pass column name for CHECK constraints)
    parts.push(this.mapType(column.type, column.typeArgs, column.name));

    let constraint: string | null = null;

    // Process decorators
    for (const decorator of column.decorators) {
      switch (decorator.name) {
        case 'pk':
          parts.push('PRIMARY KEY');
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

    return {
      columnDef: parts.join(' '),
      constraint,
    };
  }

  private mapType(type: string, args?: string[], columnName?: string): string {
    switch (type) {
      case 'Serial':
        return 'SERIAL';

      case 'Int':
        return 'INTEGER';

      case 'BigInt':
        return 'BIGINT';

      case 'SmallInt':
        return 'SMALLINT';

      case 'VarChar':
        if (args && args.length > 0) {
          return `VARCHAR(${args[0]})`;
        }
        // FIX BUG-007: Default to VARCHAR(255) instead of bare VARCHAR for valid SQL
        return 'VARCHAR(255)';

      case 'Char':
        if (args && args.length > 0) {
          return `CHAR(${args[0]})`;
        }
        // FIX BUG-030: Default to CHAR(1) for SQL standard compliance
        return 'CHAR(1)';

      case 'Text':
        return 'TEXT';

      case 'Boolean':
        return 'BOOLEAN';

      case 'Timestamp':
        return 'TIMESTAMP';

      case 'Date':
        return 'DATE';

      case 'Time':
        return 'TIME';

      case 'Decimal':
      case 'Numeric':
        if (args && args.length >= 2) {
          return `NUMERIC(${args[0]}, ${args[1]})`;
        } else if (args && args.length === 1) {
          return `NUMERIC(${args[0]})`;
        }
        // FIX BUG-033: Default to NUMERIC(10, 2) for consistency with MySQL
        // and to avoid implementation-dependent precision/scale behavior
        return 'NUMERIC(10, 2)';

      case 'Real':
        return 'REAL';

      case 'DoublePrecision':
        return 'DOUBLE PRECISION';

      case 'Json':
        return 'JSON';

      case 'Jsonb':
        return 'JSONB';

      case 'Uuid':
        return 'UUID';

      case 'Enum':
        if (args && args.length > 0) {
          // FIX BUG-024: Escape enum values to prevent SQL injection
          const values = args.map((v) => escapeSqlStringLiteral(v)).join(', ');
          // FIX BUG-002: Use actual column name instead of non-existent VALUE keyword
          const checkColumn = columnName ? escapePostgresIdentifier(columnName) : 'value';
          return `VARCHAR(50) CHECK (${checkColumn} IN (${values}))`;
        }
        throw new GeneratorError('Enum type requires values');

      default:
        throw new GeneratorError(`Unknown type: ${type}`);
    }
  }

  private formatDefaultValue(value: string): string {
    // Handle special keywords
    if (value.toLowerCase() === 'now') {
      return 'CURRENT_TIMESTAMP';
    }

    // FIX BUG-006: Use lowercase 'true'/'false' for PostgreSQL boolean defaults
    if (value.toLowerCase() === 'true' || value.toLowerCase() === 'false') {
      return value.toLowerCase();
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
      throw new GeneratorError(`Invalid reference format: ${ref}. Expected Table.column`);
    }
    return { table: parts[0], column: parts[1] };
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
