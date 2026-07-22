import React, { useEffect, useState } from 'react';
import { api, request } from '../../lib/apiClient';
import { nativePrompt } from '../../components/NativeDialog';
import { DollarSign, Gift, Zap, Package } from 'lucide-react';
import { showToast } from '../../lib/toast';

interface GiftCatalogItem {
  id: string;
  name: string;
  coin_cost: number;
  rarity: string;
  is_active: boolean;
}

interface BoosterCatalogItem {
  id: string;
  name: string;
  coin_cost: number;
  effect_type: string;
  is_active: boolean;
}

export default function AdminEconomy() {
  const [gifts, setGifts] = useState<GiftCatalogItem[]>([]);
  const [boosters, setBoosters] = useState<BoosterCatalogItem[]>([]);
  const [packages, setPackages] = useState<
    Array<{ id: string; title: string; coins: number; price_display: string }>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [giftsRes, boostersRes, packagesRes] = await Promise.all([
        api.gifts.getCatalog(),
        request('/api/boosters/catalog'),
        request('/api/coin-packages'),
      ]);

      const gData = giftsRes.data;
      const rawGifts = Array.isArray(gData) ? gData : (gData?.gifts ?? gData?.data ?? []);
      setGifts(
        rawGifts.map((g: Record<string, unknown>) => ({
          id: String(g.gift_id ?? g.id ?? ''),
          name: String(g.name ?? ''),
          coin_cost: Number(g.coin_cost ?? 0),
          rarity: String(g.gift_type ?? g.rarity ?? 'small'),
          is_active: Boolean(g.is_active),
        })).filter((g) => g.id),
      );
      const bData = boostersRes.data;
      setBoosters(Array.isArray(bData) ? bData : (Array.isArray(bData?.data) ? bData.data : []));
      const pData = packagesRes.data;
      const rawPkgs = Array.isArray(pData)
        ? pData
        : (pData?.packages ?? pData?.data ?? []);
      setPackages(
        (rawPkgs as Record<string, unknown>[])
          .map((p) => ({
            id: String(p.id ?? p.product_id ?? ''),
            title: String(p.title ?? p.name ?? p.product_id ?? ''),
            coins: Number(p.coins ?? p.coin_amount ?? 0),
            price_display: String(p.price_display ?? p.price ?? ''),
          }))
          .filter((p) => p.id),
      );
    } catch {
      showToast('Failed to load economy data');
    } finally {
      setLoading(false);
    }
  };

  const updateGiftPrice = async (giftId: string, newPrice: number) => {
    try {
      const { error } = await request(`/api/admin/gifts/catalog/${encodeURIComponent(giftId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ coin_cost: newPrice }),
      });

      if (error) throw error;
      showToast('Price updated');
      loadData();
    } catch {
      showToast('Failed to update price');
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-[#111111] flex items-center justify-center text-white">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-[#111111] text-white p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 flex items-center gap-3">
          <DollarSign className="w-8 h-8 text-white" />
          Economy Controls
        </h1>

        {/* Coin Packages */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <Package className="w-6 h-6 text-white" />
            Coin Packages ({packages.length})
          </h2>
          <div className="bg-[#111111] rounded-lg overflow-hidden">
            {packages.length === 0 ? (
              <p className="text-gray-400 p-6">No coin packages found in coin_packages.</p>
            ) : (
              <table className="w-full">
                <thead className="bg-[#2A2D35]">
                  <tr>
                    <th className="px-4 py-3 text-left">Package</th>
                    <th className="px-4 py-3 text-left">Coins</th>
                    <th className="px-4 py-3 text-left">Price</th>
                    <th className="px-4 py-3 text-left">Product ID</th>
                  </tr>
                </thead>
                <tbody>
                  {packages.map((pkg) => (
                    <tr key={pkg.id} className="hover:bg-[#2A2D35]/50">
                      <td className="px-4 py-3 font-semibold">{pkg.title}</td>
                      <td className="px-4 py-3">{pkg.coins.toLocaleString()}</td>
                      <td className="px-4 py-3">{pkg.price_display || '—'}</td>
                      <td className="px-4 py-3 text-gray-400 text-sm">{pkg.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Gifts Catalog */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <Gift className="w-6 h-6 text-pink-500" />
            Gifts Catalog ({gifts.length})
          </h2>
          <div className="bg-[#111111] rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-[#2A2D35]">
                <tr>
                  <th className="px-4 py-3 text-left">Gift</th>
                  <th className="px-4 py-3 text-left">Rarity</th>
                  <th className="px-4 py-3 text-left">Price (Coins)</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {gifts.map(gift => (
                  <tr key={gift.id} className="hover:bg-[#2A2D35]/50">
                    <td className="px-4 py-3 font-semibold">{gift.name}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 bg-[#FFFFFF] rounded text-xs">{gift.rarity}</span>
                    </td>
                    <td className="px-4 py-3 text-white font-bold">{gift.coin_cost}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          gift.is_active ? 'bg-[#D4AF37]' : 'bg-[#2A2D35]'
                        }`}
                      >
                        {gift.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={async () => {
                          const newPrice = await nativePrompt(`New price for ${gift.name}:`, String(gift.coin_cost), 'Edit Price');
                          if (newPrice) {
                            const parsed = parseInt(newPrice, 10);
                            if (isNaN(parsed) || parsed <= 0) { showToast('Invalid price'); return; }
                            updateGiftPrice(gift.id, parsed);
                          }
                        }}
                        className="px-3 py-1 bg-[#D4AF37] text-black rounded hover:bg-[#C9A227]/90 text-sm"
                      >
                        Edit Price
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Boosters Catalog */}
        <div>
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <Zap className="w-6 h-6 text-white" />
            Boosters Catalog ({boosters.length})
          </h2>
          <div className="bg-[#111111] rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-[#2A2D35]">
                <tr>
                  <th className="px-4 py-3 text-left">Booster</th>
                  <th className="px-4 py-3 text-left">Effect</th>
                  <th className="px-4 py-3 text-left">Price (Coins)</th>
                  <th className="px-4 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {boosters.map(booster => (
                  <tr key={booster.id} className="hover:bg-[#2A2D35]/50">
                    <td className="px-4 py-3 font-semibold">{booster.name}</td>
                    <td className="px-4 py-3 text-gray-400">{booster.effect_type}</td>
                    <td className="px-4 py-3 text-white font-bold">{booster.coin_cost}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          booster.is_active ? 'bg-[#D4AF37]' : 'bg-[#2A2D35]'
                        }`}
                      >
                        {booster.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
