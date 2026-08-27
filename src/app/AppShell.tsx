import { Suspense } from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { BottomNav } from './BottomNav';

/**
 * PAGE-006: the single shell that owns global navigation, session gate and
 * loading/error boundaries for every authenticated view.
 *
 * The bottom nav only renders on authenticated routes; live pages hide it. Each
 * page inside the shell remains its own owner for content.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-black text-white">
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>{children}</Suspense>
      </ErrorBoundary>
      <BottomNav />
    </div>
  );
}

function PageLoader() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center p-4 text-white">
      <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-white" />
      <p className="text-white/70">Loading…</p>
    </div>
  );
}
