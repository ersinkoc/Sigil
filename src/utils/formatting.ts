/**
 * Formatting utilities
 * Helper functions for string formatting and file generation
 */

/**
 * Format DSL content with proper indentation
 */
export function formatDsl(content: string): string {
  const lines = content.split('\n');
  const formatted: string[] = [];
  let indent = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '') {
      formatted.push('');
      continue;
    }

    // Decrease indent for closing braces
    if (trimmed === '}') {
      indent = Math.max(0, indent - 1);
    }

    // Add indentation
    const indentedLine = '  '.repeat(indent) + trimmed;
    formatted.push(indentedLine);

    // Increase indent for opening braces
    if (trimmed.endsWith('{')) {
      indent++;
    }
  }

  return formatted.join('\n');
}

/**
 * Generate a timestamp-based migration filename
 */
export function generateMigrationFilename(name: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  const timestamp = `${year}${month}${day}${hours}${minutes}${seconds}`;
  const safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');

  return `${timestamp}_${safeName}.sigl`;
}

/**
 * Create a migration template
 */
export function createMigrationTemplate(name: string): string {
  const modelName = name
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');

  return `# Migration: ${name}

model ${modelName} {
  id        Serial        @pk
  createdAt Timestamp     @default(now)
}
`;
}

/**
 * Format a table for display
 */
export function formatTable(
  headers: string[],
  rows: string[][]
): string {
  if (rows.length === 0) {
    return '';
  }

  // Calculate column widths
  const widths = headers.map((header, i) => {
    const maxContentWidth = Math.max(
      ...rows.map((row) => (row[i] || '').length)
    );
    return Math.max(header.length, maxContentWidth);
  });

  // Format header
  const headerRow = headers
    .map((header, i) => header.padEnd(widths[i]))
    .join('  ');

  const separator = widths.map((width) => '-'.repeat(width)).join('  ');

  // Format rows
  const dataRows = rows.map((row) =>
    row.map((cell, i) => (cell || '').padEnd(widths[i])).join('  ')
  );

  return [headerRow, separator, ...dataRows].join('\n');
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Pluralize a word based on count
 */
export function pluralize(word: string, count: number): string {
  return count === 1 ? word : `${word}s`;
}
