import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Music, Trophy, Vote, Video, Radio } from "lucide-react";
import { RoyceBackIcon } from "../components/royce";
import { request } from "../lib/apiClient";
import { showToast } from "../lib/toast";
import { useAuthStore } from "../store/useAuthStore";
import { AvatarRing } from "../components/AvatarRing";
import { nativeShareUrl } from "../lib/platform";

interface Challenge {
  id: string;
  title: string;
  description: string | null;
  status: string;
  week_index: number;
  sound_track_id: string;
  sound_meta: Record<string, unknown>;
  opens_at: string;
  closes_at: string;
  live_qualifier_room_id: string | null;
  live_final_room_id: string | null;
  leaderboard_frozen: boolean;
}

interface Entry {
  id: string;
  creator_user_id: string;
  video_id: string;
  vote_count: number;
  status: string;
  username?: string;
  avatar_url?: string | null;
}

export default function RisingStarsChallenge() {
  const { challengeId } = useParams<{ challengeId: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [votedToday, setVotedToday] = useState(false);
  const [myVideos, setMyVideos] = useState<Array<{ id: string; description?: string }>>([]);
  const [selectedVideoId, setSelectedVideoId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const soundTitle = useMemo(() => {
    const meta = challenge?.sound_meta || {};
    return String(meta.title || meta.name || challenge?.sound_track_id || "Exclusive sound");
  }, [challenge]);

  useEffect(() => {
    if (!challengeId) return;
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challengeId]);

  const loadAll = async () => {
    if (!challengeId) return;
    setLoading(true);
    try {
      const [ch, en] = await Promise.all([
        request(`/api/rising-stars/challenges/${challengeId}`),
        request(`/api/rising-stars/challenges/${challengeId}/entries`),
      ]);
      if (ch.error) throw new Error(ch.error.message);
      setChallenge(ch.data?.challenge || null);
      setVotedToday(Boolean(ch.data?.voted_today));
      setEntries(en.data?.entries || []);

      if (user?.id) {
        const vids = await request(`/api/videos/user/${user.id}`);
        const list = Array.isArray(vids.data?.videos)
          ? vids.data.videos
          : Array.isArray(vids.data)
            ? vids.data
            : [];
        setMyVideos(
          list.map((v: { id?: string; description?: string }) => ({
            id: String(v.id),
            description: v.description,
          })),
        );
      }
    } catch {
      showToast("Could not load challenge");
    } finally {
      setLoading(false);
    }
  };

  const enter = async () => {
    if (!challengeId || !selectedVideoId || busy) return;
    if (!user) {
      navigate("/login");
      return;
    }
    setBusy(true);
    try {
      const { error } = await request(
        `/api/rising-stars/challenges/${challengeId}/enter`,
        {
          method: "POST",
          body: JSON.stringify({ videoId: selectedVideoId }),
        },
      );
      if (error) {
        showToast(error.message || "Entry failed");
        return;
      }
      showToast("Entry accepted");
      await loadAll();
    } finally {
      setBusy(false);
    }
  };

  const vote = async (entryId: string) => {
    if (!user) {
      navigate("/login");
      return;
    }
    if (votedToday || busy) return;
    setBusy(true);
    try {
      const { data, error } = await request(
        `/api/rising-stars/entries/${entryId}/vote`,
        { method: "POST", body: "{}" },
      );
      if (error) {
        showToast(error.message || "Vote failed");
        return;
      }
      setVotedToday(true);
      setEntries((prev) =>
        prev.map((e) =>
          e.id === entryId
            ? { ...e, vote_count: Number(data?.vote_count ?? e.vote_count + 1) }
            : e,
        ),
      );
      showToast("Vote counted");
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (!challengeId) return;
    await nativeShareUrl({
      title: challenge?.title || "Rising Stars",
      text: "Vote in Rising Stars on Elix Star Live",
      url: `https://www.elixstarlive.co.uk/rising-stars/challenge/${challengeId}`,
    });
  };

  const openLive = (roomId: string | null) => {
    if (!roomId) {
      showToast("Live stage not scheduled yet");
      return;
    }
    navigate(`/watch/${encodeURIComponent(roomId)}`);
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
              <h1 className="text-base font-semibold">Challenge</h1>
            </div>
            <button type="button" onClick={() => void share()} className="text-xs text-[#C9A227]">
              Share
            </button>
          </div>
        </div>

        <div className="px-3 pb-8">
          {loading || !challenge ? (
            <div className="py-10 text-center text-white/50 text-sm">Loading...</div>
          ) : (
            <>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 mb-4">
                <div className="text-xs text-[#C9A227] mb-1 uppercase">
                  Week {challenge.week_index} · {challenge.status}
                </div>
                <h2 className="text-lg font-bold mb-2">{challenge.title}</h2>
                {challenge.description && (
                  <p className="text-sm text-white/60 mb-3">{challenge.description}</p>
                )}
                <div className="flex items-center gap-2 text-sm text-white/80">
                  <Music className="w-4 h-4 text-[#C9A227]" />
                  <span>Required sound: {soundTitle}</span>
                </div>
                <p className="text-xs text-white/40 mt-2">
                  One free vote per day. Votes are not coins and cannot be bought.
                </p>
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => openLive(challenge.live_qualifier_room_id)}
                    className="flex-1 py-2 rounded-xl bg-white/10 text-xs flex items-center justify-center gap-1"
                  >
                    <Radio className="w-3 h-3" /> Qualifier
                  </button>
                  <button
                    type="button"
                    onClick={() => openLive(challenge.live_final_room_id)}
                    className="flex-1 py-2 rounded-xl bg-white/10 text-xs flex items-center justify-center gap-1"
                  >
                    <Radio className="w-3 h-3" /> Final
                  </button>
                </div>
              </div>

              {user && ["open", "voting"].includes(challenge.status) && (
                <div className="rounded-2xl border border-[#C9A227]/25 bg-[#1a1608] p-4 mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Video className="w-4 h-4 text-[#C9A227]" />
                    <span className="text-sm font-semibold">Enter with your video</span>
                  </div>
                  <p className="text-xs text-white/50 mb-2">
                    Video must use the required sound. Create one first if needed.
                  </p>
                  <select
                    value={selectedVideoId}
                    onChange={(e) => setSelectedVideoId(e.target.value)}
                    className="w-full bg-[#111111] border border-white/10 rounded-xl px-3 py-2 text-sm mb-2"
                  >
                    <option value="">Select a video…</option>
                    {myVideos.map((v) => (
                      <option key={v.id} value={v.id}>
                        {(v.description || v.id).slice(0, 60)}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => navigate("/create")}
                      className="flex-1 py-2 rounded-xl bg-white/10 text-xs"
                    >
                      Create video
                    </button>
                    <button
                      type="button"
                      disabled={!selectedVideoId || busy}
                      onClick={() => void enter()}
                      className="flex-1 py-2 rounded-xl bg-[#C9A227] text-black text-xs font-semibold disabled:opacity-40"
                    >
                      Submit entry
                    </button>
                  </div>
                </div>
              )}

              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Vote className="w-4 h-4 text-[#C9A227]" /> Entries
                {votedToday && (
                  <span className="text-xs text-white/40 font-normal">(voted today)</span>
                )}
              </h3>
              <div className="space-y-2">
                {entries.length === 0 ? (
                  <p className="text-sm text-white/50 text-center py-8">No entries yet.</p>
                ) : (
                  entries.map((e, idx) => (
                    <div
                      key={e.id}
                      className="rounded-xl border border-white/10 bg-white/5 p-3 flex items-center gap-3"
                    >
                      <span className="w-6 text-center text-[#C9A227] font-bold text-sm">
                        {idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => navigate(`/profile/${e.creator_user_id}`)}
                      >
                        <AvatarRing
                          src={e.avatar_url || ""}
                          size={36}
                          alt={e.username || "Creator"}
                        />
                      </button>
                      <div className="flex-1 min-w-0">
                        <button
                          type="button"
                          className="text-sm font-medium truncate block text-left"
                          onClick={() => navigate(`/video/${e.video_id}`)}
                        >
                          {e.username || "Creator"}
                        </button>
                        <div className="text-xs text-white/50">{e.vote_count} votes</div>
                      </div>
                      <button
                        type="button"
                        disabled={
                          busy ||
                          votedToday ||
                          challenge.leaderboard_frozen ||
                          e.creator_user_id === user?.id
                        }
                        onClick={() => void vote(e.id)}
                        className="px-3 py-1.5 rounded-lg bg-[#C9A227] text-black text-xs font-semibold disabled:opacity-40"
                      >
                        Vote
                      </button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
