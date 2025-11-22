# 🛠️ REVIEW.md Sorunları İçin Kapsamlı Çözüm Planı

**Hazırlanma Tarihi:** 2025-11-21
**Proje:** Sigil v1.0.0
**Hedef:** REVIEW.md'de belirlenen tüm sorunların çözümü
**Toplam Sorun Sayısı:** 16 (6 Critical/High, 6 Medium, 4 Low)

---

## 📋 İçindekiler

1. [CRITICAL Öncelikli Sorunlar (6)](#critical-öncelikli-sorunlar)
2. [MEDIUM Öncelikli Sorunlar (6)](#medium-öncelikli-sorunlar)
3. [LOW Öncelikli Sorunlar (4)](#low-öncelikli-sorunlar)
4. [Implementasyon Sıralaması](#implementasyon-sıralaması)
5. [Test Stratejisi](#test-stratejisi)
6. [Risk Analizi ve Azaltma](#risk-analizi)

---

## 🔴 CRITICAL Öncelikli Sorunlar

### CRITICAL-1: Resource Exhaustion via Unbounded File Parsing

**📍 Dosyalar:**
- `src/engine/runner.ts` (Line 52-54)
- `src/ast/lexer.ts` (Line 39-40)
- `src/ast/types.ts` (SigilConfig interface)

**🎯 Çözüm Yaklaşımı:**

1. **Configuration Enhancement**
   - `SigilConfig` interface'ine `maxMigrationFileSize` ekleme (default: 5MB)
   - `maxTotalMigrationsSize` ekleme (default: 50MB - tüm migration dosyaları toplamı)
   - `enableFileSizeValidation` boolean flag (default: true)

2. **File Size Validation Layer**
   ```typescript
   // Yeni dosya: src/utils/file-validator.ts
   // İçerik:
   // - validateFileSize(path, maxSize): Promise<void>
   // - validateTotalSize(paths, maxSize): Promise<void>
   // - getFileSize(path): Promise<number>
   ```

3. **Runner Integration**
   - `loadMigrationFiles()` metodunda dosya boyutunu kontrol etme
   - Büyük dosya tespit edildiğinde açıklayıcı hata mesajı
   - Hata mesajında dosya boyutu, limit ve öneriler

**📝 Implementation Adımları:**

**Adım 1:** `src/ast/types.ts` güncellemesi
- `SigilConfig` interface'ine yeni alanlar ekle:
  ```typescript
  maxMigrationFileSize?: number; // bytes, default 5MB
  maxTotalMigrationsSize?: number; // bytes, default 50MB
  enableFileSizeValidation?: boolean; // default true
  ```

**Adım 2:** `src/utils/file-validator.ts` oluşturma
- Dosya boyutu kontrolü için utility fonksiyonları
- Clear error messages ile custom hatalar
- Logging desteği

**Adım 3:** `src/engine/runner.ts` entegrasyonu
- `loadMigrationFiles()` içinde her dosya okunmadan önce boyut kontrolü
- Toplam boyut kontrolü (tüm migration dosyaları)
- Config'den ayarları okuma, default değerler kullanma

**Adım 4:** CLI bilgilendirme
- `sigil init` komutunda config dosyasına örnek ayarlar ekleme
- Help documentation'a file size limits ekleme

**🧪 Test Senaryoları:**
- ✅ Normal boyutta dosya (1KB) - başarılı
- ✅ Limit altında büyük dosya (4MB) - başarılı
- ✅ Limiti aşan dosya (6MB) - hata mesajı
- ✅ Limiti disable edildiğinde (config) - büyük dosya kabul
- ✅ Toplam boyut limiti aşımı - hata mesajı
- ✅ Dosya boyutu alınamadığında - graceful degradation

**⏱️ Tahmini Süre:** 4 saat

---

### CRITICAL-2: Ledger Lock Race Condition (TOCTOU)

**📍 Dosyalar:**
- `src/engine/ledger.ts` (Line 29-94)

**🎯 Çözüm Yaklaşımı:**

1. **Atomic Lock Acquisition**
   - İki aşamalı lock mekanizması:
     - Faz 1: Unique ID ile geçici lock file oluşturma
     - Faz 2: Atomic rename ile asıl lock file'a dönüştürme
   - Lock file içeriğine PID, hostname, timestamp ekleme
   - Lock validation: İçerik kontrolü ile ownership doğrulama

2. **Enhanced Lock Structure**
   ```typescript
   interface LockInfo {
     pid: number;
     hostname: string;
     acquiredAt: string;
     lockId: string; // UUID
   }
   ```

3. **Improved Stale Lock Detection**
   - Lock file okuma ve validation
   - Process existence kontrolü (kill(pid, 0) ile)
   - Hostname matching (farklı makinelerden çalışma durumu)
   - Sadece gerçekten stale lock'lar silinsin

**📝 Implementation Adımları:**

**Adım 1:** Lock yapısını güçlendirme
- `LockInfo` interface tanımlama
- `os.hostname()` kullanarak hostname ekleme
- `crypto.randomUUID()` ile unique lock ID

**Adım 2:** Atomic lock acquisition
```typescript
private async acquireLock(): Promise<void> {
  // 1. Unique temp file oluştur: .sigil_ledger.json.lock.tmp.{uuid}
  // 2. LockInfo'yu yaz
  // 3. Atomic rename: tmp file -> .sigil_ledger.json.lock
  // 4. Lock file'ı oku ve validation
  // 5. Eğer lockId eşleşmiyorsa, başka process almış - retry
}
```

**Adım 3:** Stale lock detection iyileştirme
- Process liveness check (cross-platform)
- Hostname comparison
- Lock age threshold

**Adım 4:** Graceful lock cleanup
- Process exit handlers (SIGINT, SIGTERM)
- Automatic lock release on normal exit
- Lock ownership validation before release

**🧪 Test Senaryoları:**
- ✅ Normal lock acquisition - başarılı
- ✅ İki process aynı anda lock almaya çalışır - biri başarılı, diğeri bekler
- ✅ Stale lock cleanup (crashed process) - yeni process alabilir
- ✅ Lock timeout - clear error message
- ✅ Multiple machines (different hostnames) - prevented
- ✅ Process crash during lock hold - lock cleanup on next run
- ✅ Race condition: TOCTOU attack simulation - prevented

**⏱️ Tahmini Süre:** 6 saat

---

### CRITICAL-3: SQL Keyword Detection Bypass

**📍 Dosyalar:**
- `src/utils/sql-identifier-escape.ts` (Line 42-47)

**🎯 Çözüm Yaklaşımı:**

**Karar:** SQL keyword detection'ı security control olarak KALDIRMA

**Gerekçe:**
- Escaping zaten güvenli (ikinci savunma hattı)
- Keyword detection bypass edilebilir (Unicode, homograph attacks)
- False sense of security yaratıyor
- User experience'ı negatif etkiliyor (valid identifiers reject edilebilir)

**Alternative Yaklaşım:**
Keyword detection'ı **developer-friendly warning** olarak kullanma:
- Security control değil, best practice uyarısı
- Bypass edilse bile güvenlik riski yok (escaping var)
- CLI'da optional warning gösterme (--strict mode)

**📝 Implementation Adımları:**

**Adım 1:** Security layer'dan kaldırma
- `escapeSqlIdentifier()` içindeki keyword check'i kaldırma
- Sadece character validation ve escaping kalacak

**Adım 2:** Warning system ekleme (opsiyonel)
```typescript
// Yeni fonksiyon
function warnIfSqlKeyword(identifier: string): void {
  if (config.enableSqlKeywordWarnings && containsSqlKeyword(identifier)) {
    console.warn(`⚠️  Identifier "${identifier}" contains SQL keyword. ` +
      `While safe (escaped), consider renaming for clarity.`);
  }
}
```

**Adım 3:** Documentation update
- README'de escaping mekanizmasını açıklama
- Security section'da defense-in-depth stratejisi
- SQL keyword kullanımının güvenli olduğunu belgeleme

**Adım 4:** Test coverage
- Unicode bypass test cases ekleme (documentation için)
- Homograph attack examples
- Escaping effectiveness validation

**🧪 Test Senaryoları:**
- ✅ SQL keyword identifier (DROP, SELECT) - escaped, kabul edilir
- ✅ Unicode zero-width characters - escaped, güvenli
- ✅ Homograph attack (cyrillic chars) - escaped, güvenli
- ✅ Hyphen-embedded keywords (user-DROP-table) - escaped, güvenli
- ✅ All edge cases - SQL injection prevented by escaping

**⏱️ Tahmini Süre:** 3 saat

---

### CRITICAL-4: Missing Transaction Rollback on Batch Recording Failure

**📍 Dosyalar:**
- `src/engine/runner.ts` (Line 96-141)
- `src/engine/ledger.ts` (recordBatch method)
- `src/ast/types.ts` (DbAdapter interface)

**🎯 Çözüm Yaklaşımı:**

**Two-Phase Commit Pattern:**

1. **Phase 1: Validation**
   - Ledger write permissions check
   - Disk space availability
   - Lock acquisition pre-check

2. **Phase 2: Execution with Rollback Support**
   - Migrations execute in DB transaction
   - Ledger update in try-catch
   - On ledger fail: Automatic DB rollback

3. **Recovery Mechanism**
   - Orphan migration detection (DB'de var, ledger'da yok)
   - Auto-reconciliation on next `sigil up`
   - User confirmation for manual reconciliation

**📝 Implementation Adımları:**

**Adım 1:** DbAdapter interface enhancement
```typescript
interface DbAdapter {
  // Existing...
  rollbackTransaction(): Promise<void>; // Yeni method
  getCurrentTransaction(): Promise<any>; // Transaction state
}
```

**Adım 2:** Validation phase
```typescript
async validateLedgerWrite(): Promise<void> {
  // Test write to ledger file
  // Check disk space (at least 10MB free)
  // Verify file permissions
  // Throw error if any check fails
}
```

**Adım 3:** Enhanced execution flow
```typescript
async up(): Promise<Result> {
  // 1. Validate ledger write capability
  await this.validateLedgerWrite();

  // 2. Start DB transaction
  await this.adapter.beginTransaction();

  try {
    // 3. Execute migrations
    for (const migration of pending) {
      await executeMigration(migration);
      migrationsToRecord.push(migration);
    }

    // 4. Try ledger update
    await this.ledger.recordBatch(migrationsToRecord);

    // 5. Commit DB transaction
    await this.adapter.commitTransaction();

  } catch (error) {
    // 6. Rollback DB on ANY error
    await this.adapter.rollbackTransaction();
    throw error;
  }
}
```

**Adım 4:** Recovery mechanism
```typescript
async reconcileLedger(): Promise<void> {
  // Detect orphan migrations (applied but not recorded)
  // Compare DB schema with ledger
  // Offer user options:
  //   - Auto-add to ledger (if safe)
  //   - Manual reconciliation
  //   - Rollback orphan migrations
}
```

**Adım 5:** CLI integration
- `sigil reconcile` komut ekleme
- `sigil up` içinde otomatik reconciliation check
- Clear error messages with recovery steps

**🧪 Test Senaryoları:**
- ✅ Normal flow - migrations + ledger update başarılı
- ✅ Ledger write failure - DB rollback, clean state
- ✅ Disk full - pre-validation catch, no changes
- ✅ Permission denied - pre-validation catch, no changes
- ✅ Orphan migration detection - reconciliation successful
- ✅ Multiple orphan migrations - batch reconciliation
- ✅ Network interruption - transaction rollback

**⏱️ Tahmini Süre:** 8 saat

---

### CRITICAL-5: Path Traversal Vulnerability Enhancement

**📍 Dosyalar:**
- `src/cli.ts` (Line 187-215)
- `src/utils/path-validator.ts` (yeni)

**🎯 Çözüm Yaklaşımı:**

1. **Canonicalization-Based Validation**
   - `path.resolve()` ile absolute path oluşturma
   - Expected migrations directory ile comparison
   - Whitelist approach (blacklist yerine)

2. **Multi-Layer Encoding Prevention**
   - URL decoding (`decodeURIComponent`)
   - Unicode normalization (NFC form)
   - Multiple pass decoding (double-encoding prevention)

3. **Character Whitelist**
   - Allowed: `[a-zA-Z0-9_-]`
   - Disallowed: Tüm path separators, special chars
   - Length limit: 100 characters

**📝 Implementation Adımları:**

**Adım 1:** Path validator utility
```typescript
// src/utils/path-validator.ts

export function validateMigrationName(name: string): ValidationResult {
  // 1. Decode URL encoding (multiple times)
  let decoded = decodeMultipleTimes(name);

  // 2. Unicode normalization
  decoded = normalizeUnicode(decoded);

  // 3. Character whitelist check
  if (!/^[a-zA-Z0-9_-]+$/.test(decoded)) {
    throw new Error('Invalid characters in migration name');
  }

  // 4. Length check
  if (decoded.length > 100) {
    throw new Error('Migration name too long (max 100 chars)');
  }

  return { sanitized: decoded, safe: true };
}

export function validateMigrationPath(
  name: string,
  migrationsDir: string
): string {
  // 1. Validate name
  const { sanitized } = validateMigrationName(name);

  // 2. Build path
  const proposedPath = path.join(migrationsDir, sanitized + '.sigl');

  // 3. Canonicalize
  const resolvedProposed = path.resolve(proposedPath);
  const resolvedMigrationsDir = path.resolve(migrationsDir);

  // 4. Verify path starts with migrations directory
  if (!resolvedProposed.startsWith(resolvedMigrationsDir + path.sep)) {
    throw new Error('Path traversal detected');
  }

  // 5. Additional safety: Check for symlinks
  const stats = fs.lstatSync(path.dirname(resolvedProposed));
  if (stats.isSymbolicLink()) {
    throw new Error('Symlinks not allowed in migrations path');
  }

  return resolvedProposed;
}
```

**Adım 2:** CLI integration
- `create` command'da `validateMigrationPath` kullanma
- Error messages improvement
- Help text'te allowed characters belirtme

**Adım 3:** Security hardening
- Symlink detection ve prevention
- Case-sensitivity handling (Windows vs Unix)
- Network path prevention (UNC paths)

**🧪 Test Senaryoları:**
- ✅ Normal name (user_table) - başarılı
- ✅ Hyphen (user-table) - başarılı
- ✅ Basic traversal (../config) - blocked
- ✅ URL encoded (%2F%2E%2E%2Fconfig) - blocked
- ✅ Double encoded (%252F) - blocked
- ✅ Unicode slash (／) - blocked
- ✅ Unicode dot (．) - blocked
- ✅ Null byte (%00) - blocked
- ✅ Long name (>100 chars) - blocked
- ✅ Symlink in path - blocked
- ✅ UNC path (\\server\share) - blocked
- ✅ Windows absolute (C:\) - blocked

**⏱️ Tahmini Süre:** 5 saat

---

### CRITICAL-6: Database Connection Validation

**📍 Dosyalar:**
- `src/ast/types.ts` (DbAdapter interface)
- `src/engine/runner.ts` (Line 99, 163)
- `src/engine/introspector.ts` (Line 39)
- `src/utils/connection-validator.ts` (yeni)

**🎯 Çözüm Yaklaşımı:**

1. **Enhanced DbAdapter Interface**
   ```typescript
   interface DbAdapter {
     connect(): Promise<ConnectionResult>;
     healthCheck(): Promise<boolean>;
     getConnectionInfo(): ConnectionInfo; // For error messages
     // ... existing methods
   }

   interface ConnectionResult {
     connected: boolean;
     error?: Error;
     latency?: number;
   }
   ```

2. **Connection Validation Layer**
   - Post-connect health check query
   - Connection latency measurement
   - Clear error messages with troubleshooting steps

3. **Retry Logic**
   - Exponential backoff (1s, 2s, 4s, 8s)
   - Max 3 retries for transient errors
   - Different handling for permanent vs transient errors

**📝 Implementation Adımları:**

**Adım 1:** Interface enhancement
```typescript
// src/ast/types.ts

export class ConnectionError extends SigilError {
  constructor(
    message: string,
    public readonly cause?: Error,
    public readonly connectionInfo?: Partial<ConnectionInfo>
  ) {
    super(message);
    this.name = 'ConnectionError';
  }
}

export interface ConnectionInfo {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  // NO password!
}

export interface DbAdapter {
  // Enhanced methods
  connect(): Promise<void>; // Must throw ConnectionError on failure
  healthCheck(): Promise<void>; // Throw if unhealthy
  getConnectionInfo(): ConnectionInfo;
  // ... existing
}
```

**Adım 2:** Connection validator utility
```typescript
// src/utils/connection-validator.ts

export async function validateConnection(
  adapter: DbAdapter,
  options: ValidationOptions = {}
): Promise<void> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelay = options.baseDelay ?? 1000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // 1. Connect
      await adapter.connect();

      // 2. Health check
      await adapter.healthCheck();

      // Success!
      return;

    } catch (error) {
      // Check if transient error
      if (isTransientError(error) && attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.log(`Connection failed (attempt ${attempt}/${maxRetries}). ` +
          `Retrying in ${delay}ms...`);
        await sleep(delay);
        continue;
      }

      // Permanent error or max retries reached
      throw createConnectionError(error, adapter);
    }
  }
}

function createConnectionError(error: Error, adapter: DbAdapter): ConnectionError {
  const info = adapter.getConnectionInfo();
  const message = formatConnectionError(error, info);
  return new ConnectionError(message, error, info);
}

function formatConnectionError(error: Error, info: ConnectionInfo): string {
  const parts = ['Failed to connect to database'];

  // Add connection details
  if (info.host) parts.push(`Host: ${info.host}:${info.port || 'default'}`);
  if (info.database) parts.push(`Database: ${info.database}`);
  if (info.user) parts.push(`User: ${info.user}`);

  // Add error details
  parts.push(`\nError: ${error.message}`);

  // Add troubleshooting steps
  parts.push('\n\nTroubleshooting:');
  parts.push('1. Verify database server is running');
  parts.push('2. Check connection parameters in sigil.config.js');
  parts.push('3. Verify network connectivity');
  parts.push('4. Check database user permissions');

  return parts.join('\n');
}

function isTransientError(error: Error): boolean {
  const transientPatterns = [
    /ECONNREFUSED/,
    /ETIMEDOUT/,
    /ENOTFOUND/,
    /Connection refused/i,
    /timeout/i,
  ];

  return transientPatterns.some(pattern =>
    pattern.test(error.message)
  );
}
```

**Adım 3:** Runner integration
```typescript
// src/engine/runner.ts

async up(): Promise<Result> {
  try {
    // Validate connection with retry logic
    await validateConnection(this.adapter, {
      maxRetries: 3,
      baseDelay: 1000
    });

    // ... rest of migration logic

  } catch (error) {
    if (error instanceof ConnectionError) {
      // Already formatted with helpful message
      throw error;
    }
    // ... other error handling
  } finally {
    await this.adapter.disconnect();
  }
}
```

**Adım 4:** Adapter implementation guides
- PostgreSQL adapter örneği ile healthCheck implementasyonu
- MySQL adapter örneği
- SQLite adapter örneği
- README'de adapter implementation guide

**🧪 Test Senaryoları:**
- ✅ Successful connection - health check pass
- ✅ Database server down - clear error with troubleshooting
- ✅ Wrong credentials - authentication error
- ✅ Wrong database name - database not found error
- ✅ Network timeout - retry with backoff
- ✅ Transient error (connection refused) - retry successful
- ✅ Max retries exceeded - final error message
- ✅ Health check fails - connection closed, error thrown

**⏱️ Tahmini Süre:** 6 saat

---

## 🟡 MEDIUM Öncelikli Sorunlar

### MEDIUM-1: Insufficient Logging for Audit Trail

**📍 Dosyalar:**
- Tüm proje (yeni logging layer)
- `src/utils/logger.ts` (yeni)
- `src/engine/runner.ts`
- `src/engine/ledger.ts`
- `src/cli.ts`

**🎯 Çözüm Yaklaşımı:**

1. **Structured Logging System**
   ```typescript
   interface LogEntry {
     timestamp: string; // ISO 8601
     level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
     category: string; // 'migration', 'ledger', 'cli', 'security'
     message: string;
     metadata?: Record<string, any>;
     user?: string; // Process user
     pid: number;
   }
   ```

2. **Log Levels ve Categories**
   - DEBUG: Detailed debugging information
   - INFO: General informational messages
   - WARN: Warning messages
   - ERROR: Error messages
   - SECURITY: Security-related events (audit trail)

3. **Output Formats**
   - Console: Human-readable (colored, formatted)
   - File: JSON (machine-parseable)
   - Optional: Syslog, external logging service

**📝 Implementation Adımları:**

**Adım 1:** Logger infrastructure
```typescript
// src/utils/logger.ts

export class Logger {
  private static instance: Logger;
  private config: LoggerConfig;

  log(level: LogLevel, category: string, message: string, metadata?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      metadata,
      user: os.userInfo().username,
      pid: process.pid,
      hostname: os.hostname(),
    };

    // Console output (formatted)
    if (this.config.console) {
      this.writeConsole(entry);
    }

    // File output (JSON)
    if (this.config.file) {
      this.writeFile(entry);
    }
  }

  // Convenience methods
  info(category: string, message: string, metadata?: any) {
    this.log('INFO', category, message, metadata);
  }

  security(action: string, details: any) {
    this.log('SECURITY', 'audit', action, details);
  }
}
```

**Adım 2:** Critical event logging
```typescript
// src/engine/runner.ts

async up(): Promise<Result> {
  logger.security('migration_start', {
    pendingCount: pending.length,
    migrations: pending.map(m => m.filename)
  });

  try {
    for (const migration of pending) {
      const startTime = Date.now();

      logger.info('migration', `Applying: ${migration.filename}`);

      await executeMigration(migration);

      const duration = Date.now() - startTime;
      logger.security('migration_applied', {
        filename: migration.filename,
        duration,
        batch: currentBatch
      });
    }

    logger.security('migration_complete', {
      appliedCount: applied.length,
      totalDuration: Date.now() - overallStart
    });

  } catch (error) {
    logger.error('migration', 'Migration failed', {
      error: error.message,
      stack: error.stack,
      currentMigration: currentMigration?.filename
    });
    throw error;
  }
}
```

**Adım 3:** Configuration
```typescript
// sigil.config.js enhancement
export default {
  // ... existing config

  logging: {
    console: true,
    file: '.sigil.log', // JSON log file
    level: 'INFO', // Minimum level to log
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5, // Rotation
    auditTrail: true, // Enable security logging
  }
}
```

**Adım 4:** Log rotation
- File size check
- Automatic rotation (.sigil.log.1, .sigil.log.2, ...)
- Old file cleanup

**🧪 Test Senaryoları:**
- ✅ Migration applied - audit log entry
- ✅ Migration failed - error log entry
- ✅ Lock acquired - debug log entry
- ✅ Configuration loaded - info log entry
- ✅ Log rotation - new file created at 10MB
- ✅ Log filtering by level - only >= configured level
- ✅ JSON format - parseable by log aggregators

**⏱️ Tahmini Süre:** 6 saat

---

### MEDIUM-2: Synchronous Processing Bottleneck

**📍 Dosyalar:**
- `src/engine/runner.ts` (Line 100-128)
- `src/engine/dependency-analyzer.ts` (yeni)

**🎯 Çözüm Yaklaşımı:**

1. **Dependency Analysis**
   - AST analizi ile tablo dependencies çıkarma
   - Foreign key references → dependency graph
   - Topological sort ile execution order

2. **Parallel Execution**
   - Independent migrations → parallel
   - Dependent migrations → sequential
   - Configurable concurrency limit

3. **Safety First**
   - Default: Sequential (güvenli)
   - Opt-in: Parallel (--parallel flag)
   - User confirmation for risky parallelization

**📝 Implementation Adımları:**

**Adım 1:** Dependency analyzer
```typescript
// src/engine/dependency-analyzer.ts

export interface MigrationDependency {
  migration: MigrationFile;
  dependencies: string[]; // Table names this migration depends on
  creates: string[]; // Table names this migration creates
}

export class DependencyAnalyzer {
  analyze(migrations: MigrationFile[]): DependencyGraph {
    const graph = new Map<string, MigrationDependency>();

    for (const migration of migrations) {
      const ast = Parser.parse(migration.content);
      const creates = ast.models.map(m => m.name);
      const dependencies = this.extractDependencies(ast);

      graph.set(migration.filename, {
        migration,
        dependencies,
        creates
      });
    }

    return graph;
  }

  private extractDependencies(ast: SchemaAST): string[] {
    const deps = new Set<string>();

    for (const model of ast.models) {
      for (const column of model.columns) {
        for (const decorator of column.decorators) {
          if (decorator.name === 'ref' && decorator.args) {
            // Extract table name from @ref(Table.column)
            const [tableName] = decorator.args[0].split('.');
            deps.add(tableName);
          }
        }
      }
    }

    return Array.from(deps);
  }

  createExecutionPlan(graph: DependencyGraph): ExecutionPlan {
    // Topological sort
    const sorted = topologicalSort(graph);

    // Group into execution waves (independent migrations in same wave)
    const waves: MigrationFile[][] = [];
    const executed = new Set<string>();

    while (executed.size < sorted.length) {
      const wave = sorted.filter(migration => {
        const deps = graph.get(migration.filename)!.dependencies;
        return deps.every(dep => executed.has(dep));
      });

      waves.push(wave);
      wave.forEach(m => executed.add(m.filename));
    }

    return { waves };
  }
}
```

**Adım 2:** Parallel executor
```typescript
// src/engine/runner.ts

async upParallel(options: ParallelOptions = {}): Promise<Result> {
  const concurrency = options.concurrency ?? 5;
  const analyzer = new DependencyAnalyzer();

  // Analyze dependencies
  const graph = analyzer.analyze(migrations);
  const plan = analyzer.createExecutionPlan(graph);

  logger.info('migration', `Execution plan: ${plan.waves.length} waves`);

  // Execute wave by wave
  for (const [index, wave] of plan.waves.entries()) {
    logger.info('migration', `Wave ${index + 1}: ${wave.length} migrations`);

    // Execute migrations in this wave in parallel
    await Promise.all(
      wave.map(migration =>
        this.executeMigration(migration)
      )
    );
  }
}
```

**Adım 3:** CLI integration
```typescript
// sigil up --parallel --concurrency=10
// sigil up --analyze-only  (show execution plan without running)
```

**Adım 4:** Safety checks
- Dry-run analysis
- Dependency cycle detection
- User confirmation for parallel execution

**🧪 Test Senaryoları:**
- ✅ Independent migrations - parallel execution
- ✅ Dependent migrations (FK) - sequential execution
- ✅ Complex dependency graph - correct topological sort
- ✅ Circular dependency - error detection
- ✅ Mixed (independent + dependent) - correct waves
- ✅ Concurrency limit - respected
- ✅ One migration fails - wave stops, rollback

**⏱️ Tahmini Süre:** 8 saat

---

### MEDIUM-3: Lock Timeout Not Configurable

**📍 Dosyalar:**
- `src/engine/ledger.ts` (Line 16)
- `src/ast/types.ts` (SigilConfig)

**🎯 Çözüm Yaklaşımı:**

1. **Configuration Options**
   ```typescript
   interface SigilConfig {
     lockTimeout?: number; // Global default
     operationTimeouts?: {
       up?: number;
       down?: number;
       status?: number; // Quick operations
     };
   }
   ```

2. **Operation-Specific Timeouts**
   - `status` command: 5 seconds (quick)
   - `up` command: 5 minutes (can be slow)
   - `down` command: 2 minutes
   - Configurable overrides

**📝 Implementation Adımları:**

**Adım 1:** Config enhancement
```typescript
// src/ast/types.ts
export interface SigilConfig {
  lockTimeout?: number; // Default: 30000ms
  operationTimeouts?: {
    up?: number;      // Default: 300000ms (5 min)
    down?: number;    // Default: 120000ms (2 min)
    status?: number;  // Default: 5000ms (5 sec)
    pull?: number;    // Default: 60000ms (1 min)
  };
}
```

**Adım 2:** LedgerManager enhancement
```typescript
// src/engine/ledger.ts

export class LedgerManager {
  private lockTimeout: number;

  constructor(
    ledgerPath: string,
    lockTimeout?: number
  ) {
    this.ledgerPath = ledgerPath;
    this.lockTimeout = lockTimeout ?? 30000; // Default 30s
  }

  async acquireLock(operationTimeout?: number): Promise<void> {
    const timeout = operationTimeout ?? this.lockTimeout;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      // Lock acquisition logic
    }

    throw new IntegrityError(
      `Failed to acquire lock after ${timeout}ms`
    );
  }
}
```

**Adım 3:** Runner integration
```typescript
// src/engine/runner.ts

async up(): Promise<Result> {
  const timeout = this.config.operationTimeouts?.up ?? 300000;
  await this.ledger.acquireLock(timeout);
  // ... rest
}
```

**Adım 4:** CLI override
```typescript
// sigil up --lock-timeout=600000  (10 minutes)
```

**🧪 Test Senaryoları:**
- ✅ Default timeout - 30 seconds
- ✅ Operation-specific timeout - respected
- ✅ Config override - applied
- ✅ CLI flag override - highest priority
- ✅ Timeout exceeded - clear error message
- ✅ Quick operation (status) - short timeout

**⏱️ Tahmini Süre:** 2 saat

---

### MEDIUM-4: Error Messages May Expose Internal Details

**📍 Dosyalar:**
- `src/engine/ledger.ts` (Line 119-123)
- Tüm error handling locations

**🎯 Çözüm Yaklaşımı:**

1. **Sanitized Error Messages**
   - Production: Sanitized (no paths, no stack traces)
   - Development: Detailed (debug mode)
   - Environment-based: NODE_ENV=production/development

2. **Error Codes**
   - Machine-readable error codes
   - Documentation reference
   - No sensitive information in codes

**📝 Implementation Adımları:**

**Adım 1:** Error sanitizer
```typescript
// src/utils/error-sanitizer.ts

export function sanitizeError(error: Error, isDevelopment: boolean): Error {
  if (isDevelopment) {
    return error; // Full details in dev mode
  }

  // Production: Remove sensitive details
  const sanitized = new Error(error.message);
  sanitized.name = error.name;

  // Remove paths from message
  sanitized.message = removePaths(error.message);

  // No stack trace in production
  delete sanitized.stack;

  return sanitized;
}

function removePaths(message: string): string {
  // Remove absolute paths
  return message
    .replace(/\/[^\s]+/g, '<path>')
    .replace(/[A-Z]:\\[^\s]+/g, '<path>')
    .replace(/\w+@\w+\.\w+/g, '<email>'); // Remove emails if any
}
```

**Adım 2:** Error codes system
```typescript
// src/utils/error-codes.ts

export enum SigilErrorCode {
  // File errors
  FILE_NOT_FOUND = 'E1001',
  FILE_TOO_LARGE = 'E1002',
  FILE_READ_ERROR = 'E1003',

  // Ledger errors
  LEDGER_CORRUPTED = 'E2001',
  LEDGER_LOCK_FAILED = 'E2002',
  INTEGRITY_CHECK_FAILED = 'E2003',

  // Database errors
  CONNECTION_FAILED = 'E3001',
  QUERY_FAILED = 'E3002',
  TRANSACTION_FAILED = 'E3003',

  // ... more codes
}

export class CodedError extends SigilError {
  constructor(
    public code: SigilErrorCode,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'CodedError';
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      // details only in dev mode
    };
  }
}
```

**Adım 3:** Global error handler
```typescript
// src/cli.ts

cli.run().catch((error) => {
  const isDev = process.env.NODE_ENV !== 'production';
  const sanitized = sanitizeError(error, isDev);

  console.error(c.error('Error:'), sanitized.message);

  if (error instanceof CodedError) {
    console.error(c.dim(`Error code: ${error.code}`));
    console.error(c.dim(`See: https://docs.sigil.dev/errors/${error.code}`));
  }

  if (isDev && error.stack) {
    console.error(c.dim('\nStack trace:'));
    console.error(c.dim(error.stack));
  }

  process.exit(1);
});
```

**🧪 Test Senaryoları:**
- ✅ Production mode - no paths in error
- ✅ Development mode - full error details
- ✅ Error code - documented, accessible
- ✅ Stack traces - only in development
- ✅ File paths - sanitized in production

**⏱️ Tahmini Süre:** 3 saat

---

### MEDIUM-5: No Backup Mechanism Before Destructive Operations

**📍 Dosyalar:**
- `src/engine/runner.ts` (down method)
- `src/engine/backup.ts` (yeni)

**🎯 Çözüm Yaklaşımı:**

1. **Automatic Backup**
   - `sigil down` öncesi otomatik backup
   - Backup format: SQL dump (database-specific)
   - Backup location: `.sigil_backups/`

2. **Dry-Run Mode**
   - `--dry-run` flag
   - Show what would be done
   - No actual changes

3. **User Confirmation**
   - Interactive prompt (production)
   - `--force` flag to skip (automation)

**📝 Implementation Adımları:**

**Adım 1:** Backup utility
```typescript
// src/engine/backup.ts

export class BackupManager {
  async createBackup(
    adapter: DbAdapter,
    generator: SqlGenerator,
    migrations: MigrationFile[]
  ): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = '.sigil_backups';
    const backupFile = path.join(backupDir, `backup_${timestamp}.sql`);

    // Ensure backup directory exists
    await fs.mkdir(backupDir, { recursive: true });

    // Generate SQL dump for tables being dropped
    const tables = this.extractTableNames(migrations, generator);
    const dumpSql = await this.generateDump(adapter, tables);

    // Write backup file
    await fs.writeFile(backupFile, dumpSql, 'utf-8');

    logger.info('backup', `Backup created: ${backupFile}`);

    return backupFile;
  }

  async restore(backupFile: string, adapter: DbAdapter): Promise<void> {
    const sql = await fs.readFile(backupFile, 'utf-8');
    await adapter.transaction([sql]);
    logger.info('backup', `Restored from: ${backupFile}`);
  }
}
```

**Adım 2:** Dry-run implementation
```typescript
// src/engine/runner.ts

async down(options: DownOptions = {}): Promise<Result> {
  const { dryRun = false, force = false } = options;

  if (dryRun) {
    // Show what would be done
    const migrations = this.ledger.getLastBatchMigrations();
    console.log('Would rollback:');
    migrations.forEach(m => console.log(`  - ${m.filename}`));

    const sqls = this.generateDownSQL(migrations);
    console.log('\nSQL to execute:');
    sqls.forEach(sql => console.log(sql));

    return { rolledBack: [], dryRun: true };
  }

  // Interactive confirmation
  if (!force && process.stdin.isTTY) {
    const confirmed = await askConfirmation(
      'This will rollback migrations and drop tables. Continue?'
    );
    if (!confirmed) {
      throw new Error('Operation cancelled by user');
    }
  }

  // Create backup
  const backupFile = await this.backup.createBackup(
    this.adapter,
    this.generator,
    migrations
  );

  try {
    // Proceed with rollback
    await this.executeRollback(migrations);

  } catch (error) {
    // Offer to restore from backup
    console.error('Rollback failed. Restore from backup?');
    // ... restoration logic
    throw error;
  }
}
```

**Adım 3:** CLI integration
```typescript
// sigil down --dry-run     (show plan)
// sigil down --force       (skip confirmation)
// sigil down --no-backup   (skip backup)
// sigil restore <backup>   (restore from backup)
```

**🧪 Test Senaryoları:**
- ✅ down --dry-run - no changes, show plan
- ✅ down with confirmation - user prompted
- ✅ down --force - no prompt
- ✅ Backup created - file exists, valid SQL
- ✅ Rollback fails - backup available
- ✅ Restore from backup - data recovered

**⏱️ Tahmini Süre:** 5 saat

---

### MEDIUM-6: Integer Overflow in Batch Number

**📍 Dosyalar:**
- `src/engine/ledger.ts` (Line 236, 249, 272)

**🎯 Çözüm Yaklaşımı:**

1. **Validation and Safe Math**
   - Check for `Number.MAX_SAFE_INTEGER`
   - Prevent batch number overflow
   - Clear error message if approaching limit

2. **Future-Proof Solution**
   - Use BigInt for batch numbers (breaking change)
   - Or: Keep number but add validation
   - Document the limitation

**📝 Implementation Adımları:**

**Adım 1:** Safe batch increment
```typescript
// src/engine/ledger.ts

async recordBatch(migrations: Migration[]): Promise<void> {
  if (migrations.length === 0) return;

  // Validate batch number won't overflow
  if (this.ledger.currentBatch >= Number.MAX_SAFE_INTEGER - 1) {
    throw new IntegrityError(
      'Batch number overflow detected. ' +
      'Maximum batch number (2^53 - 1) reached. ' +
      'Consider resetting the ledger or contact support.'
    );
  }

  const batchNumber = this.ledger.currentBatch + 1;
  // ... rest of logic
}
```

**Adım 2:** Warning system
```typescript
// Warn when approaching limit
if (this.ledger.currentBatch > Number.MAX_SAFE_INTEGER * 0.9) {
  logger.warn('ledger',
    'Batch number approaching maximum safe integer. ' +
    `Current: ${this.ledger.currentBatch}, ` +
    `Max: ${Number.MAX_SAFE_INTEGER}`
  );
}
```

**Adım 3:** Documentation
- README'de limitation açıklama
- Theoretical limit: 9 quadrillion batches
- Practical impossibility (milyon yıl sürer)

**🧪 Test Senaryoları:**
- ✅ Normal batch increment - no issue
- ✅ Batch number near MAX_SAFE_INTEGER - warning
- ✅ Batch number at MAX_SAFE_INTEGER - error
- ✅ Error message - clear, actionable

**⏱️ Tahmini Süre:** 1 saat

---

## 🟢 LOW Öncelikli Sorunlar

### LOW-1: Magic Numbers Without Constants

**📍 Dosyalar:**
- `src/utils/sql-identifier-escape.ts` (Line 67-70)
- All generators (Line 206, 238, 268 in postgres.ts, etc.)

**🎯 Çözüm Yaklaşımı:**

1. **Constants File**
   ```typescript
   // src/utils/constants.ts
   export const SQL_LIMITS = {
     POSTGRES: {
       MAX_IDENTIFIER_LENGTH: 63,
       MAX_VARCHAR_LENGTH: 10485760,
     },
     MYSQL: {
       MAX_IDENTIFIER_LENGTH: 64,
       MAX_VARCHAR_LENGTH: 65535,
     },
     SQLITE: {
       MAX_IDENTIFIER_LENGTH: 256,
       MAX_VARCHAR_LENGTH: 1000000000,
     },
   };

   export const DEFAULT_TYPE_PARAMS = {
     VARCHAR: 255,
     CHAR: 1,
     DECIMAL_PRECISION: 10,
     DECIMAL_SCALE: 2,
   };
   ```

2. **Database-Aware Limits**
   - Generator-specific limits
   - Runtime detection
   - Config overrides

**📝 Implementation Adımları:**

**Adım 1:** Create constants file
```typescript
// src/utils/constants.ts
export const SQL_LIMITS = { /* ... */ };
export const DEFAULT_TYPE_PARAMS = { /* ... */ };
export const FILE_LIMITS = {
  MAX_MIGRATION_SIZE: 5 * 1024 * 1024, // 5MB
  MAX_LEDGER_SIZE: 10 * 1024 * 1024,   // 10MB
};
```

**Adım 2:** Replace magic numbers
```typescript
// Before
if (identifier.length > 63) {
  throw new Error('Too long');
}

// After
if (identifier.length > SQL_LIMITS.POSTGRES.MAX_IDENTIFIER_LENGTH) {
  throw new Error(
    `Identifier too long. Max: ${SQL_LIMITS.POSTGRES.MAX_IDENTIFIER_LENGTH}`
  );
}
```

**Adım 3:** Generator-specific limits
```typescript
// PostgresGenerator
private readonly MAX_IDENTIFIER = SQL_LIMITS.POSTGRES.MAX_IDENTIFIER_LENGTH;

// MySQLGenerator
private readonly MAX_IDENTIFIER = SQL_LIMITS.MYSQL.MAX_IDENTIFIER_LENGTH;
```

**🧪 Test Senaryoları:**
- ✅ PostgreSQL - 63 char identifier accepted
- ✅ MySQL - 64 char identifier accepted
- ✅ SQLite - 256 char identifier accepted
- ✅ Constants used throughout codebase

**⏱️ Tahmini Süre:** 2 saat

---

### LOW-2: Inconsistent Error Handling Patterns

**📍 Dosyalar:**
- All files

**🎯 Çözüm Yaklaşımı:**

1. **Error Hierarchy**
   ```typescript
   SigilError (base)
   ├── IntegrityError
   ├── ParseError
   ├── GeneratorError
   ├── ConnectionError
   ├── FileError
   └── ConfigurationError
   ```

2. **Consistent Throwing**
   - Always use custom error types
   - Never throw raw strings
   - Include context in errors

3. **Documentation**
   - Error hierarchy diagram
   - When to use which error type
   - Examples

**📝 Implementation Adımları:**

**Adım 1:** Expand error types
```typescript
// src/ast/types.ts

export class SigilError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'SigilError';
  }
}

export class FileError extends SigilError {
  constructor(
    message: string,
    public filePath: string,
    public cause?: Error
  ) {
    super(message, 'E1000');
    this.name = 'FileError';
  }
}

export class ConfigurationError extends SigilError {
  constructor(message: string, public configKey?: string) {
    super(message, 'E4000');
    this.name = 'ConfigurationError';
  }
}

// ... more error types
```

**Adım 2:** Standardize error usage
```typescript
// Bad
throw new Error('File not found');

// Good
throw new FileError(
  `Migration file not found: ${filename}`,
  filepath
);
```

**Adım 3:** Documentation
```typescript
/**
 * Error Handling Guide
 *
 * - FileError: File system operations
 * - ParseError: DSL parsing issues
 * - GeneratorError: SQL generation issues
 * - ConnectionError: Database connection issues
 * - IntegrityError: Ledger/migration integrity
 * - ConfigurationError: Invalid configuration
 *
 * Always provide context in error messages!
 */
```

**🧪 Test Senaryoları:**
- ✅ All error types used consistently
- ✅ Error messages include context
- ✅ Error hierarchy documented
- ✅ Type guards available (instanceof)

**⏱️ Tahmini Süre:** 3 saat

---

### LOW-3: Missing JSDoc Comments

**📍 Dosyalar:**
- All TypeScript files

**🎯 Çözüm Yaklaşımı:**

1. **Comprehensive JSDoc**
   ```typescript
   /**
    * Parses a .sigl file and generates an Abstract Syntax Tree
    *
    * @param input - The .sigl file content as a string
    * @returns Parsed AST representing the schema
    * @throws {ParseError} If the input has syntax errors
    * @throws {SigilError} If parsing fails for other reasons
    *
    * @example
    * ```typescript
    * const ast = Parser.parse(`
    *   model User {
    *     id Serial @pk
    *     email VarChar(255) @unique
    *   }
    * `);
    * ```
    */
   ```

2. **Automation**
   - ESLint rule: require JSDoc
   - TypeDoc for documentation generation
   - CI check for missing docs

**📝 Implementation Adımları:**

**Adım 1:** ESLint configuration
```json
// .eslintrc.json
{
  "rules": {
    "jsdoc/require-jsdoc": ["warn", {
      "require": {
        "FunctionDeclaration": true,
        "MethodDefinition": true,
        "ClassDeclaration": true
      }
    }],
    "jsdoc/require-param": "warn",
    "jsdoc/require-returns": "warn",
    "jsdoc/require-throws": "warn"
  }
}
```

**Adım 2:** Add JSDoc to all public APIs
```typescript
// src/index.ts exports
/**
 * Lexer for tokenizing .sigl files
 * @see {@link https://docs.sigil.dev/lexer}
 */
export { Lexer } from './ast/lexer.js';

/**
 * Parser for building AST from tokens
 * @see {@link https://docs.sigil.dev/parser}
 */
export { Parser } from './ast/parser.js';
```

**Adım 3:** TypeDoc setup
```json
// typedoc.json
{
  "entryPoints": ["src/index.ts"],
  "out": "docs",
  "plugin": ["typedoc-plugin-markdown"]
}
```

**Adım 4:** Generate documentation
```bash
npm run docs  # Generate TypeDoc
```

**🧪 Test Senaryoları:**
- ✅ All public APIs have JSDoc
- ✅ TypeDoc generates without errors
- ✅ Documentation site accessible
- ✅ Examples in JSDoc work

**⏱️ Tahmini Süre:** 6 saat

---

### LOW-4: No Metrics or Performance Monitoring

**📍 Dosyalar:**
- All files (new metrics layer)
- `src/utils/metrics.ts` (yeni)

**🎯 Çözüm Yaklaşımı:**

1. **Metrics Collection**
   ```typescript
   interface Metrics {
     migrationDuration: number;
     queryDuration: number;
     lockWaitTime: number;
     totalMigrations: number;
     failedMigrations: number;
   }
   ```

2. **Optional Export**
   - JSON export
   - StatsD format
   - Prometheus format (optional)

3. **Performance Insights**
   - Slowest migrations
   - Lock contention analysis
   - Query performance

**📝 Implementation Adımları:**

**Adım 1:** Metrics collector
```typescript
// src/utils/metrics.ts

export class MetricsCollector {
  private metrics: Map<string, Metric> = new Map();

  recordMigration(filename: string, duration: number, success: boolean) {
    this.metrics.set(`migration:${filename}`, {
      type: 'migration',
      duration,
      success,
      timestamp: Date.now(),
    });
  }

  recordQuery(sql: string, duration: number) {
    // ...
  }

  recordLockWait(duration: number) {
    // ...
  }

  export(format: 'json' | 'statsd' | 'prometheus'): string {
    switch (format) {
      case 'json':
        return JSON.stringify(Array.from(this.metrics.values()), null, 2);
      case 'statsd':
        return this.formatStatsD();
      case 'prometheus':
        return this.formatPrometheus();
    }
  }

  getSummary(): Summary {
    return {
      totalMigrations: this.countByType('migration'),
      avgMigrationDuration: this.avgDuration('migration'),
      slowestMigrations: this.getSlowest(5),
      totalLockWaitTime: this.sumByType('lock_wait'),
    };
  }
}
```

**Adım 2:** Integration points
```typescript
// src/engine/runner.ts

async up(): Promise<Result> {
  const metrics = new MetricsCollector();

  for (const migration of pending) {
    const start = Date.now();

    try {
      await executeMigration(migration);
      const duration = Date.now() - start;
      metrics.recordMigration(migration.filename, duration, true);
    } catch (error) {
      metrics.recordMigration(migration.filename, Date.now() - start, false);
      throw error;
    }
  }

  // Export metrics
  if (config.metrics?.enabled) {
    const summary = metrics.getSummary();
    await fs.writeFile('.sigil_metrics.json', JSON.stringify(summary));
  }

  // Log summary
  logger.info('metrics', `Applied ${applied.length} migrations in ${totalDuration}ms`);
}
```

**Adım 3:** CLI commands
```typescript
// sigil metrics          (show summary)
// sigil metrics --export (export to file)
```

**🧪 Test Senaryoları:**
- ✅ Migration duration recorded
- ✅ Lock wait time recorded
- ✅ Metrics exported to JSON
- ✅ Summary calculation correct
- ✅ Slowest migrations identified

**⏱️ Tahmini Süre:** 4 saat

---

## 📅 Implementasyon Sıralaması

### Sprint 1: Critical Security Fixes (2 hafta)
**Öncelik: CRITICAL**

| Sorun | Tahmini Süre | Bağımlılık |
|-------|--------------|------------|
| CRITICAL-3: SQL Keyword Bypass | 3 saat | - |
| CRITICAL-5: Path Traversal | 5 saat | - |
| CRITICAL-1: File Size Limits | 4 saat | - |
| CRITICAL-2: Lock Race Condition | 6 saat | - |
| CRITICAL-6: Connection Validation | 6 saat | - |
| CRITICAL-4: Transaction Rollback | 8 saat | CRITICAL-6 |

**Toplam:** 32 saat (4 iş günü)

---

### Sprint 2: Operational Excellence (2 hafta)
**Öncelik: MEDIUM (High Impact)**

| Sorun | Tahmini Süre | Bağımlılık |
|-------|--------------|------------|
| MEDIUM-1: Logging System | 6 saat | - |
| MEDIUM-5: Backup Mechanism | 5 saat | - |
| MEDIUM-3: Lock Timeout Config | 2 saat | CRITICAL-2 |
| MEDIUM-4: Error Sanitization | 3 saat | MEDIUM-1 |
| MEDIUM-6: Batch Number Overflow | 1 saat | - |

**Toplam:** 17 saat (2 iş günü)

---

### Sprint 3: Performance & UX (2 hafta)
**Öncelik: MEDIUM (Performance)**

| Sorun | Tahmini Süre | Bağımlılık |
|-------|--------------|------------|
| MEDIUM-2: Parallel Execution | 8 saat | MEDIUM-1 |
| LOW-4: Metrics & Monitoring | 4 saat | MEDIUM-1 |

**Toplam:** 12 saat (1.5 iş günü)

---

### Sprint 4: Code Quality (1 hafta)
**Öncelik: LOW**

| Sorun | Tahmini Süre | Bağımlılık |
|-------|--------------|------------|
| LOW-1: Magic Numbers | 2 saat | - |
| LOW-2: Error Handling | 3 saat | MEDIUM-4 |
| LOW-3: JSDoc Comments | 6 saat | - |

**Toplam:** 11 saat (1.5 iş günü)

---

## 🧪 Test Stratejisi

### Test Yapısı

```
tests/
├── unit/
│   ├── ast/
│   │   ├── lexer.test.ts
│   │   └── parser.test.ts
│   ├── generators/
│   │   ├── postgres.test.ts
│   │   ├── mysql.test.ts
│   │   └── sqlite.test.ts
│   ├── engine/
│   │   ├── runner.test.ts
│   │   ├── ledger.test.ts
│   │   └── backup.test.ts
│   └── utils/
│       ├── file-validator.test.ts
│       ├── path-validator.test.ts
│       ├── sql-identifier-escape.test.ts
│       └── logger.test.ts
│
├── integration/
│   ├── migration-flow.test.ts
│   ├── rollback.test.ts
│   ├── parallel-execution.test.ts
│   └── backup-restore.test.ts
│
├── security/
│   ├── sql-injection.test.ts
│   ├── path-traversal.test.ts
│   ├── file-size-dos.test.ts
│   └── lock-race-condition.test.ts
│
└── e2e/
    ├── cli.test.ts
    ├── postgres-e2e.test.ts
    ├── mysql-e2e.test.ts
    └── sqlite-e2e.test.ts
```

### Test Framework Setup

```json
// package.json
{
  "devDependencies": {
    "@types/jest": "^29.5.0",
    "jest": "^29.5.0",
    "ts-jest": "^29.1.0",
    "@testcontainers/postgresql": "^10.0.0",
    "@testcontainers/mysql": "^10.0.0"
  },
  "scripts": {
    "test": "jest",
    "test:unit": "jest tests/unit",
    "test:integration": "jest tests/integration",
    "test:security": "jest tests/security",
    "test:e2e": "jest tests/e2e",
    "test:coverage": "jest --coverage",
    "test:watch": "jest --watch"
  }
}
```

### Coverage Hedefleri

- **Unit Tests:** >90% coverage
- **Integration Tests:** Tüm major flows
- **Security Tests:** Tüm CRITICAL issues için dedicated tests
- **E2E Tests:** Tüm CLI commands

### Kritik Test Senaryoları

**Security Tests (Öncelik 1):**
```typescript
// tests/security/path-traversal.test.ts
describe('Path Traversal Protection', () => {
  test('blocks basic traversal (../)', () => {
    expect(() => validateMigrationName('../etc/passwd')).toThrow();
  });

  test('blocks URL-encoded traversal (%2F%2E%2E)', () => {
    expect(() => validateMigrationName('%2F%2E%2E%2Fconfig')).toThrow();
  });

  test('blocks Unicode traversal (／)', () => {
    expect(() => validateMigrationName('／etc／passwd')).toThrow();
  });

  test('blocks double-encoded traversal', () => {
    expect(() => validateMigrationName('%252F%252E%252E')).toThrow();
  });
});

// tests/security/file-size-dos.test.ts
describe('File Size DoS Protection', () => {
  test('rejects file larger than limit', async () => {
    const largeFile = 'x'.repeat(10 * 1024 * 1024); // 10MB
    await expect(loadMigration(largeFile)).rejects.toThrow('File too large');
  });

  test('accepts file under limit', async () => {
    const normalFile = 'model User { id Serial @pk }';
    await expect(loadMigration(normalFile)).resolves.not.toThrow();
  });
});

// tests/security/lock-race-condition.test.ts
describe('Lock Race Condition Prevention', () => {
  test('prevents concurrent lock acquisition', async () => {
    const ledger1 = new LedgerManager();
    const ledger2 = new LedgerManager();

    await ledger1.load();
    const lock1 = ledger1.acquireLock();

    // Second attempt should wait/fail
    await expect(
      ledger2.load().then(() => ledger2.acquireLock())
    ).rejects.toThrow('Lock timeout');
  });
});
```

---

## ⚠️ Risk Analizi ve Azaltma

### High Risk Items

**1. CRITICAL-2: Lock Race Condition Fix**
- **Risk:** Breaking change for concurrent usage
- **Mitigation:**
  - Extensive testing with race condition simulations
  - Backward compatibility mode
  - Gradual rollout with feature flag
  - Documentation for upgrade path

**2. CRITICAL-4: Transaction Rollback**
- **Risk:** DbAdapter interface breaking change
- **Mitigation:**
  - Make new methods optional (backwards compatible)
  - Provide default implementations
  - Version bump with deprecation warnings
  - Migration guide for adapter authors

**3. MEDIUM-2: Parallel Execution**
- **Risk:** Data corruption if dependencies missed
- **Mitigation:**
  - Conservative dependency detection
  - Opt-in feature (--parallel flag)
  - Extensive integration tests
  - Rollback mechanism for failed waves

### Rollback Plans

Her sprint için rollback stratejisi:

**Sprint 1 (Critical Fixes):**
- Git tags her fix sonrası
- Feature flags for new validations
- Backward compatible changes önceliği
- Detailed changelog

**Sprint 2-4:**
- Incremental rollout
- A/B testing (optional features)
- User feedback collection
- Hotfix process

---

## 📊 Başarı Kriterleri

### Sprint 1 (Critical)
- ✅ Tüm CRITICAL security issues çözüldü
- ✅ Security test coverage >95%
- ✅ No new vulnerabilities introduced
- ✅ Performance degradation <5%

### Sprint 2 (Operational)
- ✅ Audit logging implemented
- ✅ Backup/restore tested successfully
- ✅ Error messages sanitized
- ✅ User documentation updated

### Sprint 3 (Performance)
- ✅ Parallel execution 2-3x faster for independent migrations
- ✅ Metrics collected for all operations
- ✅ No performance regression for serial execution

### Sprint 4 (Quality)
- ✅ Code duplication <10%
- ✅ TypeDoc documentation complete
- ✅ All public APIs documented
- ✅ ESLint warnings = 0

---

## 📝 Sonuç

**Toplam Tahmini Süre:** 72 saat (9 iş günü)
**Sprint Sayısı:** 4
**Toplam Süre:** 7 hafta (buffer dahil)

**Öncelik Sırası:**
1. **Sprint 1:** Security fixes (ASAP)
2. **Sprint 2:** Operational stability
3. **Sprint 3:** Performance optimization
4. **Sprint 4:** Code quality

Bu plan, REVIEW.md'de belirlenen tüm sorunları sistematik bir şekilde çözecek ve Sigil'in production-ready duruma gelmesini sağlayacaktır.

---

**Hazırlayan:** AI Principal Engineer
**Tarih:** 2025-11-21
**Versiyon:** 1.0
**Durum:** Ready for Implementation
