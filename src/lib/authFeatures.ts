/** Runtime flags from /env.js (server is source of truth). */
function runtimeEnv(key: string): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as { __ENV?: Record<string, string> }).__ENV?.[key];
}

/** Apple Sign-In UI — only when server sets APPLE_SIGN_IN_ENABLED=true and OAuth is wired. */
export function isAppleSignInEnabled(): boolean {
  const runtime = runtimeEnv('VITE_APPLE_SIGN_IN_ENABLED');
  if (runtime === 'true') return true;
  if (runtime === 'false') return false;
  return import.meta.env.VITE_APPLE_SIGN_IN_ENABLED === 'true';
}

/** Password-reset UI — only when transactional email is configured on the server. */
export function isPasswordResetEnabled(): boolean {
  const runtime = runtimeEnv('VITE_EMAIL_CONFIGURED');
  if (runtime === 'true') return true;
  if (runtime === 'false') return false;
  return import.meta.env.VITE_EMAIL_CONFIGURED === 'true';
}
