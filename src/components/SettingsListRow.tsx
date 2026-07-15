import React from 'react';
import { ChevronRight } from 'lucide-react';

/** Shared settings row — same glow disc + height as every Settings / Safety / Support line. */
export function SettingsListRow({
  icon,
  title,
  value,
  description,
  onClick,
}: {
  icon?: React.ReactNode;
  title: string;
  value?: string;
  description?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-2 py-2 active:bg-white/5 text-left rounded-md"
    >
      {icon ? (
        <span className="royce-glow-disc w-7 h-7 shrink-0 [&_svg]:size-[14px]">
          <span className="royce-icon-gold">{icon}</span>
        </span>
      ) : null}
      <div className="flex-1 min-w-0">
        <span className="block text-[12px] leading-tight text-white/85">{title}</span>
        {description ? (
          <span className="block text-[10px] text-white/45 mt-0.5 truncate">{description}</span>
        ) : null}
      </div>
      {value ? <span className="text-[10px] text-white/45 tabular-nums shrink-0">{value}</span> : null}
      <ChevronRight size={13} className="text-white/30 shrink-0" />
    </button>
  );
}

export function SettingsSectionLabel({ title }: { title: string }) {
  return (
    <p className="text-[8px] text-white/30 uppercase tracking-[0.12em] mt-2.5 mb-0.5 px-1 leading-none">
      {title}
    </p>
  );
}
