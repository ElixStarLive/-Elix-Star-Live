/**
 * The single way the app talks to its backend.
 *
 * Every response is reduced to `{ data } | { error }` so no caller has to think
 * about status codes, and `error.code` carries the server's machine-readable
 * reason. Callers branch on that code, never on message text — matching on copy
 * is how error handling silently breaks the first time wording changes.
 *
 * A failure is always surfaced as an error. There is no path here that turns an
 * unreachable backend into an empty success.
 */

export interface ApiError {
  code: string;
  message: string;
  status: number;
}

export type ApiResult<T> = { data: T; error: null } | { data: null; error: ApiError };

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Same-origin in the browser: Vite proxies `/api` in development and the server
 * serves the built client in production. The native build overrides this with a
 * fully-qualified origin at build time.
 */
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

/**
 * The bearer token for native clients. Held in memory only — writing it to
 * `localStorage` would make it readable by any injected script, and the browser
 * does not need it there because the server also sets an HttpOnly cookie.
 */
let bearerToken: string | null = null;

export function setBearerToken(token: string | null): void {
  bearerToken = token;
}

function fail(status: number, code: string, message: string): { data: null; error: ApiError } {
  return { data: null, error: { code, message, status } };
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (bearerToken !== null) headers.set('Authorization', `Bearer ${bearerToken}`);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      // Sends and accepts the HttpOnly session cookie.
      credentials: 'include',
      ...init,
      headers,
      signal: init.signal ?? controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return fail(0, 'aborted', 'The request was cancelled.');
    }
    return fail(0, 'network_error', 'Cannot reach the server. Check your connection and try again.');
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 204) {
    return { data: undefined as T, error: null };
  }

  let body: unknown = null;
  const text = await response.text();
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      // A non-JSON body from an API that only speaks JSON means something
      // upstream answered instead of the server — a proxy error page, usually.
      return fail(response.status, 'invalid_response', 'The server returned an unexpected response.');
    }
  }

  if (!response.ok) {
    const envelope = (body as { error?: { code?: unknown; message?: unknown } } | null)?.error;
    return fail(
      response.status,
      typeof envelope?.code === 'string' ? envelope.code : 'server_error',
      typeof envelope?.message === 'string'
        ? envelope.message
        : 'Something went wrong. Please try again.',
    );
  }

  return { data: body as T, error: null };
}
