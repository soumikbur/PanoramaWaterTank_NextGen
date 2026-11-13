import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Logger } from '../../services/logger';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    Logger.error(
      'RUNTIME',
      'ErrorBoundary',
      error ? `${error.name}: ${error.message}` : 'Unknown React render exception',
      'componentDidCatch',
      {
        stack: error?.stack,
        componentStack: errorInfo?.componentStack,
      }
    );
    this.setState({ error, errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReturnToDashboard = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.hash = '#/dashboard';
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '320px',
            margin: '24px auto',
            maxWidth: '680px',
            backgroundColor: '#FFFFFF',
            borderRadius: '10px',
            border: '1px solid #FECACA',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
            padding: '32px 24px',
            textAlign: 'center',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: '#FEE2E2',
              color: '#DC2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px auto',
            }}
          >
            <AlertTriangle size={30} />
          </div>

          <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: '0 0 8px 0' }}>
            {this.props.fallbackTitle || 'Component Rendering Error'}
          </h2>

          <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 16px 0', lineHeight: 1.5 }}>
            The requested railway interface encountered an unexpected error during rendering. No data has been corrupted. You can return to the dashboard or reload the page.
          </p>

          {this.state.error && (
            <div
              style={{
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '6px',
                padding: '10px 14px',
                fontSize: '11px',
                fontFamily: 'monospace',
                color: '#DC2626',
                textAlign: 'left',
                margin: '0 auto 20px auto',
                overflowX: 'auto',
                maxWidth: '560px',
              }}
            >
              {this.state.error.message || String(this.state.error)}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={this.handleReturnToDashboard}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 18px',
                backgroundColor: '#2563EB',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <Home size={14} />
              <span>Return to Dashboard</span>
            </button>

            <button
              onClick={this.handleReload}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 18px',
                backgroundColor: '#F1F5F9',
                color: '#475569',
                border: '1px solid #CBD5E1',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={14} />
              <span>Reload Application</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
