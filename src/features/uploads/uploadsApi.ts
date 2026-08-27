import { request, type ApiResult } from '../../lib/apiClient';

export async function uploadFile(file: File): Promise<ApiResult<{ url: string; path: string }>> {
  const formData = new FormData();
  formData.append('file', file);
  return request<{ url: string; path: string }>('/api/uploads', {
    method: 'POST',
    body: formData,
  });
}
