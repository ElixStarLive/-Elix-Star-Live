import React, { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { apiUrl } from '../lib/api';
import { AvatarRing } from './AvatarRing';

interface CreatorRanking {
  rank: number;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  total_diamonds: number;
}

interface RankingPanelProps {
  onClose: () => void;
}

export function RankingPanel({ onClose }: RankingPanelProps) {
  const [rankings, setRankings] = useState<CreatorRanking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRanking();
  }, []);

  const loadRanking = async () => {
    try {
      const res = await fetch(apiUrl('/api/rankings/weekly'));
      if (!res.ok) throw new Error('fetch failed');
      const json = await res.json();
      if (Array.isArray(json.data)) {
        setRankings(json.data.map((r: any, i: number) => ({
          rank: r.rank ?? i + 1,
          user_id: r.user_id,
          username: r.username || '',
          display_name: r.display_name || r.username || '',
          avatar_url: r.avatar_url || null,
          total_diamonds: r.total_diamonds ?? r.total_coins ?? 0,
        })));
      }
    } catch {
      // endpoint not reachable
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number): string =>
    (typeof num === 'number' && Number.isFinite(num) ? num : 0).toLocaleString();

  return (
        <div 
          className="bg-[#1C1E24]/95 backdrop-blur-md rounded-t-2xl p-3 pb-safe max-h-[40dvh] flex flex-col shadow-2xl w-full overflow-hidden border-t border-[#C9A96E]/20 h-full" 
          onClick={(e) => e.stopPropagation()}
        >
        {/* Drag handle */}
        <div className="flex justify-center mb-2">
          <div className="w-10 h-1 bg-white/20 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex justify-between items-center mb-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#13151A] flex items-center justify-center border border-[#C9A96E]/40">
              <Trophy className="w-4 h-4 text-[#C9A96E]" fill="currentColor" />
            </div>
            <div>
              <h3 className="text-white font-bold text-sm leading-none">Weekly Ranking</h3>
              <p className="text-white/50 text-[10px] font-medium">Top Creators This Week</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto -mx-2 px-2 no-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="w-8 h-8 border-2 border-[#C9A96E]/30 border-t-[#C9A96E] rounded-full animate-spin" />
              <p className="text-white/30 text-xs">Loading rankings...</p>
            </div>
          ) : rankings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <Trophy className="w-12 h-12 text-white/10" />
              <p className="text-white/30 text-sm">No rankings yet this week</p>
            </div>
          ) : (
            <div className="flex flex-col pb-4">
              {/* Top 3 Podium */}
              <div className="flex justify-center items-end gap-2 mb-6 px-4 pt-4">
                {/* Rank 2 (Silver) */}
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

                {/* Rank 1 (Gold) */}
                {rankings[0] && (
                  <div className="flex flex-col items-center gap-1 w-1/3 order-2 -mt-4 z-10">
                    <div className="relative">
                      <div className="absolute -top-5 left-1/2 -translate-x-1/2 animate-bounce-slow">
                        <Trophy className="w-6 h-6 text-white drop-shadow-[0_0_10px_rgba(201,169,110,0.5)]" fill="currentColor" />
                      </div>
                      <AvatarRing src={rankings[0].avatar_url || ''} alt={rankings[0].display_name} size={64} />
                      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-[#C9A96E] text-black text-xs font-black px-2 py-0.5 rounded-full border border-white">
                        1
                      </div>
                    </div>
                    <div className="text-center w-full mt-2">
                      <h4 className="text-white font-bold text-sm truncate w-full">{rankings[0].display_name}</h4>
                      <p className="text-white font-bold text-xs">{formatNumber(rankings[0].total_diamonds)}</p>
                    </div>
                  </div>
                )}

                {/* Rank 3 (Bronze) */}
                {rankings[2] && (
                  <div className="flex flex-col items-center gap-1 w-1/3 order-3">
                    <div className="relative">
                      <AvatarRing src={rankings[2].avatar_url || ''} alt={rankings[2].display_name} size={48} />
                      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-[#C9A96E] text-white text-[10px] font-black px-1.5 rounded-full border border-white/20">
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

              {/* Rest of the list */}
              <div className="flex flex-col gap-1">
                {rankings.slice(3).map((creator) => (
                  <div 
                    key={creator.user_id}
                    className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors"
                  >
                    {/* Rank Number */}
                    <div className="w-8 text-center font-bold text-sm text-white/50 italic">
                      {creator.rank}
                    </div>

                    {/* Avatar */}
                    <AvatarRing src={creator.avatar_url || ''} alt={creator.display_name} size={36} />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h4 className="text-white font-bold text-sm truncate">
                        {creator.display_name || creator.username}
                      </h4>
                      <p className="text-white/40 text-[10px] truncate">
                        @{creator.username}
                      </p>
                    </div>

                    {/* Points */}
                    <div className="flex flex-col items-end">
                      <span className="text-white/90 font-bold text-xs tabular-nums">
                        {formatNumber(creator.total_diamonds)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
  );
}
