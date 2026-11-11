import React from 'react';
import { AlertToast } from '../../services/alertNotificationService';
import { AlertTriangle, AlertCircle, CheckCircle2, X } from 'lucide-react';

interface AlertToastBannerProps {
  toast: AlertToast | null;
  onDismiss: () => void;
}

export const AlertToastBanner: React.FC<AlertToastBannerProps> = ({ toast, onDismiss }) => {
  if (!toast) return null;

  const isCrit = toast.severity === 'CRITICAL';
  const isWarn = toast.severity === 'WARNING';

  const bg = isCrit ? '#FEF2F2' : isWarn ? '#FFFBEB' : '#ECFDF5';
  const border = isCrit ? '#FECACA' : isWarn ? '#FDE68A' : '#A7F3D0';
  const textTitle = isCrit ? '#991B1B' : isWarn ? '#92400E' : '#065F46';
  const textBody = isCrit ? '#B91C1C' : isWarn ? '#B45309' : '#047857';
  const iconColor = isCrit ? '#EF4444' : isWarn ? '#F59E0B' : '#10B981';

  return (
    <aside
      aria-label="System Alert"
      style={{
        position: 'fixed',
        top: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 99999,
        width: '100%',
        maxWidth: 'calc(100vw - 24px)',
        boxSizing: 'border-box',
        pointerEvents: 'auto',
      }}
    >
      <div
        role="alert"
        aria-live={isCrit ? 'assertive' : 'polite'}
        style={{
          margin: '0 auto',
          maxWidth: '460px',
          backgroundColor: bg,
          border: `1.5px solid ${border}`,
          borderRadius: '10px',
          padding: '10px 14px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '10px',
          animation: 'slideDown 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div style={{ flexShrink: 0, marginTop: '2px', color: iconColor }}>
          {isCrit ? <AlertTriangle size={20} /> : isWarn ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <span
              style={{
                fontSize: '13px',
                fontWeight: 700,
                color: textTitle,
                letterSpacing: '-0.01em',
              }}
            >
              {toast.title}
            </span>
            <span style={{ fontSize: '10px', color: '#64748B', whiteSpace: 'nowrap' }}>
              {new Date(toast.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>

          <p
            style={{
              margin: '3px 0 0 0',
              fontSize: '12px',
              color: textBody,
              lineHeight: 1.4,
              wordBreak: 'break-word',
            }}
          >
            {toast.message}
          </p>
        </div>

        <button
          onClick={onDismiss}
          aria-label="Dismiss alert"
          style={{
            flexShrink: 0,
            width: '44px',
            height: '44px',
            margin: '-10px -10px -10px 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'transparent',
            border: 'none',
            color: textTitle,
            cursor: 'pointer',
            borderRadius: '6px',
          }}
        >
          <X size={16} />
        </button>
      </div>
    </aside>
  );
};
