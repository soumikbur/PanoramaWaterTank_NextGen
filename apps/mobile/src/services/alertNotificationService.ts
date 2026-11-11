/**
 * alertNotificationService.ts — Enterprise SCADA Alert Notification Engine
 *
 * Implements real-time alert evaluation, state-change transition tracking,
 * strict deduplication, console logging, UI toast banners, and persistent history.
 */

export interface AlertToast {
  id: string;
  severity: 'CRITICAL' | 'WARNING' | 'NORMAL';
  title: string;
  message: string;
  timestamp: string;
  tankId?: string;
  coachNumber?: string;
  levelPercent?: number | null;
  autoDismissMs?: number;
}

export interface AlertHistoryEntry {
  id: string;
  timestamp: string;
  alertType: string;
  severity: 'CRITICAL' | 'WARNING' | 'NORMAL';
  waterLevel: number | null;
  description: string;
  status: 'Active' | 'Resolved' | 'Acknowledged';
  target: string;
}

export interface AlertConfig {
  masterEnabled: boolean;
  criticalThreshold: number;
  warningThreshold: number;
  overflowThreshold: number;
  lowWaterEnabled: boolean;
  sensorFaultEnabled: boolean;
  deviceOfflineEnabled: boolean;
  modemFailureEnabled: boolean;
  overflowEnabled: boolean;
  voltageEnabled: boolean;
}

const DEFAULT_CONFIG: AlertConfig = {
  masterEnabled: true,
  criticalThreshold: 10.0,
  warningThreshold: 20.0,
  overflowThreshold: 100.0,
  lowWaterEnabled: true,
  sensorFaultEnabled: true,
  deviceOfflineEnabled: true,
  modemFailureEnabled: true,
  overflowEnabled: true,
  voltageEnabled: true,
};

const STORAGE_KEY_CONFIG = 'panorama_alert_config';
const STORAGE_KEY_HISTORY = 'panorama_alert_history';

type ToastListener = (toast: AlertToast) => void;

class AlertNotificationService {
  private config: AlertConfig = { ...DEFAULT_CONFIG };
  private stateCache = new Map<string, { severity: string; state: string; timestamp: string }>();
  private toastListeners = new Set<ToastListener>();

  constructor() {
    this.loadConfig();
  }

  public getConfig(): AlertConfig {
    return { ...this.config };
  }

  public setConfig(newConfig: Partial<AlertConfig>): AlertConfig {
    this.config = { ...this.config, ...newConfig };
    this.saveConfig();
    return this.getConfig();
  }

  private loadConfig() {
    if (typeof localStorage === 'undefined') return;
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CONFIG);
      if (saved) {
        this.config = { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
      }
    } catch {
      // fallback to default
    }
  }

  private saveConfig() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(this.config));
    } catch {
      // ignore
    }
  }

  public onToast(listener: ToastListener): () => void {
    this.toastListeners.add(listener);
    return () => {
      this.toastListeners.delete(listener);
    };
  }

  private formatConsoleTimestamp(): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  }

  private logAlert(severity: 'CRITICAL' | 'WARNING' | 'NORMAL', alertType: string, description: string) {
    const ts = this.formatConsoleTimestamp();
    const msg = `[${ts}] [${severity}] [${alertType}] - ${description}`;
    if (severity === 'CRITICAL') {
      console.error(msg);
    } else if (severity === 'WARNING') {
      console.warn(msg);
    } else {
      console.info(msg);
    }
  }

  public getHistory(): AlertHistoryEntry[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const data = localStorage.getItem(STORAGE_KEY_HISTORY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  public addHistoryEntry(entry: AlertHistoryEntry) {
    if (typeof localStorage === 'undefined') return;
    try {
      const current = this.getHistory();
      // Keep most recent 100 entries
      const updated = [entry, ...current.slice(0, 99)];
      localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  }

  public clearHistory(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.removeItem(STORAGE_KEY_HISTORY);
      this.stateCache.clear();
    } catch {
      // ignore
    }
  }

  private notify(toast: AlertToast, alertType: string) {
    this.logAlert(toast.severity, alertType, `${toast.title}: ${toast.message}`);
    this.toastListeners.forEach((listener) => {
      try {
        listener(toast);
      } catch (err) {
        console.error('Error dispatching alert toast:', err);
      }
    });

    // Record into history
    this.addHistoryEntry({
      id: toast.id,
      timestamp: toast.timestamp,
      alertType,
      severity: toast.severity,
      waterLevel: toast.levelPercent ?? null,
      description: toast.message,
      status: toast.severity === 'NORMAL' ? 'Resolved' : 'Active',
      target: toast.coachNumber ? `Coach ${toast.coachNumber}` : (toast.tankId || 'System'),
    });
  }

  /**
   * Evaluate water level reading for a specific tank with transition detection & deduplication.
   */
  public evaluateWaterLevel(params: {
    tankId: string;
    coachNumber: string;
    levelPercent: number | null;
    isOnline: boolean;
  }) {
    if (!this.config.masterEnabled || !this.config.lowWaterEnabled) return;

    const { tankId, coachNumber, levelPercent, isOnline } = params;
    const cacheKey = `level-${tankId}`;
    const previous = this.stateCache.get(cacheKey);

    if (!isOnline || levelPercent == null) {
      // If went offline, clear water level state
      if (previous && previous.state !== 'NORMAL') {
        this.stateCache.delete(cacheKey);
      }
      return;
    }

    let newState: 'CRITICAL' | 'WARNING' | 'OVERFLOW' | 'NORMAL' = 'NORMAL';
    if (levelPercent < this.config.criticalThreshold) {
      newState = 'CRITICAL';
    } else if (levelPercent < this.config.warningThreshold) {
      newState = 'WARNING';
    } else if (this.config.overflowEnabled && levelPercent >= this.config.overflowThreshold) {
      newState = 'OVERFLOW';
    } else {
      newState = 'NORMAL';
    }

    const prevState = previous ? previous.state : 'INITIAL';

    // Strictly skip duplicate state
    if (newState === prevState) {
      return;
    }

    const isoTime = new Date().toISOString();
    this.stateCache.set(cacheKey, {
      severity: newState === 'OVERFLOW' ? 'WARNING' : newState,
      state: newState,
      timestamp: isoTime,
    });

    if (newState === 'CRITICAL') {
      this.notify(
        {
          id: `crit-${tankId}-${Date.now()}`,
          severity: 'CRITICAL',
          title: `Water Level Critically Low (${coachNumber})`,
          message: `Measured level is ${levelPercent.toFixed(1)}% (below ${this.config.criticalThreshold}% critical setpoint). Refill required.`,
          timestamp: isoTime,
          tankId,
          coachNumber,
          levelPercent,
          autoDismissMs: 8000,
        },
        'CRITICAL_LOW'
      );
    } else if (newState === 'WARNING') {
      this.notify(
        {
          id: `warn-${tankId}-${Date.now()}`,
          severity: 'WARNING',
          title: `Water Level Low Warning (${coachNumber})`,
          message: `Measured level is ${levelPercent.toFixed(1)}% (below ${this.config.warningThreshold}% warning setpoint).`,
          timestamp: isoTime,
          tankId,
          coachNumber,
          levelPercent,
          autoDismissMs: 6000,
        },
        'WARNING_LOW'
      );
    } else if (newState === 'OVERFLOW') {
      this.notify(
        {
          id: `over-${tankId}-${Date.now()}`,
          severity: 'WARNING',
          title: `Tank Overflow Warning (${coachNumber})`,
          message: `Measured level is ${levelPercent.toFixed(1)}% (exceeds ${this.config.overflowThreshold}% overflow setpoint).`,
          timestamp: isoTime,
          tankId,
          coachNumber,
          levelPercent,
          autoDismissMs: 6000,
        },
        'OVERFLOW'
      );
    } else if (newState === 'NORMAL' && (prevState === 'CRITICAL' || prevState === 'WARNING' || prevState === 'OVERFLOW')) {
      // Recovery notification
      this.notify(
        {
          id: `rec-${tankId}-${Date.now()}`,
          severity: 'NORMAL',
          title: `Water Level Recovered (${coachNumber})`,
          message: `Water level returned to nominal (${levelPercent.toFixed(1)}% >= ${this.config.warningThreshold}%).`,
          timestamp: isoTime,
          tankId,
          coachNumber,
          levelPercent,
          autoDismissMs: 4000,
        },
        'WATER_LEVEL_RECOVERY'
      );
    }
  }

  /**
   * Evaluate device connectivity / offline state.
   */
  public evaluateDeviceConnectivity(params: {
    deviceId: string;
    coachNumber: string;
    isOnline: boolean;
  }) {
    if (!this.config.masterEnabled || !this.config.deviceOfflineEnabled) return;

    const { deviceId, coachNumber, isOnline } = params;
    const cacheKey = `conn-${deviceId}`;
    const previous = this.stateCache.get(cacheKey);

    const newState = isOnline ? 'ONLINE' : 'OFFLINE';
    const prevState = previous ? previous.state : 'INITIAL';

    if (newState === prevState) return;

    const isoTime = new Date().toISOString();
    this.stateCache.set(cacheKey, {
      severity: isOnline ? 'NORMAL' : 'WARNING',
      state: newState,
      timestamp: isoTime,
    });

    if (newState === 'OFFLINE') {
      this.notify(
        {
          id: `offline-${deviceId}-${Date.now()}`,
          severity: 'WARNING',
          title: `Device Offline (${coachNumber || deviceId})`,
          message: `Communication lost with telemetry unit ${deviceId}.`,
          timestamp: isoTime,
          coachNumber,
          autoDismissMs: 6000,
        },
        'DEVICE_OFFLINE'
      );
    } else if (newState === 'ONLINE' && prevState === 'OFFLINE') {
      this.notify(
        {
          id: `online-${deviceId}-${Date.now()}`,
          severity: 'NORMAL',
          title: `Device Reconnected (${coachNumber || deviceId})`,
          message: `Real-time SCADA telemetry link restored for ${deviceId}.`,
          timestamp: isoTime,
          coachNumber,
          autoDismissMs: 4000,
        },
        'DEVICE_ONLINE'
      );
    }
  }

  /**
   * Evaluate sensor health / fault.
   */
  public evaluateSensorHealth(params: {
    sensorId: string;
    coachNumber: string;
    isValid: boolean;
    sensorName: string;
  }) {
    if (!this.config.masterEnabled || !this.config.sensorFaultEnabled) return;

    const { sensorId, coachNumber, isValid, sensorName } = params;
    const cacheKey = `sensor-${sensorId}`;
    const previous = this.stateCache.get(cacheKey);

    const newState = isValid ? 'VALID' : 'FAULT';
    const prevState = previous ? previous.state : 'INITIAL';

    if (newState === prevState) return;

    const isoTime = new Date().toISOString();
    this.stateCache.set(cacheKey, {
      severity: isValid ? 'NORMAL' : 'CRITICAL',
      state: newState,
      timestamp: isoTime,
    });

    if (newState === 'FAULT') {
      this.notify(
        {
          id: `fault-${sensorId}-${Date.now()}`,
          severity: 'CRITICAL',
          title: `Sensor Fault (${coachNumber})`,
          message: `${sensorName} signal fault or probe disconnected.`,
          timestamp: isoTime,
          coachNumber,
          autoDismissMs: 8000,
        },
        'SENSOR_FAULT'
      );
    } else if (newState === 'VALID' && prevState === 'FAULT') {
      this.notify(
        {
          id: `sensor-rec-${sensorId}-${Date.now()}`,
          severity: 'NORMAL',
          title: `Sensor Restored (${coachNumber})`,
          message: `${sensorName} signal normal and probe reading valid.`,
          timestamp: isoTime,
          coachNumber,
          autoDismissMs: 4000,
        },
        'SENSOR_RECOVERED'
      );
    }
  }

  /**
   * Evaluate modem/cellular connectivity failure.
   */
  public evaluateModemStatus(params: {
    deviceId: string;
    coachNumber: string;
    modemOk: boolean;
  }) {
    if (!this.config.masterEnabled || !this.config.modemFailureEnabled) return;

    const { deviceId, coachNumber, modemOk } = params;
    const cacheKey = `modem-${deviceId}`;
    const previous = this.stateCache.get(cacheKey);

    const newState = modemOk ? 'OK' : 'FAIL';
    const prevState = previous ? previous.state : 'INITIAL';

    if (newState === prevState) return;

    const isoTime = new Date().toISOString();
    this.stateCache.set(cacheKey, {
      severity: modemOk ? 'NORMAL' : 'WARNING',
      state: newState,
      timestamp: isoTime,
    });

    if (newState === 'FAIL') {
      this.notify(
        {
          id: `modem-fail-${deviceId}-${Date.now()}`,
          severity: 'WARNING',
          title: `Modem Connectivity Failure (${coachNumber})`,
          message: `Cellular/LTE modem communication failure on unit ${deviceId}.`,
          timestamp: isoTime,
          coachNumber,
          autoDismissMs: 6000,
        },
        'MODEM_FAILURE'
      );
    } else if (newState === 'OK' && prevState === 'FAIL') {
      this.notify(
        {
          id: `modem-ok-${deviceId}-${Date.now()}`,
          severity: 'NORMAL',
          title: `Modem Connection Restored (${coachNumber})`,
          message: `Cellular/LTE carrier connection re-established.`,
          timestamp: isoTime,
          coachNumber,
          autoDismissMs: 4000,
        },
        'MODEM_RESTORED'
      );
    }
  }
}

export const alertNotificationService = new AlertNotificationService();
export default alertNotificationService;
