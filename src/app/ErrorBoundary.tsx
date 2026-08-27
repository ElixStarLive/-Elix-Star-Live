import { Component } from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[100dvh] flex-col items-center justify-center p-4 text-center text-white">
          <h1 className="text-fluid-xl font-bold">Something went wrong</h1>
          <p className="mt-2 text-fluid-sm text-white/60">Please refresh the app and try again.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 rounded-xl border border-white/40 px-6 py-2 text-fluid-sm font-bold"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
