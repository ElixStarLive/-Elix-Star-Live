import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Home, MessageCircle, Plus, User, Users, type LucideIcon } from 'lucide-react';

type NavItem = { path: string; label: string; Icon: LucideIcon; center?: boolean };

const ITEMS: NavItem[] = [
  { path: '/feed', label: 'Home', Icon: Home },
  { path: '/friends', label: 'Friends', Icon: Users },
  { path: '/create', label: 'Create', Icon: Plus, center: true },
  { path: '/inbox', label: 'Inbox', Icon: MessageCircle },
  { path: '/profile', label: 'Profile', Icon: User },
];

const ICON_SIZE = 26;

function isActive(pathname: string, path: string): boolean {
  if (path === '/feed') return pathname === '/feed' || pathname === '/';
  if (path === '/profile') return pathname === '/profile' || pathname.startsWith('/profile/');
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const onPress = useCallback(
    (path: string) => {
      navigate(path);
    },
    [navigate],
  );

  if (location.pathname === '/live' || location.pathname.startsWith('/live/')) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 bg-black/80 backdrop-blur-md"
      aria-label="Main navigation"
    >
      <div
        className="flex items-center justify-around px-1 pt-1.5"
        style={{ paddingBottom: 'max(2px, env(safe-area-inset-bottom, 0px))' }}
      >
        {ITEMS.map(({ path, label, Icon, center }) => {
          const active = isActive(location.pathname, path);
          const color = active ? '#FFFFFF' : '#C8CDD5';
          const labelColor = active || center ? '#FFFFFF' : '#A7ABB2';

          return (
            <button
              key={path}
              type="button"
              onClick={() => onPress(path)}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className="flex flex-1 flex-col items-center justify-center gap-0.5 active:opacity-75"
            >
              {center ? (
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white/30 bg-white/10"
                  aria-hidden="true"
                >
                  <Plus className="h-5 w-5" style={{ color: '#E8EAED' }} />
                </span>
              ) : (
                <Icon
                  size={ICON_SIZE}
                  strokeWidth={active ? 2.35 : 2}
                  style={{ color, stroke: color }}
                />
              )}
              <span className="text-[9px] font-semibold leading-none tracking-wide" style={{ color: labelColor }}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
