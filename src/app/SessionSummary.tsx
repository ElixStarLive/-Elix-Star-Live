import { useAuthStore } from '../features/auth/authStore';

/**
 * Temporary root view, owned by PAGE-006 (App Shell) and removed when it lands.
 *
 * It exists so the authentication contract can be verified at runtime: it proves
 * the session resolved from the server, survives a reload, and can be ended.
 * It renders no product surface and nothing else imports it.
 */
export function SessionSummary() {
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);

  if (!user) return null;

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 p-6 text-white">
      <p className="text-fluid-lg font-semibold">Signed in as {user.username}</p>
      <p className="text-fluid-sm text-white/60">{user.email}</p>
      <button
        type="button"
        onClick={() => void signOut()}
        className="rounded-xl border border-white/40 px-6 py-2.5 text-fluid-sm font-bold"
      >
        Sign out
      </button>
    </div>
  );
}
