// apps/mobile/src/services/router.ts
/**
 * Lightweight URL Router for Railway SCADA HMI
 * Fully compatible with GitHub Pages, static hosting, and Electron.
 * Supports hash routes (#/screen?train=...&coach=...) and query parameters.
 */

export interface ParsedRoute {
  screen: string;
  trainNumber?: string;
  coachNumber?: string;
}

export class AppRouter {
  public static parseCurrentRoute(): ParsedRoute {
    if (typeof window === 'undefined') {
      return { screen: 'dashboard' };
    }

    // 1. Check SPA redirect query param (?p=/coach-details&train=...)
    const urlParams = new URLSearchParams(window.location.search);
    const redirectPath = urlParams.get('p');
    if (redirectPath) {
      // Clean up search param and convert to hash
      const cleanPath = redirectPath.startsWith('/') ? redirectPath.slice(1) : redirectPath;
      const [pathPart, queryPart] = cleanPath.split('?');
      const hashParams = new URLSearchParams(queryPart || '');
      const screen = pathPart || 'dashboard';
      const train = hashParams.get('train') || urlParams.get('train') || undefined;
      const coach = hashParams.get('coach') || urlParams.get('coach') || undefined;
      return {
        screen,
        trainNumber: train,
        coachNumber: coach,
      };
    }

    // 2. Check Hash Route (#/screen?train=...&coach=...)
    const hash = window.location.hash || '';
    if (hash.startsWith('#')) {
      const cleanHash = hash.startsWith('#/') ? hash.slice(2) : hash.slice(1);
      const [pathPart, queryPart] = cleanHash.split('?');
      const hashParams = new URLSearchParams(queryPart || '');

      let screen = pathPart.trim() || '';
      // Support path-like /coaches/12841/C4 or /coach-details/12841/C4
      const segments = screen.split('/').filter(Boolean);
      let trainNumber = hashParams.get('train') || urlParams.get('train') || undefined;
      let coachNumber = hashParams.get('coach') || urlParams.get('coach') || undefined;

      if (segments.length >= 1) {
        screen = segments[0];
      }
      if (segments.length >= 2 && !trainNumber) {
        trainNumber = segments[1];
      }
      if (segments.length >= 3 && !coachNumber) {
        coachNumber = segments[2];
      }

      if (screen) {
        if (screen === 'dashboard' && coachNumber) {
          screen = 'coach-details';
        } else if (screen === 'dashboard') {
          screen = 'trains';
        }
        return {
          screen,
          trainNumber,
          coachNumber,
        };
      }
    }

    // 3. Check regular search params (?screen=coach-details&train=12841&coach=C4)
    const screenParam = urlParams.get('screen');
    if (screenParam) {
      let sc = screenParam;
      const coach = urlParams.get('coach') || undefined;
      if (sc === 'dashboard' && coach) {
        sc = 'coach-details';
      } else if (sc === 'dashboard') {
        sc = 'trains';
      }
      return {
        screen: sc,
        trainNumber: urlParams.get('train') || undefined,
        coachNumber: coach,
      };
    }

    // Default to Train Management
    return { screen: 'trains' };
  }

  public static navigate(screen: string, trainNumber?: string, coachNumber?: string) {
    if (typeof window === 'undefined') return;

    let targetHash = `#/${screen}`;
    const params = new URLSearchParams();
    if (trainNumber) params.set('train', trainNumber);
    if (coachNumber) params.set('coach', coachNumber);

    const queryString = params.toString();
    if (queryString) {
      targetHash += `?${queryString}`;
    }

    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    }
  }
}
