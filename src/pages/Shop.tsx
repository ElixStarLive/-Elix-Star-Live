import { useState, useEffect, useRef, useCallback } from 'react';
import { RoyceBackIcon, ShopBasketIcon } from '../components/royce';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/apiClient';
import { useAuthStore } from '../store/useAuthStore';
import { Plus, Camera, Tag, MessageCircle, Search, MoreVertical, X } from 'lucide-react';
import { StoryGoldRingAvatar } from '../components/StoryGoldRingAvatar';
import { showToast } from '../lib/toast';
import { bunnyUpload } from '../lib/bunnyStorage';
import { openExternalLink } from '../lib/platform';
import { useCartStore } from '../store/useCartStore';
import { apiLiveStreams } from '../lib/live';
import { apiFetchProfiles } from '../features/feed/feedApi';
import { apiShopCheckout, apiShopCheckoutSessionStatus } from '../features/shop/shopApi';

const SHOP_LIVE_RING = 56;

interface ShopItem {
  id: string;
  user_id: string;
  seller_id?: string; // alias for user_id when reading from join
  title: string;
  description: string;
  price: number;
  currency?: string;
  image_url: string | null;
  category: string;
  status?: string;
  is_active?: boolean;
  created_at: string;
  seller?: { username: string; avatar_url: string | null; display_name: string | null };
}

export default function Shop() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [items, setItems] = useState<ShopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'clothing' | 'electronics' | 'accessories' | 'other'>('all');
  const [liveUsers, setLiveUsers] = useState<{ id: string; name: string; avatar: string; streamKey: string }[]>([]);

  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newCategory, setNewCategory] = useState('other');
  const [newImage, setNewImage] = useState<File | null>(null);
  const [newImagePreview, setNewImagePreview] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [menuItemId, setMenuItemId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const cartItems = useCartStore((s) => s.items);
  const addToCart = useCartStore((s) => s.add);
  const removeFromCart = useCartStore((s) => s.remove);
  const clearCart = useCartStore((s) => s.clear);
  const [showCart, setShowCart] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const cartTotal = cartItems.reduce((sum, i) => sum + (Number(i.price) || 0), 0);

  const goBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const goSearch = useCallback(() => {
    navigate('/search');
  }, [navigate]);

  const goLiveDiscover = useCallback(() => {
    navigate('/live');
  }, [navigate]);

  const openWatchLive = useCallback((streamKey: string) => {
    navigate(`/watch/${streamKey}`);
  }, [navigate]);

  const openCreateListing = useCallback(() => {
    setShowCreate(true);
  }, []);

  const closeCreateListing = useCallback(() => {
    setShowCreate(false);
  }, []);

  const openCart = useCallback(() => {
    setShowCart(true);
  }, []);

  const closeCart = useCallback(() => {
    setShowCart(false);
  }, []);

  const selectFilter = useCallback((key: typeof activeFilter) => {
    setActiveFilter(key);
  }, []);

  const toggleItemMenu = useCallback((itemId: string, menuOpen: boolean) => {
    setMenuItemId(menuOpen ? null : itemId);
  }, []);

  const closeItemMenu = useCallback(() => {
    setMenuItemId(null);
  }, []);

  const handleAddToCart = useCallback((item: { id: string; title: string; price: number; image_url: string | null }, isOwn: boolean) => {
    if (isOwn) {
      showToast("You can't add your own listing to basket");
      return;
    }
    addToCart(item);
    showToast('Added to basket');
  }, [addToCart]);

  const handleRemoveFromCart = useCallback((itemId: string) => {
    removeFromCart(itemId);
  }, [removeFromCart]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  // Returning from Stripe checkout: confirm payment_status via server (buyer-scoped).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const purchase = params.get('purchase');
    const sessionId = params.get('session_id');
    if (purchase === 'cancelled') {
      showToast('Checkout cancelled');
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }
    if (purchase !== 'success') return;

    let cancelled = false;
    (async () => {
      if (!sessionId) {
        showToast('Checkout return incomplete — check email/orders if you paid');
        window.history.replaceState({}, '', window.location.pathname);
        return;
      }
      const { data, error } = await apiShopCheckoutSessionStatus(sessionId);
      if (cancelled) return;
      if (error) {
        showToast(error || 'Could not confirm payment status');
      } else if (data?.paid) {
        clearCart();
        setShowCart(false);
        showToast('Payment confirmed');
      } else {
        showToast(
          `Checkout returned — payment status: ${data?.payment_status || 'pending'}. Cart kept until payment confirms.`,
        );
      }
      window.history.replaceState({}, '', window.location.pathname);
    })();

    return () => {
      cancelled = true;
    };
  }, [clearCart]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchItems(); }, [activeFilter]);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [streamsResult, profilesResult] = await Promise.all([
          apiLiveStreams().catch(() => ({ streams: [], error: null })),
          apiFetchProfiles().catch(() => ({ profiles: [], error: null })),
        ]);
        const streamsBody = { streams: streamsResult.streams ?? [] };
        const profilesBody = { profiles: profilesResult.profiles ?? [] };

        const profiles = Array.isArray(profilesBody?.profiles) ? profilesBody.profiles : [];
        const byId = new Map<string, { name: string; avatar: string }>();
        for (const p of profiles) {
          const id = String(p.user_id ?? p.userId ?? '');
          if (!id) continue;
          const name = String(p.display_name ?? p.displayName ?? p.username ?? 'User');
          const avatar = String(p.avatar_url ?? p.avatarUrl ?? '');
          byId.set(id, { name, avatar });
        }

        const streams = Array.isArray(streamsBody?.streams) ? streamsBody.streams : [];
        const mapped = streams
          .map((s: Record<string, unknown>) => {
            const userId = String(s.user_id ?? s.userId ?? '');
            const streamKey = String(s.stream_key ?? s.streamKey ?? s.room_id ?? userId);
            const prof = byId.get(userId);
            return {
              id: userId || streamKey,
              name: prof?.name || String(s.display_name ?? s.title ?? 'Live'),
              avatar: prof?.avatar || '',
              streamKey,
            };
          })
          .filter((x) => !!x.streamKey)
          .slice(0, 25);

        if (!cancelled) setLiveUsers(mapped);
      } catch {
        if (!cancelled) setLiveUsers([]);
      }
    };

    load();
    const t = window.setInterval(load, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const { data: rows, error } = await api.shop.listItems();
      if (error) throw error;
      let list = (rows as ShopItem[]) || [];
      if (activeFilter !== 'all') {
        list = list.filter((item: ShopItem) => item.category === activeFilter);
      }
      if (list.length > 0) {
        const userIds = new Set(list.map((i: ShopItem) => i.user_id).filter(Boolean));
        const { data: profiles } = await api.profiles.list();
        const byId: Record<string, { username: string; display_name: string | null; avatar_url: string | null }> = {};
        (profiles || []).forEach((p: { user_id?: string; userId?: string; username?: string; display_name?: string; displayName?: string; avatar_url?: string; avatarUrl?: string }) => {
          const uid = p.user_id ?? p.userId ?? '';
          if (userIds.has(uid)) {
            byId[uid] = { username: p.username || 'user', display_name: p.display_name ?? p.displayName ?? null, avatar_url: p.avatar_url ?? p.avatarUrl ?? null };
          }
        });
        list.forEach((item: ShopItem) => { item.seller = byId[item.user_id]; });
      }
      setItems(list);
    } catch {
      setItems([]);
      if (!navigator.onLine) showToast('No internet connection');
      else showToast('Failed to load shop items');
    }
    setLoading(false);
  };

  const handleImageSelect = (file: File | undefined) => {
    if (!file) return;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const url = URL.createObjectURL(file);
    previewUrlRef.current = url;
    setNewImage(file);
    setNewImagePreview(url);
  };

  const handleCreateListing = async () => {
    if (!user?.id || !newTitle.trim() || !newPrice.trim()) {
      showToast('Please fill in title and price');
      return;
    }
    const parsed = parseFloat(newPrice);
    if (isNaN(parsed) || parsed <= 0) {
      showToast('Invalid price');
      return;
    }
    setCreating(true);
    try {
      let imageUrl: string | null = null;

      if (newImage) {
        try {
          const ext = newImage.name?.split('.').pop() || 'jpg';
          const storagePath = `shop/${user.id}/${Date.now()}.${ext}`;
          const result = await bunnyUpload(newImage, storagePath, newImage.type);
          imageUrl = result.cdnUrl;
        } catch {
          showToast('Image upload failed, listing without image');
        }
      }

      const { error: insertError } = await api.shop.createItem({
        user_id: user.id,
        title: newTitle.trim(),
        description: newDescription.trim(),
        price: Math.round(parsed * 100) / 100,
        image_url: imageUrl,
        category: newCategory,
        is_active: true,
      });

      if (insertError) throw insertError;

      showToast('Item listed!');
      setShowCreate(false);
      setNewTitle('');
      setNewDescription('');
      setNewPrice('');
      setNewCategory('other');
      setNewImage(null);
      setNewImagePreview(null);
      fetchItems();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : 'Failed to create listing';
      showToast(msg);
    }
    setCreating(false);
  };

  const handleCheckoutCart = async () => {
    if (cartItems.length === 0 || checkingOut) return;
    setCheckingOut(true);
    try {
      const { data, error } = await apiShopCheckout({
        items: cartItems.map((i) => ({ id: i.id })),
      });
      if (error) throw new Error(error || 'Checkout failed');
      if (data?.url) {
        // Shop is physical goods → Stripe is correct. On native, open the
        // system browser so checkout does not hijack the Capacitor WebView.
        openExternalLink(String(data.url));
        return;
      }
      throw new Error('Checkout URL missing');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not start checkout');
    } finally {
      setCheckingOut(false);
    }
  };

  const contactSeller = useCallback(async (sellerId: string) => {
    if (!user?.id || sellerId === user.id) return;
    try {
      const { data: thread } = await api.chat.ensureThread(sellerId);
      if (thread?.id) navigate(`/inbox/${thread.id}`);
    } catch {
      showToast('Failed to contact seller');
    }
  }, [navigate, user?.id]);

  const handleMessageSeller = useCallback((sellerId: string) => {
    setMenuItemId(null);
    void contactSeller(sellerId);
  }, [contactSeller]);

  const handleRemoveItem = async (item: ShopItem) => {
    if (!user?.id || item.user_id !== user.id || removingId) return;
    setRemovingId(item.id);
    setMenuItemId(null);
    try {
      const { error } = await api.shop.deleteItem(item.id);
      if (error) throw error;
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      showToast('Item removed');
    } catch {
      showToast('Failed to remove item');
    } finally {
      setRemovingId(null);
    }
  };

  const filters = [
    { key: 'all', label: 'All' },
    { key: 'clothing', label: 'Clothing' },
    { key: 'electronics', label: 'Electronics' },
    { key: 'accessories', label: 'Accessories' },
    { key: 'other', label: 'Other' },
  ] as const;

  return (
    <div className="page-above-bottom-nav bg-transparent text-white">
      <div className="page-above-bottom-nav__inner">
        {/* Header — same size container as STEM */}
        <div
          className="w-full shrink-0 bg-[rgba(0,0,0,0.35)] z-10 border-b border-white/5"
          style={{ paddingTop: 'var(--topnav-anchor-top)' }}
        >
          <div
            className="w-full px-3 flex items-center justify-between"
            style={{ minHeight: 'var(--topnav-bar-height)' }}
          >
            <div className="flex items-center gap-1">
              <button onClick={openCreateListing} className="p-1" title="Sell item">
                <Plus size={18} className="text-white" />
              </button>
              <button onClick={goSearch} className="p-1" title="Search">
                <Search size={18} className="text-white" />
              </button>
              <button onClick={openCart} className="p-1 relative" title="Basket">
                <ShopBasketIcon size={18} active={cartItems.length > 0} className="text-white" />
                {cartItems.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-full bg-[#6F3FF5] text-white text-[9px] font-extrabold flex items-center justify-center leading-none">
                    {cartItems.length}
                  </span>
                )}
              </button>
            </div>
            <h1 className="text-sm font-bold text-white">Shop</h1>
            <button onClick={goBack} className="p-1" title="Back">
              <RoyceBackIcon />
            </button>
          </div>
        </div>

        {/* Live now circles — between header and filter bar */}
        {liveUsers.length > 0 && (
          <div className="px-3 pt-2 pb-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-white/60">LIVE now</span>
              <button
                type="button"
                onClick={goLiveDiscover}
                className="text-[11px] font-bold text-[#F5F5F7]"
              >
                See all
              </button>
            </div>
            <div className="flex gap-3 overflow-x-auto overflow-y-hidden no-scrollbar py-1">
              {liveUsers.map((u) => (
                <button
                  key={u.streamKey}
                  type="button"
                  onClick={() => openWatchLive(u.streamKey)}
                  className="flex-shrink-0 flex flex-col items-center gap-1 active:scale-95 transition-transform"
                  style={{ width: SHOP_LIVE_RING, minWidth: SHOP_LIVE_RING }}
                  title={u.name}
                >
                  <StoryGoldRingAvatar
                    size={SHOP_LIVE_RING}
                    live
                    innerTranslateYmm={0.5}
                    innerDiameterAddMm={1}
                    src={u.avatar || '/royce/default-avatar.svg'}
                    alt={u.name}
                  />
                  <div className="text-[9px] text-white/70 truncate w-full text-center">{u.name}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Filter bar (All / Clothing / ...) */}
        <div className="flex gap-2 px-3 py-3 overflow-x-auto no-scrollbar">
          {filters.map(f => (
            <button
              key={f.key}
              onClick={() => selectFilter(f.key)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border border-transparent transition-opacity ${
                activeFilter === f.key ? 'opacity-100' : 'opacity-45'
              }`}
            >
              <span className="elix-silver-red-text">{f.label}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-[#6F3FF5]/25 border-t-[#6F3FF5] rounded-full animate-spin elix-loader" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3">
            <Tag size={40} className="text-white/20" />
            <p className="text-white/40 text-sm">No items for sale yet</p>
            <button onClick={openCreateListing} className="mt-2 px-5 py-2 rounded-xl bg-transparent border border-white/30 font-bold text-sm active:opacity-70">
              <span className="elix-silver-red-text">Sell Something</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 px-3 py-2 pb-6 overflow-y-auto">
            {items.map(item => {
              const isOwn = item.user_id === user?.id;
              const menuOpen = menuItemId === item.id;
              return (
              <div key={item.id} className="bg-white/5 rounded-2xl overflow-hidden border border-white/5 relative">
                <div className="relative">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.title} className="w-full aspect-[4/3] object-cover" />
                  ) : (
                    <div className="w-full aspect-[4/3] bg-white/5 flex items-center justify-center">
                      <Tag size={28} className="text-white/20" />
                    </div>
                  )}
                  <div className="absolute top-1.5 right-1.5 z-[2]">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleItemMenu(item.id, menuOpen);
                      }}
                      className="p-1.5 rounded-full bg-black/55 border border-white/10"
                      aria-label="Item options"
                    >
                      <MoreVertical size={14} className="text-white" />
                    </button>
                    {menuOpen && (
                      <>
                        <button
                          type="button"
                          className="fixed inset-0 z-[3]"
                          aria-label="Close menu"
                          onClick={closeItemMenu}
                        />
                        <div className="absolute right-0 top-full mt-1 z-[4] min-w-[120px] rounded-xl bg-[rgba(0,0,0,0.35)] border border-white/10 shadow-lg overflow-hidden">
                          {isOwn ? (
                            <button
                              type="button"
                              disabled={removingId === item.id}
                              onClick={() => handleRemoveItem(item)}
                              className="w-full text-left px-3 py-2 text-xs font-semibold text-red-400 hover:bg-white/5 disabled:opacity-50"
                            >
                              {removingId === item.id ? 'Removing…' : 'Remove'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleMessageSeller(item.user_id)}
                              className="w-full text-left px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/5 flex items-center gap-1.5"
                            >
                              <MessageCircle size={12} className="text-[#F5F5F7]" />
                              Message
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div className="border-t border-white/15 px-2.5 py-2 pr-10 relative">
                  <h3 className="text-sm font-bold text-gold-metallic truncate">{item.title}</h3>
                  <p className="text-base font-extrabold text-white mt-0.5">£{item.price.toFixed(2)}</p>
                  {cartItems.some((c) => c.id === item.id) ? (
                    <button
                      type="button"
                      onClick={() => handleRemoveFromCart(item.id)}
                      className="absolute bottom-1.5 right-1.5 w-7 h-7 flex items-center justify-center rounded-full bg-white/10 border border-[#6F3FF5]/55"
                      aria-label="Remove from basket"
                      title="Remove from basket"
                    >
                      <ShopBasketIcon size={15} active className="text-[#6F3FF5]" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleAddToCart({ id: item.id, title: item.title, price: item.price, image_url: item.image_url }, isOwn)}
                      className="absolute bottom-1.5 right-1.5 w-7 h-7 flex items-center justify-center rounded-full bg-black/60 border border-white/15 active:opacity-70"
                      aria-label="Add to basket"
                      title="Add to basket"
                    >
                      <ShopBasketIcon size={15} className="text-white" />
                    </button>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        )}

        {/* Create Listing Modal */}
        {showCreate && (
          <>
            <div
              className="fixed inset-0 z-[9998] bg-black/70"
              onClick={closeCreateListing}
            />
            {/* Anchor the modal exactly to the top of the bottom bar (no extra gap). */}
            <div className="fixed left-0 right-0 z-[9999] pointer-events-auto max-w-[480px] mx-auto fixed-above-bottom-nav">
              <div
                className="w-full bg-[rgba(0,0,0,0.35)] rounded-t-3xl pb-safe"
                style={{ maxHeight: '80dvh', boxShadow: '0 -4px 30px rgba(255,255,255,0.25)' }}
                onClick={e => e.stopPropagation()}
              >
              <div className="flex items-center justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-white/20" />
              </div>
              <div className="flex items-center justify-center px-5 pb-3">
                <h3 className="text-gold-metallic font-bold text-base">Sell an Item</h3>
              </div>
              <div className="overflow-y-auto px-5 pb-6" style={{ maxHeight: 'calc(80dvh - 70px)' }}>
                <button
                  onClick={() => document.getElementById('shop-image-input')?.click()}
                  className="w-full aspect-video rounded-xl border-2 border-dashed border-[#D8D9DD]/40 flex flex-col items-center justify-center gap-2 mb-4 overflow-hidden"
                >
                  {newImagePreview ? (
                    <img src={newImagePreview} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <>
                      <Camera size={28} className="text-[#F5F5F7]/50" />
                      <span className="text-white/40 text-xs">Add Photo</span>
                    </>
                  )}
                </button>
                <input
                  id="shop-image-input"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  aria-label="Upload item photo"
                  onChange={e => handleImageSelect(e.target.files?.[0])}
                />

                <input
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="Item name"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/30 mb-3 focus:outline-none focus:border-[#D8D9DD]"
                />
                <input
                  value={newPrice}
                  onChange={e => setNewPrice(e.target.value)}
                  placeholder="Price (£)"
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/30 mb-3 focus:outline-none focus:border-[#D8D9DD]"
                />
                <textarea
                  value={newDescription}
                  onChange={e => setNewDescription(e.target.value)}
                  placeholder="Description (optional)"
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/30 mb-3 focus:outline-none focus:border-[#D8D9DD] resize-none"
                />
                <select
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm mb-4 focus:outline-none focus:border-[#D8D9DD] [&>option]:bg-[rgba(0,0,0,0.35)] [&>option]:text-white"
                  aria-label="Category"
                >
                  <option value="clothing">Clothing</option>
                  <option value="electronics">Electronics</option>
                  <option value="accessories">Accessories</option>
                  <option value="other">Other</option>
                </select>

                <button
                  onClick={handleCreateListing}
                  disabled={creating || !newTitle.trim() || !newPrice.trim()}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-[#D8D9DD] to-[#D8D9DD] text-black font-bold text-sm disabled:opacity-50"
                >
                  {creating ? 'Listing...' : 'List for Sale'}
                </button>
              </div>
              </div>
            </div>
          </>
        )}

        {/* Basket sheet — review items and checkout once with Stripe */}
        {showCart && (
          <>
            <div
              className="fixed inset-0 z-[9998] bg-black/70"
              onClick={closeCart}
            />
            <div className="fixed left-0 right-0 z-[9999] pointer-events-auto max-w-[480px] mx-auto fixed-above-bottom-nav">
              <div
                className="w-full bg-[rgba(0,0,0,0.35)] rounded-t-3xl pb-safe"
                style={{ maxHeight: '80dvh', boxShadow: '0 -4px 30px rgba(255,255,255,0.25)' }}
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-center pt-3 pb-1">
                  <div className="w-10 h-1 rounded-full bg-white/20" />
                </div>
                <div className="flex items-center justify-between px-5 pb-3">
                  <h3 className="text-gold-metallic font-bold text-base">Your basket</h3>
                  <button onClick={closeCart} className="p-1" aria-label="Close basket">
                    <X size={18} className="text-white/70" />
                  </button>
                </div>

                {cartItems.length === 0 ? (
                  <div className="px-5 pb-8 pt-4 flex flex-col items-center gap-2">
                    <ShopBasketIcon size={32} className="text-white/25" />
                    <p className="text-white/40 text-sm">Your basket is empty</p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-y-auto px-5" style={{ maxHeight: 'calc(80dvh - 190px)' }}>
                      {cartItems.map((ci) => (
                        <div key={ci.id} className="flex items-center gap-3 py-2 border-b border-white/5">
                          {ci.image_url ? (
                            <img src={ci.image_url} alt={ci.title} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                              <Tag size={16} className="text-white/20" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{ci.title}</p>
                            <p className="text-sm font-extrabold text-gold-metallic">£{Number(ci.price).toFixed(2)}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveFromCart(ci.id)}
                            className="p-1.5 rounded-full bg-white/5 border border-white/10"
                            aria-label={`Remove ${ci.title}`}
                          >
                            <X size={14} className="text-white/70" />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="px-5 pt-3 pb-5">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm text-white/60">Total</span>
                        <span className="text-lg font-extrabold text-white">£{cartTotal.toFixed(2)}</span>
                      </div>
                      <button
                        onClick={handleCheckoutCart}
                        disabled={checkingOut}
                        className="w-full py-3 rounded-xl bg-gradient-to-r from-[#D8D9DD] to-[#D8D9DD] text-black font-bold text-sm disabled:opacity-50"
                      >
                        {checkingOut ? 'Starting checkout…' : 'Checkout with Stripe'}
                      </button>
                      <p className="text-[10px] text-white/40 text-center mt-2">
                        Shop orders are paid with Stripe. Eligible shop refunds are handled via Stripe/support only — not as digital coins. Digital coin purchases are separate and non-refundable.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
