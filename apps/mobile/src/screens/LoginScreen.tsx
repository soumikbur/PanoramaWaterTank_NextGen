import React, { useState } from 'react';
import { colors, typography, radii } from '../theme';
import { useApp } from '../state/AppContext';
import { AuthLayout } from '../components/auth/AuthLayout';
import { Droplet, Lock, User, Shield, Eye, EyeOff, AlertCircle, ArrowRight, KeyRound } from 'lucide-react';
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
        <div
          id="quick-test-login-section"
          style={{
            backgroundColor: colors.surfaceAlt,
            border: `1px solid ${colors.border}`,
            borderRadius: radii.sm,
            padding: '10px 12px',
            marginTop: '2px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: colors.textSecondary,
                letterSpacing: '0.6px',
                textTransform: 'uppercase',
              }}
            >
              QUICK TEST LOGIN
            </span>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 600,
                color: colors.primary,
                backgroundColor: colors.primarySurface,
                border: `1px solid ${colors.primaryBorder}`,
                padding: '1px 6px',
                borderRadius: radii.sm,
                letterSpacing: '0.3px',
              }}
            >
              DEV SHORTCUT
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap',
            }}
          >
            {/* Admin Quick Login */}
            <button
              type="button"
              id="btn-quick-login-admin"
              disabled={loading}
              onClick={() => onLogin('@admin', 'Admin@123')}
              style={{
                flex: '1 1 140px',
                height: '36px',
                backgroundColor: '#FFFFFF',
                border: '1px solid #C7D2FE',
                borderRadius: radii.sm,
                fontSize: '12px',
                fontWeight: 600,
                color: '#4338CA',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                boxShadow: '0 1px 2px rgba(67, 56, 202, 0.08)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.backgroundColor = '#EEF2FF';
                  e.currentTarget.style.borderColor = '#818CF8';
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.currentTarget.style.backgroundColor = '#FFFFFF';
                  e.currentTarget.style.borderColor = '#C7D2FE';
                }
              }}
            >
              <Shield size={14} color="#4F46E5" />
              <span>Login as Admin</span>
            </button>

            {/* Employee Quick Login */}
            <button
              type="button"
              id="btn-quick-login-employee"
              disabled={loading}
              onClick={() => onLogin('@employee', 'Employee@123')}
              style={{
                flex: '1 1 140px',
                height: '36px',
                backgroundColor: '#FFFFFF',
                border: `1px solid ${colors.borderStrong}`,
                borderRadius: radii.sm,
                fontSize: '12px',
                fontWeight: 600,
                color: colors.textPrimary,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                boxShadow: '0 1px 2px rgba(15, 23, 42, 0.05)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.backgroundColor = colors.surfaceAlt;
                  e.currentTarget.style.borderColor = colors.primary;
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.currentTarget.style.backgroundColor = '#FFFFFF';
                  e.currentTarget.style.borderColor = colors.borderStrong;
                }
              }}
            >
              <User size={14} color={colors.textSecondary} />
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
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginBottom: '28px',
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            backgroundColor: colors.primary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF',
            marginBottom: '12px',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
          }}
        >
          <Droplet size={26} strokeWidth={2.2} />
        </div>
        <h1
          style={{
            fontSize: '22px',
            fontWeight: 700,
            color: colors.textPrimary,
            margin: 0,
            letterSpacing: '0.2px',
            textAlign: 'center',
          }}
        >
          Panorama Water Tank Monitor
        </h1>
        <p
          style={{
            fontSize: '12px',
            color: colors.textMuted,
            margin: '4px 0 0 0',
            fontWeight: 500,
            letterSpacing: '0.4px',
            textTransform: 'uppercase',
            textAlign: 'center',
          }}
        >
          NextGen Railway SCADA / HMI Telematics Portal
        </p>
      </div>

      {/* Main Authentication Card */}
      <div
        className="auth-card-entrance"
        style={{
          width: '100%',
          maxWidth: '420px',
          backgroundColor: colors.surface,
          borderRadius: radii.md,
          border: `1px solid ${colors.border}`,
          boxShadow: '0 4px 16px rgba(15, 23, 42, 0.06)',
          padding: '32px',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ marginBottom: '20px' }}>
          <h2
            style={{
              fontSize: '16px',
              fontWeight: 700,
              color: colors.textPrimary,
              margin: '0 0 4px 0',
            }}
          >
            System Authentication
          </h2>
          <p style={{ fontSize: '12px', color: colors.textSecondary, margin: 0 }}>
            Enter your authorized railway credentials to access the console.
          </p>
        </div>

        {/* Error Banner */}
        {errorMessage && (
          <div
            id="login-error-banner"
            className="auth-error-enter"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 14px',
              backgroundColor: colors.criticalSurface,
              border: `1px solid ${colors.criticalBorder}`,
              borderRadius: radii.sm,
              marginBottom: '18px',
              color: colors.critical,
              fontSize: '12px',
              fontWeight: 500,
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Username Field */}
          <div>
            <label
              htmlFor="login-username"
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: colors.textSecondary,
                marginBottom: '6px',
              }}
            >
              Username
            </label>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                position: 'relative',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  left: '12px',
                  color: colors.textPlaceholder,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <User size={16} />
              </span>
              <input
                id="login-username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username (e.g. @admin or @employee)"
                style={{
                  width: '100%',
                  height: '40px',
                  paddingLeft: '38px',
                  paddingRight: '12px',
                  backgroundColor: '#FFFFFF',
                  border: `1px solid ${colors.borderStrong}`,
                  borderRadius: radii.sm,
                  fontSize: '13px',
                  color: colors.textPrimary,
                  outline: 'none',
                  fontFamily: typography.fontFamily,
                  boxSizing: 'border-box',
                  transition: 'border-color 0.15s ease',
                }}
                onFocus={(e) => (e.target.style.borderColor = colors.primary)}
                onBlur={(e) => (e.target.style.borderColor = colors.borderStrong)}
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
            <label
              htmlFor="login-password"
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: colors.textSecondary,
                marginBottom: '6px',
              }}
            >
              Password
            </label>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                position: 'relative',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  left: '12px',
                  color: colors.textPlaceholder,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Lock size={16} />
              </span>
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                style={{
                  width: '100%',
                  height: '40px',
                  paddingLeft: '38px',
                  paddingRight: '38px',
                  backgroundColor: '#FFFFFF',
                  border: `1px solid ${colors.borderStrong}`,
                  borderRadius: radii.sm,
                  fontSize: '13px',
                  color: colors.textPrimary,
                  outline: 'none',
                  fontFamily: typography.fontFamily,
                  boxSizing: 'border-box',
                  transition: 'border-color 0.15s ease',
                }}
                onFocus={(e) => (e.target.style.borderColor = colors.primary)}
                onBlur={(e) => (e.target.style.borderColor = colors.borderStrong)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                title={showPassword ? 'Hide password' : 'Show password'}
                style={{
                  position: 'absolute',
                  right: '10px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: colors.textMuted,
                  display: 'flex',
                  alignItems: 'center',
                  padding: '4px',
                }}
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
            disabled={loading}
            className="auth-button"
            style={{
              width: '100%',
              height: '42px',
              marginTop: '8px',
              backgroundColor: loading ? colors.primaryHover : colors.primary,
              color: '#FFFFFF',
              border: 'none',
              borderRadius: radii.sm,
              fontSize: '13px',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)',
              transition: 'background-color 0.15s ease',
            }}
          >
            <span>{loading ? 'Authenticating...' : 'Sign In to Console'}</span>
            {!loading && <ArrowRight size={16} />}
          </button>

          {/* New Employee Registration Switch */}
          <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '12px', color: colors.textSecondary }}>
            New Employee?{' '}
            <button
              type="button"
              id="btn-switch-to-register"
              onClick={() => { setErrorMessage(null); setAuthMode('REGISTER'); }}
              style={{ background: 'none', border: 'none', color: colors.primary, fontWeight: 600, cursor: 'pointer', padding: 0 }}
            >
              Register Here
            </button>
          </div>
        </form>
      </div>

      {/* Footer System Info */}
      <div
        style={{
          marginTop: '20px',
          fontSize: '11px',
          color: colors.textPlaceholder,
          textAlign: 'center',
        }}
      >
        Panorama SCADA System v2.0.0 &bull; Eastern Railway Division &bull; Strictly Authorized Access
      </div>

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
