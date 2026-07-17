import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trophy, Star, Users, MapPin, Music, ChevronRight } from "lucide-react";
import { RoyceBackIcon } from "../components/royce";
import { request } from "../lib/apiClient";
import { showToast } from "../lib/toast";
import { AvatarRing } from "../components/AvatarRing";

interface Season {
  id: string;
  title: string;
  description: string | null;
  status: string;
  starts_at: string;
  ends_at: string;
}

interface Category {
  id: string;
  title: string;
  slug: string;
}

interface Region {
  id: string;
  title: string;
  slug: string;
}

interface Challenge {
  id: string;
  title: string;
  status: string;
  week_index: number;
  category_id: string;
  region_id: string | null;
  sound_track_id: string;
  opens_at: string;
  closes_at: string;
}

interface Standing {
  rank: number;
  creator_user_id: string;
  username: string;
  avatar_url: string | null;
  total_votes: number;
}

interface Team {
  id: string;
  name: string;
  team_votes: number;
  member_count: number;
}

export default function RisingStars() {
  const navigate = useNavigate();
  const [season, setSeason] = useState<Season | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [categoryId, setCategoryId] = useState<string>("");
  const [regionId, setRegionId] = useState<string>("");
  const [tab, setTab] = useState<"challenges" | "standings" | "teams">("challenges");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadHub();
  }, []);

  useEffect(() => {
    if (!season?.id) return;
    void loadChallenges();
  }, [season?.id, categoryId, regionId]);

  const loadHub = async () => {
    setLoading(true);
    try {
      const { data, error } = await request("/api/rising-stars/seasons/current");
      if (error) throw new Error(error.message);
      const s = data?.season as Season | null;
      setSeason(s);
      if (!s?.id) {
        setCategories([]);
        setRegions([]);
        setChallenges([]);
        setStandings([]);
        setTeams([]);
        return;
      }
      const [cats, regs, stand, teamRes] = await Promise.all([
        request(`/api/rising-stars/categories?seasonId=${s.id}`),
        request(`/api/rising-stars/regions?seasonId=${s.id}`),
        request(`/api/rising-stars/seasons/${s.id}/standings`),
        request(`/api/rising-stars/teams?seasonId=${s.id}`),
      ]);
      setCategories(cats.data?.categories || []);
      setRegions(regs.data?.regions || []);
      setStandings(stand.data?.standings || []);
      setTeams(teamRes.data?.teams || []);
    } catch {
      showToast("Could not load Rising Stars");
    } finally {
      setLoading(false);
    }
  };

  const loadChallenges = async () => {
    if (!season?.id) return;
    const params = new URLSearchParams({ seasonId: season.id });
    if (categoryId) params.set("categoryId", categoryId);
    if (regionId) params.set("regionId", regionId);
    const { data } = await request(`/api/rising-stars/challenges?${params}`);
    setChallenges(data?.challenges || []);
  };

  return (
    <div className="page-above-bottom-nav bg-[#111111] text-white">
      <div className="page-above-bottom-nav__inner">
        <div
          className="w-full shrink-0 bg-[#111111] z-10"
          style={{ paddingTop: "var(--topnav-anchor-top)" }}
        >
          <div
            className="w-full px-3 flex items-center justify-between"
            style={{ minHeight: "var(--topnav-bar-height)" }}
          >
            <button type="button" onClick={() => navigate(-1)} className="p-1" aria-label="Back">
              <RoyceBackIcon className="w-6 h-6 text-white" />
            </button>
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-[#C9A227]" />
              <h1 className="text-base font-semibold">Rising Stars</h1>
            </div>
            <div className="w-8" />
          </div>
        </div>

        <div className="px-3 pb-6">
          {loading ? (
            <div className="py-10 text-center text-white/50 text-sm">Loading...</div>
          ) : !season ? (
            <div className="py-10 text-center text-white/60 text-sm">
              No active Rising Stars season yet. Check back soon.
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-[#C9A227]/30 bg-gradient-to-br from-[#1a1608] to-[#111111] p-4 mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <Star className="w-4 h-4 text-[#C9A227]" />
                  <span className="text-xs uppercase tracking-wide text-[#C9A227]">
                    {season.status}
                  </span>
                </div>
                <h2 className="text-lg font-bold mb-1">{season.title}</h2>
                {season.description ? (
                  <p className="text-sm text-white/60">{season.description}</p>
                ) : (
                  <p className="text-sm text-white/60">
                    Compete with exclusive sounds. Free daily votes. Live finals.
                  </p>
                )}
              </div>

              <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
                <button
                  type="button"
                  onClick={() => setCategoryId("")}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs border ${
                    !categoryId
                      ? "bg-[#C9A227] text-black border-[#C9A227]"
                      : "border-white/20 text-white/70"
                  }`}
                >
                  All categories
                </button>
                {categories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategoryId(c.id)}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-xs border ${
                      categoryId === c.id
                        ? "bg-[#C9A227] text-black border-[#C9A227]"
                        : "border-white/20 text-white/70"
                    }`}
                  >
                    {c.title}
                  </button>
                ))}
              </div>

              <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
                <button
                  type="button"
                  onClick={() => setRegionId("")}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs border ${
                    !regionId
                      ? "bg-white/15 text-white border-white/20"
                      : "border-white/10 text-white/50"
                  }`}
                >
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> All regions
                  </span>
                </button>
                {regions.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRegionId(r.id)}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-xs border ${
                      regionId === r.id
                        ? "bg-white/15 text-white border-white/20"
                        : "border-white/10 text-white/50"
                    }`}
                  >
                    {r.title}
                  </button>
                ))}
              </div>

              <div className="flex gap-2 mb-4">
                {(
                  [
                    ["challenges", "Challenges"],
                    ["standings", "Standings"],
                    ["teams", "Teams"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={`flex-1 py-2 rounded-xl text-xs font-medium ${
                      tab === id ? "bg-[#C9A227] text-black" : "bg-white/10 text-white/70"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === "challenges" && (
                <div className="space-y-3">
                  {challenges.length === 0 ? (
                    <p className="text-sm text-white/50 text-center py-8">
                      No challenges for this filter.
                    </p>
                  ) : (
                    challenges.map((ch) => (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => navigate(`/rising-stars/challenge/${ch.id}`)}
                        className="w-full text-left rounded-xl border border-white/10 bg-white/5 p-3 flex items-center gap-3"
                      >
                        <div className="w-10 h-10 rounded-full bg-[#C9A227]/15 flex items-center justify-center">
                          <Music className="w-5 h-5 text-[#C9A227]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold truncate">{ch.title}</div>
                          <div className="text-xs text-white/50">
                            Week {ch.week_index} · {ch.status}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-white/40" />
                      </button>
                    ))
                  )}
                </div>
              )}

              {tab === "standings" && (
                <div className="space-y-2">
                  {standings.length === 0 ? (
                    <p className="text-sm text-white/50 text-center py-8">No standings yet.</p>
                  ) : (
                    standings.map((s) => (
                      <button
                        key={s.creator_user_id}
                        type="button"
                        onClick={() => navigate(`/profile/${s.creator_user_id}`)}
                        className="w-full flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3"
                      >
                        <span className="w-6 text-center text-[#C9A227] font-bold text-sm">
                          {s.rank}
                        </span>
                        <AvatarRing
                          src={s.avatar_url || ""}
                          size={36}
                          alt={s.username}
                        />
                        <div className="flex-1 text-left min-w-0">
                          <div className="text-sm font-medium truncate">{s.username}</div>
                          <div className="text-xs text-white/50">{s.total_votes} votes</div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}

              {tab === "teams" && (
                <div className="space-y-2">
                  {teams.length === 0 ? (
                    <p className="text-sm text-white/50 text-center py-8">No teams yet.</p>
                  ) : (
                    teams.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3"
                      >
                        <Users className="w-5 h-5 text-[#C9A227]" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{t.name}</div>
                          <div className="text-xs text-white/50">
                            {t.member_count} members · {t.team_votes} votes
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
