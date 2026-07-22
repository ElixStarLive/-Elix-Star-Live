import React from "react";
import { useNavigate } from "react-router-dom";
import { RoyceBackIcon } from "../../components/royce";
import type { LucideIcon } from "lucide-react";

export function EngagementShell({
  title,
  icon: Icon,
  children,
  backTo = "/engagement",
}: {
  title: string;
  icon?: LucideIcon;
  children: React.ReactNode;
  backTo?: string;
}) {
  const navigate = useNavigate();
  return (
    <div className="page-above-bottom-nav bg-[#111111] text-white">
      <div className="page-above-bottom-nav__inner">
        <div
          className="w-full shrink-0 bg-[#111111] z-10"
          style={{ paddingTop: "var(--topnav-anchor-top)" }}
        >
          <div
            className="w-full px-3 flex items-center justify-between"
            style={{ minHeight: "var(--topnav-bar-height)" }}
          >
            <button
              type="button"
              onClick={() => navigate(backTo)}
              className="p-1"
              aria-label="Back"
            >
              <RoyceBackIcon className="w-6 h-6 text-white" />
            </button>
            <div className="flex items-center gap-2">
              {Icon ? <Icon className="w-5 h-5 text-[#C9A227]" /> : null}
              <h1 className="text-base font-semibold">{title}</h1>
            </div>
            <div className="w-8" />
          </div>
        </div>
        <div className="px-3 pb-6">{children}</div>
      </div>
    </div>
  );
}
