import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Mail, User } from 'lucide-react';
import { PasswordField } from '../components/PasswordField';
import { useAuthStore } from '../features/auth/authStore';

interface RegisterLocationState {
  from?: string;
}

export default function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as RegisterLocationState | null)?.from ?? '/';
  const signUp = useAuthStore((state) => state.signUp);

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    setError(null);
    setInfo(null);

    if (!acceptedTerms) {
      setError('You must accept the Terms of Service and Privacy Policy to continue.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);

    const outcome = await signUp({
      email: email.trim(),
      password,
      username: username.trim() || undefined,
    });

    if (!outcome.success) {
      setError(outcome.error.message);
      setSubmitting(false);
      return;
    }

    if (outcome.needsVerification) {
      setInfo('Please check your email to confirm your account.');
      setSubmitting(false);
      return;
    }

    navigate(from, { replace: true });
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center overflow-y-auto bg-transparent p-4 text-white xs:p-3">
      <div className="w-full max-w-[420px] rounded-2xl border border-white/10 bg-white/5 p-6 xs:max-w-[320px] xs:p-4 sm:max-w-[380px] sm:p-5">
        <div className="mb-3 flex justify-center">
          <img src="/elix-logo.png" alt="" className="h-20 w-20 object-contain" />
        </div>

        <h1 className="mb-4 text-center text-fluid-xl font-bold">Create Account</h1>

        <form onSubmit={onSubmit} className="space-y-4 xs:space-y-3" autoComplete="off">
          <div className="space-y-2">
            <label htmlFor="register-username" className="text-fluid-sm text-white/70">
              Username (optional)
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50 xs:h-3.5 xs:w-3.5" />
              <input
                id="register-username"
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/10 py-3 pl-10 pr-3 text-fluid-sm text-white outline-none placeholder:text-white/40 focus:border-white/40 xs:py-2.5 xs:pl-9"
                placeholder="username"
                autoComplete="username"
                spellCheck={false}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="register-email" className="text-fluid-sm text-white/70">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50 xs:h-3.5 xs:w-3.5" />
              <input
                id="register-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/10 py-3 pl-10 pr-3 text-fluid-sm text-white outline-none placeholder:text-white/40 focus:border-white/40 xs:py-2.5 xs:pl-9"
                placeholder="you@email.com"
                autoComplete="email"
                required
              />
            </div>
          </div>

          <PasswordField
            label="Password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
          />

          <PasswordField
            label="Confirm Password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
          />

          <button
            type="button"
            onClick={() => setAcceptedTerms((current) => !current)}
            className="flex w-full items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left transition hover:bg-white/10 xs:p-2.5"
          >
            <span
              aria-hidden="true"
              className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded border-2 transition-colors ${
                acceptedTerms ? 'border-white/80 bg-white/90' : 'border-white/30 bg-white/10'
              }`}
            >
              {acceptedTerms && (
                <svg
                  className="h-3.5 w-3.5 text-black"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={3}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </span>
            <span className="text-fluid-xs text-white/70 leading-5">
              I confirm I am at least 13 years old and agree to the{' '}
              <Link to="/terms" className="text-white underline" onClick={(event) => event.stopPropagation()}>
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link to="/privacy" className="text-white underline" onClick={(event) => event.stopPropagation()}>
                Privacy Policy
              </Link>
            </span>
          </button>

          {error !== null && (
            <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-fluid-sm text-rose-200 xs:p-2.5">
              {error}
            </p>
          )}

          {info !== null && (
            <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-fluid-sm text-white/70 xs:p-2.5">
              {info}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl border border-white/40 bg-transparent py-3 text-fluid-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60 xs:py-2.5"
          >
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <div className="mt-6 space-y-2 px-1 text-center xs:mt-4">
          <Link to="/login" state={{ from }} className="block text-fluid-sm text-white hover:underline">
            Already have an account? Sign in
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
