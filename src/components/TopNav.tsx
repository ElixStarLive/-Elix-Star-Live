import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search, Tv } from "lucide-react";
import { StoryGoldRingAvatar } from "./StoryGoldRingAvatar";
import { useAuthStore } from "../store/useAuthStore";
import { resolveUiAvatarUrl } from "../lib/royceAssets";

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
  const { user, isAuthenticated } = useAuthStore();

  if (location.pathname !== "/feed") {
    return null;
  }

  const accountAvatar = resolveUiAvatarUrl(
    user?.avatar,
    user?.username || user?.name || "Account",
    64,
  );
  const accountLabel = user?.username || user?.name || "Account";

  return (
    <div
      className="fixed left-0 right-0 z-[9999] flex justify-center pointer-events-none"
      style={{ top: "var(--topnav-anchor-top)" }}
    >
      <div className="feed-column-width pointer-events-auto bg-black min-h-[var(--topnav-bar-height)] h-[var(--topnav-bar-height)]">
        <div className="flex items-center h-full w-full px-1.5 gap-0.5">
          <button
            type="button"
            onClick={() => navigate(isAuthenticated ? "/profile" : "/login")}
            title={accountLabel}
            aria-label="Your account"
            className="flex-shrink-0 flex items-center justify-center mr-0.5 active:scale-95 transition-transform"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            <StoryGoldRingAvatar size={28} src={accountAvatar} alt={accountLabel} />
          </button>
          <div className="flex flex-1 items-center justify-between min-w-0 h-full flex-nowrap overflow-x-auto no-scrollbar gap-0">
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
                  className="flex-shrink-0 flex items-center px-1 py-0 h-full active:opacity-70 transition-opacity focus:outline-none"
                  style={{ WebkitTapHighlightColor: "transparent" }}
                  title={tab.label}
                >
                  <span
                    className={`flex items-center gap-0.5 text-[10px] font-bold tracking-wide whitespace-nowrap leading-none ${
                      active || ("primary" in tab && tab.primary)
                        ? "text-gold-bright"
                        : "text-gold-bright/50"
                    }`}
                  >
                    {"live" in tab && tab.live ? (
                      <Tv size={11} strokeWidth={2.25} className="shrink-0 -translate-y-[0.5mm]" />
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
            className="flex-shrink-0 flex items-center justify-center w-6 h-full ml-0.5 active:opacity-70 transition-opacity"
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
