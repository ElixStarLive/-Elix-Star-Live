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
        <div className="feed-column-width pointer-events-auto bg-black min-h-[var(--nav-height)]">
          <div className="flex items-center justify-around px-1 pt-1.5 pb-1">
            {NAV_ITEMS.map(({ path, label, Icon, center }) => {
              const active = isActiveRoute(location.pathname, path);
              const iconClass = [
                active ? "bottom-nav-icon-active" : "bottom-nav-icon-inactive",
                center ? "bottom-nav-icon-plus" : "",
              ]
                .filter(Boolean)
                .join(" ");
              const labelClass = active ? "text-[#FFFFFF]" : "text-[#A7A7AD]";
              const size = center ? ICON_SIZE + 2 : ICON_SIZE;

              return (
                <button
                  key={path}
                  type="button"
                  onClick={() => onTabPress(path)}
                  title={label}
                  aria-label={label}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center justify-center flex-1 min-w-0 gap-0.5 active:opacity-75 transition-opacity ${
                    center ? "-mt-0.5" : ""
                  }`}
                  style={{ WebkitTapHighlightColor: "transparent" }}
                >
                  <span
                    className="inline-flex items-center justify-center flex-shrink-0"
                    style={{ width: size + 12, height: size + 12 }}
                    aria-hidden
                  >
                    <Icon
                      size={size}
                      strokeWidth={active ? 2.35 : 2}
                      className={iconClass}
                    />
                  </span>
                  <span
                    className={`text-[9px] font-semibold leading-none tracking-wide ${labelClass}`}
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
