/**
 * Shared legal document section title + body (Affiliate / Audio / DMCA / …).
 */

import React from 'react';

export function LegalDocSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-white font-semibold text-base mb-2">{title}</h2>
      {children}
    </div>
  );
}
