/**
 * Shared Rising Stars page top bar (list + challenge).
 */

import React from 'react';
import { Trophy } from 'lucide-react';
import { RoyceBackIcon } from './royce';

export function RisingStarsTopBar({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack: () => void;
  right?: React.ReactNode;
}) {
  return (
    <div
      className="w-full shrink-0 bg-transparent z-10"
      style={{ paddingTop: 'var(--topnav-anchor-top)' }}
    >
      <div
        className="w-full px-3 flex items-center justify-between"
        style={{ minHeight: 'var(--topnav-bar-height)' }}
      >
        <button type="button" onClick={onBack} className="p-1" aria-label="Back">
          <RoyceBackIcon className="w-6 h-6 text-white" />
        </button>
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-[#F5F5F7]" />
          <h1 className="text-base font-semibold">{title}</h1>
        </div>
        {right ?? <div className="w-8" />}
      </div>
    </div>
  );
}
