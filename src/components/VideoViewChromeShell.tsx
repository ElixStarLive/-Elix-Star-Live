/**
 * Shared VideoView loading / missing chrome shell (identical layout).
 */

import React from 'react';
import { RoyceCloseIcon } from './royce';

export function VideoViewChromeShell({
  onBack,
  children,
}: {
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[9990] bg-transparent flex justify-center">
      <div
        className="w-full max-w-[480px] relative overflow-hidden bg-transparent h-viewport"
        style={{ marginTop: 0 }}
      >
        <div
          className="absolute z-[250] pointer-events-auto"
          style={{
            top: 'max(0.75rem, var(--safe-top))',
            right: 'max(0.75rem, env(safe-area-inset-right, 0px))',
          }}
        >
          <button
            onClick={onBack}
            className="p-2 rounded-full bg-transparent border border-transparent text-white"
            aria-label="Back"
          >
            <RoyceCloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
