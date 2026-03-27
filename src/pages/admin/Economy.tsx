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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [giftsRes, boostersRes] = await Promise.all([
        api.gifts.getCatalog(),
        request('/api/boosters/catalog'),
      ]);

      setGifts(Array.isArray(giftsRes.data) ? giftsRes.data : []);
      setBoosters(Array.isArray(boostersRes.data) ? boostersRes.data : []);
    } catch (error) {

    } finally {
      setLoading(false);
    }
  };

  const updateGiftPrice = async (giftId: string, newPrice: number) => {
    try {
      const { error } = await request(`/api/gifts/catalog/${encodeURIComponent(giftId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ coin_cost: newPrice }),
      });

      if (error) throw error;
      showToast('Price updated');
      loadData();
    } catch (error) {

      showToast('Failed to update price');
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-[#13151A] flex items-center justify-center text-white">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-[#13151A] text-white p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 flex items-center gap-3">
          <DollarSign className="w-8 h-8 text-white" />
          Economy Controls
        </h1>

        {/* Coin Packages */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <Package className="w-6 h-6 text-white" />
            Coin Packages
          </h2>
          <div className="bg-[#1C1E24] rounded-lg p-6">
            <p className="text-gray-400">Managed via coin_packages table</p>
          </div>
        </div>

        {/* Gifts Catalog */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <Gift className="w-6 h-6 text-pink-500" />
            Gifts Catalog ({gifts.length})
          </h2>
          <div className="bg-[#1C1E24] rounded-lg overflow-hidden">
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
                      <span className="px-2 py-1 bg-[#C9A96E] rounded text-xs">{gift.rarity}</span>
                    </td>
                    <td className="px-4 py-3 text-white font-bold">{gift.coin_cost}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          gift.is_active ? 'bg-[#C9A96E]' : 'bg-[#2A2D35]'
                        }`}
                      >
                        {gift.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={async () => {
                          const newPrice = await nativePrompt(`New price for ${gift.name}:`, String(gift.coin_cost), 'Edit Price');
                          if (newPrice) updateGiftPrice(gift.id, parseInt(newPrice));
                        }}
                        className="px-3 py-1 bg-[#C9A96E] text-black rounded hover:bg-[#C9A96E]/90 text-sm"
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
          <div className="bg-[#1C1E24] rounded-lg overflow-hidden">
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
                          booster.is_active ? 'bg-[#C9A96E]' : 'bg-[#2A2D35]'
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
