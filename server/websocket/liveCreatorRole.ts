import {
  isValkeyConfigured,
  valkeyDel,
  valkeyGet,
  valkeySet,
} from "../lib/valkey";

const CREATOR_ROLE_TTL_MS = 6 * 60 * 60 * 1000;

export async function setCreatorCohostRoom(
  userId: string,
  roomId: string,
): Promise<void> {
  if (!userId || !roomId || !isValkeyConfigured()) return;
  await valkeySet(`cohost_role_room:${userId}`, roomId, CREATOR_ROLE_TTL_MS);
}

export async function clearCreatorCohostRoom(
  userId: string,
  roomId: string,
): Promise<void> {
  if (!userId || !roomId || !isValkeyConfigured()) return;
  const current = await valkeyGet(`cohost_role_room:${userId}`);
  if (current === roomId) {
    await valkeyDel(`cohost_role_room:${userId}`);
  }
}

/**
 * Server-owned room where an already-live creator is currently publishing as
 * a battle participant or co-host. Their original active-live registration
 * remains authoritative until they explicitly End Live.
 */
export async function getCreatorLiveRoleRoom(
  userId: string,
): Promise<string | null> {
  if (!userId || !isValkeyConfigured()) return null;
  const battleRoom = await valkeyGet(`ubr:${userId}`);
  if (battleRoom) return battleRoom;
  return (await valkeyGet(`cohost_role_room:${userId}`)) || null;
}
