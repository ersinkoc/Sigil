---
name: Bug Report
about: Report a bug to help us improve Sigil
title: '[BUG] '
labels: bug
assignees: ''
---

## Bug Description

A clear and concise description of what the bug is.

## Steps to Reproduce

1. Initialize Sigil with '...'
2. Create migration '...'
3. Run command '...'
4. See error

## Expected Behavior

A clear description of what you expected to happen.

## Actual Behavior

What actually happened instead.

## Environment

- **OS:** [e.g., Ubuntu 22.04, macOS 13.0, Windows 11]
- **Node.js Version:** [e.g., v20.10.0]
- **Sigil Version:** [e.g., 1.0.0]
- **Database:** [e.g., PostgreSQL 15, MySQL 8.0, SQLite 3.40]
- **Database Version:** [e.g., PostgreSQL 15.2]

## Migration File (if applicable)

```sigl
# Paste your .sigl migration file here
model Example {
  id Serial @pk
}
```

## Config File (remove credentials!)

```javascript
// Paste your sigil.config.js here (remove sensitive information)
export default {
  adapter: { /* ... */ },
  migrationsPath: './migrations',
};
```

## Error Message/Stack Trace

```
Paste the full error message and stack trace here
```

## Screenshots

If applicable, add screenshots to help explain your problem.

## Additional Context

Add any other context about the problem here. For example:
- Does this happen consistently or intermittently?
- Did this work in a previous version?
- Any workarounds you've found?

## Possible Solution

If you have ideas on how to fix this, please share them here.
