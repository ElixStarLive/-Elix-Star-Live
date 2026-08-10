import React, { useCallback, useEffect, useState } from "react";
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
 * For You top tab bar — LIVE (#FF2D55) · STEM · Explore · Following · Shop · For You.
 * Non-LIVE tabs: metallic silver → white when selected.
 * Hidden while User Profile overlay is open (Search/Close live on that header).
 */
export const TopNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [userProfileOpen, setUserProfileOpen] = useState(false);

  useEffect(() => {
    const sync = () =>
      setUserProfileOpen(document.body.hasAttribute("data-user-profile-open"));
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-user-profile-open"],
    });
    return () => mo.disconnect();
  }, []);

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

  if (userProfileOpen) {
    return null;
  }

  return (
    <div className="elix-home-top-bar fixed inset-x-0 top-0 z-[9999] flex justify-center pointer-events-none">
      {/* Fundal column includes safe-top so cosmic fundal runs under status bar (time/battery) */}
      <div
        className="feed-column-width pointer-events-auto bg-transparent min-h-[var(--topnav-bar-height)]"
        style={{
          paddingTop: "var(--safe-top)",
          minHeight: "calc(var(--safe-top) + var(--topnav-bar-height))",
        }}
      >
        <div className="flex items-center w-full px-1.5 gap-0.5 min-h-[var(--topnav-bar-height)] h-[var(--topnav-bar-height)]">
          <div className="flex flex-1 items-center justify-between min-w-0 h-full flex-nowrap overflow-x-auto no-scrollbar gap-0">
            {TOP_TABS.map((tab) => {
              const isPrimary = "primary" in tab && tab.primary;
              const isLive = "live" in tab && tab.live;
              const labelColor = isLive ? "#FF2D55" : isPrimary ? "#FFFFFF" : "#A7ABB2";
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
                        className="shrink-0 -translate-y-[0.5mm]"
                        style={{ color: "#FF2D55", stroke: "#FF2D55" }}
                        aria-hidden
                      />
                    ) : null}
                    <span
                      className="text-[10px] font-bold tracking-wide"
                      style={{
                        backgroundImage: "none",
                        WebkitTextFillColor: labelColor,
                        color: labelColor,
                      }}
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
            <Search size={13} strokeWidth={2.25} style={{ color: "#E8EAED", stroke: "#E8EAED" }} />
          </button>
        </div>
      </div>
    </div>
  );
};
