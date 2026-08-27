import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Check, Mail, User } from 'lucide-react';
import { PasswordField } from '../components/PasswordField';
import { useAuthStore } from '../features/auth/authStore';
import { readRemembered, writeRemembered } from '../features/auth/rememberedIdentifier';

interface LoginLocationState {
  from?: string;
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const signIn = useAuthStore((state) => state.signIn);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /** Where to land after signing in — set by whatever redirected here. */
  const from = (location.state as LoginLocationState | null)?.from ?? '/';

  useEffect(() => {
    const remembered = readRemembered();
    setRemember(remembered.enabled);
    setIdentifier(remembered.identifier);
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    setError(null);
    setSubmitting(true);

    const trimmed = identifier.trim();
    const failure = await signIn(trimmed, password);

    if (failure) {
      setError(failure.message);
      setSubmitting(false);
      return;
    }

    // Only recorded once the credentials are known to be good, so a typo is
    // never the value restored on the next visit.
    writeRemembered(remember, trimmed);

    // `replace` so the back gesture does not return to the form of a session
    // that is now signed in.
    navigate(from, { replace: true });
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center overflow-y-auto bg-transparent p-4 text-white xs:p-3">
      <div className="w-full max-w-[420px] rounded-2xl border border-white/10 bg-white/5 p-6 xs:max-w-[320px] xs:p-4 sm:max-w-[380px] sm:p-5">
        <div className="mb-4 flex justify-center">
          <img src="/elix-logo.png" alt="" className="h-24 w-24 object-contain" />
        </div>

        <h1 className="mb-4 text-center text-fluid-xl font-bold xs:mb-3">Login</h1>

        <form onSubmit={onSubmit} className="space-y-4 xs:space-y-3" noValidate>
          <div className="space-y-2">
            <label htmlFor="login-identifier" className="text-fluid-sm text-white/70">
              Email or Username
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50 xs:h-3.5 xs:w-3.5" />
              <input
                id="login-identifier"
                type="text"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/10 py-3 pl-10 pr-3 text-fluid-sm text-white outline-none placeholder:text-white/40 focus:border-white/40 xs:py-2.5 xs:pl-9"
                placeholder="username or you@email.com"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
              />
            </div>
          </div>

          <PasswordField
            label="Password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
          />

          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3 transition hover:bg-white/10 xs:px-2 xs:py-2.5">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className={`flex h-5 w-5 items-center justify-center rounded-md border transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-white/60 xs:h-4 xs:w-4 ${
                remember ? 'border-white/80 bg-white/90' : 'border-white/30 bg-white/10'
              }`}
            >
              {remember && <Check className="h-3.5 w-3.5 stroke-[3] text-black xs:h-3 xs:w-3" />}
            </span>
            <span className="select-none text-fluid-sm text-white/70">Remember email</span>
          </label>

          {error !== null && (
            // `alert` so the failure is announced rather than only shown.
            <p
              role="alert"
              className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-fluid-sm text-rose-200 xs:p-2.5"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl border border-white/40 bg-transparent py-3 text-fluid-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60 xs:py-2.5"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="mt-4 flex flex-col gap-2">
          <span className="text-xs text-white/40">New here?</span>
          <Link
            to="/register"
            state={{ from }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"
          >
            <User className="h-4 w-4" />
            Sign up
          </Link>
        </div>

        <div className="mt-4 space-y-2 px-1 text-center xs:mt-3">
          <Link
            to="/forgot-password"
            className="block text-fluid-sm text-white/60 hover:text-white hover:underline"
          >
            Forgot your password?
          </Link>
          <div className="mx-auto max-w-[280px] space-y-0.5 text-[11px] leading-relaxed tracking-wide text-white/45">
            <p>Created by Andrei Ionut Berica</p>
            <p>© 2026 · Owner &amp; Developer · All rights reserved.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
