import React, { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { RoyceBackIcon } from "../../components/royce";
import type { LucideIcon } from "lucide-react";
import { ENGAGEMENT_HOME } from "../../lib/settingsNav";

export function EngagementShell({
  title,
  icon: Icon,
  children,
  backTo = ENGAGEMENT_HOME,
}: {
  title: string;
  icon?: LucideIcon;
  children: React.ReactNode;
  backTo?: string;
}) {
  const navigate = useNavigate();
  const exit = useCallback(() => {
    navigate(backTo, { replace: true });
  }, [navigate, backTo]);

  return (
    <div className="page-above-bottom-nav bg-[rgba(10,10,10,0.72)] backdrop-blur-md text-white">
      <div className="page-above-bottom-nav__inner engagement-panel-writing">
        <div
          className="w-full shrink-0 bg-[rgba(0,0,0,0.35)] z-10"
          style={{ paddingTop: "var(--topnav-anchor-top)" }}
        >
          <div
            className="w-full px-3 flex items-center"
            style={{ minHeight: "var(--topnav-bar-height)" }}
          >
            <div className="w-10 shrink-0" aria-hidden />
            <div className="flex-1 flex items-center justify-center gap-2 min-w-0">
              {Icon ? <Icon className="w-5 h-5 royce-icon-gold shrink-0" /> : null}
              <h1 className="text-base font-semibold truncate">
                <span className="elix-silver-red-text">{title}</span>
              </h1>
            </div>
            <button
              type="button"
              onClick={exit}
              className="w-10 h-10 shrink-0 flex items-center justify-center"
              aria-label="Close"
              title="Close"
            >
              <RoyceBackIcon className="w-6 h-6 text-white" />
            </button>
          </div>
        </div>
        <div className="px-3 pb-6">{children}</div>
      </div>
    </div>
  );
}
