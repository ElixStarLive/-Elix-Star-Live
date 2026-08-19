/**
 * DM chat REST owner — same production endpoints as CHAT_CONNECTION_MAP.
 * LiveKit call signaling stays in lib/callService.ts (WebSocket).
 */

import { request } from '../../lib/apiClient';

interface ChatMessage {
  id: string;
  sender_id: string;
  text?: string;
  body?: string;
  created_at?: string;
  [key: string]: unknown;
}

export async function apiEnsureDmThread(
  otherUserId: string,
): Promise<{ threadId: string | null; error: string | null }> {
  if (!otherUserId?.trim()) {
    return { threadId: null, error: 'Missing user' };
  }
  const { data, error } = await request<Record<string, unknown>>(
    '/api/chat/threads/ensure',
    {
      method: 'POST',
      body: JSON.stringify({ otherUserId: otherUserId.trim() }),
    },
  );
  if (error) {
    return { threadId: null, error: error.message || 'Could not open chat' };
  }
  const threadId =
    (typeof data?.threadId === 'string' && data.threadId) ||
    (typeof (data?.thread as { id?: string } | undefined)?.id === 'string'
      ? (data?.thread as { id: string }).id
      : null) ||
    (typeof (data?.data as { id?: string } | undefined)?.id === 'string'
      ? (data?.data as { id: string }).id
      : null);
  if (!threadId) {
    return { threadId: null, error: 'Could not open chat' };
  }
  return { threadId, error: null };
}

export async function apiListChatThreads(): Promise<{
  threads: Record<string, unknown>[];
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>('/api/chat/threads');
  if (error) return { threads: [], error: error.message };
  const rows = Array.isArray(data?.threads)
    ? data.threads
    : Array.isArray(data?.data)
      ? data.data
      : [];
  return { threads: rows as Record<string, unknown>[], error: null };
}

export async function apiFetchThreadMessages(
  threadId: string,
): Promise<{ messages: ChatMessage[]; error: string | null }> {
  const { data, error } = await request<Record<string, unknown>>(
    `/api/chat/threads/${threadId}/messages`,
  );
  if (error) {
    return { messages: [], error: error.message || 'Failed to load messages' };
  }
  const raw = data?.messages || data?.data || [];
  const messages = Array.isArray(raw) ? (raw as ChatMessage[]) : [];
  return { messages, error: null };
}

export async function apiSendThreadMessage(
  threadId: string,
  text: string,
): Promise<{ message: ChatMessage | null; error: string | null }> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { message: null, error: 'Message is empty' };
  }
  const { data, error } = await request<Record<string, unknown>>(
    `/api/chat/threads/${threadId}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({ text: trimmed }),
    },
  );
  if (error) {
    return { message: null, error: error.message || 'Failed to send message' };
  }
  const newMsg = (data?.message || data?.data || data) as ChatMessage | undefined;
  if (!newMsg || typeof newMsg !== 'object') {
    return { message: null, error: 'Send succeeded but server returned no message' };
  }
  return { message: newMsg, error: null };
}

export async function apiMarkThreadRead(
  threadId: string,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await request(`/api/chat/threads/${threadId}/read`, { method: 'POST' });
  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}

export async function apiDeleteChatThread(
  threadId: string,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await request(`/api/chat/threads/${encodeURIComponent(threadId)}`, {
    method: 'DELETE',
  });
  if (error) return { ok: false, error: error.message || 'Could not delete' };
  return { ok: true, error: null };
}

/** Ensure thread then send — single owner for share-to-DM and similar flows. */
export async function apiSendDmToUser(
  otherUserId: string,
  text: string,
): Promise<{ message: ChatMessage | null; threadId: string | null; error: string | null }> {
  const ensured = await apiEnsureDmThread(otherUserId);
  if (!ensured.threadId) {
    return { message: null, threadId: null, error: ensured.error };
  }
  const sent = await apiSendThreadMessage(ensured.threadId, text);
  return { message: sent.message, threadId: ensured.threadId, error: sent.error };
}
