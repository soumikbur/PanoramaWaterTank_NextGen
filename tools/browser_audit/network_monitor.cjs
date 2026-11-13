/**
 * Chrome DevTools Network Monitor
 * 
 * Captures:
 * 1. HTTP requests and response status codes
 * 2. HTTP 4xx and 5xx errors
 * 3. Failed network requests (DNS errors, connection refused, CORS failures)
 * 4. Request timings and latency
 */

const { redactSensitiveData } = require('./console_monitor.cjs');

class NetworkMonitor {
  constructor() {
    this.requests = new Map();
    this.completed = [];
    this.failedRequests = [];
    this.httpErrors = [];
    this.isAttached = false;
  }

  attach(page, cdpSession = null) {
    if (this.isAttached) return;
    this.isAttached = true;

    page.on('request', (req) => {
      const url = redactSensitiveData(req.url());
      const method = req.method();
      const resourceType = req.resourceType();
      this.requests.set(req, {
        url,
        method,
        resourceType,
        startTime: Date.now(),
        headers: this._filterHeaders(req.headers()),
      });
    });

    page.on('response', (res) => {
      const req = res.request();
      const meta = this.requests.get(req) || {
        url: redactSensitiveData(res.url()),
        method: req ? req.method() : 'GET',
        resourceType: 'unknown',
        startTime: Date.now(),
      };

      const durationMs = Date.now() - meta.startTime;
      const status = res.status();
      const statusText = res.statusText();

      const item = {
        url: meta.url,
        method: meta.method,
        resourceType: meta.resourceType,
        status,
        statusText,
        durationMs,
        timestamp: new Date().toISOString(),
      };

      this.completed.push(item);

      if (status >= 400) {
        this.httpErrors.push(item);
      }
    });

    page.on('requestfailed', (req) => {
      const meta = this.requests.get(req) || {
        url: redactSensitiveData(req.url()),
        method: req.method(),
        resourceType: req.resourceType(),
        startTime: Date.now(),
      };

      const durationMs = Date.now() - meta.startTime;
      const failure = req.failure();
      const errorText = failure ? failure.errorText : 'Network request aborted or failed';

      const item = {
        url: meta.url,
        method: meta.method,
        resourceType: meta.resourceType,
        durationMs,
        errorText,
        timestamp: new Date().toISOString(),
      };

      this.failedRequests.push(item);
    });
  }

  _filterHeaders(headers) {
    if (!headers) return {};
    const filtered = {};
    for (const [k, v] of Object.entries(headers)) {
      if (/authorization|cookie|token|secret|password|api-key/i.test(k)) {
        filtered[k] = '***REDACTED***';
      } else {
        filtered[k] = v;
      }
    }
    return filtered;
  }

  getSummary() {
    return {
      totalRequests: this.completed.length + this.failedRequests.length,
      successfulRequests: this.completed.filter(r => r.status < 400).length,
      httpErrorCount: this.httpErrors.length,
      failedRequestCount: this.failedRequests.length,
      isClean: this.httpErrors.length === 0 && this.failedRequests.length === 0,
    };
  }

  getHttpErrors() {
    return this.httpErrors;
  }

  getFailedRequests() {
    return this.failedRequests;
  }

  getAll() {
    return {
      completed: this.completed,
      failed: this.failedRequests,
    };
  }

  clear() {
    this.requests.clear();
    this.completed = [];
    this.failedRequests = [];
    this.httpErrors = [];
  }
}

module.exports = {
  NetworkMonitor,
};
