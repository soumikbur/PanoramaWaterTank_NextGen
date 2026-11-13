/**
 * browserNotificationBridge.ts
 *
 * Cross-platform Web Notifications API + Service Worker bridge for
 * Desktop browsers and Mobile browsers (including Android Chrome).
 */

import { NOTIFICATION_CONFIG } from '../config/notificationConfig';
import { nativeBridge } from './nativeBridge';

export type BrowserNotificationPermission = 'granted' | 'denied' | 'default' | 'unsupported';

export interface NotificationNavigationData {
  screen: 'alerts' | 'watertank' | 'coach-details';
  trainNumber?: string;
  coachNumber?: string;
  tankId?: string;
  alertId?: string;
  url: string;
}

export interface BrowserNotificationPayload {
  title: string;
  body: string;
  tag: string;
  severity: 'CRITICAL' | 'WARNING' | 'NORMAL';
  renotify?: boolean;
  requireInteraction?: boolean;
  data: NotificationNavigationData;
}

type PermissionListener = (perm: BrowserNotificationPermission) => void;
type ClickListener = (data: NotificationNavigationData) => void;

class BrowserNotificationBridge {
  private swRegistration: ServiceWorkerRegistration | null = null;
  private swRegisterPromise: Promise<ServiceWorkerRegistration | null> | null = null;
  private permissionListeners = new Set<PermissionListener>();
  private clickListeners = new Set<ClickListener>();
  private swMessageBound = false;

  public isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  public getPermission(): BrowserNotificationPermission {
    if (!this.isSupported()) return 'unsupported';
    try {
      return window.Notification.permission as BrowserNotificationPermission;
    } catch {
      return 'unsupported';
    }
  }

  public onPermissionChange(listener: PermissionListener): () => void {
    this.permissionListeners.add(listener);
    return () => {
      this.permissionListeners.delete(listener);
    };
  }

  public onNotificationClick(listener: ClickListener): () => void {
    this.clickListeners.add(listener);
    return () => {
      this.clickListeners.delete(listener);
    };
  }

  private emitPermissionChange(perm: BrowserNotificationPermission) {
    this.permissionListeners.forEach((fn) => {
      try {
        fn(perm);
      } catch (err) {
        console.error('[BrowserNotification] Permission listener error:', err);
      }
    });
  }

  public emitClick(data: NotificationNavigationData) {
    this.clickListeners.forEach((fn) => {
      try {
        fn(data);
      } catch (err) {
        console.error('[BrowserNotification] Click listener error:', err);
      }
    });
  }

  public async registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (
      typeof navigator === 'undefined' ||
      !('serviceWorker' in navigator) ||
      !navigator.serviceWorker ||
      typeof navigator.serviceWorker.addEventListener !== 'function'
    ) {
      return null;
    }

    if (!this.swMessageBound) {
      this.swMessageBound = true;
      navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
        const msg = event.data;
        if (msg && msg.type === 'PANORAMA_NOTIFICATION_CLICK' && msg.data) {
          this.emitClick(msg.data as NotificationNavigationData);
        }
      });
    }

    if (this.swRegistration) return this.swRegistration;
    if (this.swRegisterPromise) return this.swRegisterPromise;

    this.swRegisterPromise = navigator.serviceWorker
      .register(NOTIFICATION_CONFIG.SERVICE_WORKER_PATH)
      .then(async (reg) => {
        this.swRegistration = reg;
        try {
          const ready = await navigator.serviceWorker.ready;
          this.swRegistration = ready || reg;
        } catch {
          // Keep initial registration if ready settles later
        }
        return this.swRegistration;
      })
      .catch((err) => {
        console.warn('[BrowserNotification] Service Worker registration skipped/failed:', err);
        this.swRegisterPromise = null;
        return null;
      });

    return this.swRegisterPromise;
  }

  public async requestPermission(): Promise<BrowserNotificationPermission> {
    if (nativeBridge.isNativeApp()) {
      const granted = await nativeBridge.requestNotificationPermissions();
      const perm: BrowserNotificationPermission = granted ? 'granted' : 'denied';
      this.emitPermissionChange(perm);
      return perm;
    }

    if (!this.isSupported()) {
      this.emitPermissionChange('unsupported');
      return 'unsupported';
    }

    try {
      const current = this.getPermission();
      if (current === 'granted') {
        await this.registerServiceWorker();
        this.emitPermissionChange('granted');
        return 'granted';
      }

      const result = (await window.Notification.requestPermission()) as BrowserNotificationPermission;
      this.emitPermissionChange(result);
      if (result === 'granted') {
        await this.registerServiceWorker();
      }
      return result;
    } catch (err) {
      console.warn('[BrowserNotification] Permission request failed:', err);
      const perm = this.getPermission();
      this.emitPermissionChange(perm);
      return perm;
    }
  }

  public async showNotification(payload: BrowserNotificationPayload): Promise<boolean> {
    if (nativeBridge.isNativeApp()) {
      void nativeBridge.scheduleAlarmNotification({
        title: payload.title,
        body: payload.body,
      });
      return true;
    }

    if (!this.isSupported()) return false;
    const perm = this.getPermission();
    if (perm !== 'granted') {
      this.emitPermissionChange(perm);
      return false;
    }

    const options: NotificationOptions & { renotify?: boolean; vibrate?: number[] } = {
      body: payload.body,
      tag: payload.tag,
      renotify: payload.renotify ?? true,
      requireInteraction: payload.requireInteraction ?? payload.severity === 'CRITICAL',
      data: payload.data,
      vibrate: payload.severity === 'CRITICAL' ? [250, 100, 250] : [150],
    };

    // Prefer ServiceWorkerRegistration.showNotification (required on Android Chrome, works on desktop background tabs)
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        const reg = this.swRegistration || (await this.registerServiceWorker());
        if (reg && typeof reg.showNotification === 'function') {
          await reg.showNotification(payload.title, options);
          return true;
        }
      } catch (swErr) {
        console.warn('[BrowserNotification] SW showNotification fallback to Notification constructor:', swErr);
      }
    }

    // Desktop fallback when SW is not active
    try {
      const notif = new window.Notification(payload.title, options);
      notif.onclick = () => {
        try {
          if (typeof window.focus === 'function') window.focus();
        } catch {
          // ignore
        }
        this.emitClick(payload.data);
        try {
          notif.close();
        } catch {
          // ignore
        }
      };
      return true;
    } catch (err) {
      console.warn('[BrowserNotification] Native Notification dispatch failed:', err);
      return false;
    }
  }
}

export const browserNotificationBridge = new BrowserNotificationBridge();
export default browserNotificationBridge;
