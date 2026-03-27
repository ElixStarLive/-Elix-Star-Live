import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { trackEvent } from '../lib/analytics';
import { crashReporting } from '../lib/crashReporting';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);

    this.setState({
      error,
      errorInfo,
    });

    try {
      trackEvent('app_error', {
        error_message: error.message,
        error_stack: error.stack || '',
        component_stack: errorInfo.componentStack || '',
      });
    } catch (_) { /* avoid double-fault */ }
    try {
      crashReporting.logError(error, {
        component: 'ErrorBoundary',
        componentStack: errorInfo.componentStack,
      });
    } catch (_) { /* avoid double-fault */ }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[100dvh] bg-[#13151A] text-white flex items-center justify-center px-4">
          <div className="max-w-md text-center">
            <div className="w-20 h-20 bg-red-500 rounded-full mx-auto mb-6 flex items-center justify-center">
              <AlertTriangle className="w-10 h-10 text-red-500" />
            </div>

            <h1 className="text-2xl font-bold mb-3">Oops! Something went wrong</h1>
            <p className="text-white/60 mb-6">
              We're sorry for the inconvenience. Please try reloading the page.
            </p>

            {this.state.error && (
              <details className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-left">
                <summary className="cursor-pointer text-sm font-mono text-red-400">
                  {import.meta.env.DEV ? 'Error details' : 'Technical details'}
                </summary>
                <p className="text-sm font-mono text-red-400 mt-2 break-all">{this.state.error.message}</p>
                {this.state.errorInfo?.componentStack && (
                  <pre className="mt-2 text-xs text-white/40 whitespace-pre-wrap overflow-x-auto max-h-40 overflow-y-auto">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </details>
            )}

            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReload}
                className="flex items-center gap-2 px-6 py-3 bg-[#C9A96E] text-black rounded-full font-bold hover:opacity-90 transition"
              >
                <RefreshCw className="w-5 h-5" />
                Reload
              </button>
              <button
                onClick={this.handleGoHome}
                className="flex items-center gap-2 px-6 py-3 bg-transparent text-white rounded-full font-bold hover:brightness-125 transition"
              >
                <Home className="w-5 h-5" />
                Go Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
