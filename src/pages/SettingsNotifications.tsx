import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, X } from 'lucide-react';
import { fetchNotificationSettings, patchNotificationSettings, type NotificationSettings } from '../features/users/usersApi';

const TOGGLES: { key: keyof NotificationSettings; label: string }[] = [
  { key: 'pushEnabled', label: 'Push notifications' },
  { key: 'emailEnabled', label: 'Email notifications' },
  { key: 'likesEnabled', label: 'Likes' },
  { key: 'commentsEnabled', label: 'Comments' },
  { key: 'followsEnabled', label: 'New followers' },
  { key: 'liveEnabled', label: 'Live streams' },
  { key: 'marketingEnabled', label: 'Marketing' },
];

export default function SettingsNotifications() {
  const navigate = useNavigate();
  const location = useLocation();
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchNotificationSettings().then(({ data }) => {
      if (cancelled) return;
      if (data) setSettings(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const exit = () => {
    const from = (location.state as { from?: string } | null)?.from ?? '/settings';
    navigate(from, { replace: true });
  };

  const toggle = async (key: keyof NotificationSettings) => {
    if (!settings) return;
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    const patch: Partial<NotificationSettings> = { [key]: next[key] };
    await patchNotificationSettings(patch);
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-black text-white">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-black/90 px-4 py-3 backdrop-blur-md">
        <button type="button" onClick={exit} className="flex items-center gap-2 text-white/70 hover:text-white" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
          <span className="text-fluid-sm">Back</span>
        </button>
        <h1 className="text-fluid-base font-bold">Notifications</h1>
        <button type="button" onClick={exit} aria-label="Close">
          <X className="h-5 w-5 text-white/70 hover:text-white" />
        </button>
      </header>

      <main className="flex-1 p-4">
        <div className="mb-4 flex items-center gap-2 text-white/70">
          <Bell className="h-5 w-5" />
          <p className="text-fluid-sm">Choose what you want to be notified about.</p>
        </div>

        {loading || !settings ? (
          <p className="text-white/60">Loading…</p>
        ) : (
          <div className="space-y-1 rounded-2xl border border-white/10 bg-white/5 p-2">
            {TOGGLES.map(({ key, label }) => (
              <label
                key={key}
                className="flex cursor-pointer items-center justify-between rounded-xl p-3 hover:bg-white/5"
              >
                <span className="text-fluid-sm text-white/80">{label}</span>
                <input
                  type="checkbox"
                  checked={settings[key]}
                  onChange={() => toggle(key)}
                  className="h-5 w-5 accent-white"
                />
              </label>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
