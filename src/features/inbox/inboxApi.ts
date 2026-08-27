import { request, type ApiResult } from '../../lib/apiClient';

export interface InboxThread {
  threadId: string;
  lastMessage: string;
  lastAt: string;
  otherUser: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
  };
  unreadCount: number;
}

export interface InboxMessage {
  id: string;
  sender: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
  };
  body: string;
  createdAt: string;
}

export interface Alert {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  referenceId: string | null;
  referenceType: string | null;
  createdAt: string;
}

export async function fetchInbox(): Promise<ApiResult<{ threads: InboxThread[] }>> {
  return request<{ threads: InboxThread[] }>('/api/inbox');
}

export async function fetchThread(threadId: string): Promise<ApiResult<{ threadId: string; messages: InboxMessage[] }>> {
  return request<{ threadId: string; messages: InboxMessage[] }>(`/api/inbox/${encodeURIComponent(threadId)}`);
}

export async function fetchAlerts(): Promise<ApiResult<{ alerts: Alert[] }>> {
  return request<{ alerts: Alert[] }>('/api/alerts');
}
