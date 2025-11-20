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
      statements.push(`DROP TABLE IF EXISTS "${model.name}" CASCADE;`);
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
    parts.push(this.mapType(column.type, column.typeArgs));

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

    return {
      columnDef: parts.join(' '),
      constraint,
    };
  }

  private mapType(type: string, args?: string[]): string {
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
        return 'VARCHAR';

      case 'Char':
        if (args && args.length > 0) {
          return `CHAR(${args[0]})`;
        }
        return 'CHAR';

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
        return 'NUMERIC';

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
          const values = args.map((v) => `'${v}'`).join(', ');
          return `VARCHAR(50) CHECK (VALUE IN (${values}))`;
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

    if (value.toLowerCase() === 'true' || value.toLowerCase() === 'false') {
      return value.toUpperCase();
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
      throw new GeneratorError(`Invalid reference format: ${ref}. Expected Table.column`);
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
