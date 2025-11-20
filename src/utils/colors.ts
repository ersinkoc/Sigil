/**
 * Colors: Zero-dependency ANSI color codes
 * Provides simple colored output for CLI
 */

// ANSI escape codes
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

// Foreground colors
const FG_BLACK = '\x1b[30m';
const FG_RED = '\x1b[31m';
const FG_GREEN = '\x1b[32m';
const FG_YELLOW = '\x1b[33m';
const FG_BLUE = '\x1b[34m';
const FG_MAGENTA = '\x1b[35m';
const FG_CYAN = '\x1b[36m';
const FG_WHITE = '\x1b[37m';
const FG_GRAY = '\x1b[90m';

export const c = {
  reset: (text: string) => `${RESET}${text}${RESET}`,
  bold: (text: string) => `${BOLD}${text}${RESET}`,
  dim: (text: string) => `${DIM}${text}${RESET}`,

  black: (text: string) => `${FG_BLACK}${text}${RESET}`,
  red: (text: string) => `${FG_RED}${text}${RESET}`,
  green: (text: string) => `${FG_GREEN}${text}${RESET}`,
  yellow: (text: string) => `${FG_YELLOW}${text}${RESET}`,
  blue: (text: string) => `${FG_BLUE}${text}${RESET}`,
  magenta: (text: string) => `${FG_MAGENTA}${text}${RESET}`,
  cyan: (text: string) => `${FG_CYAN}${text}${RESET}`,
  white: (text: string) => `${FG_WHITE}${text}${RESET}`,
  gray: (text: string) => `${FG_GRAY}${text}${RESET}`,

  success: (text: string) => `${FG_GREEN}✓${RESET} ${text}`,
  error: (text: string) => `${FG_RED}✗${RESET} ${text}`,
  info: (text: string) => `${FG_BLUE}ℹ${RESET} ${text}`,
  warning: (text: string) => `${FG_YELLOW}⚠${RESET} ${text}`,
};
