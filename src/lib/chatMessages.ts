/**
 * DM chat message helpers — re-export feature owner in features/chat/chatApi.
 * Events: dm_message, dm_thread_updated (from server after POST).
 */

export type { ChatMessage } from '../features/chat/chatApi';
export {
  apiEnsureDmThread as ensureDmThread,
  apiFetchThreadMessages as fetchThreadMessages,
  apiSendThreadMessage as sendThreadMessage,
  apiSendDmToUser as sendDmToUser,
} from '../features/chat/chatApi';
