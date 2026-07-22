import React, { useEffect, useState } from "react";
import { Gift, Layers, Map, Star } from "lucide-react";
import { EngagementShell } from "./EngagementShell";
import { request } from "../../lib/apiClient";
import { showToast } from "../../lib/toast";
import { engagementFlags } from "../../config/engagementFlags";

type Chest = {
  id: string;
  title?: string;
  rarity?: string;
  status?: string;
  reward_label?: string;
};

type StickerSet = {
  id: string;
  title: string;
  progress: number;
  total: number;
  complete: boolean;
};

type CreatorCard = {
  creator_id: string;
  tier: string;
};

/**
 * Phase 1.5 collections — same APIs as LIVE Engagement drawer.
 * Full pages so Hub links work outside LIVE.
 */
export default function EngagementCollections() {
  const [chests, setChests] = useState<Chest[]>([]);
  const [sets, setSets] = useState<StickerSet[]>([]);
  const [cards, setCards] = useState<CreatorCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [tRes, sRes, cRes] = await Promise.all([
        engagementFlags.treasureHuntEnabled
          ? request("/api/engagement/treasure")
          : Promise.resolve({ data: null, error: null }),
        engagementFlags.stickerCollectionEnabled
          ? request("/api/engagement/stickers")
          : Promise.resolve({ data: null, error: null }),
        engagementFlags.creatorCollectionsEnabled
          ? request("/api/engagement/creator-cards")
          : Promise.resolve({ data: null, error: null }),
      ]);
      setChests((tRes.data?.chests as Chest[]) || []);
      setSets((sRes.data?.sets as StickerSet[]) || []);
      setCards((cRes.data?.unlocked as CreatorCard[]) || []);
    } catch {
      showToast("Could not load collections");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openChest = async (id: string) => {
    if (opening) return;
    setOpening(id);
    try {
      const { data, error } = await request(`/api/engagement/treasure/${id}/open`, {
        method: "POST",
      });
      if (error) {
        showToast(error.message || "Open failed");
        return;
      }
      const label = (data?.reward as { reward_label?: string } | undefined)?.reward_label;
      showToast(label || "Chest opened");
      await load();
    } catch {
      showToast("Open failed");
    } finally {
      setOpening(null);
    }
  };

  return (
    <EngagementShell title="Collections" icon={Layers}>
      {loading ? (
        <p className="text-sm text-white/50 text-center py-10">Loading...</p>
      ) : (
        <div className="flex flex-col gap-6">
          {engagementFlags.treasureHuntEnabled ? (
            <section>
              <h2 className="text-sm font-semibold text-[#D4AF37] mb-2 flex items-center gap-2">
                <Map className="w-4 h-4" /> Treasure Hunt
              </h2>
              {chests.length === 0 ? (
                <p className="text-xs text-white/40">No chests yet. Watch LIVE to find them.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {chests.map((c) => (
                    <li
                      key={c.id}
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 flex items-center justify-between gap-2"
                    >
                      <div>
                        <p className="text-sm text-white">{c.title || "Chest"}</p>
                        <p className="text-[10px] text-white/40">
                          {c.rarity} · {c.status}
                          {c.reward_label ? ` · ${c.reward_label}` : ""}
                        </p>
                      </div>
                      {c.status === "found" ? (
                        <button
                          type="button"
                          disabled={opening === c.id}
                          onClick={() => void openChest(c.id)}
                          className="text-xs font-semibold text-[#D4AF37] px-2 py-1 rounded border border-[#C9A227]/40 disabled:opacity-40"
                        >
                          Open
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {engagementFlags.stickerCollectionEnabled ? (
            <section>
              <h2 className="text-sm font-semibold text-[#D4AF37] mb-2 flex items-center gap-2">
                <Gift className="w-4 h-4" /> Stickers
              </h2>
              {sets.length === 0 ? (
                <p className="text-xs text-white/40">No sticker sets yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {sets.map((s) => (
                    <li
                      key={s.id}
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2"
                    >
                      <p className="text-sm text-white">{s.title}</p>
                      <p className="text-[10px] text-white/40">
                        {s.progress}/{s.total}
                        {s.complete ? " · Complete" : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {engagementFlags.creatorCollectionsEnabled ? (
            <section>
              <h2 className="text-sm font-semibold text-[#D4AF37] mb-2 flex items-center gap-2">
                <Star className="w-4 h-4" /> Creator Cards
              </h2>
              {cards.length === 0 ? (
                <p className="text-xs text-white/40">
                  Watch creators on LIVE to unlock cards.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {cards.map((c) => (
                    <li
                      key={`${c.creator_id}-${c.tier}`}
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2"
                    >
                      <p className="text-sm text-white capitalize">{c.tier} card</p>
                      <p className="text-[10px] text-white/40 truncate">{c.creator_id}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}
        </div>
      )}
    </EngagementShell>
  );
}
