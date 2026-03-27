import React from 'react';

type SettingsOptionSheetProps = {
  children: React.ReactNode;
  onClose: () => void;
};

export default function SettingsOptionSheet({ children, onClose }: SettingsOptionSheetProps) {
  return (
    <div className="fixed inset-0 z-[9999] flex justify-center">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div
        className="absolute w-full max-w-[480px] h-[50dvh] rounded-t-2xl border-t border-[#C9A96E]/20 bg-[#13151A] text-white shadow-2xl overflow-hidden"
        style={{ bottom: 'calc(var(--nav-height) + env(safe-area-inset-bottom, 0px))' }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
