import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Coins } from 'lucide-react';
import { fetchAdminCoinPurchases, type AdminCoinPurchase } from '../features/admin/adminApi';

export default function AdminPurchases() {
  const [purchases, setPurchases] = useState<AdminCoinPurchase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchAdminCoinPurchases().then(({ data }) => {
      if (cancelled) return;
      if (data) setPurchases(data.purchases);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-[100dvh] bg-black p-4 text-white">
      <header className="mb-4 flex items-center gap-3">
        <Link to="/admin" className="text-white/70 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-fluid-xl font-bold">Admin — Purchases</h1>
      </header>

      {loading ? (
        <p className="text-white/60">Loading…</p>
      ) : purchases.length === 0 ? (
        <p className="text-white/60">No coin purchases yet.</p>
      ) : (
        <div className="space-y-2">
          {purchases.map((p) => (
            <div key={p.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-center gap-2">
                <Coins className="h-4 w-4 text-yellow-300" />
                <p className="font-semibold text-white">{p.coins} coins</p>
              </div>
              <p className="text-fluid-sm text-white/60">{p.username} · {p.platform} · {p.platformProductId}</p>
              <p className="text-fluid-sm text-white/60">Status: {p.status}</p>
              <p className="text-fluid-xs text-white/40">{new Date(p.createdAt).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
