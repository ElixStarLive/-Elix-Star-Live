import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, request } from '../lib/apiClient';
import { useAuthStore } from '../store/useAuthStore';
import { Plus, X, Camera, Tag, MessageCircle, Search } from 'lucide-react';
import { AvatarRing } from '../components/AvatarRing';
import { StoryGoldRingAvatar } from '../components/StoryGoldRingAvatar';
import { showToast } from '../lib/toast';
import { bunnyUpload } from '../lib/bunnyStorage';

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
  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  useEffect(() => { fetchItems(); }, [activeFilter]);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [streamsResult, profilesResult] = await Promise.all([
          request('/api/live/streams').catch(() => ({ data: null, error: null })),
          request('/api/profiles').catch(() => ({ data: null, error: null })),
        ]);
        const streamsBody = streamsResult.data ?? { streams: [] };
        const profilesBody = profilesResult.data ?? { profiles: [] };

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
          .map((s: any) => {
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
          .filter((x: any) => !!x.streamKey)
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
        (profiles || []).forEach((p: any) => {
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

  const handleBuy = async (item: ShopItem) => {
    try {
      const { data, error } = await request('/api/shop/checkout', {
        method: 'POST',
        body: JSON.stringify({ itemId: item.id }),
      });
      if (error) throw new Error(error.message || 'Checkout failed');
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error('Checkout URL missing');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not start checkout');
    }
  };

  const contactSeller = async (sellerId: string) => {
    if (!user?.id || sellerId === user.id) return;
    try {
      const { data: thread } = await api.chat.ensureThread(sellerId);
      if (thread?.id) navigate(`/inbox/${thread.id}`);
    } catch {
      showToast('Failed to contact seller');
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
    <div className="fixed inset-0 bg-[#13151A] text-white flex justify-center px-2 pt-[calc(var(--safe-top)+46px)] pb-[var(--bottom-ui-reserve)]">
      <div
        className="w-full max-w-[480px] h-full flex flex-col overflow-hidden"
      >
        <div className="sticky top-0 bg-[#13151A] z-10 px-4 py-3 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-3">
            <button onClick={() => setShowCreate(true)} className="p-1" title="Sell item">
              <Plus size={22} className="text-[#C9A96E]" />
            </button>
            <button onClick={() => navigate('/search')} className="p-1" title="Search">
              <Search size={18} className="text-[#C9A96E]" />
            </button>
          </div>
          <h1 className="text-lg font-bold text-gold-metallic">Shop</h1>
          <button onClick={() => navigate(-1)} className="p-1" title="Back">
            <img src="/Icons/Gold power buton.png" alt="Back" className="w-5 h-5" />
          </button>
        </div>

        {/* Live now circles — between header and filter bar */}
        {liveUsers.length > 0 && (
          <div className="px-4 pt-2 pb-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-white/60">LIVE now</span>
              <button
                type="button"
                onClick={() => navigate('/live')}
                className="text-[11px] font-bold text-[#C9A96E]"
              >
                See all
              </button>
            </div>
            <div className="flex gap-3 overflow-x-auto overflow-y-hidden no-scrollbar py-1">
              {liveUsers.map((u) => (
                <button
                  key={u.streamKey}
                  type="button"
                  onClick={() => navigate(`/watch/${u.streamKey}`)}
                  className="flex-shrink-0 flex flex-col items-center gap-1 active:scale-95 transition-transform"
                  style={{ width: SHOP_LIVE_RING, minWidth: SHOP_LIVE_RING }}
                  title={u.name}
                >
                  <StoryGoldRingAvatar
                    size={SHOP_LIVE_RING}
                    live
                    innerTranslateYmm={0.5}
                    innerDiameterAddMm={1}
                    src={u.avatar || '/Icons/Profile icon.png'}
                    alt={u.name}
                  />
                  <div className="text-[9px] text-white/70 truncate w-full text-center">{u.name}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Filter bar (All / Clothing / ...) */}
        <div className="flex gap-2 px-4 py-3 overflow-x-auto no-scrollbar">
          {filters.map(f => (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors ${
                activeFilter === f.key
                  ? 'bg-[#C9A96E] text-black border-[#C9A96E]'
                  : 'bg-white/5 text-white/60 border-white/10'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-[#C9A96E] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3">
            <Tag size={40} className="text-white/20" />
            <p className="text-white/40 text-sm">No items for sale yet</p>
            <button onClick={() => setShowCreate(true)} className="mt-2 px-5 py-2 rounded-xl bg-[#C9A96E] text-black font-bold text-sm">
              Sell Something
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 px-4 py-2 pb-6 overflow-y-auto">
            {items.map(item => (
              <div key={item.id} className="bg-white/5 rounded-2xl overflow-hidden border border-white/5">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.title} className="w-full aspect-square object-cover" />
                ) : (
                  <div className="w-full aspect-square bg-white/5 flex items-center justify-center">
                    <Tag size={32} className="text-white/20" />
                  </div>
                )}
                <div className="p-3">
                  <h3 className="text-sm font-bold text-gold-metallic truncate">{item.title}</h3>
                  <p className="text-lg font-extrabold text-white mt-0.5">${item.price.toFixed(2)}</p>
                  {item.description && (
                    <p className="text-[11px] text-white/40 mt-1 line-clamp-2">{item.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <button onClick={() => navigate(`/profile/${item.user_id}`)} className="flex items-center gap-1.5 min-w-0 flex-1">
                      <AvatarRing src={(item.seller as any)?.avatar_url} alt="Seller" size={20} />
                      <span className="text-[11px] text-white/60 truncate">
                        {(item.seller as any)?.display_name || (item.seller as any)?.username || 'User'}
                      </span>
                    </button>
                    {item.user_id !== user?.id && (
                      <button onClick={() => contactSeller(item.user_id)} className="p-1.5 rounded-full bg-[#C9A96E]/20" title="Message seller">
                        <MessageCircle size={14} className="text-[#C9A96E]" />
                      </button>
                    )}
                  </div>

                  {item.user_id !== user?.id && (
                    <button
                      type="button"
                      onClick={() => handleBuy(item)}
                      className="w-full mt-3 py-2 rounded-xl bg-[#C9A96E] text-black font-extrabold text-[12px]"
                    >
                      Buy with Stripe
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Listing Modal */}
        {showCreate && (
          <>
            <div
              className="fixed inset-0 z-[9998] bg-black/70"
              onClick={() => setShowCreate(false)}
            />
            {/* Anchor the modal exactly to the top of the bottom bar (no extra gap). */}
            <div className="fixed left-0 right-0 z-[9999] pointer-events-auto max-w-[480px] mx-auto" style={{ bottom: 'var(--bottom-ui-reserve)' }}>
              <div
                className="w-full bg-[#1C1E24] rounded-t-3xl border-2 border-b-0 border-[#C9A96E] pb-safe"
                style={{ maxHeight: '80dvh', boxShadow: '0 -4px 30px rgba(201,169,110,0.25)' }}
                onClick={e => e.stopPropagation()}
              >
              <div className="flex items-center justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-white/20" />
              </div>
              <div className="flex items-center justify-between px-5 pb-3">
                <h3 className="text-gold-metallic font-bold text-base">Sell an Item</h3>
                <button onClick={() => setShowCreate(false)} title="Close">
                  <X size={20} className="text-white/50" />
                </button>
              </div>
              <div className="overflow-y-auto px-5 pb-6" style={{ maxHeight: 'calc(80dvh - 70px)' }}>
                <button
                  onClick={() => document.getElementById('shop-image-input')?.click()}
                  className="w-full aspect-video rounded-xl border-2 border-dashed border-[#C9A96E]/40 flex flex-col items-center justify-center gap-2 mb-4 overflow-hidden"
                >
                  {newImagePreview ? (
                    <img src={newImagePreview} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <>
                      <Camera size={28} className="text-[#C9A96E]/50" />
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
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/30 mb-3 focus:outline-none focus:border-[#C9A96E]"
                />
                <input
                  value={newPrice}
                  onChange={e => setNewPrice(e.target.value)}
                  placeholder="Price ($)"
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/30 mb-3 focus:outline-none focus:border-[#C9A96E]"
                />
                <textarea
                  value={newDescription}
                  onChange={e => setNewDescription(e.target.value)}
                  placeholder="Description (optional)"
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/30 mb-3 focus:outline-none focus:border-[#C9A96E] resize-none"
                />
                <select
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm mb-4 focus:outline-none focus:border-[#C9A96E] [&>option]:bg-[#1C1E24] [&>option]:text-white"
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
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-[#C9A96E] to-[#E8D5A3] text-black font-bold text-sm disabled:opacity-50"
                >
                  {creating ? 'Listing...' : 'List for Sale'}
                </button>
              </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
