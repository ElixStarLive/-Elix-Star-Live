import React, { useState, useEffect } from 'react';
import { Coins, Sparkles } from 'lucide-react';
import { platform } from '@/lib/platform';
import {
  loadProducts as loadIAPProducts,
  purchaseProduct,
  initializeIAP,
  reconcileOwnedCoinPurchases,
  type IAPProductId,
  type IAPProduct,
} from '@/lib/iap';
import { showToast } from '@/lib/toast';

interface BuyCoinsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Current wallet balance — used only if server verify omits newBalance. */
  currentBalance?: number;
  /** Called with the absolute post-purchase wallet balance. */
  onSuccess?: (newBalance: number) => void;
}

export const BuyCoinsModal: React.FC<BuyCoinsModalProps> = ({ isOpen, onClose, onSuccess, currentBalance }) => {
  const [nativeProducts, setNativeProducts] = useState<IAPProduct[]>([]);
  const [nativeLoading, setNativeLoading] = useState<string | null>(null);
  const isNative = platform.isNative;

  useEffect(() => {
    if (!isOpen || !isNative) return;
    let cancelled = false;
    const loadNative = async () => {
      try {
        await initializeIAP();
        // Recover stuck owned-but-uncredited purchases before showing the shop.
        await reconcileOwnedCoinPurchases();
        const products = await loadIAPProducts();
        if (cancelled) return;
        if (products.length > 0) {
          setNativeProducts(products);
        } else {
          setNativeProducts([]);
          showToast('Coin store unavailable. Try again in a moment.');
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
        if (result.restoredOwned) {
          showToast('Previous purchase restored');
          if (onSuccess && typeof result.newBalance === 'number') {
            onSuccess(result.newBalance);
          } else if (onSuccess) {
            const { useWalletStore } = await import('@/store/useWalletStore');
            const refreshed = await useWalletStore.getState().fetchWallet();
            if (refreshed.ok) {
              onSuccess(useWalletStore.getState().paidBalance);
            } else if (typeof currentBalance === 'number') {
              onSuccess(currentBalance);
            }
          }
          onClose();
          return;
        }
        if (onSuccess) {
          if (typeof result.newBalance === 'number') {
            onSuccess(result.newBalance);
          } else {
            // Server did not return an authoritative balance (rare). Do NOT add
            // product.coins to the current balance — on a deduplicated/restored
            // purchase the coins were already credited, so adding again would
            // double-count in the displayed balance. Keep the known balance;
            // the next wallet refresh reconciles the real value.
            const base = typeof currentBalance === 'number' ? currentBalance : 0;
            onSuccess(Math.max(0, base));
          }
        }
        if (typeof result.newBalance === 'number') {
          showToast(`Coins updated — balance ${result.newBalance.toLocaleString()}`);
        } else {
          showToast('Purchase completed. Refresh if balance looks wrong.');
        }
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


  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 pointer-events-auto" style={{ zIndex: 99998 }} onClick={onClose} />
      <div
        className="fixed left-0 right-0 z-[999999] pointer-events-auto max-w-[480px] mx-auto"
        style={{ bottom: 'var(--bottom-nav-top)' }}
      >
        <div className="bg-[rgba(255,255,255,0.06)] backdrop-blur-md rounded-t-2xl h-[40vh] flex flex-col shadow-2xl overflow-hidden">
          <div className="flex justify-center pt-2 pb-1">
            <div className="w-10 h-1 bg-white/20 rounded-full" />
          </div>

          <div className="flex items-center gap-1.5 px-4 pb-2 flex-shrink-0">
            <Coins className="w-3.5 h-3.5 text-[#D9A62E]" strokeWidth={1.8} />
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
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/10 hover:bg-white/5 transition-colors active:scale-[0.98] disabled:opacity-50"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-[rgba(0,0,0,0.35)] border border-[#D8D9DD]/30 flex items-center justify-center">
                        <Sparkles className="w-3.5 h-3.5 text-[#F5F5F7]" strokeWidth={1.8} />
                      </div>
                      <div className="text-left">
                        <p className="text-white text-xs font-semibold">{product.title}</p>
                        {product.price && <p className="text-white/40 text-[10px]">{product.price}</p>}
                      </div>
                    </div>
                    <span className="text-[#D9A62E] text-[10px] font-bold">{nativeLoading === product.id ? 'Processing...' : `${product.coins} coins`}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <Sparkles className="w-8 h-8 text-[#F5F5F7] mb-3" />
                <p className="text-white text-xs font-semibold mb-1">Purchase Coins in the App</p>
                <p className="text-white/40 text-[10px] px-4">Coins are digital items and must be purchased through the Elix Star app on your mobile device.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
