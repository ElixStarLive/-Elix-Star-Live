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
 * Main bottom tab bar — metallic silver → white when selected.
 * No purple on Home / Friends / Inbox / Profile.
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
      className="fixed inset-x-0 bottom-0 z-[10002] pointer-events-none bg-transparent"
      aria-label="Main navigation"
    >
      <div className="flex justify-center pointer-events-none">
        <div className="feed-column-width pointer-events-auto bg-transparent border-0 border-b-0">
          <div
            className="flex items-center justify-around px-1 pt-1.5"
            style={{ paddingBottom: "max(2px, calc(env(safe-area-inset-bottom, 0px) - 8mm))" }}
          >
            {NAV_ITEMS.map(({ path, label, Icon, center }) => {
              const active = isActiveRoute(location.pathname, path);
              const size = ICON_SIZE;
              const iconColor = active ? "#FFFFFF" : "#C8CDD5";

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
                          stroke="#E8EAED"
                          strokeWidth="2.75"
                          strokeLinecap="round"
                        />
                      </svg>
                    ) : (
                      <Icon
                        size={size}
                        strokeWidth={active ? 2.35 : 2}
                        className="relative z-[2]"
                        style={{ color: iconColor, stroke: iconColor }}
                      />
                    )}
                  </span>
                  <span
                    className="text-[9px] font-semibold leading-none tracking-wide"
                    style={{
                      marginTop: "1mm",
                      color: active || center ? "#FFFFFF" : "#A7ABB2",
                      WebkitTextFillColor: active || center ? "#FFFFFF" : "#A7ABB2",
                      backgroundImage: "none",
                    }}
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
