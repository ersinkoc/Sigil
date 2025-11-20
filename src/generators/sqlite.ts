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
      statements.push(`DROP TABLE IF EXISTS "${model.name}";`);
    }

    return statements;
  }

  private generateCreateTable(model: ModelNode): string {
    const lines: string[] = [];
    lines.push(`CREATE TABLE "${model.name}" (`);

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

    // Column name
    parts.push(`"${column.name}"`);

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
          if (decorator.args && decorator.args.length > 0) {
            const defaultValue = this.formatDefaultValue(decorator.args[0]);
            parts.push(`DEFAULT ${defaultValue}`);
          }
          break;

        case 'ref':
          if (decorator.args && decorator.args.length > 0) {
            const ref = this.parseReference(decorator.args[0]);
            const onDelete = this.findOnDelete(column.decorators);
            const fkConstraint = this.generateForeignKey(
              column.name,
              ref.table,
              ref.column,
              onDelete
            );
            constraint = fkConstraint;
          }
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
      const values = column.typeArgs.map((v) => `'${v}'`).join(', ');
      parts.push(`CHECK ("${column.name}" IN (${values}))`);
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

    // Handle strings - wrap in quotes
    return `'${value}'`;
  }

  private parseReference(ref: string): { table: string; column: string } {
    const parts = ref.split('.');
    if (parts.length !== 2) {
      throw new GeneratorError(
        `Invalid reference format: ${ref}. Expected Table.column`
      );
    }
    return { table: parts[0], column: parts[1] };
  }

  private findOnDelete(decorators: DecoratorNode[]): string | undefined {
    const onDeleteDecorator = decorators.find((d) => d.name === 'onDelete');
    return onDeleteDecorator?.args?.[0];
  }

  private generateForeignKey(
    columnName: string,
    refTable: string,
    refColumn: string,
    onDelete?: string
  ): string {
    let fk = `FOREIGN KEY ("${columnName}") REFERENCES "${refTable}"("${refColumn}")`;

    if (onDelete) {
      const action = onDelete.toUpperCase();
      fk += ` ON DELETE ${action}`;
    }

    return fk;
  }
}
