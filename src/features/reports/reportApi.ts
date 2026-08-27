import { request, type ApiResult } from '../../lib/apiClient';

export interface ReportInput {
  targetId: string;
  targetType: 'user' | 'video' | 'live_stream' | 'comment';
  reason: string;
  details?: string;
}

export async function submitReport(body: ReportInput): Promise<ApiResult<{ success: boolean }>> {
  return request<{ success: boolean }>('/api/reports', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
