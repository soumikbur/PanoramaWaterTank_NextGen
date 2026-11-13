/**
 * alertNotificationService.ts — Enterprise SCADA Alert Notification & Reminder Engine
 *
 * Implements real-time alert evaluation, state-change transition tracking,
 * strict deduplication, native Browser/ServiceWorker popup notifications,
 * independent persistent 30s reminders, acknowledgement/recovery stopping,
 * and persistent alert history.
 */

import { NOTIFICATION_CONFIG } from '../config/notificationConfig';
import {
  browserNotificationBridge,
  BrowserNotificationPayload,
  BrowserNotificationPermission,
} from './browserNotificationBridge';

export interface AlertToast {
  id: string;
  alertKey?: string;
  severity: 'CRITICAL' | 'WARNING' | 'NORMAL';
  title: string;
  message: string;
  timestamp: string;
  trainNumber?: string;
  tankId?: string;
  tankName?: string;
  coachNumber?: string;
  levelPercent?: number | null;
  autoDismissMs?: number;
  isReminder?: boolean;
  reminderCount?: number;
}

export interface AlertHistoryEntry {
  id: string;
  alertKey?: string;
  timestamp: string;
  alertType: string;
  severity: 'CRITICAL' | 'WARNING' | 'NORMAL';
  waterLevel: number | null;
  description: string;
  status: 'Active' | 'Resolved' | 'Acknowledged';
  target: string;
  trainNumber?: string;
  coachNumber?: string;
  tankName?: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  resolvedAt?: string;
}

export interface ManagedAlertRecord {
  id: string;
  alertKey: string;
  alertType: string;
  severity: 'CRITICAL' | 'WARNING';
  title: string;
  message: string;
  trainNumber?: string;
  coachNumber?: string;
  tankId?: string;
  tankName?: string;
  levelPercent?: number | null;
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';
  triggeredAt: string;
  lastNotifiedAt: number;
  nextReminderAt: number;
  reminderCount: number;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  acknowledgeComment?: string;
  resolvedAt?: string;
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

type ToastListener = (toast: AlertToast) => void;
type AlertsChangeListener = (alerts: ManagedAlertRecord[]) => void;

class AlertNotificationService {
  private config: AlertConfig = { ...DEFAULT_CONFIG };
  private stateCache = new Map<string, { severity: string; state: string; timestamp: string }>();
  private managedAlerts: ManagedAlertRecord[] = [];
  private toastListeners = new Set<ToastListener>();
  private alertsListeners = new Set<AlertsChangeListener>();
  private reminderTimer: ReturnType<typeof setInterval> | null = null;
  private reminderIntervalOverrideMs: number | null = null;
  private visibilityBound = false;

  constructor() {
    this.loadConfig();
    this.loadManagedAlerts();
    this.hydrateStateCache();
    this.startReminderScheduler();
  }

  public getReminderIntervalMs(): number {
    return this.reminderIntervalOverrideMs ?? NOTIFICATION_CONFIG.REMINDER_INTERVAL_MS;
  }

  public setReminderIntervalOverrideMs(ms: number | null): void {
    this.reminderIntervalOverrideMs = ms;
  }

  public getPermissionStatus(): BrowserNotificationPermission {
    return browserNotificationBridge.getPermission();
  }

  public requestBrowserPermission(): Promise<BrowserNotificationPermission> {
    return browserNotificationBridge.requestPermission();
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
      const saved = localStorage.getItem(NOTIFICATION_CONFIG.STORAGE_KEYS.CONFIG);
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
      localStorage.setItem(NOTIFICATION_CONFIG.STORAGE_KEYS.CONFIG, JSON.stringify(this.config));
    } catch {
      // ignore
    }
  }

  private loadManagedAlerts() {
    if (typeof localStorage === 'undefined') return;
    try {
      const saved = localStorage.getItem(NOTIFICATION_CONFIG.STORAGE_KEYS.MANAGED_ALERTS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          this.managedAlerts = parsed;
        }
      }
    } catch {
      this.managedAlerts = [];
    }
  }

  private saveManagedAlerts() {
    if (typeof localStorage === 'undefined') return;
    try {
      const activeAndAcked = this.managedAlerts.filter((a) => a.status !== 'RESOLVED');
      const recentResolved = this.managedAlerts
        .filter((a) => a.status === 'RESOLVED')
        .slice(0, 50);
      this.managedAlerts = [...activeAndAcked, ...recentResolved];
      localStorage.setItem(
        NOTIFICATION_CONFIG.STORAGE_KEYS.MANAGED_ALERTS,
        JSON.stringify(this.managedAlerts)
      );
    } catch {
      // ignore
    }
  }

  private mapAlertTypeToState(alertType: string): string {
    switch (alertType) {
      case 'CRITICAL_LOW':
        return 'CRITICAL';
      case 'WARNING_LOW':
        return 'WARNING';
      case 'OVERFLOW':
        return 'OVERFLOW';
      case 'INVALID_READING':
        return 'INVALID';
      case 'DEVICE_OFFLINE':
        return 'OFFLINE';
      case 'SENSOR_FAULT':
        return 'FAULT';
      case 'MODEM_FAILURE':
        return 'FAIL';
      case 'MQTT_BROKER_DISCONNECTED':
        return 'DISCONNECTED';
      case 'COMMUNICATION_FAILURE':
        return 'FAILED';
      default:
        return alertType;
    }
  }

  private hydrateStateCache() {
    this.stateCache.clear();
    for (const alert of this.managedAlerts) {
      if (alert.status === 'ACTIVE' || alert.status === 'ACKNOWLEDGED') {
        this.stateCache.set(alert.alertKey, {
          severity: alert.severity,
          state: this.mapAlertTypeToState(alert.alertType),
          timestamp: alert.triggeredAt,
        });
      }
    }
  }

  public startReminderScheduler(): void {
    if (typeof window === 'undefined') return;
    if (!this.reminderTimer) {
      this.reminderTimer = setInterval(() => {
        this.processDueReminders(Date.now());
      }, NOTIFICATION_CONFIG.REMINDER_CHECK_INTERVAL_MS);
    }
    if (!this.visibilityBound && typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      this.visibilityBound = true;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.processDueReminders(Date.now());
        }
      });
    }
  }

  public stopReminderScheduler(): void {
    if (this.reminderTimer) {
      clearInterval(this.reminderTimer);
      this.reminderTimer = null;
    }
  }

  public onToast(listener: ToastListener): () => void {
    this.toastListeners.add(listener);
    return () => {
      this.toastListeners.delete(listener);
    };
  }

  public onAlertsChange(listener: AlertsChangeListener): () => void {
    this.alertsListeners.add(listener);
    return () => {
      this.alertsListeners.delete(listener);
    };
  }

  private emitAlertsChange() {
    const snapshot = this.getManagedAlerts();
    this.alertsListeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (err) {
        console.error('Error in alert change listener:', err);
      }
    });
  }

  public getManagedAlerts(): ManagedAlertRecord[] {
    return this.managedAlerts.map((a) => ({ ...a }));
  }

  public getActiveUnacknowledgedAlerts(): ManagedAlertRecord[] {
    return this.managedAlerts
      .filter((a) => a.status === 'ACTIVE')
      .map((a) => ({ ...a }));
  }

  public getNonResolvedAlerts(): ManagedAlertRecord[] {
    return this.managedAlerts
      .filter((a) => a.status !== 'RESOLVED')
      .map((a) => ({ ...a }));
  }

  private formatConsoleTimestamp(): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  }

  private formatNotificationTimestamp(isoString: string): string {
    try {
      return new Date(isoString).toLocaleString();
    } catch {
      return isoString;
    }
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
      const data = localStorage.getItem(NOTIFICATION_CONFIG.STORAGE_KEYS.HISTORY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  public addHistoryEntry(entry: AlertHistoryEntry) {
    if (typeof localStorage === 'undefined') return;
    try {
      const current = this.getHistory();
      const updated = [entry, ...current.slice(0, NOTIFICATION_CONFIG.MAX_HISTORY_ENTRIES - 1)];
      localStorage.setItem(NOTIFICATION_CONFIG.STORAGE_KEYS.HISTORY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  }

  private updateHistoryStatus(
    matcher: (h: AlertHistoryEntry) => boolean,
    patch: Partial<AlertHistoryEntry>
  ) {
    if (typeof localStorage === 'undefined') return;
    try {
      const current = this.getHistory();
      let changed = false;
      const updated = current.map((entry) => {
        if (matcher(entry)) {
          changed = true;
          return { ...entry, ...patch };
        }
        return entry;
      });
      if (changed) {
        localStorage.setItem(NOTIFICATION_CONFIG.STORAGE_KEYS.HISTORY, JSON.stringify(updated));
      }
    } catch {
      // ignore
    }
  }

  public clearHistory(): void {
    this.stateCache.clear();
    this.managedAlerts = [];
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(NOTIFICATION_CONFIG.STORAGE_KEYS.HISTORY);
      localStorage.removeItem(NOTIFICATION_CONFIG.STORAGE_KEYS.MANAGED_ALERTS);
    }
    this.emitAlertsChange();
  }

  /**
   * Reload state from localStorage (useful after simulated/real page refresh).
   */
  public reloadPersistedState(): void {
    this.loadConfig();
    this.loadManagedAlerts();
    this.hydrateStateCache();
    this.emitAlertsChange();
  }

  private emitToast(toast: AlertToast) {
    this.toastListeners.forEach((listener) => {
      try {
        listener(toast);
      } catch (err) {
        console.error('Error dispatching alert toast:', err);
      }
    });
  }

  public buildBrowserNotificationPayload(
    alert: ManagedAlertRecord,
    isReminder = false
  ): BrowserNotificationPayload {
    const severityLabel = alert.severity === 'CRITICAL' ? 'CRITICAL ALERT' : 'WARNING ALERT';
    const title = `${NOTIFICATION_CONFIG.APP_TITLE} – ${severityLabel}`;
    const levelDisplay =
      alert.levelPercent != null && Number.isFinite(alert.levelPercent)
        ? `${alert.levelPercent.toFixed(1)}%`
        : 'N/A';
    const tsDisplay = this.formatNotificationTimestamp(
      isReminder ? new Date().toISOString() : alert.triggeredAt
    );
    const reminderLine = isReminder
      ? `Reminder #${alert.reminderCount} (unacknowledged — repeats every ${Math.round(this.getReminderIntervalMs() / 1000)}s)`
      : null;

    const lines = [
      alert.message,
      `Severity: ${alert.severity} | Water Level: ${levelDisplay}`,
      `Train ID: ${alert.trainNumber || 'N/A'} | Coach ID: ${alert.coachNumber || 'N/A'} | Tank: ${alert.tankName || alert.tankId || 'System'}`,
      `Timestamp: ${tsDisplay}`,
    ];
    if (reminderLine) {
      lines.push(reminderLine);
    }

    const params = new URLSearchParams();
    if (alert.trainNumber) params.set('train', alert.trainNumber);
    if (alert.coachNumber) params.set('coach', alert.coachNumber);
    const qs = params.toString();

    return {
      title,
      body: lines.join('\n'),
      tag: `panorama-alert-${alert.id}`,
      severity: alert.severity,
      renotify: true,
      requireInteraction: alert.severity === 'CRITICAL',
      data: {
        screen: 'alerts',
        trainNumber: alert.trainNumber,
        coachNumber: alert.coachNumber,
        tankId: alert.tankId,
        alertId: alert.id,
        url: `./#/alerts${qs ? `?${qs}` : ''}`,
      },
    };
  }

  private isCategoryEnabled(alertType: string): boolean {
    if (!this.config.masterEnabled) return false;
    switch (alertType) {
      case 'CRITICAL_LOW':
      case 'WARNING_LOW':
        return this.config.lowWaterEnabled;
      case 'OVERFLOW':
        return this.config.overflowEnabled;
      case 'SENSOR_FAULT':
      case 'INVALID_READING':
        return this.config.sensorFaultEnabled;
      case 'DEVICE_OFFLINE':
      case 'MQTT_BROKER_DISCONNECTED':
      case 'COMMUNICATION_FAILURE':
        return this.config.deviceOfflineEnabled;
      case 'MODEM_FAILURE':
        return this.config.modemFailureEnabled;
      default:
        return true;
    }
  }

  private notify(toast: AlertToast, alertType: string, meta?: { alertKey?: string; tankName?: string; trainNumber?: string }) {
    this.logAlert(toast.severity, alertType, `${toast.title}: ${toast.message}`);
    this.emitToast(toast);

    const alertKey = meta?.alertKey || toast.alertKey;
    const trainNumber = meta?.trainNumber || toast.trainNumber;
    const tankName = meta?.tankName || toast.tankName;

    // Record into persistent history
    this.addHistoryEntry({
      id: toast.id,
      alertKey,
      timestamp: toast.timestamp,
      alertType,
      severity: toast.severity,
      waterLevel: toast.levelPercent ?? null,
      description: toast.message,
      status: toast.severity === 'NORMAL' ? 'Resolved' : 'Active',
      target: toast.coachNumber ? `Coach ${toast.coachNumber}` : (tankName || toast.tankId || 'System'),
      trainNumber,
      coachNumber: toast.coachNumber,
      tankName,
    });
  }

  /**
   * Open or update an active alert with persistent 30s reminder scheduling
   * and immediate native browser popup dispatch.
   */
  private triggerManagedAlert(params: {
    id: string;
    alertKey: string;
    alertType: string;
    severity: 'CRITICAL' | 'WARNING';
    title: string;
    message: string;
    timestamp: string;
    trainNumber?: string;
    coachNumber?: string;
    tankId?: string;
    tankName?: string;
    levelPercent?: number | null;
    autoDismissMs?: number;
    nowMs?: number;
  }) {
    const now = params.nowMs ?? Date.now();
    const existingNonResolved = this.managedAlerts.find(
      (a) => a.alertKey === params.alertKey && a.status !== 'RESOLVED'
    );

    // Prevent duplicate or overriding already-acknowledged alert of same or lower severity
    if (existingNonResolved) {
      if (
        existingNonResolved.status === 'ACKNOWLEDGED' &&
        (existingNonResolved.severity === params.severity ||
          (existingNonResolved.severity === 'CRITICAL' && params.severity === 'WARNING'))
      ) {
        return;
      }
      // Supersede prior warning/stale incident cleanly on severity escalation
      existingNonResolved.status = 'RESOLVED';
      existingNonResolved.resolvedAt = params.timestamp;
      this.updateHistoryStatus(
        (h) => h.id === existingNonResolved.id || (h.alertKey === params.alertKey && h.status === 'Active'),
        { status: 'Resolved', resolvedAt: params.timestamp }
      );
    }

    const record: ManagedAlertRecord = {
      id: params.id,
      alertKey: params.alertKey,
      alertType: params.alertType,
      severity: params.severity,
      title: params.title,
      message: params.message,
      trainNumber: params.trainNumber,
      coachNumber: params.coachNumber,
      tankId: params.tankId,
      tankName: params.tankName,
      levelPercent: params.levelPercent ?? null,
      status: 'ACTIVE',
      triggeredAt: params.timestamp,
      lastNotifiedAt: now,
      nextReminderAt: now + this.getReminderIntervalMs(),
      reminderCount: 0,
    };

    this.managedAlerts.unshift(record);
    this.saveManagedAlerts();
    this.emitAlertsChange();

    this.notify(
      {
        id: record.id,
        alertKey: record.alertKey,
        severity: record.severity,
        title: record.title,
        message: record.message,
        timestamp: record.triggeredAt,
        trainNumber: record.trainNumber,
        tankId: record.tankId,
        tankName: record.tankName,
        coachNumber: record.coachNumber,
        levelPercent: record.levelPercent,
        autoDismissMs: params.autoDismissMs ?? (record.severity === 'CRITICAL' ? 8000 : 6000),
      },
      record.alertType,
      { alertKey: record.alertKey, tankName: record.tankName, trainNumber: record.trainNumber }
    );

    void browserNotificationBridge.showNotification(
      this.buildBrowserNotificationPayload(record, false)
    );
  }

  /**
   * Process scheduled reminders for all ACTIVE unacknowledged alerts.
   * Safe across browser refreshes and independent per alert.
   */
  public processDueReminders(nowMs: number = Date.now()): ManagedAlertRecord[] {
    const fired: ManagedAlertRecord[] = [];
    const intervalMs = this.getReminderIntervalMs();
    let dirty = false;

    for (const alert of this.managedAlerts) {
      if (alert.status !== 'ACTIVE') continue;
      if (!this.isCategoryEnabled(alert.alertType)) continue;

      if (nowMs >= alert.nextReminderAt) {
        alert.reminderCount += 1;
        alert.lastNotifiedAt = nowMs;
        alert.nextReminderAt = nowMs + intervalMs;
        dirty = true;
        fired.push({ ...alert });

        const reminderIso = new Date(nowMs).toISOString();
        this.logAlert(
          alert.severity,
          `${alert.alertType}_REMINDER_${alert.reminderCount}`,
          `${alert.title}: Reminder #${alert.reminderCount}`
        );

        this.emitToast({
          id: `${alert.id}-rem-${alert.reminderCount}`,
          alertKey: alert.alertKey,
          severity: alert.severity,
          title: `${alert.title} (Reminder #${alert.reminderCount})`,
          message: alert.message,
          timestamp: reminderIso,
          trainNumber: alert.trainNumber,
          tankId: alert.tankId,
          tankName: alert.tankName,
          coachNumber: alert.coachNumber,
          levelPercent: alert.levelPercent,
          autoDismissMs: alert.severity === 'CRITICAL' ? 8000 : 6000,
          isReminder: true,
          reminderCount: alert.reminderCount,
        });

        void browserNotificationBridge.showNotification(
          this.buildBrowserNotificationPayload(alert, true)
        );
      }
    }

    if (dirty) {
      this.saveManagedAlerts();
      this.emitAlertsChange();
    }

    return fired;
  }

  /**
   * Acknowledge an alert and stop all future reminders for it while preserving history.
   */
  public acknowledgeAlert(
    idOrKey: string,
    username?: string,
    comment?: string
  ): ManagedAlertRecord | null {
    const nowIso = new Date().toISOString();
    const ackUser = username || 'Operator';
    const target = this.managedAlerts.find(
      (a) =>
        a.status === 'ACTIVE' &&
        (a.id === idOrKey ||
          a.alertKey === idOrKey ||
          (idOrKey.startsWith('alarm-low-tank2-') && a.alertKey === `level-${idOrKey.replace('alarm-low-tank2-', '')}-departure`) ||
          (idOrKey.startsWith('alarm-s1-') && a.alertKey === `sensor-s1-${idOrKey.replace('alarm-s1-', '')}`) ||
          (idOrKey.startsWith('alarm-s2-') && a.alertKey === `sensor-s2-${idOrKey.replace('alarm-s2-', '')}`) ||
          (idOrKey.startsWith('alarm-conn-') && a.alertKey === `conn-${idOrKey.replace('alarm-conn-', '')}`))
    );

    if (!target) return null;

    target.status = 'ACKNOWLEDGED';
    target.acknowledgedAt = nowIso;
    target.acknowledgedBy = ackUser;
    if (comment) target.acknowledgeComment = comment;

    this.updateHistoryStatus(
      (h) => h.id === target.id || (h.alertKey === target.alertKey && h.status === 'Active'),
      {
        status: 'Acknowledged',
        acknowledgedAt: nowIso,
        acknowledgedBy: ackUser,
      }
    );

    this.saveManagedAlerts();
    this.emitAlertsChange();
    return { ...target };
  }

  public acknowledgeAll(username?: string, comment?: string): number {
    const activeIds = this.managedAlerts
      .filter((a) => a.status === 'ACTIVE')
      .map((a) => a.id);
    let count = 0;
    for (const id of activeIds) {
      if (this.acknowledgeAlert(id, username, comment)) count++;
    }
    return count;
  }

  private resolveManagedAlertsByKey(alertKey: string, resolvedAt: string) {
    let changed = false;
    for (const alert of this.managedAlerts) {
      if (alert.alertKey === alertKey && alert.status !== 'RESOLVED') {
        alert.status = 'RESOLVED';
        alert.resolvedAt = resolvedAt;
        changed = true;
        this.updateHistoryStatus(
          (h) => h.id === alert.id || (h.alertKey === alertKey && h.status === 'Active'),
          { status: 'Resolved', resolvedAt }
        );
      }
    }
    if (changed) {
      this.saveManagedAlerts();
      this.emitAlertsChange();
    }
  }

  /**
   * Evaluate water tank telemetry reading and dispatch notification only on real transitions.
   */
  public evaluateWaterLevel(params: {
    tankId: string;
    coachNumber: string;
    levelPercent: number | null | undefined;
    isOnline: boolean;
    trainNumber?: string;
    tankName?: string;
  }) {
    if (!this.config.masterEnabled) return;

    const { tankId, coachNumber, levelPercent, isOnline, trainNumber, tankName } = params;
    if (!isOnline || levelPercent === null || levelPercent === undefined) return;

    const cacheKey = `level-${tankId}`;
    const previous = this.stateCache.get(cacheKey);
    const prevState = previous ? previous.state : 'INITIAL';

    // Invalid sensor reading guard (NaN or physically impossible reading)
    if (!Number.isFinite(levelPercent) || levelPercent < 0 || levelPercent > 110) {
      if (!this.config.sensorFaultEnabled) return;
      if (prevState === 'INVALID') return;
      const isoTime = new Date().toISOString();
      this.stateCache.set(cacheKey, { severity: 'CRITICAL', state: 'INVALID', timestamp: isoTime });
      this.triggerManagedAlert({
        id: `invalid-${tankId}-${Date.now()}`,
        alertKey: cacheKey,
        alertType: 'INVALID_READING',
        severity: 'CRITICAL',
        title: `Invalid Water Level Reading (${coachNumber})`,
        message: `Sensor returned out-of-range telemetry value (${String(levelPercent)}).`,
        timestamp: isoTime,
        trainNumber,
        coachNumber,
        tankId,
        tankName,
        levelPercent: Number.isFinite(levelPercent) ? levelPercent : null,
        autoDismissMs: 8000,
      });
      return;
    }

    if (!this.config.lowWaterEnabled && !this.config.overflowEnabled) return;

    let newState: 'CRITICAL' | 'WARNING' | 'OVERFLOW' | 'NORMAL' = 'NORMAL';
    if (this.config.lowWaterEnabled && levelPercent < this.config.criticalThreshold) {
      newState = 'CRITICAL';
    } else if (this.config.lowWaterEnabled && levelPercent < this.config.warningThreshold) {
      newState = 'WARNING';
    } else if (this.config.overflowEnabled && levelPercent >= this.config.overflowThreshold) {
      newState = 'OVERFLOW';
    } else {
      newState = 'NORMAL';
    }

    if (newState === prevState) {
      // Keep current reading fresh on active alert without re-triggering or resetting timer
      const existingActive = this.managedAlerts.find(
        (a) => a.alertKey === cacheKey && a.status === 'ACTIVE'
      );
      if (existingActive && existingActive.levelPercent !== levelPercent) {
        existingActive.levelPercent = levelPercent;
        this.saveManagedAlerts();
      }
      return;
    }

    const isoTime = new Date().toISOString();
    this.stateCache.set(cacheKey, {
      severity: newState === 'CRITICAL' ? 'CRITICAL' : newState === 'WARNING' || newState === 'OVERFLOW' ? 'WARNING' : 'NORMAL',
      state: newState,
      timestamp: isoTime,
    });

    if (newState === 'CRITICAL') {
      this.triggerManagedAlert({
        id: `crit-${tankId}-${Date.now()}`,
        alertKey: cacheKey,
        alertType: 'CRITICAL_LOW',
        severity: 'CRITICAL',
        title: `Critical Low Water (${coachNumber})`,
        message: `Water level has dropped below the critical threshold (${levelPercent.toFixed(1)}% < ${this.config.criticalThreshold}%).`,
        timestamp: isoTime,
        trainNumber,
        coachNumber,
        tankId,
        tankName,
        levelPercent,
        autoDismissMs: 8000,
      });
    } else if (newState === 'WARNING') {
      this.triggerManagedAlert({
        id: `warn-${tankId}-${Date.now()}`,
        alertKey: cacheKey,
        alertType: 'WARNING_LOW',
        severity: 'WARNING',
        title: `Water Level Warning (${coachNumber})`,
        message: `Measured level is ${levelPercent.toFixed(1)}% (below ${this.config.warningThreshold}% warning setpoint).`,
        timestamp: isoTime,
        trainNumber,
        coachNumber,
        tankId,
        tankName,
        levelPercent,
        autoDismissMs: 6000,
      });
    } else if (newState === 'OVERFLOW') {
      this.triggerManagedAlert({
        id: `over-${tankId}-${Date.now()}`,
        alertKey: cacheKey,
        alertType: 'OVERFLOW',
        severity: 'WARNING',
        title: `Tank Overflow Warning (${coachNumber})`,
        message: `Measured level is ${levelPercent.toFixed(1)}% (exceeds ${this.config.overflowThreshold}% overflow setpoint).`,
        timestamp: isoTime,
        trainNumber,
        coachNumber,
        tankId,
        tankName,
        levelPercent,
        autoDismissMs: 6000,
      });
    } else if (
      newState === 'NORMAL' &&
      (prevState === 'CRITICAL' || prevState === 'WARNING' || prevState === 'OVERFLOW' || prevState === 'INVALID')
    ) {
      this.resolveManagedAlertsByKey(cacheKey, isoTime);
      this.notify(
        {
          id: `rec-${tankId}-${Date.now()}`,
          alertKey: cacheKey,
          severity: 'NORMAL',
          title: `Water Level Recovered (${coachNumber})`,
          message: `Water level returned to nominal (${levelPercent.toFixed(1)}% >= ${this.config.warningThreshold}%).`,
          timestamp: isoTime,
          trainNumber,
          tankId,
          tankName,
          coachNumber,
          levelPercent,
          autoDismissMs: 4000,
        },
        'WATER_LEVEL_RECOVERY',
        { alertKey: cacheKey, tankName, trainNumber }
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
    trainNumber?: string;
  }) {
    if (!this.config.masterEnabled || !this.config.deviceOfflineEnabled) return;

    const { deviceId, coachNumber, isOnline, trainNumber } = params;
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
      this.triggerManagedAlert({
        id: `offline-${deviceId}-${Date.now()}`,
        alertKey: cacheKey,
        alertType: 'DEVICE_OFFLINE',
        severity: 'WARNING',
        title: `Device Offline (${coachNumber || deviceId})`,
        message: `Communication lost with telemetry unit ${deviceId}.`,
        timestamp: isoTime,
        trainNumber,
        coachNumber,
        tankName: `Unit ${deviceId}`,
        autoDismissMs: 6000,
      });
    } else if (newState === 'ONLINE' && prevState === 'OFFLINE') {
      this.resolveManagedAlertsByKey(cacheKey, isoTime);
      this.notify(
        {
          id: `online-${deviceId}-${Date.now()}`,
          alertKey: cacheKey,
          severity: 'NORMAL',
          title: `Device Reconnected (${coachNumber || deviceId})`,
          message: `Real-time SCADA telemetry link restored for ${deviceId}.`,
          timestamp: isoTime,
          trainNumber,
          coachNumber,
          autoDismissMs: 4000,
        },
        'DEVICE_ONLINE',
        { alertKey: cacheKey, trainNumber }
      );
    }
  }

  /**
   * Evaluate sensor health / disconnection / fault.
   */
  public evaluateSensorHealth(params: {
    sensorId: string;
    coachNumber: string;
    isValid: boolean;
    sensorName: string;
    trainNumber?: string;
    tankId?: string;
    tankName?: string;
    levelPercent?: number | null;
  }) {
    if (!this.config.masterEnabled || !this.config.sensorFaultEnabled) return;

    const { sensorId, coachNumber, isValid, sensorName, trainNumber, tankId, tankName, levelPercent } = params;
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
      this.triggerManagedAlert({
        id: `fault-${sensorId}-${Date.now()}`,
        alertKey: cacheKey,
        alertType: 'SENSOR_FAULT',
        severity: 'CRITICAL',
        title: `Sensor Fault (${coachNumber})`,
        message: `${sensorName} signal fault or probe disconnected.`,
        timestamp: isoTime,
        trainNumber,
        coachNumber,
        tankId,
        tankName: tankName || sensorName,
        levelPercent: levelPercent ?? null,
        autoDismissMs: 8000,
      });
    } else if (newState === 'VALID' && prevState === 'FAULT') {
      this.resolveManagedAlertsByKey(cacheKey, isoTime);
      this.notify(
        {
          id: `sensor-ok-${sensorId}-${Date.now()}`,
          alertKey: cacheKey,
          severity: 'NORMAL',
          title: `Sensor Restored (${coachNumber})`,
          message: `${sensorName} readings stabilized and returning valid data.`,
          timestamp: isoTime,
          trainNumber,
          coachNumber,
          tankId,
          tankName: tankName || sensorName,
          levelPercent: levelPercent ?? null,
          autoDismissMs: 4000,
        },
        'SENSOR_RESTORED',
        { alertKey: cacheKey, tankName: tankName || sensorName, trainNumber }
      );
    }
  }

  /**
   * Evaluate cellular/LTE modem communication health.
   */
  public evaluateModemStatus(params: {
    deviceId: string;
    coachNumber: string;
    modemOk: boolean;
    trainNumber?: string;
  }) {
    if (!this.config.masterEnabled || !this.config.modemFailureEnabled) return;

    const { deviceId, coachNumber, modemOk, trainNumber } = params;
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
      this.triggerManagedAlert({
        id: `modem-fail-${deviceId}-${Date.now()}`,
        alertKey: cacheKey,
        alertType: 'MODEM_FAILURE',
        severity: 'WARNING',
        title: `Modem Connectivity Failure (${coachNumber})`,
        message: `Cellular/LTE modem communication failure on unit ${deviceId}.`,
        timestamp: isoTime,
        trainNumber,
        coachNumber,
        tankName: `Modem ${deviceId}`,
        autoDismissMs: 6000,
      });
    } else if (newState === 'OK' && prevState === 'FAIL') {
      this.resolveManagedAlertsByKey(cacheKey, isoTime);
      this.notify(
        {
          id: `modem-ok-${deviceId}-${Date.now()}`,
          alertKey: cacheKey,
          severity: 'NORMAL',
          title: `Modem Connection Restored (${coachNumber})`,
          message: `Cellular/LTE carrier connection re-established.`,
          timestamp: isoTime,
          trainNumber,
          coachNumber,
          autoDismissMs: 4000,
        },
        'MODEM_RESTORED',
        { alertKey: cacheKey, trainNumber }
      );
    }
  }

  /**
   * Evaluate MQTT broker connectivity transitions.
   */
  public evaluateBrokerConnectivity(params: {
    isConnected: boolean;
    reason?: string;
  }) {
    if (!this.config.masterEnabled || !this.config.deviceOfflineEnabled) return;

    const { isConnected, reason } = params;
    const cacheKey = 'broker-mqtt';
    const previous = this.stateCache.get(cacheKey);

    const newState = isConnected ? 'CONNECTED' : 'DISCONNECTED';
    const prevState = previous ? previous.state : 'INITIAL';

    if (newState === prevState) return;

    const isoTime = new Date().toISOString();
    this.stateCache.set(cacheKey, {
      severity: isConnected ? 'NORMAL' : 'CRITICAL',
      state: newState,
      timestamp: isoTime,
    });

    if (newState === 'DISCONNECTED') {
      this.triggerManagedAlert({
        id: `broker-disc-${Date.now()}`,
        alertKey: cacheKey,
        alertType: 'MQTT_BROKER_DISCONNECTED',
        severity: 'CRITICAL',
        title: 'MQTT Broker Disconnected',
        message: reason || 'Live telemetry broker connection lost. Attempting automatic reconnect.',
        timestamp: isoTime,
        tankName: 'MQTT Broker',
        autoDismissMs: 8000,
      });
    } else if (newState === 'CONNECTED' && prevState === 'DISCONNECTED') {
      this.resolveManagedAlertsByKey(cacheKey, isoTime);
      this.notify(
        {
          id: `broker-ok-${Date.now()}`,
          alertKey: cacheKey,
          severity: 'NORMAL',
          title: 'MQTT Broker Connected',
          message: 'MQTT telemetry broker link re-established.',
          timestamp: isoTime,
          autoDismissMs: 4000,
        },
        'MQTT_BROKER_CONNECTED',
        { alertKey: cacheKey, tankName: 'MQTT Broker' }
      );
    }
  }

  /**
   * Evaluate general communication channel failures (e.g. WebSocket / backend link).
   */
  public evaluateCommunicationFailure(params: {
    channel: string;
    isHealthy: boolean;
    reason?: string;
    trainNumber?: string;
    coachNumber?: string;
  }) {
    if (!this.config.masterEnabled || !this.config.deviceOfflineEnabled) return;

    const { channel, isHealthy, reason, trainNumber, coachNumber } = params;
    const cacheKey = `comm-${channel}`;
    const previous = this.stateCache.get(cacheKey);

    const newState = isHealthy ? 'HEALTHY' : 'FAILED';
    const prevState = previous ? previous.state : 'INITIAL';

    if (newState === prevState) return;

    const isoTime = new Date().toISOString();
    this.stateCache.set(cacheKey, {
      severity: isHealthy ? 'NORMAL' : 'WARNING',
      state: newState,
      timestamp: isoTime,
    });

    if (newState === 'FAILED') {
      this.triggerManagedAlert({
        id: `comm-fail-${channel}-${Date.now()}`,
        alertKey: cacheKey,
        alertType: 'COMMUNICATION_FAILURE',
        severity: 'WARNING',
        title: `Communication Failure (${channel})`,
        message: reason || `${channel} telemetry link interrupted.`,
        timestamp: isoTime,
        trainNumber,
        coachNumber,
        tankName: `${channel} Link`,
        autoDismissMs: 6000,
      });
    } else if (newState === 'HEALTHY' && prevState === 'FAILED') {
      this.resolveManagedAlertsByKey(cacheKey, isoTime);
      this.notify(
        {
          id: `comm-ok-${channel}-${Date.now()}`,
          alertKey: cacheKey,
          severity: 'NORMAL',
          title: `Communication Restored (${channel})`,
          message: `${channel} telemetry link recovered.`,
          timestamp: isoTime,
          trainNumber,
          coachNumber,
          autoDismissMs: 4000,
        },
        'COMMUNICATION_RESTORED',
        { alertKey: cacheKey, trainNumber }
      );
    }
  }
}

export const alertNotificationService = new AlertNotificationService();
export default alertNotificationService;
