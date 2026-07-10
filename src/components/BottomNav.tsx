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

const ICON_SIZE = 26;

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
      className="fixed inset-x-0 bottom-0 z-[10002] pointer-events-none pb-[var(--safe-bottom)]"
      aria-label="Main navigation"
    >
      <div className="flex justify-center pointer-events-none">
        <div className="w-full max-w-[480px] mx-auto pointer-events-auto bg-black border-t border-gold/30 min-h-[var(--nav-height)]">
          <div className="flex items-center justify-around px-1 pt-1.5 pb-1">
            {NAV_ITEMS.map(({ path, label, Icon, center }) => {
              const active = isActiveRoute(location.pathname, path);
              const iconClass = active ? "text-gold-bright" : "text-gold-bright/50";
              const labelClass = active ? "text-gold-bright" : "text-gold-bright/45";

              return (
                <button
                  key={path}
                  type="button"
                  onClick={() => navigate(path)}
                  title={label}
                  aria-label={label}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center justify-center flex-1 min-w-0 gap-0.5 active:opacity-75 transition-opacity ${
                    center ? "-mt-0.5" : ""
                  }`}
                  style={{ WebkitTapHighlightColor: "transparent" }}
                >
                  <Icon
                    size={center ? ICON_SIZE + 2 : ICON_SIZE}
                    strokeWidth={active ? 2.35 : 2}
                    className={iconClass}
                  />
                  <span className={`text-[9px] font-semibold leading-none tracking-wide ${labelClass}`}>
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
