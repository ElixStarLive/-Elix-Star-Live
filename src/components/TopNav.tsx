import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search, Tv } from "lucide-react";

const TOP_TABS = [
  { label: "LIVE", path: "/live", live: true },
  { label: "STEM", path: "/stem" },
  { label: "Explore", path: "/discover" },
  { label: "Following", path: "/following" },
  { label: "Shop", path: "/shop" },
  { label: "For You", path: "/feed", primary: true },
] as const;

export const TopNav = () => {
  const navigate = useNavigate();
  const location = useLocation();

  if (location.pathname !== "/feed") {
    return null;
  }

  return (
    <div
      className="fixed left-0 right-0 z-[9999] flex justify-center pointer-events-none"
      style={{ top: "var(--topnav-anchor-top)" }}
    >
      <div className="w-full max-w-[480px] pointer-events-auto bg-black min-h-[var(--topnav-bar-height)]">
        <div className="flex items-center gap-0.5 px-2 h-full">
          <div className="flex flex-1 items-center justify-between min-w-0 overflow-x-auto no-scrollbar gap-0.5 pr-1">
            {TOP_TABS.map((tab) => {
              const active = tab.path === "/feed";
              return (
                <button
                  key={tab.label}
                  type="button"
                  onClick={() => {
                    if (tab.path === "/live") navigate("/live", { replace: true });
                    else navigate(tab.path);
                  }}
                  className="flex-shrink-0 px-1.5 py-2 active:opacity-70 transition-opacity focus:outline-none"
                  style={{ WebkitTapHighlightColor: "transparent" }}
                  title={tab.label}
                >
                  <span
                    className={`flex items-center gap-1 text-[11px] font-bold tracking-wide whitespace-nowrap ${
                      active || ("primary" in tab && tab.primary)
                        ? "text-gold-bright"
                        : "text-gold-bright/50"
                    }`}
                  >
                    {"live" in tab && tab.live ? (
                      <Tv size={12} strokeWidth={2.25} className="shrink-0" />
                    ) : null}
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => navigate("/search")}
            title="Search"
            className="flex-shrink-0 flex items-center justify-center w-6 h-6 ml-0.5 mr-0.5 self-start mt-1.5 active:opacity-70 transition-opacity"
            style={{ WebkitTapHighlightColor: "transparent" }}
            aria-label="Search"
          >
            <Search size={13} strokeWidth={2.25} className="text-gold-bright" />
          </button>
        </div>
      </div>
    </div>
  );
};
