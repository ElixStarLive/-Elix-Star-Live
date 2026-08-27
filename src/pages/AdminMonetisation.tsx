import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Banknote, Coins, CreditCard, Gift } from 'lucide-react';
import { fetchAdminMonetisation, type MonetisationStats } from '../features/admin/adminApi';

const STAT_CARDS: { key: keyof MonetisationStats; label: string; icon: typeof Gift }[] = [
  { key: 'paidGiftsGbp', label: 'Paid Gifts (GBP)', icon: Gift },
  { key: 'paidCoinsCount', label: 'Paid Coin Packs', icon: Coins },
  { key: 'shopOrdersGbp', label: 'Shop Orders (GBP)', icon: CreditCard },
  { key: 'approvedPayoutsGbp', label: 'Payouts (GBP)', icon: Banknote },
];

export default function AdminMonetisation() {
  const [stats, setStats] = useState<MonetisationStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchAdminMonetisation().then(({ data }) => {
      if (cancelled) return;
      if (data) setStats(data);
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
        <h1 className="text-fluid-xl font-bold">Admin — Monetisation</h1>
      </header>

      {loading ? (
        <p className="text-white/60">Loading…</p>
      ) : !stats ? (
        <p className="text-white/60">Could not load monetisation stats.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {STAT_CARDS.map(({ key, label, icon: Icon }) => (
            <div key={key} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
              <Icon className="mx-auto mb-2 h-6 w-6 text-white/60" />
              <p className="text-fluid-2xl font-bold">
                {key === 'paidCoinsCount' ? stats[key] : `£${Number(stats[key]).toFixed(2)}`}
              </p>
              <p className="text-fluid-sm text-white/60">{label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
