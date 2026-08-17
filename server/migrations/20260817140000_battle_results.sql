-- Permanent battle records.
--
-- Live battle state (participants, timer, running scores) is Valkey-authoritative
-- and is cleaned up shortly after a battle ends. These tables hold the frozen
-- result written exactly once at finalization, so the outcome survives Valkey
-- cleanup and server restarts.

CREATE TABLE IF NOT EXISTS battle_results (
  id BIGSERIAL PRIMARY KEY,
  battle_id TEXT NOT NULL UNIQUE,
  room_id TEXT NOT NULL,
  battle_type TEXT NOT NULL,
  winner TEXT NOT NULL,
  team_a_score INTEGER NOT NULL DEFAULT 0,
  team_b_score INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalize_reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT battle_results_type_chk CHECK (battle_type IN ('1x1', '2x2')),
  CONSTRAINT battle_results_winner_chk CHECK (winner IN ('teamA', 'teamB', 'draw'))
);

CREATE TABLE IF NOT EXISTS battle_result_participants (
  battle_id TEXT NOT NULL REFERENCES battle_results(battle_id) ON DELETE CASCADE,
  seat TEXT NOT NULL,
  creator_user_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (battle_id, seat),
  CONSTRAINT battle_result_participants_seat_chk
    CHECK (seat IN ('host', 'opponent', 'player3', 'player4')),
  CONSTRAINT battle_result_participants_team_chk
    CHECK (team_id IN ('teamA', 'teamB'))
);

CREATE INDEX IF NOT EXISTS idx_battle_results_room_id
  ON battle_results(room_id);
CREATE INDEX IF NOT EXISTS idx_battle_results_ended_at
  ON battle_results(ended_at DESC);
CREATE INDEX IF NOT EXISTS idx_battle_result_participants_creator
  ON battle_result_participants(creator_user_id);
