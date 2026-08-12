/**
 * Cohost invite / request / layout WS bind site.
 */

import { LIVE_WS_IN } from '../../../lib/live';
import { bindLiveWsEventPairs, type LiveWsEventPair } from './bindLiveWsEventPairs';

export type LiveCohostWsHandlers = {
  onInvite?: (data: unknown) => void;
  onInviteAck?: (data: unknown) => void;
  onInviteAccepted?: (data: unknown) => void;
  onRequest?: (data: unknown) => void;
  onRequestAccepted?: (data: unknown) => void;
  onRequestDeclined?: (data: unknown) => void;
  onLayoutSync?: (data: unknown) => void;
};

export function bindLiveCohostWs(handlers: LiveCohostWsHandlers): () => void {
  const pairs: LiveWsEventPair[] = [];

  if (handlers.onInvite) pairs.push([LIVE_WS_IN.cohost_invite, handlers.onInvite]);
  if (handlers.onInviteAck) {
    pairs.push([LIVE_WS_IN.cohost_invite_ack, handlers.onInviteAck]);
  }
  if (handlers.onInviteAccepted) {
    pairs.push([LIVE_WS_IN.cohost_invite_accepted, handlers.onInviteAccepted]);
  }
  if (handlers.onRequest) pairs.push([LIVE_WS_IN.cohost_request, handlers.onRequest]);
  if (handlers.onRequestAccepted) {
    pairs.push(['cohost_request_accepted', handlers.onRequestAccepted]);
  }
  if (handlers.onRequestDeclined) {
    pairs.push(['cohost_request_declined', handlers.onRequestDeclined]);
  }
  if (handlers.onLayoutSync) {
    pairs.push([LIVE_WS_IN.cohost_layout_sync, handlers.onLayoutSync]);
  }

  return bindLiveWsEventPairs(pairs);
}
