import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trophy } from "lucide-react";
import { request } from "../../lib/apiClient";
import { showToast } from "../../lib/toast";

interface Season {
  id: string;
  slug: string;
  title: string;
  status: string;
  starts_at: string;
  ends_at: string;
}

interface Challenge {
  id: string;
  title: string;
  status: string;
  sound_track_id: string;
  week_index: number;
}

export default function AdminRisingStars() {
  const navigate = useNavigate();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState("");
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [audit, setAudit] = useState<Array<Record<string, unknown>>>([]);
  const [busy, setBusy] = useState(false);

  const [seasonForm, setSeasonForm] = useState({
    slug: "",
    title: "",
    description: "",
    starts_at: "",
    ends_at: "",
    status: "draft",
  });
  const [categoryForm, setCategoryForm] = useState({
    slug: "music",
    title: "Music",
  });
  const [regionForm, setRegionForm] = useState({
    slug: "uk",
    title: "United Kingdom",
  });
  const [challengeForm, setChallengeForm] = useState({
    category_id: "",
    region_id: "",
    week_index: 1,
    title: "",
    sound_track_id: "",
    opens_at: "",
    closes_at: "",
    status: "scheduled",
  });

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    if (!selectedSeasonId) {
      setChallenges([]);
      return;
    }
    void loadChallenges(selectedSeasonId);
  }, [selectedSeasonId]);

  const reload = async () => {
    const [s, a] = await Promise.all([
      request("/api/admin/rising-stars/seasons"),
      request("/api/admin/rising-stars/audit?limit=50"),
    ]);
    if (s.error) {
      showToast(s.error.message);
      return;
    }
    const list = s.data?.seasons || [];
    setSeasons(list);
    if (!selectedSeasonId && list[0]?.id) setSelectedSeasonId(list[0].id);
    setAudit(a.data?.audit || []);
  };

  const loadChallenges = async (seasonId: string) => {
    const { data } = await request(
      `/api/rising-stars/challenges?seasonId=${seasonId}`,
    );
    setChallenges(data?.challenges || []);
  };

  const createSeason = async () => {
    setBusy(true);
    try {
      const { error } = await request("/api/admin/rising-stars/seasons", {
        method: "POST",
        body: JSON.stringify(seasonForm),
      });
      if (error) {
        showToast(error.message);
        return;
      }
      showToast("Season created");
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const createCategory = async () => {
    if (!selectedSeasonId) return;
    setBusy(true);
    try {
      const { data, error } = await request("/api/admin/rising-stars/categories", {
        method: "POST",
        body: JSON.stringify({
          season_id: selectedSeasonId,
          ...categoryForm,
        }),
      });
      if (error) {
        showToast(error.message);
        return;
      }
      if (data?.category?.id) {
        setChallengeForm((f) => ({ ...f, category_id: data.category.id }));
      }
      showToast("Category created");
    } finally {
      setBusy(false);
    }
  };

  const createRegion = async () => {
    if (!selectedSeasonId) return;
    setBusy(true);
    try {
      const { data, error } = await request("/api/admin/rising-stars/regions", {
        method: "POST",
        body: JSON.stringify({
          season_id: selectedSeasonId,
          ...regionForm,
          country_codes: ["GB"],
        }),
      });
      if (error) {
        showToast(error.message);
        return;
      }
      if (data?.region?.id) {
        setChallengeForm((f) => ({ ...f, region_id: data.region.id }));
      }
      showToast("Region created");
    } finally {
      setBusy(false);
    }
  };

  const createChallenge = async () => {
    if (!selectedSeasonId || !challengeForm.category_id) {
      showToast("Select season and create/set category first");
      return;
    }
    setBusy(true);
    try {
      const { error } = await request("/api/admin/rising-stars/challenges", {
        method: "POST",
        body: JSON.stringify({
          season_id: selectedSeasonId,
          category_id: challengeForm.category_id,
          region_id: challengeForm.region_id || null,
          week_index: Number(challengeForm.week_index) || 1,
          title: challengeForm.title,
          sound_track_id: challengeForm.sound_track_id,
          opens_at: challengeForm.opens_at,
          closes_at: challengeForm.closes_at,
          status: challengeForm.status,
        }),
      });
      if (error) {
        showToast(error.message);
        return;
      }
      showToast("Challenge created");
      await loadChallenges(selectedSeasonId);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (id: string, status: string) => {
    setBusy(true);
    try {
      const { error } = await request(
        `/api/admin/rising-stars/challenges/${id}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status }),
        },
      );
      if (error) {
        showToast(error.message);
        return;
      }
      await loadChallenges(selectedSeasonId);
    } finally {
      setBusy(false);
    }
  };

  const snapshot = async (id: string, phase: "qualifier" | "final") => {
    setBusy(true);
    try {
      const { error } = await request(
        `/api/admin/rising-stars/challenges/${id}/snapshot`,
        {
          method: "POST",
          body: JSON.stringify({
            phase,
            advanceTopN: phase === "qualifier" ? 10 : 0,
          }),
        },
      );
      if (error) {
        showToast(error.message);
        return;
      }
      showToast(`${phase} snapshot saved`);
      await loadChallenges(selectedSeasonId);
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    "w-full bg-[#0f1218] border border-white/10 rounded-lg px-3 py-2 text-sm text-white mb-2";

  return (
    <div className="min-h-screen bg-[#111111] text-white p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="w-7 h-7 text-[#C9A227]" />
            Rising Stars Admin
          </h1>
          <button
            type="button"
            onClick={() => navigate("/admin")}
            className="text-sm text-white/60"
          >
            Back
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <section className="rounded-xl border border-white/10 p-4">
            <h2 className="font-semibold mb-3">Create season</h2>
            <input
              className={inputClass}
              placeholder="slug (uk-rising-music)"
              value={seasonForm.slug}
              onChange={(e) => setSeasonForm({ ...seasonForm, slug: e.target.value })}
            />
            <input
              className={inputClass}
              placeholder="title"
              value={seasonForm.title}
              onChange={(e) => setSeasonForm({ ...seasonForm, title: e.target.value })}
            />
            <input
              className={inputClass}
              placeholder="description"
              value={seasonForm.description}
              onChange={(e) =>
                setSeasonForm({ ...seasonForm, description: e.target.value })
              }
            />
            <input
              className={inputClass}
              type="datetime-local"
              value={seasonForm.starts_at}
              onChange={(e) =>
                setSeasonForm({
                  ...seasonForm,
                  starts_at: new Date(e.target.value).toISOString(),
                })
              }
            />
            <input
              className={inputClass}
              type="datetime-local"
              value={seasonForm.ends_at}
              onChange={(e) =>
                setSeasonForm({
                  ...seasonForm,
                  ends_at: new Date(e.target.value).toISOString(),
                })
              }
            />
            <select
              className={inputClass}
              value={seasonForm.status}
              onChange={(e) => setSeasonForm({ ...seasonForm, status: e.target.value })}
            >
              <option value="draft">draft</option>
              <option value="active">active</option>
              <option value="closed">closed</option>
            </select>
            <button
              type="button"
              disabled={busy}
              onClick={() => void createSeason()}
              className="w-full py-2 rounded-lg bg-[#C9A227] text-black font-semibold disabled:opacity-40"
            >
              Create season
            </button>
          </section>

          <section className="rounded-xl border border-white/10 p-4">
            <h2 className="font-semibold mb-3">Season tools</h2>
            <select
              className={inputClass}
              value={selectedSeasonId}
              onChange={(e) => setSelectedSeasonId(e.target.value)}
            >
              <option value="">Select season…</option>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} ({s.status})
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <input
                  className={inputClass}
                  placeholder="category slug"
                  value={categoryForm.slug}
                  onChange={(e) =>
                    setCategoryForm({ ...categoryForm, slug: e.target.value })
                  }
                />
                <input
                  className={inputClass}
                  placeholder="category title"
                  value={categoryForm.title}
                  onChange={(e) =>
                    setCategoryForm({ ...categoryForm, title: e.target.value })
                  }
                />
                <button
                  type="button"
                  disabled={busy || !selectedSeasonId}
                  onClick={() => void createCategory()}
                  className="w-full py-2 rounded-lg bg-white/10 text-sm disabled:opacity-40"
                >
                  Add category
                </button>
              </div>
              <div>
                <input
                  className={inputClass}
                  placeholder="region slug"
                  value={regionForm.slug}
                  onChange={(e) =>
                    setRegionForm({ ...regionForm, slug: e.target.value })
                  }
                />
                <input
                  className={inputClass}
                  placeholder="region title"
                  value={regionForm.title}
                  onChange={(e) =>
                    setRegionForm({ ...regionForm, title: e.target.value })
                  }
                />
                <button
                  type="button"
                  disabled={busy || !selectedSeasonId}
                  onClick={() => void createRegion()}
                  className="w-full py-2 rounded-lg bg-white/10 text-sm disabled:opacity-40"
                >
                  Add region
                </button>
              </div>
            </div>
            <input
              className={inputClass}
              placeholder="category_id (uuid)"
              value={challengeForm.category_id}
              onChange={(e) =>
                setChallengeForm({ ...challengeForm, category_id: e.target.value })
              }
            />
            <input
              className={inputClass}
              placeholder="region_id optional"
              value={challengeForm.region_id}
              onChange={(e) =>
                setChallengeForm({ ...challengeForm, region_id: e.target.value })
              }
            />
            <input
              className={inputClass}
              placeholder="challenge title"
              value={challengeForm.title}
              onChange={(e) =>
                setChallengeForm({ ...challengeForm, title: e.target.value })
              }
            />
            <input
              className={inputClass}
              placeholder="Epidemic sound_track_id"
              value={challengeForm.sound_track_id}
              onChange={(e) =>
                setChallengeForm({
                  ...challengeForm,
                  sound_track_id: e.target.value,
                })
              }
            />
            <input
              className={inputClass}
              type="number"
              placeholder="week_index"
              value={challengeForm.week_index}
              onChange={(e) =>
                setChallengeForm({
                  ...challengeForm,
                  week_index: Number(e.target.value) || 1,
                })
              }
            />
            <input
              className={inputClass}
              type="datetime-local"
              onChange={(e) =>
                setChallengeForm({
                  ...challengeForm,
                  opens_at: new Date(e.target.value).toISOString(),
                })
              }
            />
            <input
              className={inputClass}
              type="datetime-local"
              onChange={(e) =>
                setChallengeForm({
                  ...challengeForm,
                  closes_at: new Date(e.target.value).toISOString(),
                })
              }
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void createChallenge()}
              className="w-full py-2 rounded-lg bg-[#C9A227] text-black font-semibold disabled:opacity-40"
            >
              Create challenge
            </button>
          </section>
        </div>

        <section className="rounded-xl border border-white/10 p-4 mb-8">
          <h2 className="font-semibold mb-3">Challenges</h2>
          {challenges.length === 0 ? (
            <p className="text-sm text-white/50">No challenges for this season.</p>
          ) : (
            <div className="space-y-3">
              {challenges.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center gap-2 border border-white/10 rounded-lg p-3"
                >
                  <div className="flex-1 min-w-[180px]">
                    <div className="font-medium">{c.title}</div>
                    <div className="text-xs text-white/50">
                      week {c.week_index} · {c.status} · sound {c.sound_track_id}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="px-2 py-1 text-xs rounded bg-white/10"
                    onClick={() => void setStatus(c.id, "open")}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    className="px-2 py-1 text-xs rounded bg-white/10"
                    onClick={() => void setStatus(c.id, "voting")}
                  >
                    Voting
                  </button>
                  <button
                    type="button"
                    className="px-2 py-1 text-xs rounded bg-white/10"
                    onClick={() => void snapshot(c.id, "qualifier")}
                  >
                    Snapshot qualifier
                  </button>
                  <button
                    type="button"
                    className="px-2 py-1 text-xs rounded bg-white/10"
                    onClick={() => void snapshot(c.id, "final")}
                  >
                    Snapshot final
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-white/10 p-4">
          <h2 className="font-semibold mb-3">Audit log</h2>
          <div className="space-y-2 max-h-80 overflow-y-auto text-xs">
            {audit.map((row) => (
              <div key={String(row.id)} className="border-b border-white/5 pb-2">
                <span className="text-[#C9A227]">{String(row.action)}</span>{" "}
                {String(row.entity_type)} {String(row.entity_id || "")} ·{" "}
                {String(row.created_at || "")}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
