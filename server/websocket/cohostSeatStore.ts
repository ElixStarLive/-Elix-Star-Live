/**
 * The only writer of the co-host seat table.
 *
 * Seats live in one Valkey value, so changing a seat is always a
 * read-modify-write. Performed in the open, two of them overlapping — two host
 * devices, two spectators accepting, two server instances — each compute their
 * new table from a snapshot the other has already replaced. The last write wins,
 * which means the capacity check can pass twice for the final seat (both users
 * are told they joined and both are granted publish, while the stage shows one
 * of them), and a leave can be undone by an accept that read the table first.
 *
 * Every mutation therefore runs inside a short per-room lock, so the read and
 * the write are one step and the table only moves through states a single writer
 * computed. The lock is held for a Valkey round trip or two; LiveKit calls and
 * broadcasts stay outside it.
 *
 * Nothing here reports success it cannot prove: a caller that could not take the
 * lock is told `contended`, and a failed read or write is `unavailable`. Neither
 * may be presented to a client as a seat change.
 */

import { randomUUID } from "crypto";
import { isValkeyConfigured, valkeyTrySetNx, valkeyReleaseLock } from "../lib/valkey";
import { logger } from "../lib/logger";
import { setCohostLayout, tryGetCohostLayout } from "./index";
import {
  MAX_COHOST_SLOTS,
  normalizeCohostSlots,
  type CohostSlot,
} from "./cohostSlots";

const SEAT_LOCK_TTL_MS = 5_000;
const SEAT_LOCK_ATTEMPTS = 25;
const SEAT_LOCK_RETRY_MS = 40;

export type CohostSeatLayout = {
  hostUserId: string;
  layoutId: string | null;
  featuredUserId: string | null;
};

/**
 * What the caller wants the table to become. `layoutId` / `featuredUserId` left
 * undefined keep whatever the room already had, so a seat change never resets
 * presentation state it was not asked to touch.
 */
export type CohostSeatWrite = {
  slots: CohostSlot[];
  changed: boolean;
  full?: boolean;
  layoutId?: string | null;
  featuredUserId?: string | null;
};

/** Returning null rejects the mutation: nothing is written. */
export type CohostSeatMutator = (
  seats: CohostSlot[],
  layout: CohostSeatLayout | null,
) => CohostSeatWrite | null;

export type CohostSeatMutation =
  | {
      status: "applied" | "unchanged" | "full";
      seats: CohostSlot[];
      previousSeats: CohostSlot[];
      layoutId: string | null;
      featuredUserId: string | null;
    }
  | { status: "rejected" }
  | { status: "contended" }
  | { status: "unavailable" };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Apply one change to a room's seat table under the room's seat lock.
 *
 * `hostUserId` is the host the caller has already proven; it is what seats are
 * normalized against (the host can never hold a co-host seat) and what the table
 * is stored under. The mutator also receives the stored layout so an authority
 * check that depends on it — "was this user actually invited?" — happens on the
 * same snapshot that is about to be written, not on one that may already be gone.
 */
export async function mutateCohostSeats(
  roomId: string,
  hostUserId: string,
  mutate: CohostSeatMutator,
): Promise<CohostSeatMutation> {
  const room = String(roomId || "").trim();
  const host = String(hostUserId || "").trim();
  if (!room || !host) return { status: "rejected" };
  if (!isValkeyConfigured()) return { status: "unavailable" };

  const lockKey = `cohost:lock:${room}`;
  const token = randomUUID();
  let held = false;
  for (let attempt = 0; attempt < SEAT_LOCK_ATTEMPTS; attempt++) {
    const outcome = await valkeyTrySetNx(lockKey, token, SEAT_LOCK_TTL_MS);
    if (outcome === "set") {
      held = true;
      break;
    }
    if (outcome === "unavailable") return { status: "unavailable" };
    await sleep(SEAT_LOCK_RETRY_MS);
  }
  if (!held) {
    logger.warn({ roomId: room }, "mutateCohostSeats: seat lock not acquired");
    return { status: "contended" };
  }

  try {
    const read = await tryGetCohostLayout(room);
    if (read.status === "unavailable") return { status: "unavailable" };
    const stored = read.layout;
    const layout: CohostSeatLayout | null = stored
      ? {
          hostUserId: String(stored.hostUserId || ""),
          layoutId:
            typeof stored.layoutId === "string" && stored.layoutId.trim()
              ? stored.layoutId.trim()
              : null,
          featuredUserId:
            typeof stored.featuredUserId === "string" && stored.featuredUserId.trim()
              ? stored.featuredUserId.trim()
              : null,
        }
      : null;
    const previousSeats = normalizeCohostSlots(
      stored?.coHosts,
      host,
      MAX_COHOST_SLOTS,
    );

    const write = mutate(previousSeats, layout);
    if (!write) return { status: "rejected" };

    const layoutId =
      write.layoutId !== undefined ? write.layoutId : (layout?.layoutId ?? null);
    const featuredUserId =
      write.featuredUserId !== undefined
        ? write.featuredUserId
        : (layout?.featuredUserId ?? null);

    if (write.full) {
      return {
        status: "full",
        seats: previousSeats,
        previousSeats,
        layoutId,
        featuredUserId,
      };
    }

    const presentationChanged =
      layoutId !== (layout?.layoutId ?? null) ||
      featuredUserId !== (layout?.featuredUserId ?? null);
    // A first write is needed even when nothing changed if the room has no
    // stored table yet, otherwise the host's own id is never recorded.
    if (!write.changed && !presentationChanged && stored) {
      return {
        status: "unchanged",
        seats: previousSeats,
        previousSeats,
        layoutId,
        featuredUserId,
      };
    }

    const written = await setCohostLayout(
      room,
      write.slots,
      host,
      layoutId,
      featuredUserId,
    );
    if (written !== "ok") {
      logger.error(
        { roomId: room, hostUserId: host },
        "mutateCohostSeats: seat table write not confirmed",
      );
      return { status: "unavailable" };
    }
    return {
      status: "applied",
      seats: write.slots,
      previousSeats,
      layoutId,
      featuredUserId,
    };
  } finally {
    await valkeyReleaseLock(lockKey, token);
  }
}
