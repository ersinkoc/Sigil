/**
 * Lexer: Tokenizes .sigl file content
 * Converts raw text into a stream of tokens
 */

import { Token, TokenType, ParseError } from './types.js';

const KEYWORDS = new Set(['model']);

const DATA_TYPES = new Set([
  'Serial',
  'Int',
  'BigInt',
  'SmallInt',
  'VarChar',
  'Char',
  'Text',
  'Boolean',
  'Timestamp',
  'Date',
  'Time',
  'Decimal',
  'Numeric',
  'Real',
  'DoublePrecision',
  'Json',
  'Jsonb',
  'Uuid',
  'Enum',
]);

export class Lexer {
  private input: string;
  private position: number = 0;
  private line: number = 1;
  private column: number = 1;
  private tokens: Token[] = [];

  constructor(input: string) {
    this.input = input;
  }

  tokenize(): Token[] {
    while (!this.isAtEnd()) {
      this.scanToken();
    }

    this.tokens.push({
      type: 'EOF',
      value: '',
      line: this.line,
      column: this.column,
    });

    return this.tokens;
  }

  private scanToken(): void {
    const char = this.advance();

    // Skip whitespace except newlines
    if (char === ' ' || char === '\t' || char === '\r') {
      return;
    }

    // Handle newlines
    if (char === '\n') {
      this.line++;
      this.column = 1;
      return;
    }

    // Handle comments
    if (char === '#') {
      this.scanComment();
      return;
    }

    // Handle raw SQL (lines starting with >)
    if (char === '>' && (this.column === 2 || this.isAtLineStart())) {
      this.scanRawSql();
      return;
    }

    // Handle decorators
    if (char === '@') {
      this.scanDecorator();
      return;
    }

    // Handle strings
    if (char === "'" || char === '"') {
      this.scanString(char);
      return;
    }

    // Handle punctuation
    switch (char) {
      case '(':
        this.addToken('LPAREN', char);
        return;
      case ')':
        this.addToken('RPAREN', char);
        return;
      case '{':
        this.addToken('LBRACE', char);
        return;
      case '}':
        this.addToken('RBRACE', char);
        return;
      case ',':
        this.addToken('COMMA', char);
        return;
    }

    // Handle identifiers, keywords, and types
    if (this.isAlpha(char)) {
      this.scanIdentifierOrKeyword(char);
      return;
    }

    // Handle numbers
    if (this.isDigit(char)) {
      this.scanNumber(char);
      return;
    }

    throw new ParseError(`Unexpected character: ${char}`, this.line, this.column - 1);
  }

  private scanComment(): void {
    // Skip comment characters until end of line
    while (!this.isAtEnd() && this.peek() !== '\n') {
      this.advance();
    }

    // Comments are ignored, we don't add them to tokens
  }

  private scanRawSql(): void {
    const startLine = this.line;
    const startColumn = this.column - 1;
    let sql = '';

    // Read until end of line
    while (!this.isAtEnd() && this.peek() !== '\n') {
      sql += this.advance();
    }

    this.addToken('RAW_SQL', sql.trim(), startLine, startColumn);
  }

  private scanDecorator(): void {
    const startLine = this.line;
    const startColumn = this.column - 1;
    let name = '';

    while (!this.isAtEnd() && (this.isAlphaNumeric(this.peek()) || this.peek() === '_')) {
      name += this.advance();
    }

    if (name.length === 0) {
      throw new ParseError('Expected decorator name after @', startLine, startColumn);
    }

    this.addToken('DECORATOR', name, startLine, startColumn);
  }

  private scanString(quote: string): void {
    const startLine = this.line;
    const startColumn = this.column - 1;
    let value = '';

    while (!this.isAtEnd() && this.peek() !== quote) {
      if (this.peek() === '\n') {
        this.line++;
        this.column = 0;
      }
      if (this.peek() === '\\') {
        this.advance(); // consume backslash
        if (!this.isAtEnd()) {
          const escaped = this.advance();
          // Handle escape sequences
          switch (escaped) {
            case 'n':
              value += '\n';
              break;
            case 't':
              value += '\t';
              break;
            case 'r':
              value += '\r';
              break;
            case '\\':
              value += '\\';
              break;
            case quote:
              value += quote;
              break;
            default:
              value += escaped;
          }
        }
      } else {
        value += this.advance();
      }
    }

    if (this.isAtEnd()) {
      throw new ParseError('Unterminated string', startLine, startColumn);
    }

    // Consume closing quote
    this.advance();

    this.addToken('STRING', value, startLine, startColumn);
  }

  private scanIdentifierOrKeyword(firstChar: string): void {
    const startLine = this.line;
    const startColumn = this.column - 1;
    let value = firstChar;

    while (!this.isAtEnd() && (this.isAlphaNumeric(this.peek()) || this.peek() === '_')) {
      value += this.advance();
    }

    // Check if it's a keyword
    if (KEYWORDS.has(value.toLowerCase())) {
      this.addToken('MODEL', value, startLine, startColumn);
      return;
    }

    // Check if it's a data type
    if (DATA_TYPES.has(value)) {
      this.addToken('TYPE', value, startLine, startColumn);
      return;
    }

    // Otherwise, it's an identifier
    this.addToken('IDENTIFIER', value, startLine, startColumn);
  }

  private scanNumber(firstChar: string): void {
    const startLine = this.line;
    const startColumn = this.column - 1;
    let value = firstChar;

    while (!this.isAtEnd() && this.isDigit(this.peek())) {
      value += this.advance();
    }

    // Handle decimal numbers
    if (!this.isAtEnd() && this.peek() === '.' && this.isDigit(this.peekNext())) {
      value += this.advance(); // consume '.'
      while (!this.isAtEnd() && this.isDigit(this.peek())) {
        value += this.advance();
      }
    }

    this.addToken('NUMBER', value, startLine, startColumn);
  }

  private addToken(type: TokenType, value: string, line?: number, column?: number): void {
    this.tokens.push({
      type,
      value,
      line: line ?? this.line,
      column: column ?? this.column - value.length,
    });
  }

  private advance(): string {
    const char = this.input[this.position++];
    this.column++;
    return char;
  }

  private peek(): string {
    if (this.isAtEnd()) return '\0';
    return this.input[this.position];
  }

  private peekNext(): string {
    if (this.position + 1 >= this.input.length) return '\0';
    return this.input[this.position + 1];
  }

  private isAtEnd(): boolean {
    return this.position >= this.input.length;
  }

  private isAtLineStart(): boolean {
    // Check if we're at the start of a line (only whitespace before)
    for (let i = this.position - 2; i >= 0; i--) {
      const char = this.input[i];
      if (char === '\n') return true;
      if (char !== ' ' && char !== '\t' && char !== '\r') return false;
    }
    return true;
  }

  private isAlpha(char: string): boolean {
    return /[a-zA-Z_]/.test(char);
  }

  private isDigit(char: string): boolean {
    return /[0-9]/.test(char);
  }

  private isAlphaNumeric(char: string): boolean {
    return this.isAlpha(char) || this.isDigit(char);
  }
}
