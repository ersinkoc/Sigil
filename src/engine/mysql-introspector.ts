/**
 * MySQL Introspector: Reverse engineers MySQL database schema into Sigil DSL
 * Queries information_schema to extract table and column definitions
 */

import { DbAdapter } from '../ast/types.js';
import { escapeSqlStringLiteral } from '../utils/sql-identifier-escape.js';

interface ColumnInfo {
  columnName: string;
  dataType: string;
  characterMaximumLength: number | null;
  numericPrecision: number | null;
  numericScale: number | null;
  isNullable: string;
  columnDefault: string | null;
  columnType: string;
  extra: string;
}

interface ConstraintInfo {
  constraintType: string;
  columnName: string;
  foreignTableName: string | null;
  foreignColumnName: string | null;
}

export class MySQLIntrospector {
  private adapter: DbAdapter;

  constructor(adapter: DbAdapter) {
    this.adapter = adapter;
  }

  /**
   * Introspect the database and generate .sigl DSL
   */
  async introspect(database: string): Promise<string> {
    await this.adapter.connect();

    try {
      // Get all tables
      const tables = await this.getTables(database);

      const models: string[] = [];

      for (const tableName of tables) {
        const model = await this.introspectTable(tableName, database);
        models.push(model);
      }

      return models.join('\n\n');
    } finally {
      await this.adapter.disconnect();
    }
  }

  /**
   * Get list of tables in database
   */
  private async getTables(database: string): Promise<string[]> {
    // FIX BUG-001: Use safe string literal escaping to prevent SQL injection
    const safeDatabase = escapeSqlStringLiteral(database);
    const query = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = ${safeDatabase}
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;

    const rows = await this.adapter.query(query);
    return rows.map((row: any) => row.table_name || row.TABLE_NAME);
  }

  /**
   * Introspect a single table
   */
  private async introspectTable(tableName: string, database: string): Promise<string> {
    const columns = await this.getColumns(tableName, database);
    const constraints = await this.getConstraints(tableName, database);

    let dsl = `# Table: ${tableName}\n`;
    dsl += `model ${tableName} {\n`;

    for (const col of columns) {
      const line = this.generateColumnDefinition(col, constraints);
      dsl += `  ${line}\n`;
    }

    dsl += '}';

    return dsl;
  }

  /**
   * Get column information
   */
  private async getColumns(tableName: string, database: string): Promise<ColumnInfo[]> {
    // FIX BUG-001: Use safe string literal escaping to prevent SQL injection
    const safeDatabase = escapeSqlStringLiteral(database);
    const safeTableName = escapeSqlStringLiteral(tableName);

    const query = `
      SELECT
        column_name as columnName,
        data_type as dataType,
        character_maximum_length as characterMaximumLength,
        numeric_precision as numericPrecision,
        numeric_scale as numericScale,
        is_nullable as isNullable,
        column_default as columnDefault,
        column_type as columnType,
        extra
      FROM information_schema.columns
      WHERE table_schema = ${safeDatabase}
        AND table_name = ${safeTableName}
      ORDER BY ordinal_position
    `;

    return await this.adapter.query(query);
  }

  /**
   * Get constraint information
   */
  private async getConstraints(tableName: string, database: string): Promise<ConstraintInfo[]> {
    // FIX BUG-001: Use safe string literal escaping to prevent SQL injection
    const safeDatabase = escapeSqlStringLiteral(database);
    const safeTableName = escapeSqlStringLiteral(tableName);

    const query = `
      SELECT
        tc.constraint_type as constraintType,
        kcu.column_name as columnName,
        kcu.referenced_table_name as foreignTableName,
        kcu.referenced_column_name as foreignColumnName
      FROM information_schema.table_constraints tc
      LEFT JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
        AND tc.table_name = kcu.table_name
      WHERE tc.table_schema = ${safeDatabase}
        AND tc.table_name = ${safeTableName}
    `;

    return await this.adapter.query(query);
  }

  /**
   * Generate column definition line
   */
  private generateColumnDefinition(col: ColumnInfo, constraints: ConstraintInfo[]): string {
    const parts: string[] = [];

    // Column name (padded)
    parts.push(col.columnName.padEnd(15));

    // Data type
    const sigilType = this.mapTypeToSigil(col);
    parts.push(sigilType.padEnd(20));

    // Constraints
    const columnConstraints = constraints.filter(c => c.columnName === col.columnName);

    for (const constraint of columnConstraints) {
      if (constraint.constraintType === 'PRIMARY KEY') {
        parts.push('@pk');
      } else if (constraint.constraintType === 'UNIQUE') {
        parts.push('@unique');
      } else if (constraint.constraintType === 'FOREIGN KEY' && constraint.foreignTableName) {
        parts.push(`@ref(${constraint.foreignTableName}.${constraint.foreignColumnName})`);
      }
    }

    // NOT NULL
    if (col.isNullable === 'NO' && !columnConstraints.some(c => c.constraintType === 'PRIMARY KEY')) {
      parts.push('@notnull');
    }

    // Default value
    if (col.columnDefault !== null) {
      const defaultValue = this.formatDefaultValue(col.columnDefault);
      if (defaultValue) {
        parts.push(`@default(${defaultValue})`);
      }
    }

    return parts.join(' ');
  }

  /**
   * Map MySQL type to Sigil type
   */
  private mapTypeToSigil(col: ColumnInfo): string {
    const dataType = col.dataType.toLowerCase();
    const isAutoIncrement = col.extra.toLowerCase().includes('auto_increment');

    // Handle auto-increment
    if (isAutoIncrement && (dataType === 'int' || dataType === 'integer')) {
      return 'Serial';
    }

    // Extract enum values from column_type
    if (dataType === 'enum') {
      const match = col.columnType.match(/enum\((.*)\)/i);
      if (match) {
        const values = match[1].split(',').map(v => v.trim().replace(/'/g, ''));
        return `Enum(${values.map(v => `'${v}'`).join(', ')})`;
      }
    }

    switch (dataType) {
      case 'int':
      case 'integer':
        return 'Int';

      case 'bigint':
        return 'BigInt';

      case 'smallint':
      case 'tinyint':
        return 'SmallInt';

      case 'varchar':
        if (col.characterMaximumLength) {
          return `VarChar(${col.characterMaximumLength})`;
        }
        return 'VarChar(255)';

      case 'char':
        if (col.characterMaximumLength) {
          return `Char(${col.characterMaximumLength})`;
        }
        return 'Char(1)';

      case 'text':
      case 'mediumtext':
      case 'longtext':
        return 'Text';

      case 'boolean':
      case 'tinyint(1)':
      case 'bool':
        return 'Boolean';

      case 'timestamp':
      case 'datetime':
        return 'Timestamp';

      case 'date':
        return 'Date';

      case 'time':
        return 'Time';

      case 'decimal':
      case 'numeric':
        if (col.numericPrecision && col.numericScale) {
          return `Decimal(${col.numericPrecision},${col.numericScale})`;
        } else if (col.numericPrecision) {
          return `Decimal(${col.numericPrecision})`;
        }
        return 'Decimal(10,2)';

      case 'float':
        return 'Real';

      case 'double':
        return 'DoublePrecision';

      case 'json':
        return 'Json';

      default:
        return 'Text'; // Fallback
    }
  }

  /**
   * Format default value for DSL
   */
  private formatDefaultValue(value: string): string | null {
    if (!value || value === 'NULL') {
      return null;
    }

    // Remove quotes and handle special values
    value = value.trim().replace(/^'|'$/g, '');

    if (value === 'CURRENT_TIMESTAMP' || value === 'current_timestamp()') {
      return 'now';
    }

    if (value === '1' || value === 'true') {
      return 'true';
    }

    if (value === '0' || value === 'false') {
      return 'false';
    }

    // Check if it's a number
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      return value;
    }

    // String value
    return `'${value}'`;
  }
}
