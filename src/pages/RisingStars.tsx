import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Star, Users, MapPin, Music, ChevronRight } from "lucide-react";
import { RisingStarsTopBar } from "../components/RisingStarsTopBar";
import { showToast } from "../lib/toast";
import { AvatarRing } from "../components/AvatarRing";
import {
  apiRisingStarsCategories,
  apiRisingStarsChallenges,
  apiRisingStarsCurrentSeason,
  apiRisingStarsRegions,
  apiRisingStarsStandings,
  apiRisingStarsTeams,
} from "../features/risingStars/risingStarsApi";
import {
  RISING_STARS_EXIT_TO,
  RISING_STARS_HOME,
  containerReturnState,
  exitToFromLocationState,
} from "../lib/settingsNav";

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
  const location = useLocation();
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

  const goBack = useCallback(
    () => navigate(exitToFromLocationState(location.state, RISING_STARS_EXIT_TO), { replace: true }),
    [navigate, location.state],
  );
  const openChallenge = useCallback(
    (challengeId: string) =>
      navigate(`/rising-stars/challenge/${challengeId}`, {
        state: containerReturnState(RISING_STARS_HOME),
      }),
    [navigate],
  );
  const openCreatorProfile = useCallback(
    (creatorUserId: string) =>
      navigate(`/profile/${creatorUserId}`, {
        state: containerReturnState(RISING_STARS_HOME),
      }),
    [navigate],
  );

  useEffect(() => {
    void loadHub();
  }, []);

  const loadHub = async () => {
    setLoading(true);
    try {
      const { season: seasonBody, error } = await apiRisingStarsCurrentSeason();
      if (error) throw new Error(error);
      const s = seasonBody as unknown as Season | null;
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
        apiRisingStarsCategories(s.id),
        apiRisingStarsRegions(s.id),
        apiRisingStarsStandings(s.id),
        apiRisingStarsTeams(s.id),
      ]);
      setCategories(cats.categories as unknown as Category[]);
      setRegions(regs.regions as unknown as Region[]);
      setStandings(stand.standings as unknown as Standing[]);
      setTeams(teamRes.teams as unknown as Team[]);
    } catch {
      showToast("Could not load Rising Stars");
    } finally {
      setLoading(false);
    }
  };

  const loadChallenges = useCallback(async () => {
    if (!season?.id) return;
    const params = new URLSearchParams({ seasonId: season.id });
    if (categoryId) params.set("categoryId", categoryId);
    if (regionId) params.set("regionId", regionId);
    const { challenges } = await apiRisingStarsChallenges(params.toString());
    setChallenges(challenges as unknown as Challenge[]);
  }, [season?.id, categoryId, regionId]);

  useEffect(() => {
    if (!season?.id) return;
    void loadChallenges();
  }, [season?.id, categoryId, regionId, loadChallenges]);

  return (
    <div className="page-above-bottom-nav bg-transparent text-white">
      <div className="page-above-bottom-nav__inner">
        <RisingStarsTopBar title="Rising Stars" onBack={goBack} />

        <div className="px-3 pb-6">
          {loading ? (
            <div className="py-10 text-center text-white/50 text-sm">Loading...</div>
          ) : !season ? (
            <div className="py-10 text-center text-white/60 text-sm">
              No active Rising Stars season yet. Check back soon.
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-[#D8D9DD]/30 bg-gradient-to-br from-[#1a1608] to-[#09090B] p-4 mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <Star className="w-4 h-4 text-[#F5F5F7]" />
                  <span className="text-xs uppercase tracking-wide text-[#F5F5F7]">
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
                      ? "bg-[#E6E9EE] text-white elix-accent border-[#D8D9DD]"
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
                        ? "bg-[#E6E9EE] text-white elix-accent border-[#D8D9DD]"
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
                      tab === id ? "bg-[#E6E9EE] text-white elix-accent" : "bg-white/10 text-white/70"
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
                        onClick={() => openChallenge(ch.id)}
                        className="w-full text-left rounded-xl border border-white/10 bg-white/5 p-3 flex items-center gap-3"
                      >
                        <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                          <Music className="w-5 h-5 text-[#F5F5F7]" />
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
                        onClick={() => openCreatorProfile(s.creator_user_id)}
                        className="w-full flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3"
                      >
                        <span className="w-6 text-center text-[#F5F5F7] font-bold text-sm">
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
                        <Users className="w-5 h-5 text-[#F5F5F7]" />
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
