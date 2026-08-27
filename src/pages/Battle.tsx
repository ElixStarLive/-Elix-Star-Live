import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Flame, Swords, X } from 'lucide-react';
import { fetchBattle, startBattle, tapBattle, type Battle as BattleData } from '../features/battle/battleApi';

export default function Battle() {
  const { battleId } = useParams<{ battleId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [creatorId, setCreatorId] = useState('');
  const [opponentId, setOpponentId] = useState('');
  const [battle, setBattle] = useState<BattleData | null>(null);
  const [loading, setLoading] = useState(false);
  const [tapping, setTapping] = useState(false);

  useEffect(() => {
    if (!battleId) return;
    let cancelled = false;
    fetchBattle(battleId).then(({ data }) => {
      if (cancelled) return;
      if (data) setBattle(data);
    });
    return () => {
      cancelled = true;
    };
  }, [battleId]);

  const exit = () => {
    const from = (location.state as { from?: string } | null)?.from ?? '/live';
    navigate(from, { replace: true });
  };

  const onStart = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!creatorId || !opponentId) return;
    setLoading(true);
    const { data, error } = await startBattle({ creatorStreamId: creatorId, opponentStreamId: opponentId });
    setLoading(false);
    if (error || !data) return;
    navigate(`/battle/${data.id}`, { replace: true });
  };

  const onTap = async (side: 'creator' | 'opponent') => {
    if (!battle?.id) return;
    setTapping(true);
    const { data } = await tapBattle(battle.id, side);
    setTapping(false);
    if (data) {
      setBattle((b) => (b ? { ...b, creatorScore: data.creatorScore, opponentScore: data.opponentScore } : null));
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-black text-white">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-black/90 px-4 py-3 backdrop-blur-md">
        <button type="button" onClick={exit} className="flex items-center gap-2 text-white/70 hover:text-white" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
          <span className="text-fluid-sm">Back</span>
        </button>
        <h1 className="text-fluid-base font-bold">Battle</h1>
        <button type="button" onClick={exit} aria-label="Close">
          <X className="h-5 w-5 text-white/70 hover:text-white" />
        </button>
      </header>

      <main className="p-4">
        {battle ? (
          <div className="space-y-4 text-center">
            <div className="flex items-center justify-around rounded-2xl border border-white/10 bg-white/5 p-4">
              <div>
                <p className="text-fluid-2xl font-bold text-orange-300">{battle.creatorScore}</p>
                <p className="text-fluid-sm text-white/60">Creator</p>
              </div>
              <Swords className="h-8 w-8 text-white/30" />
              <div>
                <p className="text-fluid-2xl font-bold text-purple-300">{battle.opponentScore}</p>
                <p className="text-fluid-sm text-white/60">Opponent</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onTap('creator')}
                disabled={tapping || !battle.isActive}
                className="rounded-xl border border-orange-500/30 bg-orange-500/10 py-4 text-fluid-sm font-bold text-orange-200 disabled:opacity-60"
              >
                <Flame className="mx-auto mb-1 h-5 w-5" />
                {tapping ? '…' : 'Tap +5'}
              </button>
              <button
                type="button"
                onClick={() => onTap('opponent')}
                disabled={tapping || !battle.isActive}
                className="rounded-xl border border-purple-500/30 bg-purple-500/10 py-4 text-fluid-sm font-bold text-purple-200 disabled:opacity-60"
              >
                <Flame className="mx-auto mb-1 h-5 w-5" />
                {tapping ? '…' : 'Tap +5'}
              </button>
            </div>
            {!battle.isActive && <p className="text-fluid-sm text-white/60">Battle ended.</p>}
          </div>
        ) : battleId ? (
          <p className="text-white/60">Loading battle…</p>
        ) : (
          <form onSubmit={onStart} className="space-y-4">
            <p className="text-fluid-sm text-white/60">Start a battle between two live streams.</p>
            <div className="space-y-2">
              <label className="text-fluid-sm text-white/70">Creator Stream ID</label>
              <input
                type="text"
                value={creatorId}
                onChange={(e) => setCreatorId(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/10 p-3 text-fluid-sm text-white outline-none focus:border-white/40"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-fluid-sm text-white/70">Opponent Stream ID</label>
              <input
                type="text"
                value={opponentId}
                onChange={(e) => setOpponentId(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/10 p-3 text-fluid-sm text-white outline-none focus:border-white/40"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl border border-white/40 bg-transparent py-3 text-fluid-sm font-bold disabled:opacity-60"
            >
              {loading ? 'Starting…' : 'Start Battle'}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
