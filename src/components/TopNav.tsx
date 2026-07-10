import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search } from "lucide-react";

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
      <div className="w-full max-w-[480px] pointer-events-auto">
        <div
          className="flex items-center gap-0.5 px-2 border-b border-[#FFFFFF]/25 bg-black/92 backdrop-blur-md min-h-[var(--topnav-bar-height)]"
          style={{
            boxShadow: "0 4px 20px rgba(0,0,0,0.35), inset 0 -1px 0 rgba(255,255,255,0.06)",
          }}
        >
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
                  className={`flex-shrink-0 px-1.5 py-2 rounded-md active:opacity-70 transition-opacity focus:outline-none ${
                    active ? "opacity-100" : "opacity-80"
                  }`}
                  style={{ WebkitTapHighlightColor: "transparent" }}
                  title={tab.label}
                >
                  <span className="flex items-center gap-1">
                    {"live" in tab && tab.live ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-white/20 shrink-0 animate-pulse" aria-hidden />
                    ) : null}
                    <span
                      className={`text-[10px] font-bold tracking-wide whitespace-nowrap ${
                        active || ("primary" in tab && tab.primary)
                          ? "text-gold-metallic"
                          : "text-white/55"
                      }`}
                      style={
                        active
                          ? { textShadow: "0 0 12px rgba(255,255,255,0.2)" }
                          : undefined
                      }
                    >
                      {tab.label}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => navigate("/search")}
            title="Search"
            className="flex-shrink-0 p-2 rounded-full active:bg-white/5 transition-colors"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            <Search size={18} strokeWidth={2} className="text-[#FFFFFF]" />
          </button>
        </div>
      </div>
    </div>
  );
};
