/**
 * adaptiveUiService.ts
 *
 * Device-Adaptive UI Scaling and Display-Layout Engine for Capacitor Android.
 * Evaluates logical viewport dimensions, device pixel ratio (DPR), physical resolution,
 * aspect ratio, and safe-area insets.
 *
 * Scopes all changes exclusively to Capacitor Android via:
 * document.documentElement.setAttribute('data-platform', 'capacitor-android')
 * document.documentElement.setAttribute('data-android-device', category)
 *
 * Standard desktop browsers and web users are 100% unaffected.
 */

import { isAndroidCapacitorApp } from './nativeBridge';

export type AndroidDeviceCategory = 'compact' | 'standard' | 'large' | 'xlarge' | 'tablet';
export type AndroidOrientation = 'portrait' | 'landscape';

export interface AndroidDeviceMetrics {
  logicalWidth: number;
  logicalHeight: number;
  dpr: number;
  physicalWidth: number;
  physicalHeight: number;
  aspectRatio: number;
  category: AndroidDeviceCategory;
  orientation: AndroidOrientation;
  isAndroidCapacitor: boolean;
}

export type MetricsListener = (metrics: AndroidDeviceMetrics) => void;

class AdaptiveUiService {
  private static instance: AdaptiveUiService;
  private currentMetrics: AndroidDeviceMetrics | null = null;
  private listeners: Set<MetricsListener> = new Set();
  private resizeTimer: any = null;
  private initialized: boolean = false;

  private constructor() {}

  public static getInstance(): AdaptiveUiService {
    if (!AdaptiveUiService.instance) {
      AdaptiveUiService.instance = new AdaptiveUiService();
    }
    return AdaptiveUiService.instance;
  }

  /**
   * Determine device category from logical CSS width
   * - Compact: < 360px (e.g. 320px)
   * - Standard: 360px - 389px (e.g. 360px, 375px)
   * - Large: 390px - 429px (e.g. 390px, 412px)
   * - Extra-Large: 430px - 599px (e.g. 480px on 720p/1.5x AVD)
   * - Tablet: >= 600px (e.g. 768px, 800px)
   */
  public determineCategory(width: number): AndroidDeviceCategory {
    if (width < 360) return 'compact';
    if (width < 390) return 'standard';
    if (width < 430) return 'large';
    if (width < 600) return 'xlarge';
    return 'tablet';
  }

  /**
   * Compute comprehensive metrics for the current window environment
   */
  public computeMetrics(): AndroidDeviceMetrics {
    const isAndroid = isAndroidCapacitorApp();
    if (typeof window === 'undefined') {
      return {
        logicalWidth: 1024,
        logicalHeight: 768,
        dpr: 1,
        physicalWidth: 1024,
        physicalHeight: 768,
        aspectRatio: 1.33,
        category: 'tablet',
        orientation: 'landscape',
        isAndroidCapacitor: false,
      };
    }

    const logicalWidth = window.innerWidth || document.documentElement.clientWidth || 360;
    const logicalHeight = window.innerHeight || document.documentElement.clientHeight || 640;
    const dpr = typeof window.devicePixelRatio === 'number' && window.devicePixelRatio > 0
      ? window.devicePixelRatio
      : 1;

    const physicalWidth = Math.round(logicalWidth * dpr);
    const physicalHeight = Math.round(logicalHeight * dpr);
    const aspectRatio = Number((logicalHeight / (logicalWidth || 1)).toFixed(2));
    const category = this.determineCategory(logicalWidth);
    const orientation: AndroidOrientation = logicalWidth > logicalHeight ? 'landscape' : 'portrait';

    return {
      logicalWidth,
      logicalHeight,
      dpr,
      physicalWidth,
      physicalHeight,
      aspectRatio,
      category,
      orientation,
      isAndroidCapacitor: isAndroid,
    };
  }

  /**
   * Apply layout attributes and CSS variables to the document root
   * strictly when running inside Capacitor Android.
   */
  public applyMetrics(metrics: AndroidDeviceMetrics): void {
    if (typeof document === 'undefined') return;
    const docEl = document.documentElement;

    if (!metrics.isAndroidCapacitor) {
      // Clean up if not Android Capacitor to protect desktop web
      if (docEl.getAttribute('data-platform') === 'capacitor-android') {
        docEl.removeAttribute('data-platform');
        docEl.removeAttribute('data-android-device');
        docEl.removeAttribute('data-android-orientation');
        docEl.removeAttribute('data-android-dpr');
      }
      return;
    }

    // Tag the root element with Capacitor Android platform tokens
    docEl.setAttribute('data-platform', 'capacitor-android');
    docEl.setAttribute('data-android-device', metrics.category);
    docEl.setAttribute('data-android-orientation', metrics.orientation);
    docEl.setAttribute('data-android-dpr', metrics.dpr.toFixed(2));

    // Inject dynamic CSS custom properties
    const s = docEl.style;
    s.setProperty('--android-vw', `${metrics.logicalWidth}px`);
    s.setProperty('--android-vh', `${metrics.logicalHeight}px`);
    s.setProperty('--vh', `${metrics.logicalHeight * 0.01}px`);
    s.setProperty('--android-dpr', String(metrics.dpr));

    // Dispatch custom event for components with charts or maps
    window.dispatchEvent(
      new CustomEvent('panorama:adaptive_ui_change', {
        detail: metrics,
      })
    );
  }

  /**
   * Debounced resize handler to eliminate continuous listener overhead
   */
  private handleResize = (): void => {
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => {
      const metrics = this.computeMetrics();
      this.currentMetrics = metrics;
      this.applyMetrics(metrics);
      this.listeners.forEach((fn) => {
        try {
          fn(metrics);
        } catch (e) {
          console.warn('[AdaptiveUiService] Listener error:', e);
        }
      });
    }, 120);
  };

  /**
   * Initialize the adaptive UI scaling system
   */
  public initialize(): void {
    if (this.initialized) return;
    this.initialized = true;

    const metrics = this.computeMetrics();
    this.currentMetrics = metrics;
    this.applyMetrics(metrics);

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.handleResize, { passive: true });
      window.addEventListener('orientationchange', this.handleResize, { passive: true });
    }

    console.log('[AdaptiveUiService] Initialized:', {
      isAndroidCapacitor: metrics.isAndroidCapacitor,
      category: metrics.category,
      logicalSize: `${metrics.logicalWidth}x${metrics.logicalHeight}`,
      dpr: metrics.dpr,
      physicalSize: `${metrics.physicalWidth}x${metrics.physicalHeight}`,
    });
  }

  /**
   * Force recalculate metrics (useful for testing or manual triggers)
   */
  public forceRecalculate(): AndroidDeviceMetrics {
    const metrics = this.computeMetrics();
    this.currentMetrics = metrics;
    this.applyMetrics(metrics);
    return metrics;
  }

  public getMetrics(): AndroidDeviceMetrics {
    if (!this.currentMetrics) {
      this.currentMetrics = this.computeMetrics();
    }
    return this.currentMetrics;
  }

  public addListener(fn: MetricsListener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  public destroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.handleResize);
      window.removeEventListener('orientationchange', this.handleResize);
    }
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.listeners.clear();
    this.initialized = false;
  }
}

export const adaptiveUiService = AdaptiveUiService.getInstance();
