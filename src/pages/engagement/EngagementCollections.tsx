import React, { useEffect, useState } from "react";
import { Gift, Layers, Map, Star } from "lucide-react";
import { EngagementShell } from "./EngagementShell";
import { showToast } from "../../lib/toast";
import { engagementFlags } from "../../config/engagementFlags";
import {
  apiEngagementCreatorCards,
  apiEngagementStickers,
  apiEngagementTreasure,
  apiEngagementTreasureOpen,
} from "../../features/live/engagement/liveEngagementApi";

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
          ? apiEngagementTreasure()
          : Promise.resolve({ data: null, error: null }),
        engagementFlags.stickerCollectionEnabled
          ? apiEngagementStickers()
          : Promise.resolve({ data: null, error: null }),
        engagementFlags.creatorCollectionsEnabled
          ? apiEngagementCreatorCards()
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
      const { data, error } = await apiEngagementTreasureOpen(id);
      if (error) {
        showToast(error || "Open failed");
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
        <p className="text-sm text-center py-10">
          <span className="elix-silver-red-text opacity-50">Loading...</span>
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {engagementFlags.treasureHuntEnabled ? (
            <section>
              <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Map className="w-4 h-4 royce-icon-gold" />
                <span className="elix-silver-red-text">Treasure Hunt</span>
              </h2>
              {chests.length === 0 ? (
                <p className="text-xs">
                  <span className="elix-silver-red-text opacity-55">
                    No chests yet. Watch LIVE to find them.
                  </span>
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {chests.map((c) => (
                    <li
                      key={c.id}
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 flex items-center justify-between gap-2"
                    >
                      <div>
                        <p className="text-sm">
                          <span className="elix-silver-red-text">{c.title || "Chest"}</span>
                        </p>
                        <p className="text-[10px]">
                          <span className="elix-silver-red-text opacity-55">
                            {c.rarity} · {c.status}
                            {c.reward_label ? ` · ${c.reward_label}` : ""}
                          </span>
                        </p>
                      </div>
                      {c.status === "found" ? (
                        <button
                          type="button"
                          disabled={opening === c.id}
                          onClick={() => void openChest(c.id)}
                          className="text-xs font-semibold px-2 py-1 rounded border border-white/30 bg-transparent disabled:opacity-40 active:opacity-70"
                        >
                          <span className="elix-silver-red-text">Open</span>
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
              <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Gift className="w-4 h-4 royce-icon-gold" />
                <span className="elix-silver-red-text">Stickers</span>
              </h2>
              {sets.length === 0 ? (
                <p className="text-xs">
                  <span className="elix-silver-red-text opacity-55">No sticker sets yet.</span>
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {sets.map((s) => (
                    <li
                      key={s.id}
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2"
                    >
                      <p className="text-sm">
                        <span className="elix-silver-red-text">{s.title}</span>
                      </p>
                      <p className="text-[10px]">
                        <span className="elix-silver-red-text opacity-55">
                          {s.progress}/{s.total}
                          {s.complete ? " · Complete" : ""}
                        </span>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {engagementFlags.creatorCollectionsEnabled ? (
            <section>
              <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Star className="w-4 h-4 royce-icon-gold" />
                <span className="elix-silver-red-text">Creator Cards</span>
              </h2>
              {cards.length === 0 ? (
                <p className="text-xs">
                  <span className="elix-silver-red-text opacity-55">
                    Watch creators on LIVE to unlock cards.
                  </span>
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {cards.map((c) => (
                    <li
                      key={`${c.creator_id}-${c.tier}`}
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2"
                    >
                      <p className="text-sm capitalize">
                        <span className="elix-silver-red-text">{c.tier} card</span>
                      </p>
                      <p className="text-[10px] truncate">
                        <span className="elix-silver-red-text opacity-55">{c.creator_id}</span>
                      </p>
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
