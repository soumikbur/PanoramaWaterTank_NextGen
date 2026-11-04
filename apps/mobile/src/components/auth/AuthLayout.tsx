/**
 * AuthLayout.tsx — Isolated Authentication Environment Layout
 *
 * Dedicated layout container for login, credential recovery, and access portals.
 * Strictly guarantees fixed default styling (scale 1.0, base font size 14px, zoom: 1),
 * preventing authentication screens from inheriting application display scaling or zoom.
 */

import React, { useEffect } from 'react';
import '../../styles/auth.css';

interface AuthLayoutProps {
  children: React.ReactNode;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({ children }) => {
  // Reset any document/body zoom or scale properties when mounting the auth environment
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.style.zoom = '';
      if (document.body) {
        document.body.style.zoom = '';
      }
      document.documentElement.style.setProperty('--app-scale', '1');
      document.documentElement.style.setProperty('--font-scale', '1');
      window.dispatchEvent(new Event('resize'));
    }

    return () => {
      // Clean up when unmounting
      if (typeof document !== 'undefined') {
        document.documentElement.style.zoom = '';
        if (document.body) {
          document.body.style.zoom = '';
        }
      }
    };
  }, []);

  return (
    <div
      id="auth-root"
      className="auth-layout"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        width: '100vw',
        padding: '32px 16px',
        boxSizing: 'border-box',
        backgroundColor: '#F5F7FB',
        overflowY: 'auto',
        overflowX: 'hidden',
        position: 'relative',
        zoom: 1,
      }}
    >
      <div className="auth-card-container">
        {children}
      </div>
    </div>
  );
};

export default AuthLayout;
