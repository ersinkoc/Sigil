/**
 * Base SQL Generator Interface
 * All database-specific generators must implement this interface
 */

import { SchemaAST } from '../ast/types.js';

export interface SqlGenerator {
  /**
   * Generate SQL for creating tables (UP migration)
   */
  generateUp(ast: SchemaAST): string[];

  /**
   * Generate SQL for dropping tables (DOWN migration)
   */
  generateDown(ast: SchemaAST): string[];
}

export interface GeneratedMigration {
  up: string[];
  down: string[];
}
