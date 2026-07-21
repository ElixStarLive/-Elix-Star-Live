import React, { useEffect, useState } from 'react';
import { Trophy, Flame, Gift, Users, CalendarDays, Target } from 'lucide-react';
import { request } from '../lib/apiClient';
import { AvatarRing } from './AvatarRing';
import { resolveGiftAssetUrl, type GiftUiItem } from '../lib/giftsCatalog';
import {
  giftGoalProgressPct,
  isGiftGoalComplete,
  type LiveGiftGoal,
} from '../lib/liveGiftGoal';
import type { LiveRankTab } from './CyclingRankBadge';
import { GiftGoalGallery } from './GiftGoalGallery';

interface CreatorRanking {
  rank: number;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  total_diamonds: number;
}

export type RankingPerson = {
  id: string;
  name: string;
  avatar?: string | null;
  points: number;
  subtitle?: string;
};

/** Host-only: pick a gift + target count from the gift catalog (gift-panel style). */
export type HostGiftGoalEditor = {
  selectedGiftId: string | null;
  targetCount: number;
  onSelectGift: (gift: GiftUiItem) => void;
  onTargetCountChange: (count: number) => void;
  onSave: () => void;
  onClear: () => void;
  saving?: boolean;
};

interface RankingPanelProps {
  onClose: () => void;
  initialTab?: LiveRankTab;
  /** Session top gifters (this live) with gift points */
  sessionGifters?: RankingPerson[];
  /** People watching this live (ranked list) */
  spectators?: RankingPerson[];
  /** Active gift goal for this live */
  giftGoal?: LiveGiftGoal | null;
  onSendGiftGoal?: () => void;
  /** When set, Gift Goal tab shows the gift picker so the creator can set a goal */
  hostGoalEditor?: HostGiftGoalEditor | null;
}

function formatNumber(num: number): string {
  const n = typeof num === 'number' && Number.isFinite(num) ? num : 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function mapRankings(list: unknown[]): CreatorRanking[] {
  return list.map((raw, i) => {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    return {
      rank: (r.rank as number | undefined) ?? i + 1,
      user_id: String(r.user_id ?? ''),
      username: (r.username as string) || '',
      display_name: (r.display_name as string) || (r.username as string) || '',
      avatar_url: (r.avatar_url as string | null) || null,
      total_diamonds:
        (r.total_coins as number | undefined) ??
        (r.total_diamonds as number | undefined) ??
        0,
    };
  });
}

const TABS: { id: LiveRankTab; label: string }[] = [
  { id: 'weekly', label: 'Weekly' },
  { id: 'daily', label: 'Daily' },
  { id: 'live', label: 'LIVE Popular' },
  { id: 'gifters', label: 'Top Gifters' },
  { id: 'goal', label: 'Gift Goal' },
];

export function RankingPanel({
  onClose: _onClose,
  initialTab = 'weekly',
  sessionGifters = [],
  spectators = [],
  giftGoal = null,
  onSendGiftGoal,
  hostGoalEditor = null,
}: RankingPanelProps) {
  const [tab, setTab] = useState<LiveRankTab>(initialTab);
  const [weekly, setWeekly] = useState<CreatorRanking[]>([]);
  const [daily, setDaily] = useState<CreatorRanking[]>([]);
  const [livePopular, setLivePopular] = useState<RankingPerson[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [weeklyRes, dailyRes, streamsRes] = await Promise.all([
          request('/api/rankings/weekly'),
          request('/api/rankings/daily'),
          request('/api/live/streams'),
        ]);
        if (cancelled) return;

        const weeklyList = Array.isArray(weeklyRes.data?.rankings)
          ? weeklyRes.data.rankings
          : [];
        setWeekly(mapRankings(weeklyList));

        const dailyList = Array.isArray(dailyRes.data?.rankings)
          ? dailyRes.data.rankings
          : weeklyList;
        setDaily(mapRankings(dailyList));

        const streamsRaw =
          (Array.isArray(streamsRes.data?.streams) && streamsRes.data.streams) ||
          (Array.isArray(streamsRes.data) && streamsRes.data) ||
          [];
        const liveList: RankingPerson[] = (streamsRaw as Record<string, unknown>[])
          .map((s, i) => {
            const viewers =
              Number(s.viewer_count ?? s.viewers ?? s.viewerCount ?? 0) || 0;
            const name =
              String(s.display_name || s.username || s.title || 'Live') || 'Live';
            const id = String(s.user_id || s.creator_id || s.room || s.id || i);
            return {
              id,
              name,
              avatar: (s.avatar_url as string) || (s.avatar as string) || null,
              points: viewers,
              subtitle: 'watching now',
            };
          })
          .sort((a, b) => b.points - a.points)
          .slice(0, 50);
        setLivePopular(liveList);
      } catch {
        if (!cancelled) {
          setWeekly([]);
          setDaily([]);
          setLivePopular([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const creatorList = tab === 'daily' ? daily : weekly;
  const personList: RankingPerson[] =
    tab === 'live'
      ? livePopular
      : tab === 'gifters'
        ? (sessionGifters.length > 0
            ? sessionGifters
            : spectators.map((s) => ({ ...s, points: s.points || 0 })).sort((a, b) => b.points - a.points)
          ).slice(0, 100)
        : [];

  const headerMeta =
    tab === 'weekly'
      ? { title: 'Weekly Ranking', sub: 'Top Creators This Week', Icon: Trophy }
      : tab === 'daily'
        ? { title: 'Daily Ranking', sub: 'Top Creators Today', Icon: CalendarDays }
        : tab === 'live'
          ? { title: 'LIVE Popular', sub: 'Creators live right now', Icon: Flame }
          : tab === 'gifters'
            ? { title: 'Top Gifters', sub: 'Gift points this live', Icon: Users }
            : { title: 'Gift Goal', sub: 'Send to help reach the goal', Icon: Target };

  const HeaderIcon = headerMeta.Icon;

  return (
    <div
      className="bg-[#111111]/95 backdrop-blur-md rounded-t-2xl p-3 pb-safe max-h-[40dvh] flex flex-col shadow-2xl w-full overflow-hidden h-full"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex justify-center mb-2">
        <div className="w-10 h-1 bg-white/20 rounded-full" />
      </div>

      <div className="flex justify-between items-center mb-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#111111] flex items-center justify-center border border-[#C9A227]/40">
            <HeaderIcon className="w-4 h-4 text-[#D4AF37]" fill="currentColor" />
          </div>
          <div>
            <h3 className="text-white font-bold text-sm leading-none">{headerMeta.title}</h3>
            <p className="text-white/50 text-[10px] font-medium">{headerMeta.sub}</p>
          </div>
        </div>
      </div>

      <div className="flex gap-1 mb-3 overflow-x-auto no-scrollbar flex-shrink-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap border transition-colors ${
              tab === t.id
                ? 'bg-[#D4AF37] text-black border-[#D4AF37]'
                : 'bg-white/5 text-white/60 border-white/10'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto -mx-2 px-2 no-scrollbar">
        {tab === 'goal' ? (
          <div className="flex flex-col gap-2 pb-4">
            {giftGoal ? (
              <div className="bg-white/5 rounded-xl p-3 border border-[#C9A227]/20">
                <div className="flex items-center gap-2 mb-2">
                  {giftGoal.giftIcon ? (
                    <img
                      src={resolveGiftAssetUrl(giftGoal.giftIcon)}
                      alt=""
                      className="w-10 h-10 object-contain flex-shrink-0"
                    />
                  ) : (
                    <Gift className="w-8 h-8 text-[#D4AF37]" strokeWidth={2} />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-[11px] font-bold truncate">{giftGoal.giftName}</p>
                    <p className="text-[#D4AF37] text-[10px] font-bold tabular-nums">
                      {giftGoal.currentCount}/{giftGoal.targetCount} points
                    </p>
                  </div>
                  {isGiftGoalComplete(giftGoal) ? (
                    <span className="text-[9px] font-bold text-black bg-[#D4AF37] px-2 py-1 rounded-full">Done</span>
                  ) : null}
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-2">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#D4AF37] to-[#E8D5A3] transition-all duration-500"
                    style={{ width: `${giftGoalProgressPct(giftGoal)}%` }}
                  />
                </div>
                {onSendGiftGoal && !isGiftGoalComplete(giftGoal) ? (
                  <button
                    type="button"
                    onClick={onSendGiftGoal}
                    className="w-full py-2 bg-gradient-to-r from-[#D4AF37] to-[#E8D5A3] text-black font-bold text-[10px] uppercase tracking-wide rounded-xl active:scale-[0.98]"
                  >
                    Send {giftGoal.giftName}
                  </button>
                ) : null}
              </div>
            ) : null}

            {hostGoalEditor ? (
              <GiftGoalGallery
                mode="picker"
                selectedGiftId={hostGoalEditor.selectedGiftId}
                targetCount={hostGoalEditor.targetCount}
                onSelectGift={hostGoalEditor.onSelectGift}
                onTargetCountChange={hostGoalEditor.onTargetCountChange}
                onSave={hostGoalEditor.onSave}
                onClear={hostGoalEditor.onClear}
                saving={hostGoalEditor.saving}
              />
            ) : !giftGoal ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Target className="w-12 h-12 text-white/10" />
                <p className="text-white/30 text-sm">No gift goal set yet</p>
              </div>
            ) : null}
          </div>
        ) : loading && (tab === 'weekly' || tab === 'daily' || tab === 'live') ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <div className="w-8 h-8 border-t-[#FFFFFF] rounded-full animate-spin" />
            <p className="text-white/30 text-xs">Loading rankings...</p>
          </div>
        ) : tab === 'weekly' || tab === 'daily' ? (
          creatorList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <Trophy className="w-12 h-12 text-white/10" />
              <p className="text-white/30 text-sm">No rankings yet</p>
            </div>
          ) : (
            <CreatorRankingBody rankings={creatorList} formatNumber={formatNumber} />
          )
        ) : personList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <Users className="w-12 h-12 text-white/10" />
            <p className="text-white/30 text-sm">
              {tab === 'live' ? 'No one live yet' : 'No gifters yet this live'}
            </p>
          </div>
        ) : (
          <PersonRankingBody people={personList} formatNumber={formatNumber} pointsLabel={tab === 'live' ? 'viewers' : 'pts'} />
        )}
      </div>
    </div>
  );
}

function CreatorRankingBody({
  rankings,
  formatNumber,
}: {
  rankings: CreatorRanking[];
  formatNumber: (n: number) => string;
}) {
  return (
    <div className="flex flex-col pb-4">
      <div className="flex justify-center items-end gap-2 mb-6 px-4 pt-4">
        {rankings[1] && (
          <div className="flex flex-col items-center gap-1 w-1/3 order-1">
            <div className="relative">
              <AvatarRing src={rankings[1].avatar_url || ''} alt={rankings[1].display_name} size={48} />
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-gray-300 text-black text-[10px] font-black px-1.5 rounded-full border border-white">
                2
              </div>
            </div>
            <div className="text-center w-full mt-1">
              <h4 className="text-white font-bold text-xs truncate w-full">{rankings[1].display_name}</h4>
              <p className="text-white font-bold text-[10px]">{formatNumber(rankings[1].total_diamonds)}</p>
            </div>
          </div>
        )}
        {rankings[0] && (
          <div className="flex flex-col items-center gap-1 w-1/3 order-2 -mt-4 z-10">
            <div className="relative">
              <div className="absolute -top-5 left-1/2 -translate-x-1/2 animate-bounce-slow">
                <Trophy className="w-6 h-6 text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.25)]" fill="currentColor" />
              </div>
              <AvatarRing src={rankings[0].avatar_url || ''} alt={rankings[0].display_name} size={64} />
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-[#D4AF37] text-black text-xs font-black px-2 py-0.5 rounded-full border border-white">
                1
              </div>
            </div>
            <div className="text-center w-full mt-2">
              <h4 className="text-white font-bold text-sm truncate w-full">{rankings[0].display_name}</h4>
              <p className="text-white font-bold text-xs">{formatNumber(rankings[0].total_diamonds)}</p>
            </div>
          </div>
        )}
        {rankings[2] && (
          <div className="flex flex-col items-center gap-1 w-1/3 order-3">
            <div className="relative">
              <AvatarRing src={rankings[2].avatar_url || ''} alt={rankings[2].display_name} size={48} />
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-[#FFFFFF] text-white text-[10px] font-black px-1.5 rounded-full border border-white/20">
                3
              </div>
            </div>
            <div className="text-center w-full mt-1">
              <h4 className="text-white font-bold text-xs truncate w-full">{rankings[2].display_name}</h4>
              <p className="text-white font-bold text-[10px]">{formatNumber(rankings[2].total_diamonds)}</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        {rankings.slice(3).map((creator) => (
          <div
            key={creator.user_id}
            className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors"
          >
            <div className="w-8 text-center font-bold text-sm text-white/50 italic">{creator.rank}</div>
            <AvatarRing src={creator.avatar_url || ''} alt={creator.display_name} size={36} />
            <div className="flex-1 min-w-0">
              <h4 className="text-white font-bold text-sm truncate">
                {creator.display_name || creator.username}
              </h4>
              <p className="text-white/40 text-[10px] truncate">@{creator.username}</p>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-white/90 font-bold text-xs tabular-nums">
                {formatNumber(creator.total_diamonds)}
              </span>
              <span className="text-white/40 text-[9px]">pts</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PersonRankingBody({
  people,
  formatNumber,
  pointsLabel,
}: {
  people: RankingPerson[];
  formatNumber: (n: number) => string;
  pointsLabel: string;
}) {
  return (
    <div className="flex flex-col gap-1 pb-4">
      {people.map((person, i) => (
        <div
          key={`${person.id}-${i}`}
          className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors"
        >
          <div className="w-8 text-center font-bold text-sm text-white/50 italic">{i + 1}</div>
          <AvatarRing src={person.avatar || ''} alt={person.name} size={36} />
          <div className="flex-1 min-w-0">
            <h4 className="text-white font-bold text-sm truncate">{person.name}</h4>
            {person.subtitle ? (
              <p className="text-white/40 text-[10px] truncate">{person.subtitle}</p>
            ) : null}
          </div>
          <div className="flex flex-col items-end">
            <span className="text-white/90 font-bold text-xs tabular-nums">
              {formatNumber(person.points)}
            </span>
            <span className="text-white/40 text-[9px]">{pointsLabel}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
