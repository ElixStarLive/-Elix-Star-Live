import { useState, useEffect, useRef, useCallback } from 'react';
import { RoyceBackIcon, ShopBasketIcon } from '../components/royce';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../lib/apiClient';
import { useAuthStore } from '../store/useAuthStore';
import { Camera, Tag, MessageCircle, MoreVertical, ChevronLeft, ChevronRight, Trash2, Pencil } from 'lucide-react';
import { StoryGoldRingAvatar } from '../components/StoryGoldRingAvatar';
import { showToast } from '../lib/toast';
import { bunnyUpload } from '../lib/bunnyStorage';
import { openStripeCheckoutUrl } from '../lib/platform';
import { useCartStore } from '../store/useCartStore';
import { apiLiveStreams, connectLiveFeedPresence } from '../lib/live';
import { apiFetchProfiles } from '../features/feed/feedApi';
import { apiShopCheckout, apiShopCheckoutSessionStatus } from '../features/shop/shopApi';
import { returnToFromLocationState, SHOP_EXIT_TO, containerReturnState } from '../lib/settingsNav';
import { reportFailure } from '../lib/reportFailure';

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
  const location = useLocation();
  const { user } = useAuthStore();
  const token = useAuthStore((s) => s.session?.access_token) ?? '';
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
  /** Framing inside dashed preview — scale + pan (listed image matches what you see). */
  const [imgScale, setImgScale] = useState(1);
  const [imgX, setImgX] = useState(0);
  const [imgY, setImgY] = useState(0);
  const [imageTouched, setImageTouched] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [menuItemId, setMenuItemId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const previewFrameRef = useRef<HTMLDivElement | null>(null);
  const previewImgRef = useRef<HTMLImageElement | null>(null);
  const panRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const cartItems = useCartStore((s) => s.items);
  const addToCart = useCartStore((s) => s.add);
  const removeFromCart = useCartStore((s) => s.remove);
  const setCartQuantity = useCartStore((s) => s.setQuantity);
  const clearCart = useCartStore((s) => s.clear);
  const cartUnitCount = useCartStore((s) => s.totalUnits());
  const [showCart, setShowCart] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  /** Sync guard so double-taps cannot fire two Stripe session creates before React re-renders. */
  const checkoutInFlightRef = useRef(false);
  /** Idempotency key for the active checkout attempt (same key if handler re-enters). */
  const checkoutIdempotencyKeyRef = useRef<string | null>(null);
  const cartTotal = cartItems.reduce(
    (sum, i) => sum + (Number(i.price) || 0) * Math.max(1, Math.floor(Number(i.quantity) || 1)),
    0,
  );

  const goBack = useCallback(() => {
    const returnTo = returnToFromLocationState(location.state);
    navigate(returnTo || SHOP_EXIT_TO, { replace: true });
  }, [navigate, location.state]);

  const goSearch = useCallback(() => {
    navigate('/search', { state: containerReturnState('/shop') });
  }, [navigate]);

  const goLiveDiscover = useCallback(() => {
    navigate('/live');
  }, [navigate]);

  const openWatchLive = useCallback((streamKey: string) => {
    navigate(`/watch/${streamKey}`, { state: containerReturnState('/shop') });
  }, [navigate]);

  const openCreateListing = useCallback(() => {
    setShowCart(false);
    setEditingItemId(null);
    setExistingImageUrl(null);
    setNewTitle('');
    setNewDescription('');
    setNewPrice('');
    setNewCategory('other');
    setNewImage(null);
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setNewImagePreview(null);
    setImageTouched(false);
    setImgScale(1);
    setImgX(0);
    setImgY(0);
    setShowCreate(true);
  }, []);

  const closeCreateListing = useCallback(() => {
    setShowCreate(false);
    setEditingItemId(null);
  }, []);

  const openEditListing = useCallback((item: ShopItem) => {
    if (!user?.id || item.user_id !== user.id) {
      showToast('You can only edit your own listings');
      setMenuItemId(null);
      return;
    }
    setMenuItemId(null);
    setShowCart(false);
    setEditingItemId(item.id);
    setExistingImageUrl(item.image_url);
    setNewTitle(item.title || '');
    setNewDescription(item.description || '');
    setNewPrice(String(item.price ?? ''));
    setNewCategory(item.category || 'other');
    setNewImage(null);
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setNewImagePreview(item.image_url);
    setImageTouched(false);
    setImgScale(1);
    setImgX(0);
    setImgY(0);
    setShowCreate(true);
  }, [user?.id]);

  const openCart = useCallback(() => {
    setShowCreate(false);
    setShowCart(true);
  }, []);

  const closeCart = useCallback(() => {
    checkoutInFlightRef.current = false;
    checkoutIdempotencyKeyRef.current = null;
    setCheckingOut(false);
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
    const qty = useCartStore.getState().items.find((i) => i.id === item.id)?.quantity ?? 1;
    showToast(qty > 1 ? `Basket: ${qty}` : 'Added to basket');
  }, [addToCart]);

  const handleCartQtyMinus = useCallback((itemId: string, qty: number) => {
    if (qty <= 1) {
      removeFromCart(itemId);
      return;
    }
    setCartQuantity(itemId, qty - 1);
  }, [removeFromCart, setCartQuantity]);

  const handleCartQtyPlus = useCallback((itemId: string, qty: number) => {
    setCartQuantity(itemId, qty + 1);
  }, [setCartQuantity]);

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
      checkoutInFlightRef.current = false;
      checkoutIdempotencyKeyRef.current = null;
      setCheckingOut(false);
      showToast('Checkout cancelled');
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }
    if (purchase !== 'success') return;

    let cancelled = false;
    (async () => {
      if (!sessionId) {
        checkoutInFlightRef.current = false;
        checkoutIdempotencyKeyRef.current = null;
        setCheckingOut(false);
        showToast('Checkout return incomplete — check email/orders if you paid');
        window.history.replaceState({}, '', window.location.pathname);
        return;
      }
      const { data, error } = await apiShopCheckoutSessionStatus(sessionId);
      if (cancelled) return;
      checkoutInFlightRef.current = false;
      checkoutIdempotencyKeyRef.current = null;
      setCheckingOut(false);
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
          apiLiveStreams().catch((err) => {
            reportFailure('shop_live_streams', err);
            return null;
          }),
          apiFetchProfiles().catch((err) => {
            reportFailure('shop_profiles', err);
            return null;
          }),
        ]);
        if (!streamsResult) {
          /* keep prior liveUsers — do not fake empty streams on failure */
          return;
        }
        const streamsBody = { streams: streamsResult.streams ?? [] };
        const profilesBody = { profiles: profilesResult?.profiles ?? [] };

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
      } catch (e) {
        reportFailure('shop_live_users', e);
        /* keep prior liveUsers — never treat failure as empty success */
      }
    };

    load();
    const disposePresence = token
      ? connectLiveFeedPresence(token, {
          onStreamStarted: () => {
            void load();
          },
          onStreamEnded: () => {
            void load();
          },
        })
      : () => {};
    return () => {
      cancelled = true;
      disposePresence();
    };
  }, [token]);

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
    } catch (err) {
      reportFailure('shop_list_items', err);
      if (!navigator.onLine) showToast('No internet connection');
      else showToast('Failed to load shop items');
      /* keep prior items — do not soft-empty on failure */
    }
    setLoading(false);
  };

  const resetImageFrame = useCallback(() => {
    setImgScale(1);
    setImgX(0);
    setImgY(0);
    panRef.current = null;
    setImageTouched(false);
  }, []);

  const handleImageSelect = (file: File | undefined) => {
    if (!file) return;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const url = URL.createObjectURL(file);
    previewUrlRef.current = url;
    setNewImage(file);
    setNewImagePreview(url);
    resetImageFrame();
    setImageTouched(true);
  };

  /** Export dashed-frame view (scale + pan) as the uploaded shop photo. */
  const bakeFramedImage = useCallback(async (): Promise<File | null> => {
    const frame = previewFrameRef.current;
    const img = previewImgRef.current;
    if (!frame || !img) return null;
    const fw = frame.clientWidth;
    const fh = frame.clientHeight;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (fw < 2 || fh < 2 || nw < 1 || nh < 1) return null;

    const outScale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.round(fw * outScale));
    canvas.height = Math.max(2, Math.round(fh * outScale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#080A0E';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Match preview: object-fit cover in frame, then user scale + pan from center.
    const cover = Math.max(fw / nw, fh / nh);
    const drawW = nw * cover * imgScale;
    const drawH = nh * cover * imgScale;
    const dx = (fw - drawW) / 2 + imgX;
    const dy = (fh - drawH) / 2 + imgY;
    ctx.drawImage(
      img,
      dx * outScale,
      dy * outScale,
      drawW * outScale,
      drawH * outScale,
    );

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.92),
    );
    if (!blob) return null;
    const base = newImage?.name?.replace(/\.[^.]+$/, '') || 'shop';
    return new File([blob], `${base}-framed.jpg`, { type: 'image/jpeg' });
  }, [imgScale, imgX, imgY, newImage]);

  const clearListingForm = useCallback(() => {
    setShowCreate(false);
    setEditingItemId(null);
    setExistingImageUrl(null);
    setNewTitle('');
    setNewDescription('');
    setNewPrice('');
    setNewCategory('other');
    setNewImage(null);
    setNewImagePreview(null);
    resetImageFrame();
  }, [resetImageFrame]);

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
      let imageUrl: string | null = editingItemId ? existingImageUrl : null;

      if (newImage || (imageTouched && newImagePreview)) {
        try {
          const framed = await bakeFramedImage();
          const uploadFile = framed || newImage;
          if (uploadFile) {
            const ext = uploadFile.name?.split('.').pop() || 'jpg';
            const storagePath = `shop/${user.id}/${Date.now()}.${ext}`;
            const result = await bunnyUpload(uploadFile, storagePath, uploadFile.type || 'image/jpeg');
            imageUrl = result.cdnUrl;
          }
        } catch {
          showToast('Image upload failed, keeping previous photo');
        }
      }

      const payload = {
        title: newTitle.trim(),
        description: newDescription.trim(),
        price: Math.round(parsed * 100) / 100,
        image_url: imageUrl,
        category: newCategory,
      };

      if (editingItemId) {
        const { error: updateError } = await api.shop.updateItem(editingItemId, payload);
        if (updateError) throw updateError;
        showToast('Item updated');
      } else {
        const { error: insertError } = await api.shop.createItem({
          ...payload,
          user_id: user.id,
          is_active: true,
        });
        if (insertError) throw insertError;
        showToast('Item listed!');
      }

      clearListingForm();
      fetchItems();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : (editingItemId ? 'Failed to update listing' : 'Failed to create listing');
      showToast(msg);
    }
    setCreating(false);
  };

  const handleCheckoutCart = async () => {
    if (cartItems.length === 0 || checkingOut || checkoutInFlightRef.current) return;
    // Transaction state first (sync) — not a timer. Blocks double-tap before re-render.
    checkoutInFlightRef.current = true;
    setCheckingOut(true);
    if (!checkoutIdempotencyKeyRef.current) {
      checkoutIdempotencyKeyRef.current =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `shop_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
    }
    const idempotencyKey = checkoutIdempotencyKeyRef.current;
    try {
      const { data, error } = await apiShopCheckout({
        items: cartItems.map((i) => ({
          id: i.id,
          quantity: Math.max(1, Math.floor(Number(i.quantity) || 1)),
        })),
        idempotencyKey,
      });
      if (error) throw new Error(error || 'Checkout failed');
      if (data?.url) {
        // Shop is physical goods → Stripe owns payment (Apple Pay / Google Pay /
        // card as Stripe methods). On Android, open Chrome Custom Tabs so Google
        // Pay can appear (WebView cannot). Same Stripe Checkout Session URL.
        await openStripeCheckoutUrl(String(data.url));
        // Keep in-flight until cancel/success return so one tap ≠ second session.
        return;
      }
      throw new Error('Checkout URL missing');
    } catch (err) {
      checkoutInFlightRef.current = false;
      checkoutIdempotencyKeyRef.current = null;
      setCheckingOut(false);
      showToast(err instanceof Error ? err.message : 'Could not start checkout');
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
    if (!user?.id || removingId) return;
    if (item.user_id !== user.id) {
      showToast("You can only delete your own listings");
      setMenuItemId(null);
      return;
    }
    setRemovingId(item.id);
    setMenuItemId(null);
    try {
      const { error } = await api.shop.deleteItem(item.id);
      if (error) throw error;
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      showToast('Item deleted');
    } catch {
      showToast('Failed to delete item');
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
        {/* Header — Search + Live left corner (as before); close right */}
        <header className="flex items-center justify-between px-4 pt-page-header pb-2 relative z-20">
          <div className="flex items-center gap-3 z-10">
            <button
              type="button"
              onClick={goSearch}
              className="text-[12px] font-bold text-white active:opacity-70"
              title="Search"
              aria-label="Search"
            >
              Search
            </button>
            <button
              type="button"
              onClick={goLiveDiscover}
              className="text-[12px] font-bold text-white active:opacity-70"
              title="Live"
              aria-label="Live"
            >
              Live
            </button>
          </div>
          <h1 className="pointer-events-none text-[16px] font-bold text-white absolute left-1/2 -translate-x-1/2">
            Shop
          </h1>
          <button type="button" onClick={goBack} className="relative z-20 p-1" title="Back" aria-label="Back">
            <RoyceBackIcon />
          </button>
        </header>

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

        {/* Same line: Add products / Basket + All / Clothing / Electronics / Accessories */}
        <div className="flex gap-2 px-3 py-3 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={openCreateListing}
            className="px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border border-transparent"
          >
            <span className="elix-silver-red-text">Add products</span>
          </button>
          <button
            type="button"
            onClick={openCart}
            className="px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border border-transparent"
          >
            <span className="elix-silver-red-text">
              Basket{cartUnitCount > 0 ? ` (${cartUnitCount})` : ''}
            </span>
          </button>
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
            <div className="w-8 h-8 border-2 border-[#E6E9EE]/25 border-t-[#E6E9EE] rounded-full animate-spin elix-loader" />
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
                    <img src={item.image_url} alt={item.title} className="w-full aspect-square object-cover" />
                  ) : (
                    <div className="w-full aspect-square bg-white/5 flex items-center justify-center">
                      <Tag size={28} className="text-white/20" />
                    </div>
                  )}
                  <div className="absolute top-0 right-0 z-[2] pt-0.5 pr-0.5">
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
                        <div className="absolute right-0 top-full mt-1 z-[4] min-w-[120px] rounded-xl bg-[#1A1C21] border border-white/15 shadow-lg overflow-hidden">
                          {isOwn ? (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditListing(item)}
                                className="w-full text-left px-3 py-2 text-xs font-semibold text-[#F5F5F7] hover:bg-white/5 flex items-center gap-1.5"
                              >
                                <Pencil size={12} className="text-[#F5F5F7]" />
                                Edit
                              </button>
                              <button
                                type="button"
                                disabled={removingId === item.id}
                                onClick={() => void handleRemoveItem(item)}
                                className="w-full text-left px-3 py-2 text-xs font-semibold text-[#F5F5F7] hover:bg-white/5 flex items-center gap-1.5 disabled:opacity-50"
                              >
                                <Trash2 size={12} className="text-[#F5F5F7]" />
                                {removingId === item.id ? 'Deleting…' : 'Delete'}
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleMessageSeller(item.user_id)}
                              className="w-full text-left px-3 py-2 text-xs font-semibold text-[#F5F5F7] hover:bg-white/5 flex items-center gap-1.5"
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
                <div className="relative border-t border-white/15 px-2.5 py-2 pr-10">
                  <h3 className="text-sm font-bold text-gold-metallic truncate">{item.title}</h3>
                  <p className="text-base font-extrabold text-white mt-0.5">£{item.price.toFixed(2)}</p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddToCart(
                        { id: item.id, title: item.title, price: item.price, image_url: item.image_url },
                        isOwn,
                      );
                    }}
                    className="absolute right-1.5 top-1/2 z-[2] w-8 h-8 rounded-full bg-black/55 border border-white/10 flex items-center justify-center active:opacity-70"
                    style={{ transform: 'translateY(calc(-50% + 2mm))' }}
                    aria-label="Add to basket"
                  >
                    <ShopBasketIcon size={16} className="text-[#F5F5F7]" />
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        )}

        {/* Create Listing — separate opaque panel; close by tapping outside */}
        {showCreate && (
          <>
            <div
              className="fixed inset-0 z-[10050] bg-black/85"
              onClick={closeCreateListing}
              aria-hidden
            />
            <div
              className="fixed left-0 right-0 z-[10051] pointer-events-auto max-w-[480px] mx-auto fixed-above-bottom-nav top-[var(--safe-top,0px)] bottom-[var(--bottom-nav-top)] flex flex-col justify-end"
              onClick={closeCreateListing}
            >
              <div
                className="w-full elix-panel rounded-t-3xl pb-safe border border-black flex flex-col min-h-0"
                style={{
                  maxHeight: '85dvh',
                  height: '85dvh',
                  backgroundColor: 'var(--elix-bg)',
                  backgroundImage: 'var(--elix-page-fill)',
                  backgroundSize: 'var(--elix-fundal-size), var(--elix-fundal-size)',
                  backgroundPosition: 'var(--elix-fundal-position), var(--elix-fundal-position)',
                  backgroundRepeat: 'no-repeat, no-repeat',
                }}
                onClick={e => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label={editingItemId ? 'Edit item' : 'Sell an Item'}
              >
              <div className="flex items-center justify-center pt-3 pb-1 shrink-0">
                <div className="w-10 h-1 rounded-full bg-white/20" />
              </div>
              <div className="flex items-center justify-center px-5 pb-3 shrink-0">
                <h3 className="text-gold-metallic font-bold text-base">
                  {editingItemId ? 'Edit Item' : 'Sell an Item'}
                </h3>
              </div>
              <div className="overflow-y-auto px-5 pb-6 flex-1 min-h-0">
                <div className="mb-4">
                  <div
                    ref={previewFrameRef}
                    className="w-full aspect-video rounded-xl border-2 border-dashed border-[#D8D9DD]/40 bg-black/40 flex flex-col items-center justify-center gap-2 overflow-hidden relative touch-none"
                    onPointerDown={(e) => {
                      if (!newImagePreview) return;
                      e.preventDefault();
                      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
                      panRef.current = {
                        pointerId: e.pointerId,
                        startX: e.clientX,
                        startY: e.clientY,
                        origX: imgX,
                        origY: imgY,
                      };
                    }}
                    onPointerMove={(e) => {
                      const pan = panRef.current;
                      if (!pan || pan.pointerId !== e.pointerId) return;
                      setImgX(pan.origX + (e.clientX - pan.startX));
                      setImgY(pan.origY + (e.clientY - pan.startY));
                      setImageTouched(true);
                    }}
                    onPointerUp={(e) => {
                      if (panRef.current?.pointerId === e.pointerId) panRef.current = null;
                    }}
                    onPointerCancel={(e) => {
                      if (panRef.current?.pointerId === e.pointerId) panRef.current = null;
                    }}
                  >
                    {newImagePreview ? (
                      <img
                        ref={previewImgRef}
                        src={newImagePreview}
                        alt="Preview"
                        draggable={false}
                        crossOrigin={newImagePreview.startsWith('http') ? 'anonymous' : undefined}
                        className="absolute left-1/2 top-1/2 w-full h-full object-cover pointer-events-none select-none"
                        style={{
                          transform: `translate(calc(-50% + ${imgX}px), calc(-50% + ${imgY}px)) scale(${imgScale})`,
                          transformOrigin: 'center center',
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => document.getElementById('shop-image-input')?.click()}
                        className="absolute inset-0 flex flex-col items-center justify-center gap-2"
                      >
                        <Camera size={28} className="text-[#F5F5F7]/50" />
                        <span className="text-white/40 text-xs">Add Photo</span>
                      </button>
                    )}
                  </div>
                  {newImagePreview ? (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-white/40 text-[10px] font-semibold shrink-0">Size</span>
                      <input
                        type="range"
                        min={0.4}
                        max={2}
                        step={0.05}
                        value={imgScale}
                        onChange={(e) => {
                          setImgScale(Number(e.target.value));
                          setImageTouched(true);
                        }}
                        className="flex-1 accent-[#D8D9DD]"
                        aria-label="Photo size"
                      />
                      <button
                        type="button"
                        onClick={() => document.getElementById('shop-image-input')?.click()}
                        className="shrink-0 text-[10px] font-semibold text-[#F5F5F7]/70 px-2 py-1 rounded-lg bg-white/5 border border-white/10"
                      >
                        Change
                      </button>
                    </div>
                  ) : null}
                </div>
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
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm mb-4 focus:outline-none focus:border-[#D8D9DD] [&>option]:bg-[#1A1C21] [&>option]:text-white"
                  aria-label="Category"
                >
                  <option value="clothing">Clothing</option>
                  <option value="electronics">Electronics</option>
                  <option value="accessories">Accessories</option>
                  <option value="other">Other</option>
                </select>

                <button
                  type="button"
                  onClick={handleCreateListing}
                  disabled={creating || !newTitle.trim() || !newPrice.trim()}
                  className="w-full py-3 rounded-xl bg-transparent border border-[#D8D9DD]/40 text-[#F5F5F7] font-bold text-sm disabled:opacity-50"
                >
                  {creating ? (editingItemId ? 'Saving...' : 'Listing...') : (editingItemId ? 'Save changes' : 'List for Sale')}
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
              className="fixed inset-0 z-[10050] bg-black/70"
              onClick={closeCart}
            />
            <div
              className="fixed left-0 right-0 z-[10051] pointer-events-auto max-w-[480px] mx-auto fixed-above-bottom-nav"
              onClick={closeCart}
            >
              <div
                className="w-full rounded-t-3xl pb-safe border border-black overflow-hidden"
                style={{
                  maxHeight: '80dvh',
                  backgroundColor: 'var(--elix-bg)',
                  backgroundImage: 'var(--elix-fundal-image)',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                }}
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-center pt-3 pb-1">
                  <div className="w-10 h-1 rounded-full bg-white/20" />
                </div>
                <div className="relative flex items-center justify-center px-5 pb-3 min-h-[2rem]">
                  <h3 className="text-gold-metallic font-bold text-base">Your basket</h3>
                  {cartItems.length === 1 ? (
                    <div className="absolute right-5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          handleCartQtyMinus(
                            cartItems[0].id,
                            Math.max(1, Math.floor(Number(cartItems[0].quantity) || 1)),
                          )
                        }
                        className="w-7 h-7 rounded-full bg-[#1A1C21] border border-white/15 flex items-center justify-center active:opacity-70"
                        aria-label={`Less ${cartItems[0].title}`}
                      >
                        <ChevronLeft size={16} className="text-[#F5F5F7]" />
                      </button>
                      <span className="min-w-[1.5rem] text-center text-xs font-bold text-[#F5F5F7] tabular-nums">
                        {Math.max(1, Math.floor(Number(cartItems[0].quantity) || 1))}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleCartQtyPlus(
                            cartItems[0].id,
                            Math.max(1, Math.floor(Number(cartItems[0].quantity) || 1)),
                          )
                        }
                        className="w-7 h-7 rounded-full bg-[#1A1C21] border border-white/15 flex items-center justify-center active:opacity-70"
                        aria-label={`More ${cartItems[0].title}`}
                        disabled={Math.max(1, Math.floor(Number(cartItems[0].quantity) || 1)) >= 99}
                      >
                        <ChevronRight size={16} className="text-[#F5F5F7]" />
                      </button>
                    </div>
                  ) : null}
                </div>

                {cartItems.length === 0 ? (
                  <div className="px-5 pb-8 pt-4 flex flex-col items-center gap-2">
                    <ShopBasketIcon size={32} className="text-white/25" />
                    <p className="text-white/40 text-sm">Your basket is empty</p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-y-auto px-5" style={{ maxHeight: 'calc(80dvh - 190px)' }}>
                      {cartItems.map((ci) => {
                        const qty = Math.max(1, Math.floor(Number(ci.quantity) || 1));
                        return (
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
                            <p className="text-sm font-extrabold text-gold-metallic">
                              £{(Number(ci.price) * qty).toFixed(2)}
                              {qty > 1 ? ` × ${qty}` : ''}
                            </p>
                          </div>
                          {cartItems.length > 1 ? (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleCartQtyMinus(ci.id, qty)}
                                className="w-7 h-7 rounded-full bg-[#1A1C21] border border-white/15 flex items-center justify-center active:opacity-70"
                                aria-label={`Less ${ci.title}`}
                              >
                                <ChevronLeft size={16} className="text-[#F5F5F7]" />
                              </button>
                              <span className="min-w-[1.5rem] text-center text-xs font-bold text-[#F5F5F7] tabular-nums">
                                {qty}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCartQtyPlus(ci.id, qty)}
                                className="w-7 h-7 rounded-full bg-[#1A1C21] border border-white/15 flex items-center justify-center active:opacity-70"
                                aria-label={`More ${ci.title}`}
                                disabled={qty >= 99}
                              >
                                <ChevronRight size={16} className="text-[#F5F5F7]" />
                              </button>
                            </div>
                          ) : null}
                        </div>
                        );
                      })}
                    </div>

                    <div className="px-5 pt-3 pb-5">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm text-white/60">Total</span>
                        <span className="text-lg font-extrabold text-white">£{cartTotal.toFixed(2)}</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleCheckoutCart}
                        disabled={checkingOut}
                        className="w-full py-3 rounded-xl bg-[#1A1C21] border border-white/15 text-[#F5F5F7] font-bold text-sm disabled:opacity-50"
                      >
                        {checkingOut ? 'Starting checkout…' : 'Checkout with Stripe'}
                      </button>
                      <p className="text-[10px] text-white/40 text-center mt-2">
                        Pay via Stripe with Apple Pay, Google Pay, or card when available (Clearpay when eligible). Elix Live App will contribute 1% of your purchase to help people in need. Eligible shop refunds are handled via Stripe/support only — not as digital coins. Digital coin purchases are separate and non-refundable.
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
