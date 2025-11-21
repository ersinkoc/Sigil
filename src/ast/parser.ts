/**
 * Parser: Builds AST from tokens
 * Converts token stream into a structured Abstract Syntax Tree
 */

import {
  Token,
  TokenType,
  SchemaAST,
  ModelNode,
  ColumnNode,
  DecoratorNode,
  RawSqlNode,
  ParseError,
} from './types.js';
import { Lexer } from './lexer.js';

export class Parser {
  private tokens: Token[];
  private current: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  static parse(input: string): SchemaAST {
    const lexer = new Lexer(input);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    return parser.parseSchema();
  }

  private parseSchema(): SchemaAST {
    const models: ModelNode[] = [];
    const rawSql: RawSqlNode[] = [];

    while (!this.isAtEnd()) {
      // Skip any unexpected newlines or whitespace tokens
      if (this.check('NEWLINE')) {
        this.advance();
        continue;
      }

      if (this.check('MODEL')) {
        models.push(this.parseModel());
      } else if (this.check('RAW_SQL')) {
        rawSql.push(this.parseRawSql());
      } else if (!this.check('EOF')) {
        const token = this.peek();
        throw new ParseError(
          `Unexpected token: ${token.value} (${token.type})`,
          token.line,
          token.column
        );
      } else {
        break;
      }
    }

    return { models, rawSql };
  }

  private parseModel(): ModelNode {
    this.consume('MODEL', 'Expected "model" keyword');

    const nameToken = this.consume('IDENTIFIER', 'Expected model name');
    const name = nameToken.value;

    this.consume('LBRACE', 'Expected "{" after model name');

    const columns: ColumnNode[] = [];

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      // Skip newlines inside model block
      if (this.check('NEWLINE')) {
        this.advance();
        continue;
      }

      columns.push(this.parseColumn());
    }

    this.consume('RBRACE', 'Expected "}" to close model block');

    // FIX BUG-017: Validate that models have at least one column
    if (columns.length === 0) {
      throw new ParseError(
        `Model "${name}" must have at least one column`,
        nameToken.line,
        nameToken.column
      );
    }

    return { name, columns };
  }

  private parseColumn(): ColumnNode {
    const nameToken = this.consume('IDENTIFIER', 'Expected column name');
    const name = nameToken.value;

    const typeToken = this.consume('TYPE', 'Expected column type');
    const type = typeToken.value;

    let typeArgs: string[] | undefined;

    // Handle type arguments like VarChar(255) or Enum('admin', 'guest')
    if (this.check('LPAREN')) {
      typeArgs = this.parseTypeArgs();
    }

    // FIX BUG-040: Parse decorators and detect duplicates
    const decorators: DecoratorNode[] = [];
    const seenDecorators = new Set<string>();

    while (this.check('DECORATOR')) {
      const decorator = this.parseDecorator();

      // Check for duplicate decorators
      if (seenDecorators.has(decorator.name)) {
        throw new ParseError(
          `Duplicate decorator @${decorator.name} on column "${name}". ` +
          `Each decorator can only be used once per column.`,
          this.previous().line,
          this.previous().column
        );
      }

      seenDecorators.add(decorator.name);
      decorators.push(decorator);
    }

    return {
      name,
      type,
      typeArgs,
      decorators,
    };
  }

  private parseTypeArgs(): string[] {
    this.consume('LPAREN', 'Expected "("');

    const args: string[] = [];

    if (!this.check('RPAREN')) {
      do {
        if (this.check('STRING')) {
          args.push(this.advance().value);
        } else if (this.check('NUMBER')) {
          args.push(this.advance().value);
        } else if (this.check('IDENTIFIER')) {
          args.push(this.advance().value);
        } else {
          const token = this.peek();
          throw new ParseError(
            `Expected argument value, got ${token.type}`,
            token.line,
            token.column
          );
        }

        if (this.check('COMMA')) {
          this.advance();
        } else {
          break;
        }
      } while (!this.check('RPAREN') && !this.isAtEnd());
    }

    this.consume('RPAREN', 'Expected ")" after type arguments');

    return args;
  }

  private parseDecorator(): DecoratorNode {
    const decoratorToken = this.consume('DECORATOR', 'Expected decorator');
    const name = decoratorToken.value;

    let args: string[] | undefined;

    // Handle decorator arguments like @default('guest') or @ref(User.id)
    if (this.check('LPAREN')) {
      args = this.parseDecoratorArgs();
    }

    return { name, args };
  }

  private parseDecoratorArgs(): string[] {
    this.consume('LPAREN', 'Expected "("');

    const args: string[] = [];

    if (!this.check('RPAREN')) {
      do {
        if (this.check('STRING')) {
          args.push(this.advance().value);
        } else if (this.check('NUMBER')) {
          args.push(this.advance().value);
        } else if (this.check('IDENTIFIER')) {
          // Handle compound identifiers like User.id
          let value = this.advance().value;

          // Check for dot notation
          if (this.check('DOT')) {
            this.advance(); // consume DOT
            if (this.check('IDENTIFIER')) {
              value += '.' + this.advance().value;
            } else {
              throw new ParseError(
                'Expected identifier after dot in reference',
                this.peek().line,
                this.peek().column
              );
            }
          }

          args.push(value);
        } else {
          const token = this.peek();
          throw new ParseError(
            `Expected decorator argument, got ${token.type}`,
            token.line,
            token.column
          );
        }

        if (this.check('COMMA')) {
          this.advance();
        } else {
          break;
        }
      } while (!this.check('RPAREN') && !this.isAtEnd());
    }

    this.consume('RPAREN', 'Expected ")" after decorator arguments');

    return args;
  }

  private parseRawSql(): RawSqlNode {
    const sqlToken = this.consume('RAW_SQL', 'Expected raw SQL');
    return { sql: sqlToken.value };
  }

  // Helper methods

  private advance(): Token {
    if (!this.isAtEnd()) {
      this.current++;
    }
    return this.previous();
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();

    const token = this.peek();
    throw new ParseError(message, token.line, token.column);
  }

  private peek(): Token {
    // FIX BUG-012: Add bounds checking to prevent array overflow
    if (this.current >= this.tokens.length) {
      // Return a safe EOF token if we've gone past the end
      return {
        type: 'EOF',
        value: '',
        line: this.tokens[this.tokens.length - 1]?.line || 1,
        column: this.tokens[this.tokens.length - 1]?.column || 1,
      };
    }
    return this.tokens[this.current];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private isAtEnd(): boolean {
    return this.peek().type === 'EOF';
  }
}
