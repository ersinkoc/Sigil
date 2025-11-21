/**
 * Introspector: Reverse engineers database schema into Sigil DSL
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
}

interface ConstraintInfo {
  constraintType: string;
  columnName: string;
  foreignTableName: string | null;
  foreignColumnName: string | null;
}

export class PostgresIntrospector {
  private adapter: DbAdapter;

  constructor(adapter: DbAdapter) {
    this.adapter = adapter;
  }

  /**
   * Introspect the database and generate .sigl DSL
   * FIX BUG-042: Move connect() inside try block to ensure disconnect() is called on failure
   */
  async introspect(schema: string = 'public'): Promise<string> {
    try {
      await this.adapter.connect();
      // Get all tables
      const tables = await this.getTables(schema);

      const models: string[] = [];

      for (const tableName of tables) {
        const model = await this.introspectTable(tableName, schema);
        models.push(model);
      }

      return models.join('\n\n');
    } finally {
      await this.adapter.disconnect();
    }
  }

  /**
   * Get list of tables in schema
   */
  private async getTables(schema: string): Promise<string[]> {
    // FIX BUG-001: Use safe string literal escaping to prevent SQL injection
    const safeSchema = escapeSqlStringLiteral(schema);
    const query = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = ${safeSchema}
        AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `;

    const results = await this.adapter.query(query);
    return results.map((row: any) => row.table_name);
  }

  /**
   * Introspect a single table
   */
  private async introspectTable(tableName: string, schema: string): Promise<string> {
    const columns = await this.getColumns(tableName, schema);
    const constraints = await this.getConstraints(tableName, schema);

    const lines: string[] = [];
    lines.push(`model ${tableName} {`);

    for (const col of columns) {
      const line = this.generateColumnLine(col, constraints);
      lines.push(`  ${line}`);
    }

    lines.push('}');

    return lines.join('\n');
  }

  /**
   * Get column information
   */
  private async getColumns(tableName: string, schema: string): Promise<ColumnInfo[]> {
    // FIX BUG-001: Use safe string literal escaping to prevent SQL injection
    const safeSchema = escapeSqlStringLiteral(schema);
    const safeTableName = escapeSqlStringLiteral(tableName);

    const query = `
      SELECT
        column_name,
        data_type,
        character_maximum_length,
        numeric_precision,
        numeric_scale,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = ${safeSchema}
        AND table_name = ${safeTableName}
      ORDER BY ordinal_position;
    `;

    const results = await this.adapter.query(query);

    return results.map((row: any) => ({
      columnName: row.column_name,
      dataType: row.data_type,
      characterMaximumLength: row.character_maximum_length,
      numericPrecision: row.numeric_precision,
      numericScale: row.numeric_scale,
      isNullable: row.is_nullable,
      columnDefault: row.column_default,
    }));
  }

  /**
   * Get constraint information
   */
  private async getConstraints(
    tableName: string,
    schema: string
  ): Promise<ConstraintInfo[]> {
    // FIX BUG-001: Use safe string literal escaping to prevent SQL injection
    const safeSchema = escapeSqlStringLiteral(schema);
    const safeTableName = escapeSqlStringLiteral(tableName);

    const query = `
      SELECT
        tc.constraint_type,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints tc
      LEFT JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      LEFT JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
        AND tc.table_schema = ccu.table_schema
      WHERE tc.table_schema = ${safeSchema}
        AND tc.table_name = ${safeTableName};
    `;

    const results = await this.adapter.query(query);

    return results.map((row: any) => ({
      constraintType: row.constraint_type,
      columnName: row.column_name,
      foreignTableName: row.foreign_table_name,
      foreignColumnName: row.foreign_column_name,
    }));
  }

  /**
   * Generate a single column line in DSL
   */
  private generateColumnLine(
    col: ColumnInfo,
    constraints: ConstraintInfo[]
  ): string {
    const parts: string[] = [];

    // Column name
    parts.push(col.columnName.padEnd(15));

    // Map SQL type to Sigil type
    const sigilType = this.mapSqlTypeToSigil(col);
    parts.push(sigilType.padEnd(20));

    // Find constraints for this column
    const colConstraints = constraints.filter((c) => c.columnName === col.columnName);

    // Add decorators
    const decorators: string[] = [];

    // Primary key
    if (colConstraints.some((c) => c.constraintType === 'PRIMARY KEY')) {
      decorators.push('@pk');
    }

    // Unique
    if (colConstraints.some((c) => c.constraintType === 'UNIQUE')) {
      decorators.push('@unique');
    }

    // Not null
    if (col.isNullable === 'NO' && !decorators.includes('@pk')) {
      decorators.push('@notnull');
    }

    // Foreign key
    const fkConstraint = colConstraints.find((c) => c.constraintType === 'FOREIGN KEY');
    if (fkConstraint && fkConstraint.foreignTableName && fkConstraint.foreignColumnName) {
      decorators.push(`@ref(${fkConstraint.foreignTableName}.${fkConstraint.foreignColumnName})`);
    }

    // Default value
    if (col.columnDefault) {
      const defaultValue = this.parseDefaultValue(col.columnDefault);
      if (defaultValue) {
        decorators.push(`@default(${defaultValue})`);
      }
    }

    parts.push(decorators.join(' '));

    return parts.join(' ').trimEnd();
  }

  /**
   * Map PostgreSQL types to Sigil types
   */
  private mapSqlTypeToSigil(col: ColumnInfo): string {
    const dataType = col.dataType.toLowerCase();

    switch (dataType) {
      case 'integer':
        return 'Int';

      case 'bigint':
        return 'BigInt';

      case 'smallint':
        return 'SmallInt';

      case 'character varying':
      case 'varchar':
        if (col.characterMaximumLength) {
          return `VarChar(${col.characterMaximumLength})`;
        }
        return 'VarChar';

      case 'character':
      case 'char':
        if (col.characterMaximumLength) {
          return `Char(${col.characterMaximumLength})`;
        }
        return 'Char';

      case 'text':
        return 'Text';

      case 'boolean':
        return 'Boolean';

      case 'timestamp':
      case 'timestamp without time zone':
      case 'timestamp with time zone':
        return 'Timestamp';

      case 'date':
        return 'Date';

      case 'time':
      case 'time without time zone':
        return 'Time';

      case 'numeric':
      case 'decimal':
        if (col.numericPrecision && col.numericScale) {
          return `Numeric(${col.numericPrecision}, ${col.numericScale})`;
        } else if (col.numericPrecision) {
          return `Numeric(${col.numericPrecision})`;
        }
        return 'Numeric';

      case 'real':
        return 'Real';

      case 'double precision':
        return 'DoublePrecision';

      case 'json':
        return 'Json';

      case 'jsonb':
        return 'Jsonb';

      case 'uuid':
        return 'Uuid';

      default:
        // Fallback to Text for unknown types
        return 'Text';
    }
  }

  /**
   * Parse PostgreSQL default value to Sigil format
   */
  private parseDefaultValue(defaultValue: string): string | null {
    // Remove type casts
    let value = defaultValue.replace(/::[a-z]+/gi, '');

    // Handle CURRENT_TIMESTAMP, now(), etc.
    if (value.toLowerCase().includes('current_timestamp') || value.toLowerCase().includes('now()')) {
      return "'now'";
    }

    // Handle booleans
    if (value.toLowerCase() === 'true' || value.toLowerCase() === 'false') {
      return `'${value.toLowerCase()}'`;
    }

    // Handle string literals
    if (value.startsWith("'") && value.endsWith("'")) {
      return value;
    }

    // Handle numbers
    if (/^-?\d+(\.\d+)?$/.test(value.trim())) {
      return `'${value.trim()}'`;
    }

    // Handle nextval (sequences) - map to Serial
    if (value.includes('nextval')) {
      return null; // Don't add default for auto-increment
    }

    return null;
  }
}
