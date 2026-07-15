import React from 'react';

type SettingsOptionSheetProps = {
  children: React.ReactNode;
  onClose: () => void;
};

/** Full-height column matching STEM / App shell (`max-w-[480px]`). */
export default function SettingsOptionSheet({ children, onClose }: SettingsOptionSheetProps) {
  return (
    <div className="fixed inset-0 z-[9999] flex justify-center">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div
        className="relative w-full max-w-[480px] h-full min-h-0 bg-[#111111] text-white shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
