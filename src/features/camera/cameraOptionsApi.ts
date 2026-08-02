import { request } from '../../lib/apiClient';

export async function apiFetchCameraOptionList<T>(path: string): Promise<T[]> {
  try {
    const { data, error } = await request(path);
    if (error) return [];
    const arr = (data as { data?: unknown })?.data;
    return Array.isArray(arr) ? (arr as T[]) : [];
  } catch {
    return [];
  }
}
