/**
 * Chrome DevTools WebSocket Monitor
 * 
 * Captures:
 * 1. WebSocket handshakes & connection URLs
 * 2. Sent and received WebSocket frames
 * 3. Connection state transitions
 * 4. WebSocket close codes & reasons
 * 5. Connection errors & unexpected disconnections
 */

const { redactSensitiveData } = require('./console_monitor.cjs');

class WebSocketMonitor {
  constructor() {
    this.sockets = [];
    this.socketErrors = [];
    this.frames = [];
    this.isAttached = false;
  }

  attach(page, cdpSession = null) {
    if (this.isAttached) return;
    this.isAttached = true;

    page.on('websocket', (ws) => {
      const url = redactSensitiveData(ws.url());
      const socketRecord = {
        id: `ws-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
        url,
        status: 'OPEN',
        createdAt: new Date().toISOString(),
        closedAt: null,
        closeCode: null,
        closeReason: null,
        framesCount: 0,
      };

      this.sockets.push(socketRecord);

      ws.on('framesent', (frame) => {
        socketRecord.framesCount++;
        const payload = redactSensitiveData(frame.payload);
        this.frames.push({
          socketId: socketRecord.id,
          direction: 'SENT',
          payload: typeof payload === 'string' && payload.length > 500 ? payload.slice(0, 500) + '...' : payload,
          timestamp: new Date().toISOString(),
        });
      });

      ws.on('framereceived', (frame) => {
        socketRecord.framesCount++;
        const payload = redactSensitiveData(frame.payload);
        this.frames.push({
          socketId: socketRecord.id,
          direction: 'RECEIVED',
          payload: typeof payload === 'string' && payload.length > 500 ? payload.slice(0, 500) + '...' : payload,
          timestamp: new Date().toISOString(),
        });
      });

      ws.on('socketerror', (err) => {
        const errorMsg = redactSensitiveData(err || 'WebSocket connection error');
        socketRecord.status = 'ERROR';
        const errRecord = {
          socketId: socketRecord.id,
          url: socketRecord.url,
          error: errorMsg,
          timestamp: new Date().toISOString(),
        };
        this.socketErrors.push(errRecord);
      });

      ws.on('close', (data) => {
        socketRecord.status = 'CLOSED';
        socketRecord.closedAt = new Date().toISOString();
        socketRecord.closeCode = data ? data.code : 1000;
        socketRecord.closeReason = data ? data.reason : '';
      });
    });

    if (cdpSession) {
      try {
        cdpSession.on('Network.webSocketFrameError', (event) => {
          const errRecord = {
            socketId: event.requestId,
            error: redactSensitiveData(event.errorMessage || 'CDP WebSocket frame error'),
            timestamp: new Date().toISOString(),
          };
          this.socketErrors.push(errRecord);
        });
      } catch {}
    }
  }

  getSummary() {
    return {
      totalSockets: this.sockets.length,
      activeSockets: this.sockets.filter(s => s.status === 'OPEN').length,
      closedSockets: this.sockets.filter(s => s.status === 'CLOSED').length,
      errorCount: this.socketErrors.length,
      totalFrames: this.frames.length,
      isClean: this.socketErrors.length === 0,
    };
  }

  getSockets() {
    return this.sockets;
  }

  getErrors() {
    return this.socketErrors;
  }

  getFrames(limit = 50) {
    return this.frames.slice(-limit);
  }

  clear() {
    this.sockets = [];
    this.socketErrors = [];
    this.frames = [];
  }
}

module.exports = {
  WebSocketMonitor,
};
