# Security Policy

## Supported Versions

Currently supported versions of Sigil receiving security updates:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

We take the security of Sigil seriously. If you believe you have found a security vulnerability, please report it to us as described below.

### Please Do NOT

- **Open a public GitHub issue** for security vulnerabilities
- **Discuss the vulnerability publicly** before it has been addressed

### Please DO

**Report security vulnerabilities privately** using one of these methods:

1. **GitHub Security Advisories** (Preferred)
   - Go to the repository's Security tab
   - Click "Report a vulnerability"
   - Fill out the form with details

2. **Email** (If GitHub Security Advisories is unavailable)
   - Contact the maintainers directly
   - Include "SECURITY" in the subject line
   - Provide detailed information about the vulnerability

### What to Include

Please include the following information in your report:

- **Type of vulnerability** (e.g., SQL injection, code injection, etc.)
- **Full path** of the affected source file(s)
- **Location** of the affected code (tag/branch/commit)
- **Step-by-step instructions** to reproduce the issue
- **Proof-of-concept or exploit code** (if possible)
- **Impact** of the vulnerability
- **Suggested fix** (if you have one)

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 1 week
- **Fix development**: Varies by severity
- **Public disclosure**: After fix is released

We will keep you informed of the progress towards resolving the issue.

## Security Considerations

### Migration File Integrity

Sigil uses SHA-256 hashing to ensure migration files haven't been tampered with after being applied.

**What this protects against:**
- Accidental modification of applied migrations
- Unauthorized changes to migration history

**What this doesn't protect against:**
- Initial malicious migrations (review code before running)
- Compromised development environment

**Best Practices:**
- Review all migration files before applying
- Use code review for migration PRs
- Restrict write access to migration files in production

### Database Credentials

Sigil does NOT store database credentials. You provide credentials through your adapter configuration.

**Best Practices:**
- Use environment variables for credentials
- Never commit `sigil.config.js` with credentials
- Use `.gitignore` to exclude config files
- Use IAM roles or credential managers when possible

**Example (Using Environment Variables):**

```javascript
// sigil.config.js
import pg from 'pg';

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true',
});

export default {
  adapter: {
    async connect() {},
    async disconnect() { await pool.end(); },
    async query(sql) {
      const result = await pool.query(sql);
      return result.rows;
    },
    async transaction(queries) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const sql of queries) {
          await client.query(sql);
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  },
  migrationsPath: './migrations',
};
```

### SQL Injection

**Risk Areas:**

1. **Introspectors** - Query database schema using string interpolation
2. **User-provided migration names** - Used in file paths
3. **Raw SQL statements** - Direct pass-through from `.sigl` files

**Mitigations:**

1. **Introspectors:**
   - Use parameterized queries when connecting to production databases
   - Validate schema/table names
   - Sanitize user input

2. **Migration Names:**
   - Validated by CLI (alphanumeric and underscores only)
   - File path traversal prevented

3. **Raw SQL:**
   - Users are responsible for their own SQL
   - Review raw SQL in PRs
   - Run migrations with limited database permissions

**Example (Safer Introspection):**

```javascript
// Current (String Interpolation)
const query = `SELECT * FROM information_schema.tables WHERE table_schema = '${schema}'`;

// Better (Parameterized - if your adapter supports it)
const query = 'SELECT * FROM information_schema.tables WHERE table_schema = $1';
const result = await adapter.query(query, [schema]);
```

**Note:** Built-in introspectors use string interpolation for simplicity. For production use, consider implementing your own introspector with parameterized queries.

### Dependencies

**Runtime Dependencies:** ZERO

Sigil has **no runtime dependencies** to minimize supply chain attacks. It only uses Node.js built-in modules.

**Development Dependencies:**
- `typescript` - Build tool
- `@types/node` - TypeScript definitions

These are only used during development and not included in published package.

**Recommendations:**
- Regularly update Node.js
- Run `npm audit` for dev dependencies
- Use `npm ci` instead of `npm install` in CI/CD

### Transaction Rollback

All migrations run inside transactions. If any migration fails, the entire batch is rolled back.

**What this protects against:**
- Partial migration application
- Data corruption from failed migrations

**Limitations:**
- Some DDL statements in certain databases are not transactional (e.g., MySQL DDL auto-commits)
- User responsibility to test migrations in staging first

### File System Access

Sigil reads/writes files in these locations:
- Migration directory (default: `./migrations`)
- Ledger file (default: `./.sigil_ledger.json`)
- Config file (default: `./sigil.config.js`)

**Security Considerations:**
- Sigil does NOT follow symlinks
- Paths are resolved relative to CWD
- No file access outside migration directory

**Best Practices:**
- Set appropriate file permissions on migrations
- Protect ledger file (contains migration history)
- Review file operations in untrusted environments

## Vulnerability Disclosure Policy

When a security vulnerability is confirmed:

1. **Fix Development**: We will develop a fix as quickly as possible
2. **Version Release**: A new version will be released with the fix
3. **Security Advisory**: A GitHub Security Advisory will be published
4. **CHANGELOG Update**: The vulnerability will be documented
5. **Credit**: Reporter will be credited (unless anonymity is requested)

### Severity Levels

- **Critical**: Remote code execution, privilege escalation
- **High**: SQL injection, authentication bypass
- **Medium**: Information disclosure, denial of service
- **Low**: Minor information leaks, low-impact issues

## Security Best Practices for Users

### Development Environment

✅ **DO:**
- Review all migrations before applying
- Use code review process for migrations
- Test migrations in staging environment
- Use version control for migrations
- Keep Node.js updated

❌ **DON'T:**
- Commit database credentials
- Run untrusted migrations
- Modify applied migrations
- Share ledger file publicly
- Use production credentials in development

### Production Environment

✅ **DO:**
- Use environment variables for credentials
- Run migrations with limited database user
- Enable SSL/TLS for database connections
- Backup database before migrations
- Monitor migration execution
- Use read-only replicas for introspection

❌ **DON'T:**
- Use admin/root database accounts
- Apply untested migrations
- Run migrations concurrently
- Expose migration endpoints publicly
- Ignore integrity check warnings

### CI/CD Pipelines

✅ **DO:**
- Run migrations in test environment first
- Use dedicated migration user
- Encrypt secrets in CI/CD variables
- Audit migration history
- Fail pipeline on migration errors

❌ **DON'T:**
- Store credentials in code
- Auto-apply migrations without review
- Run migrations as database admin
- Skip integrity checks
- Ignore failed migrations

## Contact

For security concerns, please use the private reporting methods described above rather than public channels.

For general questions about security, you can open a GitHub Discussion.

---

**Thank you for helping keep Sigil and its users safe!**
