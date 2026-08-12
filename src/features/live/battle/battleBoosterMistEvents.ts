/**
 * Shared host↔spectator battle booster / mist WS event parsing + apply.
 * Controllers own React state; this only runs the identical payload → state updates.
 */

import type { Dispatch, SetStateAction } from 'react';

export type BattleBoosterActivation = {
  id: string;
  userId: string;
  multiplier: number;
  username: string;
  expiresAt: number;
};

export type BattleBoosterCatch = {
  id: string;
  multiplier: number;
  finalPoints: number;
  username: string;
};

export type BattleMistFog = {
  supportedUserId: string;
  supportedSide: 'host' | 'opponent';
  expiresAt: number;
};

type SetBoosterActivations = Dispatch<SetStateAction<BattleBoosterActivation[]>>;
type SetBoosterCatches = Dispatch<SetStateAction<BattleBoosterCatch[]>>;
type SetMistFog = Dispatch<SetStateAction<BattleMistFog | null>>;

export type BattleBoosterMistHandlers = {
  onBoosterActivated: (data: unknown) => void;
  onBoosterCaught: (data: unknown) => void;
  onMistActivated: (data: unknown) => void;
};

export type CreateBattleBoosterMistHandlersOpts = {
  setBoosterActivations: SetBoosterActivations;
  setBoosterCatches: SetBoosterCatches;
  setMistFog: SetMistFog;
  /** Spectator-only: track the viewer's own active booster window. */
  selfUserId?: string;
  onSelfBoosterActivated?: (payload: { multiplier: number; expiresAt: number }) => void;
};

/** Wire identical booster_activated / booster_caught / mist_activated handlers. */
export function createBattleBoosterMistHandlers(
  opts: CreateBattleBoosterMistHandlersOpts,
): BattleBoosterMistHandlers {
  const {
    setBoosterActivations,
    setBoosterCatches,
    setMistFog,
    selfUserId,
    onSelfBoosterActivated,
  } = opts;

  const onBoosterActivated = (data: unknown) => {
    const d = data as {
      multiplier?: number;
      username?: string;
      user_id?: string;
      expires_at?: number;
      duration_ms?: number;
    };
    const multiplier = Number(d?.multiplier) || 0;
    const expiresAt =
      Number(d?.expires_at) || Date.now() + (Number(d?.duration_ms) || 30000);
    const userId = String(d?.user_id || '');
    if (
      onSelfBoosterActivated &&
      selfUserId &&
      userId &&
      String(userId) === String(selfUserId)
    ) {
      onSelfBoosterActivated({ multiplier, expiresAt });
    }
    // Glove stays for the full server-authoritative window (default ~30s).
    const id = `${Date.now()}-${Math.random()}`;
    setBoosterActivations((prev) => [
      ...prev,
      {
        id,
        userId,
        multiplier,
        username: String(d?.username || ''),
        expiresAt,
      },
    ]);
    const ms = Math.max(1000, expiresAt - Date.now());
    setTimeout(() => setBoosterActivations((prev) => prev.filter((a) => a.id !== id)), ms);
  };

  const onBoosterCaught = (data: unknown) => {
    const d = data as {
      multiplier?: number;
      final_points?: number;
      username?: string;
      transaction_id?: string;
    };
    const id = String(d?.transaction_id || `${Date.now()}-${Math.random()}`);
    setBoosterCatches((prev) =>
      prev.some((c) => c.id === id)
        ? prev
        : [
            ...prev,
            {
              id,
              multiplier: Number(d?.multiplier) || 0,
              finalPoints: Number(d?.final_points) || 0,
              username: String(d?.username || ''),
            },
          ],
    );
    setTimeout(() => setBoosterCatches((prev) => prev.filter((c) => c.id !== id)), 2200);
  };

  const onMistActivated = (data: unknown) => {
    const d = data as {
      supported_user_id?: string;
      supported_side?: string;
      expires_at?: number;
    };
    const supportedUserId = String(d?.supported_user_id || '');
    const expiresAt = Number(d?.expires_at) || 0;
    if (!supportedUserId || expiresAt <= Date.now()) return;
    const supportedSide = d?.supported_side === 'opponent' ? 'opponent' : 'host';
    setMistFog({ supportedUserId, supportedSide, expiresAt });
  };

  return { onBoosterActivated, onBoosterCaught, onMistActivated };
}
