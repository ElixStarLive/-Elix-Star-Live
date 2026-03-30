import React, { useState, useEffect } from 'react';
import { Coins, Sparkles } from 'lucide-react';
import { platform } from '@/lib/platform';
import {
  loadProducts as loadIAPProducts,
  purchaseProduct,
  initializeIAP,
  IAP_PRODUCTS,
  type IAPProductId,
  type IAPProduct,
} from '@/lib/iap';
import { showToast } from '@/lib/toast';

interface BuyCoinsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (coins: number) => void;
}

type CoinPackage = {
  id: string;
  coins: number;
  price: number;
  label: string;
};

const WEB_PACKAGES: CoinPackage[] = Object.entries(IAP_PRODUCTS).map(([id, meta]) => ({
  id,
  coins: meta.coins,
  price: 0,
  label: meta.label,
}));

export const BuyCoinsModal: React.FC<BuyCoinsModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [selectedPackage, setSelectedPackage] = useState<CoinPackage>(WEB_PACKAGES[0]);
  const [nativeProducts, setNativeProducts] = useState<IAPProduct[]>([]);
  const [nativeLoading, setNativeLoading] = useState<string | null>(null);
  const isNative = platform.isNative;
  const [customAmount, setCustomAmount] = useState('');

  useEffect(() => {
    if (!isOpen || !isNative) return;
    let cancelled = false;
    const loadNative = async () => {
      try {
        await initializeIAP();
        const products = await loadIAPProducts();
        if (cancelled) return;
        if (products.length > 0) {
          setNativeProducts(products);
        } else {
          const fallback: IAPProduct[] = Object.entries(IAP_PRODUCTS).map(
            ([id, meta]) => ({
              id,
              title: meta.label,
              description: `Get ${meta.coins} coins`,
              price: '',
              priceAmountMicros: 0,
              coins: meta.coins,
            }),
          );
          setNativeProducts(fallback);
        }
      } catch {
        if (!cancelled) showToast('Failed to load products');
      }
    };
    loadNative();
    return () => { cancelled = true; };
  }, [isOpen, isNative]);

  const handleNativePurchase = async (product: IAPProduct) => {
    setNativeLoading(product.id);
    try {
      const result = await purchaseProduct(product.id as IAPProductId);
      if (result.success) {
        if (onSuccess) onSuccess(product.coins);
        showToast(`+${product.coins.toLocaleString()} coins added!`);
        onClose();
      } else if (result.error !== 'Purchase cancelled') {
        showToast(result.error || 'Purchase failed');
      }
    } catch {
      showToast('Purchase failed');
    } finally {
      setNativeLoading(null);
    }
  };

  const handlePackageSelect = async (coinPackage: CoinPackage) => {
    setSelectedPackage(coinPackage);
    showToast('Coins are digital items and must be purchased via Apple IAP or Google Play Billing.');
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 pointer-events-auto" style={{ zIndex: 99998 }} onClick={onClose} />
      <div
        className="fixed left-0 right-0 z-[999999] pointer-events-auto max-w-[480px] mx-auto"
        style={{ bottom: 'var(--feed-main-pb)' }}
      >
        <div className="bg-[#1C1E24]/95 backdrop-blur-md rounded-t-2xl h-[40vh] flex flex-col shadow-2xl border-t border-[#C9A96E]/20 overflow-hidden">
          <div className="flex justify-center pt-2 pb-1">
            <div className="w-10 h-1 bg-white/20 rounded-full" />
          </div>

          <div className="flex items-center gap-1.5 px-4 pb-2 flex-shrink-0">
            <Coins className="w-3.5 h-3.5 text-[#C9A96E]" strokeWidth={1.8} />
            <span className="text-white font-bold text-[13px]">Recharge Coins</span>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {isNative ? (
              <div className="space-y-2">
                {nativeProducts.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => handleNativePurchase(product)}
                    disabled={nativeLoading === product.id}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/10 hover:bg-[#C9A96E]/10 transition-colors active:scale-[0.98] disabled:opacity-50"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-[#13151A] border border-[#C9A96E]/30 flex items-center justify-center">
                        <Sparkles className="w-3.5 h-3.5 text-[#C9A96E]" strokeWidth={1.8} />
                      </div>
                      <div className="text-left">
                        <p className="text-white text-xs font-semibold">{product.title}</p>
                        {product.price && <p className="text-white/40 text-[10px]">{product.price}</p>}
                      </div>
                    </div>
                    <span className="text-[#C9A96E] text-[10px] font-bold">{nativeLoading === product.id ? 'Processing...' : `${product.coins} coins`}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {WEB_PACKAGES.map((coinPackage) => (
                  <button
                    key={coinPackage.id}
                    onClick={() => handlePackageSelect(coinPackage)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border transition-colors active:scale-[0.98] ${
                      selectedPackage.id === coinPackage.id
                        ? 'bg-[#C9A96E]/10 border-[#C9A96E]/50'
                        : 'bg-white/[0.03] border-white/10 hover:bg-[#C9A96E]/10'
                    }`}
                  >
                    <div className="text-left">
                      <p className="text-white text-xs font-semibold">{coinPackage.label}</p>
                      <p className="text-white/40 text-[10px]">£{coinPackage.price.toFixed(2)}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${selectedPackage.id === coinPackage.id ? 'bg-[#C9A96E] text-black' : 'bg-white/10 text-white/70'}`}>
                      {coinPackage.coins} coins
                    </span>
                  </button>
                ))}
                {/* Custom amount */}
                <div className="flex items-center gap-2 mt-3 px-1">
                  <div className="flex-1 flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2">
                    <Coins className="w-3.5 h-3.5 text-[#C9A96E] flex-shrink-0" strokeWidth={1.8} />
                    <input
                      type="number"
                      min="1"
                      placeholder="Custom amount..."
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      className="bg-transparent text-white text-xs outline-none flex-1 placeholder:text-white/25 min-w-0"
                    />
                  </div>
                  <button
                    onClick={() => {
                      const amt = parseInt(customAmount);
                      if (!amt || amt < 1) { showToast('Enter a valid amount'); return; }
                      const price = Math.round(amt * 0.0035 * 100) / 100;
                      handlePackageSelect({ id: `coins_custom_${amt}`, coins: amt, price, label: `${amt.toLocaleString()} Coins` });
                    }}
                    className="px-3 py-2 rounded-lg bg-[#C9A96E] text-black text-[10px] font-bold active:scale-95 transition-transform flex-shrink-0"
                  >
                    Buy
                  </button>
                </div>
                <p className="text-white/30 text-[10px] text-center pt-2">Digital purchases use Apple IAP / Google Play Billing.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
