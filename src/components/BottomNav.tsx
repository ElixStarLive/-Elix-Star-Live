import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Home, Users, Plus, MessageCircle, User, Film, Radio } from "lucide-react";

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
  const [showCreateChoice, setShowCreateChoice] = React.useState(false);

  if (location.pathname === "/live" || location.pathname.startsWith("/live/")) {
    return null;
  }

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-[10002] pointer-events-none pb-[var(--safe-bottom)]"
        aria-label="Main navigation"
      >
        <div className="flex justify-center pointer-events-none">
          <div className="w-full max-w-[480px] mx-auto pointer-events-auto bg-black min-h-[var(--nav-height)]">
            <div className="flex items-center justify-around px-1 pt-1.5 pb-1">
              {NAV_ITEMS.map(({ path, label, Icon, center }) => {
                const active = isActiveRoute(location.pathname, path);
                const iconClass = "royce-icon-gold";
                const labelClass = active ? "text-gold-bright" : "text-gold-bright/45";
                const size = center ? ICON_SIZE + 2 : ICON_SIZE;

                return (
                  <button
                    key={path}
                    type="button"
                    onClick={() => {
                      if (path === "/create") {
                        setShowCreateChoice(true);
                        return;
                      }
                      navigate(path);
                    }}
                    title={label}
                    aria-label={label}
                    aria-current={active ? "page" : undefined}
                    className={`flex flex-col items-center justify-center flex-1 min-w-0 gap-0.5 active:opacity-75 transition-opacity ${
                      center ? "-mt-0.5" : ""
                    }`}
                    style={{ WebkitTapHighlightColor: "transparent" }}
                  >
                    <Icon
                      size={size}
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

      {showCreateChoice && (
        <div
          className="fixed inset-0 z-[10050] flex items-end justify-center"
          onClick={() => setShowCreateChoice(false)}
        >
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative w-full max-w-[480px] bg-[#111111] rounded-t-2xl px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pb-3">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>
            <p className="text-[#D4AF37] text-sm font-bold mb-3 px-1">Create</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                className="flex flex-col items-center gap-2 py-4 rounded-xl bg-white/5 active:scale-[0.98] transition-transform"
                onClick={() => {
                  setShowCreateChoice(false);
                  navigate("/create");
                }}
              >
                <Film size={22} className="royce-icon-gold" strokeWidth={2} />
                <span className="text-white text-xs font-semibold">Post</span>
                <span className="text-white/40 text-[10px] px-2 text-center">Camera / upload video</span>
              </button>
              <button
                type="button"
                className="flex flex-col items-center gap-2 py-4 rounded-xl bg-white/5 active:scale-[0.98] transition-transform"
                onClick={() => {
                  setShowCreateChoice(false);
                  navigate("/create?mode=live");
                }}
              >
                <Radio size={22} className="royce-icon-gold" strokeWidth={2} />
                <span className="text-white text-xs font-semibold">Live</span>
                <span className="text-white/40 text-[10px] px-2 text-center">Go live now</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
