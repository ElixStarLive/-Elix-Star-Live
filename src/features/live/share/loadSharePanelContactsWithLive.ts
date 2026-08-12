/**
 * Shared host↔spectator share-panel contact + live-now id load.
 * Callers map contact shape / toast scope; this owns the identical fetch pair.
 */

import { apiLiveStreams, collectLiveUserIds } from '../../../lib/live';
import {
  fetchAllSharePanelContacts,
  type SharePanelContact,
} from '../../../lib/sharePanelContacts';
import { reportFailure } from '../../../lib/reportFailure';

export type SharePanelContactsWithLive = {
  contacts: SharePanelContact[];
  liveUserIds: Set<string> | null;
};

/**
 * Load share contacts + optional live stream user ids.
 * Live streams failure is soft (contacts still returned; liveUserIds null).
 */
export async function loadSharePanelContactsWithLive(
  excludeUserId: string | undefined,
  liveStreamsFailureKey: string,
): Promise<SharePanelContactsWithLive> {
  const [contacts, liveResult] = await Promise.all([
    fetchAllSharePanelContacts(excludeUserId),
    apiLiveStreams().catch((err) => {
      reportFailure(liveStreamsFailureKey, err);
      return null;
    }),
  ]);
  const liveUserIds = liveResult
    ? collectLiveUserIds(liveResult.streams || [])
    : null;
  return { contacts, liveUserIds };
}
