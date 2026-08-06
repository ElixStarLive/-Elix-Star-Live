import React, { useCallback } from "react";
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

type TopTabPath = (typeof TOP_TABS)[number]["path"];

/**
 * For You top tab bar — LIVE · STEM · Explore · Following · Shop · For You.
 * Structure restored; colors only follow premium theme.
 */
export const TopNav = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const goLive = useCallback(() => {
    navigate("/live", { replace: true });
  }, [navigate]);

  const goStem = useCallback(() => {
    navigate("/stem");
  }, [navigate]);

  const goExplore = useCallback(() => {
    navigate("/discover");
  }, [navigate]);

  const goFollowing = useCallback(() => {
    navigate("/following");
  }, [navigate]);

  const goShop = useCallback(() => {
    navigate("/shop");
  }, [navigate]);

  const goForYou = useCallback(() => {
    navigate("/feed");
  }, [navigate]);

  const goSearch = useCallback(() => {
    navigate("/search");
  }, [navigate]);

  const onTabPress = useCallback(
    (path: TopTabPath) => {
      switch (path) {
        case "/live":
          goLive();
          return;
        case "/stem":
          goStem();
          return;
        case "/discover":
          goExplore();
          return;
        case "/following":
          goFollowing();
          return;
        case "/shop":
          goShop();
          return;
        case "/feed":
          goForYou();
          return;
        default:
          return;
      }
    },
    [goLive, goStem, goExplore, goFollowing, goShop, goForYou],
  );

  if (location.pathname !== "/feed") {
    return null;
  }

  return (
    <div
      className="fixed left-0 right-0 z-[9999] flex justify-center pointer-events-none"
      style={{ top: "var(--topnav-anchor-top)" }}
    >
      <div className="feed-column-width pointer-events-auto bg-[rgba(0,0,0,0.35)] min-h-[var(--topnav-bar-height)] h-[var(--topnav-bar-height)]">
        <div className="flex items-center h-full w-full px-1.5 gap-0.5">
          <div className="flex flex-1 items-center justify-between min-w-0 h-full flex-nowrap overflow-x-auto no-scrollbar gap-0">
            {TOP_TABS.map((tab) => {
              const isPrimary = "primary" in tab && tab.primary;
              const isLive = "live" in tab && tab.live;
              return (
                <button
                  key={tab.label}
                  type="button"
                  onClick={() => onTabPress(tab.path)}
                  className="flex-shrink-0 flex items-center px-1 py-0 h-full active:opacity-70 transition-opacity focus:outline-none"
                  style={{ WebkitTapHighlightColor: "transparent" }}
                  title={tab.label}
                  aria-label={tab.label}
                >
                  <span className="flex items-center gap-0.5 whitespace-nowrap leading-none">
                    {isLive ? (
                      <Tv
                        size={11}
                        strokeWidth={2.25}
                        className="shrink-0 -translate-y-[0.5mm] text-[#6F3FF5]"
                        style={{ color: "#6F3FF5", stroke: "#6F3FF5" }}
                        aria-hidden
                      />
                    ) : null}
                    <span
                      className={`text-[10px] font-bold tracking-wide ${
                        isLive
                          ? "text-[#6F3FF5]"
                          : isPrimary
                            ? "text-white"
                            : "text-[#D8D9DD] opacity-70"
                      }`}
                      style={
                        isLive
                          ? {
                              backgroundImage: "none",
                              WebkitTextFillColor: "#6F3FF5",
                              color: "#6F3FF5",
                            }
                          : isPrimary
                            ? {
                                backgroundImage: "none",
                                WebkitTextFillColor: "#FFFFFF",
                                color: "#FFFFFF",
                              }
                            : {
                                backgroundImage: "none",
                                WebkitTextFillColor: "#D8D9DD",
                                color: "#D8D9DD",
                              }
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
            onClick={goSearch}
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
