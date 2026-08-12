/**
 * Shared settings sheet option row (Safety Center / Security Settings).
 * Markup preserved exactly — logic-only share.
 */

import React from 'react';
import { ChevronRight } from 'lucide-react';

export function SettingsOptionRow({
  ic,
  t,
  d,
  fn,
}: {
  ic: React.ReactNode;
  t: string;
  d: string;
  fn: () => void;
}) {
  return (
    <button
      type="button"
      onClick={fn}
      className="w-full flex items-center gap-3 px-2.5 py-2.5 active:bg-white/5 text-left rounded-md"
    >
      <span
        className="royce-glow-disc shrink-0 [&_svg]:size-[18px]"
        style={{ width: '36px', height: '36px' }}
      >
        <span className="royce-icon-gold">{ic}</span>
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] leading-tight text-[#E6E9EE]">{t}</span>
        <span className="block text-xs text-[#8B9099] mt-0.5">{d}</span>
      </span>
      <ChevronRight size={16} className="text-white/30 shrink-0" />
    </button>
  );
}
