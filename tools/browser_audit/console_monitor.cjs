/**
 * Chrome DevTools Console Monitor
 * 
 * Captures:
 * 1. console.log / console.info
 * 2. console.warn
 * 3. console.error
 * 4. Uncaught runtime JavaScript exceptions (window.onerror)
 * 5. Unhandled promise rejections
 * 
 * Sanitizes sensitive credentials and provides queryable metrics.
 */

function redactSensitiveData(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/(bearer\s+)[A-Za-z0-9_\-\.]{15,}/gi, '$1***REDACTED_TOKEN***')
    .replace(/(token["']?\s*[:=]\s*["']?)[A-Za-z0-9_\-\.]{8,}(["']?)/gi, '$1***REDACTED***$2')
    .replace(/(password["']?\s*[:=]\s*["']?)[^\s"',&]{3,}(["']?)/gi, '$1***REDACTED***$2')
    .replace(/(secret["']?\s*[:=]\s*["']?)[^\s"',&]{3,}(["']?)/gi, '$1***REDACTED***$2');
}

class ConsoleMonitor {
  constructor() {
    this.entries = [];
    this.errors = [];
    this.warnings = [];
    this.pageErrors = [];
    this.unhandledRejections = [];
    this.isAttached = false;
  }

  /**
   * Attaches console listeners to a Playwright page.
   */
  attach(page, cdpSession = null) {
    if (this.isAttached) return;
    this.isAttached = true;

    // Standard console message listener
    page.on('console', (msg) => {
      const type = msg.type(); // 'log', 'warning', 'error', 'info', 'debug'
      const text = redactSensitiveData(msg.text());
      const location = msg.location();
      const entry = {
        type: type.toUpperCase(),
        text,
        url: location.url || '',
        line: location.lineNumber || 0,
        column: location.columnNumber || 0,
        timestamp: new Date().toISOString(),
      };

      this.entries.push(entry);

      if (type === 'error') {
        this.errors.push(entry);
      } else if (type === 'warning') {
        this.warnings.push(entry);
      }
    });

    // Uncaught exceptions (window.onerror)
    page.on('pageerror', (err) => {
      const entry = {
        type: 'UNCAUGHT_EXCEPTION',
        text: redactSensitiveData(err.message || String(err)),
        stack: redactSensitiveData(err.stack || ''),
        timestamp: new Date().toISOString(),
      };
      this.entries.push(entry);
      this.errors.push(entry);
      this.pageErrors.push(entry);
    });

    // CDP hooks if session provided
    if (cdpSession) {
      try {
        cdpSession.on('Runtime.exceptionThrown', (event) => {
          const exc = event.exceptionDetails;
          const entry = {
            type: 'CDP_RUNTIME_EXCEPTION',
            text: redactSensitiveData(exc.text || exc.exception?.description || 'Runtime Exception'),
            url: exc.url || '',
            line: exc.lineNumber || 0,
            column: exc.columnNumber || 0,
            stack: redactSensitiveData(exc.stackTrace ? JSON.stringify(exc.stackTrace) : ''),
            timestamp: new Date().toISOString(),
          };
          this.entries.push(entry);
          this.errors.push(entry);
          this.unhandledRejections.push(entry);
        });

        cdpSession.on('Log.entryAdded', (event) => {
          const entry = event.entry;
          if (entry.level === 'error' || entry.level === 'warning') {
            const item = {
              type: `CDP_LOG_${entry.level.toUpperCase()}`,
              text: redactSensitiveData(entry.text || ''),
              url: entry.url || '',
              line: entry.lineNumber || 0,
              timestamp: new Date(entry.timestamp || Date.now()).toISOString(),
            };
            this.entries.push(item);
            if (entry.level === 'error') this.errors.push(item);
            if (entry.level === 'warning') this.warnings.push(item);
          }
        });
      } catch (cdpErr) {
        console.warn(`[ConsoleMonitor] Could not attach raw CDP listeners: ${cdpErr.message}`);
      }
    }
  }

  getSummary() {
    return {
      totalEntries: this.entries.length,
      errorCount: this.errors.length,
      warningCount: this.warnings.length,
      pageErrorCount: this.pageErrors.length,
      unhandledRejectionCount: this.unhandledRejections.length,
      isClean: this.errors.length === 0,
    };
  }

  getErrors() {
    return this.errors;
  }

  getWarnings() {
    return this.warnings;
  }

  getAll() {
    return this.entries;
  }

  clear() {
    this.entries = [];
    this.errors = [];
    this.warnings = [];
    this.pageErrors = [];
    this.unhandledRejections = [];
  }
}

module.exports = {
  ConsoleMonitor,
  redactSensitiveData,
};
