import React, { useState } from 'react';
import { colors, typography, radii, spacing } from '../theme';
import { useApp } from '../state/AppContext';
import { AuthLayout } from '../components/auth/AuthLayout';
import { Droplet, Lock, User, Eye, EyeOff, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';

export const LoginScreen: React.FC = () => {
  const { login } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  const handleQuickFill = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
    setErrorMessage(null);
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
          }}
        >
          NextGen Railway SCADA / HMI Telematics Portal
        </p>
      </div>

      {/* Main Authentication Card */}
      <div
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
                placeholder="e.g. admin or operator"
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

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
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
        </form>

        {/* Quick-Select Credentials Panel for Operators/Reviewers */}
        <div
          style={{
            marginTop: '24px',
            paddingTop: '18px',
            borderTop: `1px solid ${colors.border}`,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              fontWeight: 600,
              color: colors.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
              marginBottom: '10px',
            }}
          >
            <ShieldCheck size={14} color={colors.primary} />
            <span>Authorized Test Accounts</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button
              id="btn-quick-admin"
              type="button"
              onClick={() => handleQuickFill('admin', 'admin123')}
              style={{
                padding: '8px',
                backgroundColor: colors.surfaceAlt,
                border: `1px solid ${colors.border}`,
                borderRadius: radii.sm,
                fontSize: '11px',
                color: colors.textSecondary,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ fontWeight: 700, color: colors.primary }}>Admin Role</div>
              <div style={{ color: colors.textMuted, fontSize: '10px', marginTop: '2px' }}>admin / admin123</div>
            </button>

            <button
              id="btn-quick-operator"
              type="button"
              onClick={() => handleQuickFill('operator', 'operator123')}
              style={{
                padding: '8px',
                backgroundColor: colors.surfaceAlt,
                border: `1px solid ${colors.border}`,
                borderRadius: radii.sm,
                fontSize: '11px',
                color: colors.textSecondary,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ fontWeight: 700, color: colors.successText }}>Operator Role</div>
              <div style={{ color: colors.textMuted, fontSize: '10px', marginTop: '2px' }}>operator / operator123</div>
            </button>
          </div>
        </div>
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
        Panorama SCADA System v2.0.0 &bull; Northern Railway Division &bull; Strictly Authorized Access
      </div>
    </AuthLayout>
  );
};
