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
        <div
          className="w-full max-w-[480px] mx-auto pointer-events-auto border-t border-[#C9A96E]/20 bg-[#0B0B0F]/96 backdrop-blur-xl"
          style={{
            boxShadow: "0 -4px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(201,169,110,0.12)",
          }}
        >
          <div className="flex items-end justify-around px-1 pt-1.5 pb-1 min-h-[var(--nav-height)]">
            {NAV_ITEMS.map(({ path, label, Icon, center }) => {
              const active = isActiveRoute(location.pathname, path);
              if (center) {
                return (
                  <button
                    key={path}
                    type="button"
                    onClick={() => navigate(path)}
                    title={label}
                    className="flex flex-col items-center justify-end flex-1 min-w-0 -mt-3 active:scale-95 transition-transform"
                    style={{ WebkitTapHighlightColor: "transparent" }}
                  >
                    <span
                      className="flex items-center justify-center w-11 h-11 rounded-full border border-[#C9A96E]/50 bg-gradient-to-b from-[#2a2418] to-[#13151A] shadow-[0_0_16px_rgba(201,169,110,0.35)]"
                    >
                      <Icon size={22} strokeWidth={2.25} className="text-[#C9A96E]" />
                    </span>
                    <span
                      className={`mt-0.5 text-[9px] font-semibold tracking-wide truncate max-w-full px-0.5 ${
                        active ? "text-gold-metallic" : "text-white/40"
                      }`}
                    >
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
                  className="flex flex-col items-center justify-end flex-1 min-w-0 py-0.5 active:opacity-70 transition-opacity"
                  style={{ WebkitTapHighlightColor: "transparent" }}
                >
                  <Icon
                    size={22}
                    strokeWidth={active ? 2.25 : 1.75}
                    className={active ? "text-[#C9A96E]" : "text-white/45"}
                    style={
                      active
                        ? { filter: "drop-shadow(0 0 6px rgba(201,169,110,0.45))" }
                        : undefined
                    }
                  />
                  <span
                    className={`mt-0.5 text-[9px] font-semibold tracking-wide truncate max-w-full px-0.5 ${
                      active ? "text-gold-metallic" : "text-white/40"
                    }`}
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
