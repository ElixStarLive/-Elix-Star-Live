import React from "react";
import { useLocation, useNavigate } from "react-router-dom";

const BOTTOM_BAR_SRC = "/Icons/bottombar.png";

const NAV_TABS = [
  { path: "/feed", title: "Home" },
  { path: "/friends", title: "Friends" },
  { path: "/create", title: "Create" },
  { path: "/inbox", title: "Inbox" },
  { path: "/profile", title: "Profile" },
] as const;

function isActiveRoute(pathname: string, path: string): boolean {
  if (path === "/feed") return pathname === "/feed" || pathname === "/";
  if (path === "/profile") return pathname === "/profile" || pathname.startsWith("/profile/");
  return pathname === path || pathname.startsWith(`${path}/`);
}

export const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();

  if (location.pathname === "/live" || location.pathname.startsWith("/live/")) {
    return null;
  }

  return (
    <nav
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[10002] pb-[var(--safe-bottom)]"
      aria-label="Main navigation"
    >
      <div className="flex justify-center">
        <div
          className="pointer-events-auto relative w-full max-w-[480px] mx-auto overflow-hidden"
          style={{
            height: "var(--nav-height)",
            filter: "drop-shadow(0 0 8px rgba(0,0,0,0.6))",
          }}
        >
          <div className="absolute inset-0 flex">
            {NAV_TABS.map((tab, index) => {
              const active = isActiveRoute(location.pathname, tab.path);
              return (
                <button
                  key={tab.path}
                  type="button"
                  onClick={() => navigate(tab.path)}
                  title={tab.title}
                  aria-label={tab.title}
                  aria-current={active ? "page" : undefined}
                  className="relative flex-1 min-w-0 h-full overflow-hidden bg-transparent border-0 p-0 m-0 appearance-none focus:outline-none active:opacity-80 transition-opacity"
                  style={{ WebkitTapHighlightColor: "transparent" }}
                >
                  <img
                    src={BOTTOM_BAR_SRC}
                    alt=""
                    draggable={false}
                    className="absolute top-0 h-full max-w-none pointer-events-none select-none"
                    style={{
                      width: `${NAV_TABS.length * 100}%`,
                      left: `${-index * 100}%`,
                    }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
};
