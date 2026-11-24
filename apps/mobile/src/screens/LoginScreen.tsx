import React, { useState } from 'react';
import { colors, typography, radii } from '../theme';
import { useApp } from '../state/AppContext';
import { AuthLayout } from '../components/auth/AuthLayout';
import { Lock, User, Shield, Eye, EyeOff, AlertCircle, ArrowRight, KeyRound } from 'lucide-react';
import panoramaLogoIcon from '../assets/panorama_logo_icon.png';
import { ApiClient } from '../api/client';
import { RegisterScreen } from './RegisterScreen';

interface QuickTestLoginProps {
  loading: boolean;
  onLogin: (username: string, password: string) => void;
}

// Feature flag: Only instantiate and compile quick test login when VITE_ENABLE_TEST_LOGIN is set to true
const QuickTestLoginSection: React.FC<QuickTestLoginProps> | null =
  process.env.VITE_ENABLE_TEST_LOGIN === 'true'
    ? ({ loading, onLogin }) => (
        <div id="quick-test-login-section" className="login-quick-test">
          <div className="login-quick-test-header">
            <span className="login-quick-test-label">QUICK TEST LOGIN</span>
            <span className="login-quick-test-badge">DEV</span>
          </div>

          <div className="login-quick-test-grid">
            {/* Admin Quick Login */}
            <button
              type="button"
              id="btn-quick-login-admin"
              disabled={loading}
              onClick={() => onLogin('@admin', 'Admin@123')}
              className="login-quick-btn"
              title="Authenticate immediately with administrator privileges"
            >
              <Shield size={13} color="#4F46E5" />
              <span>Login as Admin</span>
            </button>

            {/* Employee Quick Login */}
            <button
              type="button"
              id="btn-quick-login-employee"
              disabled={loading}
              onClick={() => onLogin('@employee', 'Employee@123')}
              className="login-quick-btn login-quick-btn-emp"
              title="Authenticate immediately with technician privileges"
            >
              <User size={13} color="#475569" />
              <span>Login as Employee</span>
            </button>
          </div>
        </div>
      )
    : null;

export const LoginScreen: React.FC = () => {
  const { login, setActiveScreen, currentUser } = useApp();
  const [authMode, setAuthMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Forced temporary password change modal state
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changeError, setChangeError] = useState<string | null>(null);
  const [changeLoading, setChangeLoading] = useState(false);

  if (authMode === 'REGISTER') {
    return <RegisterScreen onBackToLogin={() => setAuthMode('LOGIN')} />;
  }

  const handleQuickLogin = async (quickUser: string, quickPass: string) => {
    setUsername(quickUser);
    setPassword(quickPass);
    setErrorMessage(null);
    try {
      setLoading(true);
      await login(quickUser, quickPass);
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setErrorMessage('Please enter both username and password.');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);
      await login(username.trim(), password);
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateTemporaryPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword.trim()) {
      setChangeError('New password is required.');
      return;
    }
    if (newPassword.length < 6) {
      setChangeError('Password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setChangeError('Passwords do not match.');
      return;
    }

    try {
      setChangeLoading(true);
      setChangeError(null);
      await ApiClient.changePassword(newPassword.trim());
      setMustChangePassword(false);
      setActiveScreen('dashboard');
    } catch (err: any) {
      setChangeError(err.message || 'Failed to update password.');
    } finally {
      setChangeLoading(false);
    }
  };

  return (
    <AuthLayout>
      {/* Brand Header */}
      <div className="login-branding">
        <div className="login-logo-container">
          <img
            src={panoramaLogoIcon}
            alt="Panorama Logo"
            className="login-logo-img"
          />
        </div>
        <div className="login-branding-text">
          <h1 className="login-title">
            Panorama Water Tank Monitor
          </h1>
          <p className="login-subtitle">
            NextGen Railway SCADA / HMI Telematics Portal
          </p>
        </div>
      </div>

      {/* Main Authentication Card */}
      <div className="login-card auth-card-entrance">
        <div className="login-card-header">
          <h2 className="login-card-title">
            SYSTEM AUTHENTICATION
          </h2>
          <p className="login-card-subtitle">
            Enter your authorized railway credentials to access the console.
          </p>
        </div>

        {/* Error Banner */}
        {errorMessage && (
          <div
            id="login-error-banner"
            className="auth-error-enter login-error-banner"
          >
            <AlertCircle size={15} style={{ flexShrink: 0 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          {/* Username Field */}
          <div className="login-field">
            <label htmlFor="login-username" className="login-label">
              Username
            </label>
            <div className="login-input-wrapper">
              <span className="login-input-icon">
                <User size={17} />
              </span>
              <input
                id="login-username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username (e.g. @admin or @employee)"
                className="login-input"
              />
            </div>
          </div>

          {/* Password Field */}
          <div className="login-field">
            <label htmlFor="login-password" className="login-label">
              Password
            </label>
            <div className="login-input-wrapper">
              <span className="login-input-icon">
                <Lock size={17} />
              </span>
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="login-input"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                title={showPassword ? 'Hide password' : 'Show password'}
                className="login-password-toggle"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* QUICK TEST LOGIN SECTION (Controlled by VITE_ENABLE_TEST_LOGIN) */}
          {QuickTestLoginSection && (
            <QuickTestLoginSection loading={loading} onLogin={handleQuickLogin} />
          )}

          {/* Submit Button */}
          <button
            type="submit"
            id="btn-login-submit"
            disabled={loading}
            className="login-submit-btn"
          >
            <span>{loading ? 'Authenticating...' : 'Sign In to Console'}</span>
            {!loading && <ArrowRight size={16} />}
          </button>

          {/* New Employee Registration Switch */}
          <div className="login-register-prompt">
            New Employee?{' '}
            <button
              type="button"
              id="btn-switch-to-register"
              onClick={() => { setErrorMessage(null); setAuthMode('REGISTER'); }}
              className="login-register-link"
            >
              Register Here
            </button>
          </div>
        </form>
      </div>

      {/* Footer System Info */}
      <footer className="login-footer">
        Panorama SCADA System v2.0.0 &bull; Eastern Railway Division &bull; Strictly Authorized Access
      </footer>

      {/* Mandatory Temporary Password Update Modal */}
      {mustChangePassword && (
        <div
          className="modal-backdrop"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '440px',
              backgroundColor: '#FFFFFF',
              borderRadius: radii.md,
              boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
              padding: '28px',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  backgroundColor: '#EFF6FF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: colors.primary,
                }}
              >
                <KeyRound size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: colors.textPrimary }}>
                  Password Change Required
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: colors.textMuted }}>
                  A temporary password was issued for your account. Please set a new password to proceed.
                </p>
              </div>
            </div>

            {changeError && (
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  backgroundColor: colors.criticalSurface,
                  color: colors.critical,
                  fontSize: '12px',
                  marginBottom: '14px',
                }}
              >
                {changeError}
              </div>
            )}

            <form onSubmit={handleUpdateTemporaryPassword} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '4px' }}>
                  New Permanent Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  required
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 12px',
                    borderRadius: radii.sm,
                    border: `1px solid ${colors.borderStrong}`,
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '4px' }}>
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-type new password"
                  required
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 12px',
                    borderRadius: radii.sm,
                    border: `1px solid ${colors.borderStrong}`,
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={changeLoading}
                style={{
                  marginTop: '6px',
                  height: '40px',
                  backgroundColor: colors.primary,
                  color: '#FFFFFF',
                  borderRadius: radii.sm,
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: changeLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {changeLoading ? 'Updating Password...' : 'Save Password & Enter Console'}
              </button>
            </form>
          </div>
        </div>
      )}
    </AuthLayout>
  );
};
