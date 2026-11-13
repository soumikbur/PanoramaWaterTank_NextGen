/**
 * Centralized Browser Notification & Alert Reminder Configuration.
 *
 * Configurable alert reminder interval: exactly 30 minutes (1800 seconds / 1,800,000 ms).
 */

export const ALERT_REMINDER_INTERVAL_MS = 30 * 60 * 1000;
export const ALERT_REMINDER_INTERVAL_SECONDS = 30 * 60; // 1800 seconds

export type ReminderMode = 'TEST' | 'PRODUCTION';

export const NOTIFICATION_CONFIG = {
  /** Active mode for automatic unacknowledged alert reminders */
  REMINDER_MODE: 'PRODUCTION' as ReminderMode,

  /** Standard reminder interval: 30 minutes (1800 seconds) */
  TEST_REMINDER_INTERVAL_SECONDS: ALERT_REMINDER_INTERVAL_SECONDS,

  /** Production reminder interval: 30 minutes (1800 seconds) */
  PRODUCTION_REMINDER_INTERVAL_SECONDS: ALERT_REMINDER_INTERVAL_SECONDS,

  get REMINDER_INTERVAL_SECONDS(): number {
    return ALERT_REMINDER_INTERVAL_SECONDS;
  },

  get REMINDER_INTERVAL_MS(): number {
    return ALERT_REMINDER_INTERVAL_MS;
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

