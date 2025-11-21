/**
 * SQLite Introspector: Reverse engineers SQLite database schema into Sigil DSL
 * Uses PRAGMA commands and sqlite_master to extract table and column definitions
 */

import { DbAdapter } from '../ast/types.js';
import { escapeSqlIdentifier } from '../utils/sql-identifier-escape.js';

interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface ForeignKeyInfo {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string;
  on_update: string;
  on_delete: string;
  match: string;
}

interface IndexInfo {
  name: string;
  unique: number;
}

interface IndexColumnInfo {
  seqno: number;
  cid: number;
  name: string;
}

export class SQLiteIntrospector {
  private adapter: DbAdapter;

  constructor(adapter: DbAdapter) {
    this.adapter = adapter;
  }

  /**
   * Introspect the database and generate .sigl DSL
   * FIX BUG-042: Move connect() inside try block to ensure disconnect() is called on failure
   */
  async introspect(): Promise<string> {
    try {
      await this.adapter.connect();
      // Get all tables
      const tables = await this.getTables();

      const models: string[] = [];

      for (const tableName of tables) {
        const model = await this.introspectTable(tableName);
        models.push(model);
      }

      return models.join('\n\n');
    } finally {
      await this.adapter.disconnect();
    }
  }

  /**
   * Get list of tables
   */
  private async getTables(): Promise<string[]> {
    const query = `
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `;

    const rows = await this.adapter.query(query);
    return rows.map((row: any) => row.name);
  }

  /**
   * Introspect a single table
   */
  private async introspectTable(tableName: string): Promise<string> {
    const columns = await this.getColumns(tableName);
    const foreignKeys = await this.getForeignKeys(tableName);
    const indexes = await this.getIndexes(tableName);

    let dsl = `# Table: ${tableName}\n`;
    dsl += `model ${tableName} {\n`;

    for (const col of columns) {
      const line = this.generateColumnDefinition(col, foreignKeys, indexes);
      dsl += `  ${line}\n`;
    }

    dsl += '}';

    return dsl;
  }

  /**
   * Get column information using PRAGMA
   */
  private async getColumns(tableName: string): Promise<ColumnInfo[]> {
    // FIX BUG-001: Validate table name to prevent SQL injection
    const safeTableName = escapeSqlIdentifier(tableName);
    const query = `PRAGMA table_info("${safeTableName}")`;
    return await this.adapter.query(query);
  }

  /**
   * Get foreign key information using PRAGMA
   */
  private async getForeignKeys(tableName: string): Promise<ForeignKeyInfo[]> {
    // FIX BUG-001: Validate table name to prevent SQL injection
    const safeTableName = escapeSqlIdentifier(tableName);
    const query = `PRAGMA foreign_key_list("${safeTableName}")`;
    return await this.adapter.query(query);
  }

  /**
   * Get index information
   */
  private async getIndexes(tableName: string): Promise<Map<string, IndexInfo>> {
    // FIX BUG-001: Validate table name to prevent SQL injection
    const safeTableName = escapeSqlIdentifier(tableName);
    const query = `PRAGMA index_list("${safeTableName}")`;
    const indexes = await this.adapter.query(query);

    const indexMap = new Map<string, IndexInfo>();

    for (const idx of indexes) {
      // Skip auto-created indexes (for primary keys and foreign keys)
      if (idx.origin === 'pk' || idx.origin === 'u') {
        // FIX BUG-001: Validate index name to prevent SQL injection
        const safeIndexName = escapeSqlIdentifier(idx.name);
        const columnsQuery = `PRAGMA index_info("${safeIndexName}")`;
        const columns: IndexColumnInfo[] = await this.adapter.query(columnsQuery);

        if (columns.length === 1) {
          // Single-column index
          indexMap.set(columns[0].name, {
            name: idx.name,
            unique: idx.unique,
          });
        }
      }
    }

    return indexMap;
  }

  /**
   * Generate column definition line
   */
  private generateColumnDefinition(
    col: ColumnInfo,
    foreignKeys: ForeignKeyInfo[],
    indexes: Map<string, IndexInfo>
  ): string {
    const parts: string[] = [];

    // Column name (padded)
    parts.push(col.name.padEnd(15));

    // Data type
    const sigilType = this.mapTypeToSigil(col);
    parts.push(sigilType.padEnd(20));

    // Primary key
    if (col.pk === 1) {
      parts.push('@pk');
    }

    // Unique (from index)
    const indexInfo = indexes.get(col.name);
    if (indexInfo && indexInfo.unique === 1 && col.pk === 0) {
      parts.push('@unique');
    }

    // Foreign key
    const fk = foreignKeys.find(fk => fk.from === col.name);
    if (fk) {
      parts.push(`@ref(${fk.table}.${fk.to})`);

      if (fk.on_delete && fk.on_delete !== 'NO ACTION') {
        parts.push(`@onDelete('${fk.on_delete.toLowerCase()}')`);
      }
    }

    // NOT NULL (if not primary key)
    if (col.notnull === 1 && col.pk === 0) {
      parts.push('@notnull');
    }

    // Default value
    if (col.dflt_value !== null) {
      const defaultValue = this.formatDefaultValue(col.dflt_value, col.type);
      if (defaultValue) {
        parts.push(`@default(${defaultValue})`);
      }
    }

    return parts.join(' ');
  }

  /**
   * Map SQLite type to Sigil type
   */
  private mapTypeToSigil(col: ColumnInfo): string {
    const type = col.type.toUpperCase();

    // Check for AUTOINCREMENT in the column definition
    // SQLite AUTOINCREMENT is only valid with INTEGER PRIMARY KEY
    if (col.pk === 1 && type === 'INTEGER') {
      return 'Serial';
    }

    // Check for VARCHAR with length
    const varcharMatch = type.match(/VARCHAR\((\d+)\)/i);
    if (varcharMatch) {
      return `VarChar(${varcharMatch[1]})`;
    }

    // Check for CHAR with length
    const charMatch = type.match(/CHAR\((\d+)\)/i);
    if (charMatch) {
      return `Char(${charMatch[1]})`;
    }

    // Check for DECIMAL with precision
    const decimalMatch = type.match(/DECIMAL\((\d+),(\d+)\)/i);
    if (decimalMatch) {
      return `Decimal(${decimalMatch[1]},${decimalMatch[2]})`;
    }

    // Check for CHECK constraint for Enum (this is tricky in SQLite)
    // We'll try to extract it from the table SQL
    // For now, just return TEXT and let user manually convert if needed

    switch (type) {
      case 'INTEGER':
      case 'INT':
      case 'BIGINT':
      case 'SMALLINT':
        return 'Int';

      case 'TEXT':
      case 'VARCHAR':
      case 'CHAR':
        return 'Text';

      case 'BOOLEAN':
      case 'BOOL':
        return 'Boolean';

      case 'TIMESTAMP':
      case 'DATETIME':
        return 'Timestamp';

      case 'DATE':
        return 'Date';

      case 'TIME':
        return 'Time';

      case 'REAL':
      case 'FLOAT':
      case 'DOUBLE':
        return 'Real';

      case 'NUMERIC':
      case 'DECIMAL':
        return 'Decimal(10,2)';

      case 'JSON':
        return 'Json';

      default:
        // Check if it contains specific keywords
        if (type.includes('INT')) {
          return 'Int';
        }
        if (type.includes('CHAR') || type.includes('TEXT')) {
          return 'Text';
        }
        if (type.includes('REAL') || type.includes('FLOAT') || type.includes('DOUBLE')) {
          return 'Real';
        }

        return 'Text'; // Fallback
    }
  }

  /**
   * Format default value for DSL
   */
  private formatDefaultValue(value: string, type: string): string | null {
    if (!value || value === 'NULL') {
      return null;
    }

    // Remove surrounding quotes
    value = value.trim();

    // Handle quoted strings
    if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }

    // Special values
    if (value === 'CURRENT_TIMESTAMP' || value === "datetime('now')") {
      return 'now';
    }

    // Boolean values (SQLite stores as 0/1)
    if (type.toUpperCase().includes('BOOL')) {
      if (value === '1' || value === 'true' || value === 'TRUE') {
        return 'true';
      }
      if (value === '0' || value === 'false' || value === 'FALSE') {
        return 'false';
      }
    }

    // Check if it's a number
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      return value;
    }

    // String value
    return `'${value}'`;
  }
}
