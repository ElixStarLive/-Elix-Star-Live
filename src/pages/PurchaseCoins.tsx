import React, { useState, useEffect } from 'react';
import { api } from '../lib/apiClient';
import { Check, Sparkles, RotateCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { trackEvent } from '../lib/analytics';
import { platform } from '../lib/platform';
import {
  purchaseProduct,
  loadProducts as loadIAPProducts,
  restorePurchases,
  initializeIAP,
  IAP_PRODUCTS,
  type IAPProductId,
  type IAPProduct,
} from '../lib/iap';
import { showToast } from '../lib/toast';

export default function PurchaseCoins() {
  const navigate = useNavigate();
  const [nativeProducts, setNativeProducts] = useState<IAPProduct[]>([]);
  const [selectedNativeId, setSelectedNativeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const isNative = platform.isNative;

  useEffect(() => {
    loadCurrentUser();
    if (isNative) {
      loadNativeProducts();
    }
  }, []);

  const loadCurrentUser = async () => {
    try {
      const { data } = await api.auth.getUser();
      setCurrentUserId(data.user?.id || null);
    } catch {
      setCurrentUserId(null);
    }
  };

  const loadNativeProducts = async () => {
    try {
      await initializeIAP();
      const products = await loadIAPProducts();
      if (products.length > 0) {
        setNativeProducts(products);
      } else {
        // Fallback — show products from our config so the page isn't empty
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
      showToast('Failed to load products');
    }
  };

  const handleNativePurchase = async (product: IAPProduct) => {
    if (!currentUserId) {
      showToast('Please log in to purchase coins');
      navigate('/login');
      return;
    }

    setLoading(true);
    setSelectedNativeId(product.id);

    try {
      trackEvent('purchase_intent', {
        package_id: product.id,
        coins: product.coins,
        price: product.price,
      });

      const result = await purchaseProduct(product.id as IAPProductId);

      if (!result.success) {
        if (result.error !== 'Purchase cancelled') {
          showToast(result.error || 'Purchase failed');
        }
        return;
      }

      trackEvent('purchase_success', {
        package_id: product.id,
        coins: product.coins,
        transaction_id: result.transactionId,
      });

      showToast(`+${product.coins.toLocaleString()} coins added!`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Purchase failed');
    } finally {
      setLoading(false);
      setSelectedNativeId(null);
    }
  };

  const handleRestore = async () => {
    try {
      setLoading(true);
      await restorePurchases();
      showToast('Purchases restored');
    } catch {
      showToast('Could not restore purchases');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#13151A] text-white flex justify-center px-2">
      <div className="w-full max-w-[480px] rounded-3xl overflow-hidden bg-[#13151A] flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-[#13151A] z-10 px-4 py-4 border-b border-transparent flex items-center justify-between">
          <button onClick={() => navigate('/feed')} className="p-2 hover:brightness-125 rounded-full transition" title="Back">
            <img src="/Icons/Gold power buton.png" alt="Back" className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold">Get Coins</h1>
          {isNative ? (
            <button onClick={handleRestore} disabled={loading} className="p-2 hover:brightness-125 rounded-full transition" title="Restore purchases">
              <RotateCcw className="w-5 h-5 text-[#C9A96E]" />
            </button>
          ) : (
            <div className="w-10" />
          )}
        </div>

        <div className="px-4 py-6 flex-1 overflow-y-auto">
          {/* Hero */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-gradient-to-br from-[#C9A96E] to-[#B8943F] rounded-full mx-auto mb-4 flex items-center justify-center">
              <Sparkles className="w-10 h-10 text-black" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Buy Coins</h2>
            <p className="text-sm text-white/60">Send gifts, unlock features, and support creators</p>
          </div>

          {/* Products — Native (iOS/Android) */}
          {isNative && (
            <div className="space-y-3 mb-8">
              {nativeProducts.map((product) => (
                <button
                  key={product.id}
                  onClick={() => handleNativePurchase(product)}
                  disabled={loading}
                  className="w-full p-6 rounded-2xl transition relative overflow-hidden bg-white/5 border-2 border-transparent hover:border-[#C9A96E]/40 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-left">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="w-6 h-6 text-[#C9A96E]" />
                        <span className="text-2xl font-bold">{product.coins.toLocaleString()}</span>
                      </div>
                      <p className="text-sm text-white/60">{product.title}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-[#C9A96E]">
                        {product.price || 'Loading…'}
                      </div>
                    </div>
                  </div>

                  {loading && selectedNativeId === product.id && (
                    <div className="mt-4 text-center text-sm text-white/60">Processing…</div>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Web — direct to mobile app */}
          {!isNative && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-8 text-center">
              <Sparkles className="w-10 h-10 text-[#C9A96E] mx-auto mb-3" />
              <h3 className="font-bold text-lg mb-2">Purchase Coins in the App</h3>
              <p className="text-sm text-white/60">
                Coins are digital items and must be purchased through the Elix Star app on your mobile device via Apple App Store or Google Play.
              </p>
            </div>
          )}

          {/* Features */}
          <div className="bg-white/5 rounded-2xl p-6 space-y-4">
            <h3 className="font-bold mb-4">What you can do with coins:</h3>
            <FeatureItem text="Send virtual gifts to your favorite creators" />
            <FeatureItem text="Activate battle boosters during live competitions" />
            <FeatureItem text="Unlock premium features and filters" />
            <FeatureItem text="Support the community and help creators grow" />
          </div>

          {/* No-refund policy */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 mt-6">
            <p className="text-xs text-white/60 text-center font-semibold mb-1">All coin purchases are final and non-refundable.</p>
            <p className="text-[10px] text-white/40 text-center">Coins have no real-world monetary value. Once purchased, coins cannot be returned, exchanged, or transferred. Gifts sent to creators are final. Prices may vary by platform.</p>
          </div>
          <p className="text-xs text-white/40 text-center mt-3 px-4">
            By purchasing, you agree to our{' '}
            <span className="text-white underline cursor-pointer" onClick={() => navigate('/terms')}>Terms of Service</span>{' '}
            and{' '}
            <span className="text-white underline cursor-pointer" onClick={() => navigate('/privacy')}>Privacy Policy</span>.
          </p>
        </div>
      </div>
    </div>
  );
}

function FeatureItem({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-5 h-5 bg-[#C9A96E] rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
        <Check className="w-3 h-3 text-black" />
      </div>
      <p className="text-sm text-white/80">{text}</p>
    </div>
  );
}

