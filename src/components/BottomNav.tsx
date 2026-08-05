import React, { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Home, Users, Plus, MessageCircle, User, type LucideIcon } from "lucide-react";

type NavItem = {
  path: string;
  label: string;
  Icon: LucideIcon;
  center?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { path: "/feed", label: "Home", Icon: Home },
  { path: "/friends", label: "Friends", Icon: Users },
  { path: "/create", label: "Create", Icon: Plus, center: true },
  { path: "/inbox", label: "Inbox", Icon: MessageCircle },
  { path: "/profile", label: "Profile", Icon: User },
];

type BottomNavPath = (typeof NAV_ITEMS)[number]["path"];

const ICON_SIZE = 26;

function isActiveRoute(pathname: string, path: string): boolean {
  if (path === "/feed") return pathname === "/feed" || pathname === "/";
  if (path === "/profile") return pathname === "/profile" || pathname.startsWith("/profile/");
  return pathname === path || pathname.startsWith(`${path}/`);
}

/**
 * Main bottom tab bar — one clean navigation owner per control.
 * UI/layout/routes unchanged from production chrome.
 */
export const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const goHome = useCallback(() => {
    navigate("/feed");
  }, [navigate]);

  const goFriends = useCallback(() => {
    navigate("/friends");
  }, [navigate]);

  const goCreate = useCallback(() => {
    navigate("/create");
  }, [navigate]);

  const goInbox = useCallback(() => {
    navigate("/inbox");
  }, [navigate]);

  const goProfile = useCallback(() => {
    navigate("/profile");
  }, [navigate]);

  const onTabPress = useCallback(
    (path: BottomNavPath) => {
      switch (path) {
        case "/feed":
          goHome();
          return;
        case "/friends":
          goFriends();
          return;
        case "/create":
          goCreate();
          return;
        case "/inbox":
          goInbox();
          return;
        case "/profile":
          goProfile();
          return;
        default:
          return;
      }
    },
    [goHome, goFriends, goCreate, goInbox, goProfile],
  );

  if (location.pathname === "/live" || location.pathname.startsWith("/live/")) {
    return null;
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[10002] pointer-events-none pb-[var(--safe-bottom)]"
      aria-label="Main navigation"
    >
      <div className="flex justify-center pointer-events-none">
        <div className="feed-column-width pointer-events-auto bg-[#121215] min-h-[var(--nav-height)]">
          <div className="flex items-center justify-around px-1 pt-1.5 pb-1">
            {NAV_ITEMS.map(({ path, label, Icon, center }) => {
              const active = isActiveRoute(location.pathname, path);
              const iconClass = "royce-icon-gold";
              const size = ICON_SIZE;

              return (
                <button
                  key={path}
                  type="button"
                  onClick={() => onTabPress(path)}
                  title={label}
                  aria-label={label}
                  aria-current={active ? "page" : undefined}
                  className="flex flex-col items-center justify-center flex-1 min-w-0 gap-0.5 active:opacity-75 transition-opacity"
                  style={{ WebkitTapHighlightColor: "transparent" }}
                >
                  <span className="royce-glow-disc" aria-hidden>
                    {center ? (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="relative z-[2] block" aria-hidden>
                        <path
                          d="M12 5v14M5 12h14"
                          stroke="url(#elixSilverRed)"
                          strokeWidth="2.75"
                          strokeLinecap="round"
                        />
                      </svg>
                    ) : (
                      <Icon
                        size={size}
                        strokeWidth={active ? 2.35 : 2}
                        className={iconClass}
                      />
                    )}
                  </span>
                  <span
                    className={`elix-silver-red-text text-[9px] font-semibold leading-none tracking-wide ${
                      active || center ? '' : 'opacity-55'
                    }`}
                    style={{ marginTop: "1mm" }}
                  >
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
};
