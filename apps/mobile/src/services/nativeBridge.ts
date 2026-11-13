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
        await StatusBar.setStyle({ style: 'DARK' }).catch(() => {});
        await StatusBar.setBackgroundColor({ color: '#FFFFFF' }).catch(() => {});
        await StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
        console.log('[NativeBridge] StatusBar configured.');
      }
    } catch (err) {
      console.warn('[NativeBridge] StatusBar config warning:', err);
    }

    // 2. Hide Splash Screen smoothly after DOM hydration
    try {
      const SplashScreen = this.getCapacitorPlugin('SplashScreen');
      if (SplashScreen) {
        setTimeout(async () => {
          await SplashScreen.hide({ fadeOutDuration: 400 }).catch(() => {});
          console.log('[NativeBridge] SplashScreen hidden.');
        }, 500);
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
      }
    } catch (err) {
      console.warn('[NativeBridge] App lifecycle listener warning:', err);
    }

    // 5. Pre-request notification permission
    this.requestNotificationPermissions();
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
      const req = await LocalNotifications.requestPermissions();
      this.notificationPermissionGranted = req.display === 'granted';
      return this.notificationPermissionGranted;
    } catch (err) {
      console.warn('[NativeBridge] Notification permission request error:', err);
      return false;
    }
  }

  /**
   * Schedule a high-priority native notification for critical SCADA alarms (e.g. Tank < 10%)
   */
  public async scheduleAlarmNotification(options: {
    id?: number;
    title: string;
    body: string;
    channelId?: string;
  }): Promise<void> {
    if (!this.isNative) return;
    try {
      const LocalNotifications = this.getCapacitorPlugin('LocalNotifications');
      if (!LocalNotifications) return;

      const notifId = options.id || Math.floor(Date.now() % 10000000);
      await LocalNotifications.schedule({
        notifications: [
          {
            id: notifId,
            title: options.title,
            body: options.body,
            schedule: { at: new Date(Date.now() + 100) },
            sound: 'beep.wav',
            smallIcon: 'ic_stat_panorama',
            iconColor: '#2563EB',
            extra: {
              source: 'panorama_alarm',
            },
          },
        ],
      });
      console.log(`[NativeBridge] Native notification scheduled (#${notifId}):`, options.title);
    } catch (err) {
      console.warn('[NativeBridge] Failed to schedule notification:', err);
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


