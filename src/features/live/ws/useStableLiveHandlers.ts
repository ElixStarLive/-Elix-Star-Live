/**
 * Stable identities for the live WS handler bundle.
 *
 * The live subscription must live exactly as long as `roomId + userId`. When that
 * effect re-runs mid-stream it unbinds the socket, and the server reads a host
 * unbind as the host leaving, which ends the live for everyone watching. But the
 * handlers themselves have to run the *current* logic when an event arrives, and
 * React hands them a new identity on almost every render. Depending on them
 * directly forces a choice between a dishonest dependency array and a
 * stream-ending rebind — which is why this bind effect carried an
 * `exhaustive-deps` suppression.
 *
 * Each function returned here keeps one identity for the life of the component
 * and forwards to whatever implementation was passed on the most recent render.
 * The subscription effect can then depend on this bundle truthfully and still
 * never rebind, and the handlers never read a stale closure.
 *
 * This is not a second subscription system: the returned functions are handed to
 * the existing `bindLive*Ws` binders unchanged.
 */

import { useRef } from 'react';

type AnyFn = (...args: never[]) => unknown;

export function useStableLiveHandlers<T extends Record<string, AnyFn>>(handlers: T): T {
  const latest = useRef(handlers);
  latest.current = handlers;

  const stable = useRef<T | null>(null);
  if (stable.current === null) {
    const forwarders: Record<string, AnyFn> = {};
    for (const key of Object.keys(handlers)) {
      forwarders[key] = ((...args: never[]) =>
        (latest.current as Record<string, AnyFn>)[key](...args)) as AnyFn;
    }
    stable.current = forwarders as T;
  }
  return stable.current;
}
