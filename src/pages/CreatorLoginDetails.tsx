import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, X } from 'lucide-react';
import { fetchMyProfile, type PublicProfile } from '../features/users/usersApi';
import { useAuthStore } from '../features/auth/authStore';

export default function CreatorLoginDetails() {
  const navigate = useNavigate();
  const location = useLocation();
  const currentUser = useAuthStore((state) => state.user);
  const [profile, setProfile] = useState<PublicProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMyProfile().then(({ data }) => {
      if (cancelled || !data) return;
      setProfile(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const exit = () => {
    const from = (location.state as { from?: string } | null)?.from ?? '/settings';
    navigate(from, { replace: true });
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-black text-white">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-black/90 px-4 py-3 backdrop-blur-md">
        <button type="button" onClick={exit} className="flex items-center gap-2 text-white/70 hover:text-white" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
          <span className="text-fluid-sm">Back</span>
        </button>
        <h1 className="text-fluid-base font-bold">Login Details</h1>
        <button type="button" onClick={exit} aria-label="Close">
          <X className="h-5 w-5 text-white/70 hover:text-white" />
        </button>
      </header>

      <main className="space-y-4 p-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-fluid-xs text-white/50">Username</p>
          <p className="text-fluid-sm text-white">{profile?.username ?? currentUser?.username ?? '—'}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-fluid-xs text-white/50">Display Name</p>
          <p className="text-fluid-sm text-white">{profile?.displayName ?? currentUser?.displayName ?? '—'}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-fluid-xs text-white/50">Account Status</p>
          <p className="text-fluid-sm text-white">{profile?.isAdmin ? 'Admin' : 'Standard'}</p>
        </div>
      </main>
    </div>
  );
}
