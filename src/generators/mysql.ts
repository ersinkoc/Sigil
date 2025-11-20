/**
 * MySQL SQL Generator
 * Converts Sigil AST to MySQL DDL statements
 */

import {
  SchemaAST,
  ModelNode,
  ColumnNode,
  DecoratorNode,
  GeneratorError,
} from '../ast/types.js';
import { SqlGenerator } from './base.js';

export class MySQLGenerator implements SqlGenerator {
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
    // MySQL doesn't have CASCADE for DROP TABLE, handle foreign keys first
    for (let i = ast.models.length - 1; i >= 0; i--) {
      const model = ast.models[i];
      statements.push(`DROP TABLE IF EXISTS \`${model.name}\`;`);
    }

    return statements;
  }

  private generateCreateTable(model: ModelNode): string {
    const lines: string[] = [];
    lines.push(`CREATE TABLE \`${model.name}\` (`);

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

    lines.push(') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');

    return lines.join('\n');
  }

  private generateColumn(
    column: ColumnNode
  ): { columnDef: string; constraint: string | null } {
    const parts: string[] = [];

    // Column name
    parts.push(`\`${column.name}\``);

    // Column type
    parts.push(this.mapType(column.type, column.typeArgs));

    let constraint: string | null = null;
    let isPrimaryKey = false;

    // Process decorators
    for (const decorator of column.decorators) {
      switch (decorator.name) {
        case 'pk':
          isPrimaryKey = true;
          // For MySQL, PRIMARY KEY comes after AUTO_INCREMENT
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

    // Add PRIMARY KEY at the end for MySQL
    if (isPrimaryKey) {
      parts.push('PRIMARY KEY');
    }

    return {
      columnDef: parts.join(' '),
      constraint,
    };
  }

  private mapType(type: string, args?: string[]): string {
    switch (type) {
      case 'Serial':
        return 'INT AUTO_INCREMENT';

      case 'Int':
        return 'INT';

      case 'BigInt':
        return 'BIGINT';

      case 'SmallInt':
        return 'SMALLINT';

      case 'VarChar':
        if (args && args.length > 0) {
          return `VARCHAR(${args[0]})`;
        }
        return 'VARCHAR(255)';

      case 'Char':
        if (args && args.length > 0) {
          return `CHAR(${args[0]})`;
        }
        return 'CHAR(1)';

      case 'Text':
        return 'TEXT';

      case 'Boolean':
        return 'BOOLEAN'; // MySQL maps this to TINYINT(1)

      case 'Timestamp':
        return 'TIMESTAMP';

      case 'Date':
        return 'DATE';

      case 'Time':
        return 'TIME';

      case 'Decimal':
      case 'Numeric':
        if (args && args.length >= 2) {
          return `DECIMAL(${args[0]}, ${args[1]})`;
        } else if (args && args.length === 1) {
          return `DECIMAL(${args[0]})`;
        }
        return 'DECIMAL(10, 2)';

      case 'Real':
        return 'FLOAT';

      case 'DoublePrecision':
        return 'DOUBLE';

      case 'Json':
        return 'JSON'; // MySQL 5.7+

      case 'Jsonb':
        // MySQL doesn't have JSONB, use JSON instead
        return 'JSON';

      case 'Uuid':
        return 'CHAR(36)'; // UUID format: 8-4-4-4-12

      case 'Enum':
        if (args && args.length > 0) {
          const values = args.map((v) => `'${v}'`).join(', ');
          return `ENUM(${values})`;
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
    let fk = `FOREIGN KEY (\`${columnName}\`) REFERENCES \`${refTable}\`(\`${refColumn}\`)`;

    if (onDelete) {
      const action = onDelete.toUpperCase();
      fk += ` ON DELETE ${action}`;
    }

    return fk;
  }
}
