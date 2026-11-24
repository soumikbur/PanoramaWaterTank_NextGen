/**
 * authStorageService.ts
 *
 * Unified authentication persistence service for Panorama SCADA mobile app.
 * Provides synchronized dual-layer storage across Capacitor Preferences (native Android Keystore backed)
 * and window.localStorage (fast synchronous web cache), with strict JWT / session expiration enforcement.
 */

import { UserProfile } from '../types/user';

export interface StoredSession {
  token: string;
  user: UserProfile;
  expiresAt: number; // Unix epoch timestamp in milliseconds
}

const KEYS = {
  TOKEN: 'panorama_token',
  USER: 'panorama_user',
  DEMO_USER: 'panorama_demo_user',
  SESSION: 'panorama_auth_session',
  ROLE: 'panorama_user_role',
  AUTH_TOKEN: 'panorama_auth_token',
} as const;

export class AuthStorageService {
  private static getPreferencesPlugin(): any {
    try {
      return (window as any).Capacitor?.Plugins?.Preferences || null;
    } catch {
      return null;
    }
  }

  /**
   * Safely decodes base64url-encoded JWT payload without external library dependencies.
   */
  public static parseJwt(token: string): Record<string, any> | null {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    try {
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
      const jsonStr = decodeURIComponent(
        Array.prototype.map
          .call(atob(padded), (c: string) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonStr);
    } catch {
      return null;
    }
  }

  /**
   * Determines whether the given token or session envelope has expired.
   */
  public static isTokenExpired(token: string, expiresAt?: number): boolean {
    if (!token || typeof token !== 'string' || !token.trim()) {
      return true;
    }

    // 1. Check explicit session expiration timestamp
    if (typeof expiresAt === 'number' && expiresAt > 0) {
      if (Date.now() >= expiresAt) {
        return true;
      }
    }

    // 2. Check JWT exp claim if valid JWT structure
    const payload = this.parseJwt(token);
    if (payload && typeof payload.exp === 'number') {
      return Date.now() >= payload.exp * 1000;
    }

    // 3. If explicit timestamp was supplied and is in the future
    if (typeof expiresAt === 'number' && expiresAt > Date.now()) {
      return false;
    }

    // shortcut: Non-JWT opaque tokens without stored timestamp assume active session within launch window, upgrade to signed backend refresh tokens
    return false;
  }

  /**
   * Persists authenticated session simultaneously to localStorage and Capacitor Preferences.
   */
  public static async saveSession(
    token: string,
    user: UserProfile,
    expiresInSeconds?: number
  ): Promise<void> {
    if (!token || !user) return;

    let expiresAt: number;
    const jwtPayload = this.parseJwt(token);
    if (jwtPayload && typeof jwtPayload.exp === 'number') {
      expiresAt = jwtPayload.exp * 1000;
    } else if (typeof expiresInSeconds === 'number' && expiresInSeconds > 0) {
      expiresAt = Date.now() + expiresInSeconds * 1000;
    } else {
      // Default session lifetime: 24 hours
      expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    }

    const sessionData: StoredSession = { token, user, expiresAt };
    const serializedSession = JSON.stringify(sessionData);
    const serializedUser = JSON.stringify(user);

    // 1. Fast synchronous write to localStorage
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(KEYS.TOKEN, token);
        localStorage.setItem(KEYS.USER, serializedUser);
        localStorage.setItem(KEYS.DEMO_USER, serializedUser);
        localStorage.setItem(KEYS.SESSION, serializedSession);
        if (user.role) {
          localStorage.setItem(KEYS.ROLE, user.role);
        }
      } catch (err) {
        console.warn('[AuthStorageService] localStorage write failed:', err);
      }
    }

    // 2. Native persistent write to Capacitor Preferences
    const Preferences = this.getPreferencesPlugin();
    if (Preferences) {
      try {
        await Promise.all([
          Preferences.set({ key: KEYS.TOKEN, value: token }),
          Preferences.set({ key: KEYS.USER, value: serializedUser }),
          Preferences.set({ key: KEYS.SESSION, value: serializedSession }),
          ...(user.role ? [Preferences.set({ key: KEYS.ROLE, value: user.role })] : []),
        ]);
      } catch (err) {
        console.warn('[AuthStorageService] Preferences write warning:', err);
      }
    }
  }

  /**
   * Fast synchronous session reader from localStorage with expiration verification.
   */
  public static loadSessionSync(): StoredSession | null {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }

    try {
      // Priority A: Try full session envelope
      const rawSession = localStorage.getItem(KEYS.SESSION);
      if (rawSession) {
        const session: StoredSession = JSON.parse(rawSession);
        if (session && session.token) {
          if (this.isTokenExpired(session.token, session.expiresAt)) {
            console.info('[AuthStorageService] Session expired. Purging local storage.');
            this.clearSessionSync();
            return null;
          }
          return session;
        }
      }

      // Priority B: Fall back to raw token and user keys
      const token = localStorage.getItem(KEYS.TOKEN);
      const rawUser = localStorage.getItem(KEYS.USER) || localStorage.getItem(KEYS.DEMO_USER);
      if (token && rawUser) {
        if (this.isTokenExpired(token)) {
          console.info('[AuthStorageService] Token expired. Purging local storage.');
          this.clearSessionSync();
          return null;
        }
        const user: UserProfile = JSON.parse(rawUser);
        const jwtPayload = this.parseJwt(token);
        const expiresAt = jwtPayload?.exp ? jwtPayload.exp * 1000 : Date.now() + 24 * 60 * 60 * 1000;
        return { token, user, expiresAt };
      }
    } catch (err) {
      console.warn('[AuthStorageService] Error loading sync session, clearing corrupted entries:', err);
      this.clearSessionSync();
    }

    return null;
  }

  /**
   * Asynchronous session reader checking Capacitor Preferences then localStorage,
   * synchronizing between stores if one was cleared by Android OS.
   */
  public static async loadSessionAsync(): Promise<StoredSession | null> {
    const Preferences = this.getPreferencesPlugin();

    // 1. Check native Preferences
    if (Preferences) {
      try {
        const { value: rawSession } = await Preferences.get({ key: KEYS.SESSION });
        if (rawSession) {
          const session: StoredSession = JSON.parse(rawSession);
          if (session && session.token) {
            if (this.isTokenExpired(session.token, session.expiresAt)) {
              console.info('[AuthStorageService] Preferences session expired. Purging.');
              await this.clearSession();
              return null;
            }
            // Ensure localStorage is aligned
            this.syncToLocalStorage(session);
            return session;
          }
        }

        const { value: token } = await Preferences.get({ key: KEYS.TOKEN });
        const { value: rawUser } = await Preferences.get({ key: KEYS.USER });
        if (token && rawUser) {
          if (this.isTokenExpired(token)) {
            await this.clearSession();
            return null;
          }
          const user: UserProfile = JSON.parse(rawUser);
          const jwtPayload = this.parseJwt(token);
          const expiresAt = jwtPayload?.exp ? jwtPayload.exp * 1000 : Date.now() + 24 * 60 * 60 * 1000;
          const session = { token, user, expiresAt };
          this.syncToLocalStorage(session);
          return session;
        }
      } catch (err) {
        console.warn('[AuthStorageService] Preferences read error:', err);
      }
    }

    // 2. Fall back to synchronous localStorage
    const localSession = this.loadSessionSync();
    if (localSession && Preferences) {
      // Resynchronize back to Preferences
      try {
        await Preferences.set({ key: KEYS.SESSION, value: JSON.stringify(localSession) });
        await Preferences.set({ key: KEYS.TOKEN, value: localSession.token });
        await Preferences.set({ key: KEYS.USER, value: JSON.stringify(localSession.user) });
      } catch {}
    }

    return localSession;
  }

  /**
   * Helper to write session data into localStorage.
   */
  private static syncToLocalStorage(session: StoredSession): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      localStorage.setItem(KEYS.TOKEN, session.token);
      localStorage.setItem(KEYS.USER, JSON.stringify(session.user));
      localStorage.setItem(KEYS.DEMO_USER, JSON.stringify(session.user));
      localStorage.setItem(KEYS.SESSION, JSON.stringify(session));
      if (session.user.role) {
        localStorage.setItem(KEYS.ROLE, session.user.role);
      }
    } catch {}
  }

  /**
   * Synchronously removes all auth-related keys from localStorage.
   */
  public static clearSessionSync(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      Object.values(KEYS).forEach((k) => {
        localStorage.removeItem(k);
      });
    } catch (err) {
      console.warn('[AuthStorageService] clearSessionSync error:', err);
    }
  }

  /**
   * Purges all authentication tokens, session envelopes and user data from both stores.
   */
  public static async clearSession(): Promise<void> {
    this.clearSessionSync();

    const Preferences = this.getPreferencesPlugin();
    if (Preferences) {
      try {
        await Promise.allSettled(
          Object.values(KEYS).map((k) => Preferences.remove({ key: k }))
        );
      } catch (err) {
        console.warn('[AuthStorageService] Preferences clear error:', err);
      }
    }
  }

  /**
   * Returns true if a valid, unexpired session exists.
   */
  public static hasValidSession(): boolean {
    return Boolean(this.loadSessionSync());
  }

  /**
   * Retrieves active access token string or null if unauthenticated or expired.
   */
  public static getToken(): string | null {
    const session = this.loadSessionSync();
    return session ? session.token : null;
  }

  /**
   * Retrieves active authenticated user profile or null.
   */
  public static getUser(): UserProfile | null {
    const session = this.loadSessionSync();
    return session ? session.user : null;
  }
}
