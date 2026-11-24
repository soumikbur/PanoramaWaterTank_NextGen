/**
 * nativeBridge.ts
 *
 * Seamless native platform bridge for Panorama Water Tank Monitor.
 * Interacts with @capacitor/core and plugins when running as a native Android/iOS app.
 * In a standard web browser (desktop or mobile Chrome), all calls gracefully fall back with zero overhead.
 */

export interface NativeNetworkStatus {
  connected: boolean;
  connectionType: 'wifi' | 'cellular' | 'none' | 'unknown';
}

export type NetworkStatusListener = (status: NativeNetworkStatus) => void;

class NativeBridge {
  private static instance: NativeBridge;
  private isNative: boolean = false;
  private networkListeners: Set<NetworkStatusListener> = new Set();
  private notificationPermissionGranted: boolean = false;
  private hasInitialized: boolean = false;

  private constructor() {
    this.checkIsNative();
  }

  public static getInstance(): NativeBridge {
    if (!NativeBridge.instance) {
      NativeBridge.instance = new NativeBridge();
    }
    return NativeBridge.instance;
  }

  private checkIsNative(): boolean {
    try {
      const cap = (window as any).Capacitor;
      this.isNative = Boolean(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
    } catch {
      this.isNative = false;
    }
    return this.isNative;
  }

  public isNativeApp(): boolean {
    return this.isNative;
  }

  public getCapacitorPlugin(pluginName: string): any {
    try {
      const cap = (window as any).Capacitor;
      return cap?.Plugins?.[pluginName] || null;
    } catch {
      return null;
    }
  }

  /**
   * Initialize native features on app launch:
   * - Light status bar with dark icons
   * - Hide native splash screen
   * - Bind App lifecycle (background / foreground)
   * - Monitor network status
   */
  public async initialize(): Promise<void> {
    if (this.hasInitialized) return;
    this.hasInitialized = true;
    this.checkIsNative();

    if (!this.isNative) {
      return;
    }

    console.log('[NativeBridge] Running on Native Capacitor platform. Initializing native subsystems...');

    // 1. Configure StatusBar
    try {
      const StatusBar = this.getCapacitorPlugin('StatusBar');
      if (StatusBar) {
        await StatusBar.show().catch(() => {});
        await StatusBar.setStyle({ style: 'LIGHT' }).catch(() => {});
        await StatusBar.setBackgroundColor({ color: '#FFFFFF' }).catch(() => {});
        await StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
        console.log('[NativeBridge] StatusBar configured.');
      }
    } catch (err) {
      console.warn('[NativeBridge] StatusBar config warning:', err);
    }

    // 2. Hide Splash Screen immediately once native subsystems initialize
    try {
      const SplashScreen = this.getCapacitorPlugin('SplashScreen');
      if (SplashScreen) {
        await SplashScreen.hide().catch(() => {});
        console.log('[NativeBridge] SplashScreen hidden.');
      }
    } catch (err) {
      console.warn('[NativeBridge] SplashScreen hide warning:', err);
    }

    // 3. Network Monitoring
    try {
      const Network = this.getCapacitorPlugin('Network');
      if (Network && typeof Network.addListener === 'function') {
        Network.addListener('networkStatusChange', (status: any) => {
          const formatted: NativeNetworkStatus = {
            connected: Boolean(status.connected),
            connectionType: status.connectionType || 'unknown',
          };
          console.log('[NativeBridge] Network status changed:', formatted);
          this.networkListeners.forEach((fn) => fn(formatted));
        });
      }
    } catch (err) {
      console.warn('[NativeBridge] Network listener warning:', err);
    }

    // 4. App Lifecycle
    try {
      const App = this.getCapacitorPlugin('App');
      if (App && typeof App.addListener === 'function') {
        App.addListener('appStateChange', ({ isActive }: { isActive: boolean }) => {
          console.log(`[NativeBridge] App state changed: ${isActive ? 'FOREGROUND' : 'BACKGROUND'}`);
          if (isActive) {
            // Wake up or ping MQTT watchdog if connection went stale during sleep
            window.dispatchEvent(new CustomEvent('panorama:app_resumed'));
          } else {
            window.dispatchEvent(new CustomEvent('panorama:app_paused'));
          }
        });

        // 4b. Hardware Back Button Listener (Single registration)
        App.addListener('backButton', () => {
          console.log('[NativeBridge] Android hardware backButton pressed.');
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('panorama:hardware_back'));
          }
        });
      }
    } catch (err) {
      console.warn('[NativeBridge] App lifecycle listener warning:', err);
    }

    // 5. Initialize Notification Channels & Action Performed Listener
    await this.createNotificationChannels();

    // 6. Pre-request notification permission (Android 13+ / iOS)
    this.requestNotificationPermissions();
  }

  /**
   * Create dedicated Android notification channels:
   * - Critical Water Alerts: HIGH importance (5), audible, red light & vibration
   * - Warning Alerts: DEFAULT importance (3), vibration
   * - System Notifications: LOW importance (2)
   */
  public async createNotificationChannels(): Promise<void> {
    if (!this.isNative) return;
    try {
      const LocalNotifications = this.getCapacitorPlugin('LocalNotifications');
      if (!LocalNotifications || typeof LocalNotifications.createChannel !== 'function') return;

      // 1. Critical Water Alerts (HIGH importance)
      await LocalNotifications.createChannel({
        id: 'critical-water-alerts',
        name: 'Critical Water Alerts',
        description: 'Audible emergency alerts for critical low water levels and overflows',
        importance: 5, // NotificationManager.IMPORTANCE_HIGH
        visibility: 1, // NotificationCompat.VISIBILITY_PUBLIC
        sound: 'beep.wav',
        vibration: true,
        lights: true,
        lightColor: '#DC2626',
      }).catch((e: any) => console.warn('[NativeBridge] Channel create error (critical):', e));

      // 2. Warning Alerts (DEFAULT importance)
      await LocalNotifications.createChannel({
        id: 'warning-alerts',
        name: 'Warning Alerts',
        description: 'Advisory notifications for low water and fleet warnings',
        importance: 3, // NotificationManager.IMPORTANCE_DEFAULT
        visibility: 1,
        vibration: true,
        lights: false,
      }).catch((e: any) => console.warn('[NativeBridge] Channel create error (warning):', e));

      // 3. System Notifications (LOW importance)
      await LocalNotifications.createChannel({
        id: 'system-notifications',
        name: 'System Notifications',
        description: 'Background status, sync updates and network state changes',
        importance: 2, // NotificationManager.IMPORTANCE_LOW
        visibility: 0,
        vibration: false,
        lights: false,
      }).catch((e: any) => console.warn('[NativeBridge] Channel create error (system):', e));

      // Register notification tap/action listener to open app & navigate to relevant alert
      if (typeof LocalNotifications.addListener === 'function') {
        LocalNotifications.addListener('localNotificationActionPerformed', (action: any) => {
          console.log('[NativeBridge] Notification clicked:', action);
          const extra = action?.notification?.extra || {};
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('panorama:notification_clicked', { detail: extra }));
          }
        });
      }

      console.log('[NativeBridge] Android notification channels and tap listener registered.');
    } catch (err) {
      console.warn('[NativeBridge] Error creating notification channels:', err);
    }
  }

  /**
   * Request local notification permission on Android 13+ / iOS
   */
  public async requestNotificationPermissions(): Promise<boolean> {
    if (!this.isNative) return false;
    try {
      const LocalNotifications = this.getCapacitorPlugin('LocalNotifications');
      if (!LocalNotifications) return false;

      const status = await LocalNotifications.checkPermissions();
      if (status.display === 'granted') {
        this.notificationPermissionGranted = true;
        return true;
      }
      if (status.display === 'denied') {
        // Do not repeatedly prompt if user already denied permission
        return false;
      }
      const req = await LocalNotifications.requestPermissions();
      this.notificationPermissionGranted = req.display === 'granted';
      return this.notificationPermissionGranted;
    } catch (err) {
      console.warn('[NativeBridge] Notification permission request error:', err);
      return false;
    }
  }

  private lastNotificationTime: number = 0;

  /**
   * Deterministic 32-bit positive integer hash for notification IDs.
   * Updates existing notification in Android shade rather than spawning duplicates.
   */
  public getDeterministicNotificationId(key: string): number {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = (hash << 5) - hash + key.charCodeAt(i);
      hash |= 0;
    }
    return (Math.abs(hash) % 900000) + 10000;
  }

  /**
   * Schedule a high-priority native notification for critical SCADA alarms.
   * Conforms strictly to mobile notification appearance & channels.
   */
  public async scheduleAlarmNotification(options: {
    id?: number;
    alertKey?: string;
    title: string;
    body: string;
    channelId?: 'critical-water-alerts' | 'warning-alerts' | 'system-notifications';
    severity?: 'CRITICAL' | 'WARNING' | 'NORMAL';
    trainNumber?: string;
    coachNumber?: string;
    tankName?: string;
    tankId?: string;
    levelPercent?: number | null;
    threshold?: number;
  }): Promise<void> {
    if (!this.isNative) return;

    try {
      const LocalNotifications = this.getCapacitorPlugin('LocalNotifications');
      if (!LocalNotifications) return;

      const isCrit = options.severity === 'CRITICAL';
      const channelId = options.channelId || (isCrit ? 'critical-water-alerts' : 'warning-alerts');

      // Title formatting per specification: CRITICAL LOW WATER - <COACH>
      let formattedTitle = options.title;
      if (isCrit) {
        const coachLabel = (options.coachNumber || 'COACH').toUpperCase();
        formattedTitle = options.title.startsWith('CRITICAL LOW WATER')
          ? options.title
          : `CRITICAL LOW WATER - ${coachLabel}`;
      }

      // Body formatting per specification: Water level: X.X% | Below critical threshold: Y%
      let formattedBody = options.body;
      if (isCrit && options.levelPercent !== null && options.levelPercent !== undefined) {
        const pct = options.levelPercent.toFixed(1);
        const thresh = options.threshold ?? 10;
        formattedBody = `Water level: ${pct}% | Below critical threshold: ${thresh}%`;
        const extraDetails: string[] = [];
        if (options.trainNumber) extraDetails.push(`Train: ${options.trainNumber}`);
        if (options.coachNumber) extraDetails.push(`Coach: ${options.coachNumber}`);
        if (options.tankName) extraDetails.push(`Tank: ${options.tankName}`);
        if (extraDetails.length > 0) {
          formattedBody += `\n${extraDetails.join(' | ')}`;
        }
      }

      // Deterministic notification ID by alertKey/tankId to prevent duplicate cards
      const notifId = options.id ?? this.getDeterministicNotificationId(options.alertKey || options.tankId || formattedTitle);

      await LocalNotifications.schedule({
        notifications: [
          {
            id: notifId,
            title: formattedTitle,
            body: formattedBody,
            channelId,
            schedule: { at: new Date(Date.now() + 50) },
            sound: 'beep.wav',
            smallIcon: 'ic_stat_panorama',
            iconColor: isCrit ? '#DC2626' : '#2563EB',
            autoCancel: true,
            group: 'panorama_water_alerts',
            groupSummary: false,
            extra: {
              alertKey: options.alertKey,
              trainNumber: options.trainNumber,
              coachNumber: options.coachNumber,
              tankName: options.tankName,
              tankId: options.tankId,
              severity: options.severity || (isCrit ? 'CRITICAL' : 'WARNING'),
              screen: 'alerts',
            },
          },
        ],
      });
      console.log(`[NativeBridge] Native notification scheduled (#${notifId}, channel: ${channelId}):`, formattedTitle);
    } catch (err) {
      console.warn('[NativeBridge] Failed to schedule notification:', err);
    }
  }

  /**
   * Cancel / dismiss an active notification from the Android shade by alertKey
   */
  public async cancelAlarmNotification(alertKey: string): Promise<void> {
    if (!this.isNative) return;
    try {
      const LocalNotifications = this.getCapacitorPlugin('LocalNotifications');
      if (!LocalNotifications) return;

      const notifId = this.getDeterministicNotificationId(alertKey);
      await LocalNotifications.cancel({ notifications: [{ id: notifId }] });
      console.log(`[NativeBridge] Dismissed notification #${notifId} for key: ${alertKey}`);
    } catch (err) {
      console.warn('[NativeBridge] Failed to cancel notification:', err);
    }
  }

  public onNetworkChange(listener: NetworkStatusListener): () => void {
    this.networkListeners.add(listener);
    return () => {
      this.networkListeners.delete(listener);
    };
  }
}

export const nativeBridge = NativeBridge.getInstance();

/**
 * Reliable Capacitor Android platform detector.
 * Returns true ONLY when running inside native Android Capacitor app.
 * Returns false on desktop browsers, mobile Chrome/Safari, iOS, and electron.
 */
export function isAndroidCapacitorApp(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const cap = (window as any).Capacitor;
    if (cap) {
      const isNative = typeof cap.isNativePlatform === 'function' ? cap.isNativePlatform() : false;
      const platform = typeof cap.getPlatform === 'function' ? cap.getPlatform() : (cap.platform || '');
      if (isNative && platform === 'android') return true;
    }
    if (window.location && window.location.protocol === 'capacitor:' && navigator.userAgent.includes('Android')) {
      return true;
    }
    if ((window as any).__PANORAMA_FORCE_CAPACITOR_ANDROID__) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Reliable Capacitor native platform detector.
 * Returns true ONLY when running inside native Android or iOS Capacitor wrapper.
 * Returns false on standard desktop browsers, mobile Chrome, and Safari.
 */
export function isNativeCapacitorApp(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const cap = (window as any).Capacitor;
    if (cap) {
      if (typeof cap.isNativePlatform === 'function') {
        const isNative = cap.isNativePlatform();
        if (typeof isNative === 'boolean') return isNative;
      }
      if (typeof cap.getPlatform === 'function') {
        const platform = cap.getPlatform();
        if (platform === 'android' || platform === 'ios') return true;
        if (platform === 'web') return false;
      }
      if (cap.platform === 'android' || cap.platform === 'ios') return true;
    }
    if (window.location && window.location.protocol === 'capacitor:') {
      return true;
    }
    return nativeBridge.isNativeApp();
  } catch {
    return false;
  }
}


