import { useEffect, useState } from 'react';
import { Coins } from 'lucide-react';
import { fetchCoinPackages, type CoinPackage } from '../features/coins/coinsApi';

export default function PurchaseCoins() {
  const [packages, setPackages] = useState<CoinPackage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchCoinPackages().then(({ data }) => {
      if (cancelled) return;
      if (data) setPackages(data.packages);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-[100dvh] bg-black p-4 text-white">
      <header className="mb-4 flex items-center gap-2">
        <Coins className="h-6 w-6" />
        <h1 className="text-fluid-xl font-bold">Coins</h1>
      </header>

      <p className="mb-4 text-fluid-sm text-white/60">
        Buy coins with your platform&apos;s in-app purchase system.
      </p>

      {loading ? (
        <p className="text-white/60">Loading…</p>
      ) : packages.length === 0 ? (
        <p className="text-white/60">No coin packages available.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {packages.map((pkg) => (
            <div key={pkg.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h2 className="text-fluid-base font-bold">{pkg.name}</h2>
              <p className="text-fluid-2xl font-bold text-yellow-300">{pkg.coins.toLocaleString()}</p>
              <p className="text-fluid-sm text-white/60">£{pkg.priceGbp.toFixed(2)}</p>
              <p className="text-fluid-xs text-white/40">Product ID: {pkg.productId}</p>
              <button
                type="button"
                disabled
                className="mt-3 w-full rounded-xl border border-white/40 bg-transparent py-2 text-fluid-sm font-bold disabled:opacity-60"
              >
                IAP SDK not configured
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
