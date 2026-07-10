import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Home, Users, Plus, MessageCircle, User } from "lucide-react";

type NavItem = {
  path: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  center?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { path: "/feed", label: "Home", Icon: Home },
  { path: "/friends", label: "Friends", Icon: Users },
  { path: "/create", label: "Create", Icon: Plus, center: true },
  { path: "/inbox", label: "Inbox", Icon: MessageCircle },
  { path: "/profile", label: "Profile", Icon: User },
];

const ICON_SIZE = 28;
const ICON_WRAP_CLASS =
  "flex items-center justify-center w-[52px] h-[52px] shrink-0";

function isActiveRoute(pathname: string, path: string): boolean {
  if (path === "/feed") return pathname === "/feed" || pathname === "/";
  if (path === "/profile") return pathname === "/profile" || pathname.startsWith("/profile/");
  return pathname === path || pathname.startsWith(`${path}/`);
}

export const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();

  if (
    location.pathname === "/live" ||
    location.pathname.startsWith("/live/")
  ) {
    return null;
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[10002] pointer-events-none pb-[var(--safe-bottom)]"
      aria-label="Main navigation"
    >
      <div className="flex justify-center pointer-events-none">
        <div className="w-full max-w-[480px] mx-auto pointer-events-auto bg-black border-t border-gold/20">
          <div className="flex items-end justify-around px-0.5 pt-2 pb-1.5 min-h-[var(--nav-height)]">
            {NAV_ITEMS.map(({ path, label, Icon, center }) => {
              const active = isActiveRoute(location.pathname, path);
              const iconClass = active ? "text-gold-bright" : "text-gold/45";
              const labelClass = active ? "text-gold-bright" : "text-gold/40";

              if (center) {
                return (
                  <button
                    key={path}
                    type="button"
                    onClick={() => navigate(path)}
                    title={label}
                    className="flex flex-col items-center justify-end flex-1 min-w-0 -mt-2 active:scale-95 transition-transform"
                    style={{ WebkitTapHighlightColor: "transparent" }}
                  >
                    <span className={ICON_WRAP_CLASS}>
                      <Icon size={ICON_SIZE} strokeWidth={2.5} className="text-gold-bright" />
                    </span>
                    <span className={`mt-1 text-[10px] font-semibold tracking-wide truncate max-w-full px-0.5 ${labelClass}`}>
                      {label}
                    </span>
                  </button>
                );
              }

              return (
                <button
                  key={path}
                  type="button"
                  onClick={() => navigate(path)}
                  title={label}
                  className="flex flex-col items-center justify-end flex-1 min-w-0 active:opacity-80 transition-opacity"
                  style={{ WebkitTapHighlightColor: "transparent" }}
                >
                  <span className={ICON_WRAP_CLASS}>
                    <Icon
                      size={ICON_SIZE}
                      strokeWidth={active ? 2.5 : 2}
                      className={iconClass}
                    />
                  </span>
                  <span className={`mt-1 text-[10px] font-semibold tracking-wide truncate max-w-full px-0.5 ${labelClass}`}>
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
