import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
import { reportFailure } from '@/lib/reportFailure';

/** Above live gift overlay (99999); below EngagementDrawer (1001000). */
const BUY_COINS_Z_BACKDROP = 100050;
const BUY_COINS_Z_PANEL = 100051;

interface BuyCoinsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Call-site compatibility only — never used as a fake post-purchase balance. */
  currentBalance?: number;
  /** Called only with an authoritative post-purchase wallet balance. */
  onSuccess?: (newBalance: number) => void;
}

export const BuyCoinsModal: React.FC<BuyCoinsModalProps> = ({ isOpen, onClose, onSuccess }) => {
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
      } catch (err) {
        if (!cancelled) {
          reportFailure('buy_coins_load_products', err);
          showToast('Failed to load products');
        }
      }
    };
    loadNative();
    return () => { cancelled = true; };
  }, [isOpen, isNative]);

  const resolveAuthoritativeBalance = async (
    newBalance: number | undefined,
  ): Promise<number | null> => {
    if (typeof newBalance === 'number' && Number.isFinite(newBalance)) {
      return Math.max(0, newBalance);
    }
    const { useWalletStore } = await import('@/store/useWalletStore');
    const refreshed = await useWalletStore.getState().fetchWallet();
    if (!refreshed.ok) return null;
    return Math.max(0, useWalletStore.getState().paidBalance);
  };

  const handleNativePurchase = async (product: IAPProduct) => {
    setNativeLoading(product.id);
    try {
      const result = await purchaseProduct(product.id as IAPProductId);
      if (result.success) {
        if (result.restoredOwned) {
          showToast('Previous purchase restored');
        }
        const balance = await resolveAuthoritativeBalance(result.newBalance);
        if (balance != null) {
          onSuccess?.(balance);
          if (!result.restoredOwned) {
            showToast(`Coins updated — balance ${balance.toLocaleString()}`);
          }
        } else {
          reportFailure(
            'buy_coins_balance_unresolved',
            new Error('Purchase verified but wallet balance could not be confirmed'),
            { productId: product.id },
          );
          showToast('Purchase completed. Open wallet to confirm balance.');
        }
        onClose();
      } else if (result.error !== 'Purchase cancelled') {
        showToast(result.error || 'Purchase failed');
      }
    } catch (err) {
      reportFailure('buy_coins_purchase', err, { productId: product.id });
      showToast('Purchase failed');
    } finally {
      setNativeLoading(null);
    }
  };


  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  // Portal to body: gift sheet uses overflow-x-hidden; iOS WKWebView clips nested fixed UI.
  return createPortal(
    <>
      <div
        className="fixed inset-0 bg-black/80 pointer-events-auto"
        style={{ zIndex: BUY_COINS_Z_BACKDROP }}
        onClick={onClose}
        aria-hidden
      />
      <div
        className="fixed left-0 right-0 pointer-events-auto max-w-[480px] mx-auto"
        style={{ zIndex: BUY_COINS_Z_PANEL, bottom: 0 }}
        role="dialog"
        aria-modal="true"
        aria-label="Recharge Coins"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="elix-panel rounded-t-2xl min-h-[52vh] h-[min(58vh,calc(100dvh-18%))] flex flex-col shadow-2xl overflow-hidden relative"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          {/* Solid underlay — blocks gift sheet behind Top Up */}
          <div className="absolute inset-0 bg-[#080A0E]" aria-hidden />
          <div className="relative z-[1] flex flex-col h-full min-h-0">
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
                    type="button"
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
      </div>
    </>,
    document.body,
  );
};
