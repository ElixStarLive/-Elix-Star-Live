import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { fetchAlerts, type Alert } from '../features/inbox/inboxApi';

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchAlerts().then(({ data }) => {
      if (cancelled) return;
      if (data) setAlerts(data.alerts);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-[100dvh] bg-black p-4 text-white">
      <h1 className="mb-4 text-fluid-xl font-bold">Alerts</h1>
      {loading ? (
        <p className="text-white/60">Loading…</p>
      ) : alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Bell className="mb-4 h-12 w-12 text-white/30" />
          <p className="text-fluid-sm text-white/60">No notifications yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`rounded-xl border border-white/10 p-3 ${alert.isRead ? 'bg-white/5' : 'bg-white/10'}`}
            >
              <p className="font-semibold text-white">{alert.title}</p>
              <p className="text-fluid-sm text-white/60">{alert.body}</p>
              <p className="mt-1 text-fluid-xs text-white/40">{new Date(alert.createdAt).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
