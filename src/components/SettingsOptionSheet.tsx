import React from 'react';

type SettingsOptionSheetProps = {
  children: React.ReactNode;
  onClose: () => void;
};

/**
 * Settings sub-page shell — same container size as STEM / App main only
 * (`h-full w-full` inside max-w-[480px]). Does not change page content.
 */
export default function SettingsOptionSheet({ children, onClose }: SettingsOptionSheetProps) {
  return (
    <div className="relative h-full min-h-0 w-full bg-[#111111] text-white overflow-hidden flex flex-col">
      {/* Keep onClose wired for callers that overlay-dismissed; unused in-flow */}
      <button type="button" className="sr-only" onClick={onClose} aria-label="Close" />
      {children}
    </div>
  );
}
