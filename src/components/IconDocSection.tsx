/**
 * Shared Guidelines / How It Works section heading with icon.
 */

import React from 'react';

export function IconDocSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="flex items-center gap-2 text-white font-semibold text-base mb-2">
        <span className="text-[#E6E9EE] flex-shrink-0">{icon}</span>
        {title}
      </h2>
      {children}
    </div>
  );
}
