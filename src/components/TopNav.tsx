import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search } from "lucide-react";

const TOP_TABS = [
  { label: "LIVE", path: "/live" },
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
        <div className="flex items-center gap-1 px-2 bg-black min-h-[var(--topnav-bar-height)]">
          <div className="flex flex-1 items-center justify-between min-w-0 overflow-x-auto no-scrollbar gap-1 pr-1">
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
                  className="flex-shrink-0 px-2 py-2.5 active:opacity-70 transition-opacity focus:outline-none"
                  style={{ WebkitTapHighlightColor: "transparent" }}
                  title={tab.label}
                >
                  <span
                    className={`text-[12px] font-bold tracking-wide whitespace-nowrap ${
                      active || ("primary" in tab && tab.primary) ? "text-white" : "text-white/50"
                    }`}
                  >
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
            className="flex-shrink-0 flex items-center justify-center w-[44px] h-[44px] rounded-full border-2 border-white bg-black active:opacity-80 transition-opacity"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            <Search size={24} strokeWidth={2.25} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  );
};
