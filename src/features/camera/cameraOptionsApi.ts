import { request } from '../../lib/apiClient';

export async function apiFetchCameraOptionList<T>(path: string): Promise<T[]> {
  const { data, error } = await request(path);
  if (error) {
    throw new Error(error.message || `Camera options failed: ${path}`);
  }
  const arr = (data as { data?: unknown })?.data;
  if (!Array.isArray(arr)) {
    throw new Error(`Camera options missing array: ${path}`);
  }
  return arr as T[];
}
