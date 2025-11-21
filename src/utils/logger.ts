/**
 * Structured Logger for Sigil
 * FIX MEDIUM-1: Provides audit trail and structured logging
 *
 * Features:
 * - Structured log entries with timestamps
 * - Multiple log levels (DEBUG, INFO, WARN, ERROR, SECURITY)
 * - JSON output for machine parsing
 * - Console output with colors
 * - Audit trail for compliance (SOX, GDPR, HIPAA)
 */

import { hostname } from 'os';
import { appendFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname } from 'path';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SECURITY';

export interface LogEntry {
  timestamp: string; // ISO 8601
  level: LogLevel;
  category: string; // 'migration', 'ledger', 'cli', 'security'
  message: string;
  metadata?: Record<string, any>;
  pid: number;
  hostname: string;
}

export interface LoggerConfig {
  /** Enable console output (default: true) */
  console?: boolean;
  /** File path for JSON logs (default: null, disabled) */
  file?: string | null;
  /** Minimum log level to output (default: 'INFO') */
  level?: LogLevel;
  /** Enable security audit logging (default: true) */
  auditTrail?: boolean;
}

/**
 * Singleton Logger instance
 */
export class Logger {
  private static instance: Logger;
  private config: Required<LoggerConfig>;
  private logLevels: Record<LogLevel, number> = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    SECURITY: 4,
  };

  private constructor(config: LoggerConfig = {}) {
    this.config = {
      console: config.console ?? true,
      file: config.file ?? null,
      level: config.level ?? 'INFO',
      auditTrail: config.auditTrail ?? true,
    };
  }

  static getInstance(config?: LoggerConfig): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(config);
    } else if (config) {
      // Update config if provided
      Logger.instance.config = {
        console: config.console ?? Logger.instance.config.console,
        file: config.file ?? Logger.instance.config.file,
        level: config.level ?? Logger.instance.config.level,
        auditTrail: config.auditTrail ?? Logger.instance.config.auditTrail,
      };
    }
    return Logger.instance;
  }

  /**
   * Core logging method
   */
  async log(
    level: LogLevel,
    category: string,
    message: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    // Filter by log level
    if (this.logLevels[level] < this.logLevels[this.config.level]) {
      return;
    }

    // Skip security logs if audit trail is disabled
    if (level === 'SECURITY' && !this.config.auditTrail) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      metadata,
      pid: process.pid,
      hostname: hostname(),
    };

    // Console output
    if (this.config.console) {
      this.writeConsole(entry);
    }

    // File output (async)
    if (this.config.file) {
      await this.writeFile(entry);
    }
  }

  /**
   * Write formatted output to console
   */
  private writeConsole(entry: LogEntry): void {
    const colors = {
      DEBUG: '\x1b[36m',    // Cyan
      INFO: '\x1b[32m',     // Green
      WARN: '\x1b[33m',     // Yellow
      ERROR: '\x1b[31m',    // Red
      SECURITY: '\x1b[35m', // Magenta
      RESET: '\x1b[0m',
      DIM: '\x1b[2m',
    };

    const color = colors[entry.level];
    const timestamp = new Date(entry.timestamp).toLocaleTimeString();

    let output = `${colors.DIM}[${timestamp}]${colors.RESET} ${color}${entry.level}${colors.RESET} [${entry.category}] ${entry.message}`;

    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      output += `\n${colors.DIM}${JSON.stringify(entry.metadata, null, 2)}${colors.RESET}`;
    }

    console.log(output);
  }

  /**
   * Write JSON log entry to file
   */
  private async writeFile(entry: LogEntry): Promise<void> {
    if (!this.config.file) return;

    try {
      // Ensure directory exists
      const dir = dirname(this.config.file);
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }

      // Append JSON line
      const line = JSON.stringify(entry) + '\n';
      await appendFile(this.config.file, line, 'utf-8');
    } catch (error) {
      // Fail silently - don't break app if logging fails
      console.error(`Failed to write log to file: ${(error as Error).message}`);
    }
  }

  /**
   * Convenience methods
   */

  async debug(category: string, message: string, metadata?: Record<string, any>): Promise<void> {
    await this.log('DEBUG', category, message, metadata);
  }

  async info(category: string, message: string, metadata?: Record<string, any>): Promise<void> {
    await this.log('INFO', category, message, metadata);
  }

  async warn(category: string, message: string, metadata?: Record<string, any>): Promise<void> {
    await this.log('WARN', category, message, metadata);
  }

  async error(category: string, message: string, metadata?: Record<string, any>): Promise<void> {
    await this.log('ERROR', category, message, metadata);
  }

  /**
   * Security audit logging
   * Used for compliance requirements (SOX, GDPR, HIPAA)
   */
  async security(action: string, details: Record<string, any>): Promise<void> {
    await this.log('SECURITY', 'audit', action, details);
  }
}

/**
 * Export singleton instance getter
 */
export function getLogger(config?: LoggerConfig): Logger {
  return Logger.getInstance(config);
}
