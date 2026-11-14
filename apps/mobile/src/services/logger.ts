/**
 * Centralized Enterprise Application Logger for Panorama SCADA.
 *
 * Provides structured logging with category, module, severity, operation context,
 * sensitive data redaction (tokens, passwords), deduplication of spammy events,
 * and an in-memory ring buffer for runtime diagnostics.
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export type LogCategory =
  | 'WEBSOCKET'
  | 'API'
  | 'MQTT'
  | 'AUTH'
  | 'LIFECYCLE'
  | 'RUNTIME'
  | 'NOTIFICATION'
  | 'STORAGE'
  | 'FLEET'
  | 'NETWORK';

export interface LogEntry {
  timestamp: string;
  category: LogCategory;
  module: string;
  level: LogLevel;
  message: string;
  operation?: string;
  meta?: any;
}

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'secret',
  'apiKey',
  'key',
]);

function sanitizeValue(key: string, val: any): any {
  if (val === null || val === undefined) return val;
  if (typeof val === 'string') {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      return '***REDACTED***';
    }
    // Mask Bearer tokens
    if (/bearer\s+[a-zA-Z0-9._-]+/i.test(val)) {
      return val.replace(/bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer ***REDACTED***');
    }
    return val;
  }
  if (typeof val === 'object') {
    if (Array.isArray(val)) {
      return val.map((item) => sanitizeValue(key, item));
    }
    const sanitized: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase())) {
        sanitized[k] = '***REDACTED***';
      } else {
        sanitized[k] = sanitizeValue(k, v);
      }
    }
    return sanitized;
  }
  return val;
}

class ApplicationLogger {
  private static instance: ApplicationLogger;
  private ringBuffer: LogEntry[] = [];
  private maxBufferSize = 250;
  private recentFingerprints = new Map<string, { count: number; timestamp: number }>();
  private globalHandlersInstalled = false;

  private constructor() {
    this.initGlobalErrorHandlers();
  }

  static getInstance(): ApplicationLogger {
    if (!this.instance) {
      this.instance = new ApplicationLogger();
    }
    return this.instance;
  }

  public initGlobalErrorHandlers(): void {
    if (this.globalHandlersInstalled || typeof window === 'undefined') return;
    this.globalHandlersInstalled = true;

    // Intercept uncaught runtime exceptions
    window.addEventListener('error', (event: ErrorEvent) => {
      // Ignore cross-origin script error noise without actionable messages
      if (!event.message && !event.error) return;
      this.error(
        'RUNTIME',
        'Window',
        event.message || 'Uncaught error event',
        'uncaughtException',
        {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error?.stack || null,
        }
      );
    });

    // Intercept unhandled promise rejections
    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      let msg = 'Unhandled Promise Rejection';
      let stack: string | null = null;

      if (typeof reason === 'string') {
        msg = reason;
      } else if (reason instanceof Error) {
        msg = reason.message;
        stack = reason.stack || null;
      } else if (reason && typeof reason === 'object') {
        try {
          msg = JSON.stringify(reason);
        } catch {
          msg = String(reason);
        }
      }

      // Gracefully handle expected offline fallback and superseded promises without noisy red console errors
      const isExpectedOffline =
        reason?.code === 'BACKEND_OFFLINE' ||
        reason?.status === 503 ||
        String(msg).includes('using cached local store') ||
        String(msg).includes('Remote backend unreachable') ||
        reason?.name === 'AbortError' ||
        String(msg).includes('Lookup superseded');

      if (isExpectedOffline) {
        if (typeof event.preventDefault === 'function') {
          event.preventDefault();
        }
        this.debug('RUNTIME', 'Promise', msg, 'unhandledRejection', { stack });
        return;
      }

      this.error('RUNTIME', 'Promise', msg, 'unhandledRejection', { stack });
    });
  }

  private isDuplicateSpam(fingerprint: string): boolean {
    const now = Date.now();
    const entry = this.recentFingerprints.get(fingerprint);
    if (!entry) {
      this.recentFingerprints.set(fingerprint, { count: 1, timestamp: now });
      return false;
    }

    if (now - entry.timestamp < 3000) {
      entry.count++;
      return entry.count > 3; // Suppress after 3 occurrences in 3 seconds
    }

    // Reset window
    this.recentFingerprints.set(fingerprint, { count: 1, timestamp: now });
    return false;
  }

  private record(entry: LogEntry): void {
    const fingerprint = `${entry.level}:${entry.category}:${entry.module}:${entry.message}`;
    if (this.isDuplicateSpam(fingerprint)) {
      return;
    }

    // Append to ring buffer
    this.ringBuffer.push(entry);
    if (this.ringBuffer.length > this.maxBufferSize) {
      this.ringBuffer.shift();
    }

    const formattedPrefix = `[${entry.timestamp}] [${entry.category}] [${entry.module}]`;
    const sanitizedMeta = entry.meta ? sanitizeValue('meta', entry.meta) : undefined;

    switch (entry.level) {
      case 'DEBUG':
        if (typeof console !== 'undefined' && console.debug) {
          if (sanitizedMeta !== undefined) {
            console.debug(formattedPrefix, entry.message, sanitizedMeta);
          } else {
            console.debug(formattedPrefix, entry.message);
          }
        }
        break;
      case 'INFO':
        if (typeof console !== 'undefined' && console.info) {
          if (sanitizedMeta !== undefined) {
            console.info(formattedPrefix, entry.message, sanitizedMeta);
          } else {
            console.info(formattedPrefix, entry.message);
          }
        }
        break;
      case 'WARN':
        if (typeof console !== 'undefined' && console.warn) {
          if (sanitizedMeta !== undefined) {
            console.warn(formattedPrefix, entry.message, sanitizedMeta);
          } else {
            console.warn(formattedPrefix, entry.message);
          }
        }
        break;
      case 'ERROR':
        if (typeof console !== 'undefined' && console.error) {
          if (sanitizedMeta !== undefined) {
            console.error(formattedPrefix, entry.message, sanitizedMeta);
          } else {
            console.error(formattedPrefix, entry.message);
          }
        }
        break;
    }
  }

  debug(category: LogCategory, module: string, message: string, operation?: string, meta?: any): void {
    this.record({
      timestamp: new Date().toISOString(),
      category,
      module,
      level: 'DEBUG',
      message,
      operation,
      meta,
    });
  }

  info(category: LogCategory, module: string, message: string, operation?: string, meta?: any): void {
    this.record({
      timestamp: new Date().toISOString(),
      category,
      module,
      level: 'INFO',
      message,
      operation,
      meta,
    });
  }

  warn(category: LogCategory, module: string, message: string, operation?: string, meta?: any): void {
    this.record({
      timestamp: new Date().toISOString(),
      category,
      module,
      level: 'WARN',
      message,
      operation,
      meta,
    });
  }

  error(category: LogCategory, module: string, message: string, operation?: string, meta?: any): void {
    this.record({
      timestamp: new Date().toISOString(),
      category,
      module,
      level: 'ERROR',
      message,
      operation,
      meta,
    });
  }

  getRecentLogs(): readonly LogEntry[] {
    return [...this.ringBuffer];
  }

  clearLogs(): void {
    this.ringBuffer = [];
    this.recentFingerprints.clear();
  }
}

export const Logger = ApplicationLogger.getInstance();

