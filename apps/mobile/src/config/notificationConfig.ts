/**
 * Centralized Browser Notification & Alert Reminder Configuration.
 *
 * Toggle REMINDER_MODE between 'TEST' (30s) and 'PRODUCTION' (3600s / 1 hour)
 * in this single configuration module.
 */

export type ReminderMode = 'TEST' | 'PRODUCTION';

export const NOTIFICATION_CONFIG = {
  /** Active mode for automatic unacknowledged alert reminders */
  REMINDER_MODE: 'TEST' as ReminderMode,

  /** Initial testing phase reminder interval: 30 seconds */
  TEST_REMINDER_INTERVAL_SECONDS: 30,

  /** Production reminder interval: 3600 seconds (1 hour) */
  PRODUCTION_REMINDER_INTERVAL_SECONDS: 3600,

  get REMINDER_INTERVAL_SECONDS(): number {
    return this.REMINDER_MODE === 'PRODUCTION'
      ? this.PRODUCTION_REMINDER_INTERVAL_SECONDS
      : this.TEST_REMINDER_INTERVAL_SECONDS;
  },

  get REMINDER_INTERVAL_MS(): number {
    return this.REMINDER_INTERVAL_SECONDS * 1000;
  },

  /** Scheduler tick resolution in milliseconds */
  REMINDER_CHECK_INTERVAL_MS: 1000,

  /** Maximum alert history records kept in local storage */
  MAX_HISTORY_ENTRIES: 200,

  /** Service worker script path relative to web app root */
  SERVICE_WORKER_PATH: './sw.js',

  /** Prefix used in native OS/browser notification titles */
  APP_TITLE: 'PANORAMA WATER TANK',

  STORAGE_KEYS: {
    CONFIG: 'panorama_alert_config',
    HISTORY: 'panorama_alert_history',
    MANAGED_ALERTS: 'panorama_managed_alerts_v1',
  },
};

export default NOTIFICATION_CONFIG;

