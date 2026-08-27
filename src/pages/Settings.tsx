import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Bell,
  BookOpen,
  ChevronRight,
  Heart,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Lock,
  Moon,
  Shield,
  Trash2,
  User,
  Wallet,
  X,
} from 'lucide-react';
import { useAuthStore } from '../features/auth/authStore';

interface SettingRowProps {
  icon: React.ReactNode;
  label: string;
  value?: string;
  onClick: () => void;
}

function SettingRow({ icon, label, value, onClick }: SettingRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-md px-2.5 py-3 text-left text-white/80 hover:bg-white/5"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10">{icon}</span>
      <span className="flex-1 text-fluid-sm">{label}</span>
      {value && <span className="text-fluid-xs text-white/50">{value}</span>}
      <ChevronRight className="h-4 w-4 text-white/40" />
    </button>
  );
}

function Section({ label }: { label: string }) {
  return (
    <h2 className="mb-2 mt-4 px-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">
      {label}
    </h2>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);

  const exit = useCallback(() => {
    const from = (location.state as { from?: string } | null)?.from ?? '/feed';
    navigate(from, { replace: true });
  }, [navigate, location.state]);

  const handleLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const go = (path: string) => () => navigate(path);

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-black text-white">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-black/90 px-4 py-3 backdrop-blur-md">
        <button type="button" onClick={exit} className="flex items-center gap-2 text-white/70 hover:text-white" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
          <span className="text-fluid-sm">Back</span>
        </button>
        <h1 className="text-fluid-base font-bold">Settings</h1>
        <button type="button" onClick={exit} aria-label="Close">
          <X className="h-5 w-5 text-white/70 hover:text-white" />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto overscroll-y-contain px-4 pb-24 pt-4">
        <div className="mb-4 flex justify-center">
          <img src="/elix-logo.png" alt="" className="h-20 w-20 object-contain" />
        </div>

        <Section label="Account" />
        <SettingRow icon={<User className="h-4 w-4" />} label="Edit Profile" onClick={go('/edit-profile')} />
        <SettingRow icon={<Lock className="h-4 w-4" />} label="Privacy" onClick={go('/settings/safety')} />
        <SettingRow icon={<Shield className="h-4 w-4" />} label="Security" onClick={go('/settings/security')} />
        <SettingRow icon={<Trash2 className="h-4 w-4" />} label="Delete Account" onClick={() => {}} />
        <SettingRow icon={<Wallet className="h-4 w-4" />} label="Creator Payout" onClick={go('/settings/payout')} />
        {user?.isAdmin && (
          <SettingRow icon={<LayoutDashboard className="h-4 w-4" />} label="Admin" onClick={go('/admin')} />
        )}

        <Section label="Preferences" />
        <SettingRow icon={<Bell className="h-4 w-4" />} label="Notifications" onClick={go('/settings/notifications')} />
        <SettingRow icon={<Moon className="h-4 w-4" />} label="Dark Mode" value="On" onClick={() => {}} />

        <Section label="Content" />
        <SettingRow icon={<Heart className="h-4 w-4" />} label="Liked Videos" onClick={go('/saved')} />

        <Section label="Support" />
        <SettingRow icon={<BookOpen className="h-4 w-4" />} label="How it works" onClick={go('/how-it-works')} />
        <SettingRow icon={<HelpCircle className="h-4 w-4" />} label="Help & Support" onClick={go('/support')} />

        <div className="mt-6 grid grid-cols-3 gap-2 border-t border-white/10 pt-4">
          <button type="button" onClick={go('/terms')} className="rounded-md py-2 text-fluid-xs text-white/70 hover:bg-white/5">
            Terms
          </button>
          <button type="button" onClick={go('/privacy')} className="rounded-md py-2 text-fluid-xs text-white/70 hover:bg-white/5">
            Privacy
          </button>
          <button type="button" onClick={go('/guidelines')} className="rounded-md py-2 text-fluid-xs text-white/70 hover:bg-white/5">
            Guidelines
          </button>
        </div>

        <div className="mt-6 flex items-center justify-center gap-4 border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-md px-4 py-2 text-fluid-sm font-semibold text-white/80 hover:bg-white/5"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      </main>
    </div>
  );
}
