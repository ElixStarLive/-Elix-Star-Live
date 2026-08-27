import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Mail } from 'lucide-react';
import { forgotPassword } from '../features/auth/authApi';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    setError(null);
    setSubmitting(true);

    const { error: apiError } = await forgotPassword(email.trim().toLowerCase());
    setSubmitting(false);

    if (apiError && apiError.code !== 'aborted') {
      setError(apiError.message);
      return;
    }

    setSuccess(true);
  };

  if (success) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center p-4 text-white">
        <div className="w-full max-w-[420px] rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
          <CheckCircle className="mx-auto mb-4 h-12 w-12" />
          <h1 className="text-fluid-xl font-bold">Check your email</h1>
          <p className="mt-2 text-fluid-sm text-white/60">
            If an account exists for <strong>{email}</strong>, a reset link has been sent.
          </p>
          <Link
            to="/login"
            className="mt-6 inline-flex w-full items-center justify-center rounded-xl border border-white/40 py-3 text-fluid-sm font-bold"
          >
            Back to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center p-4 text-white">
      <div className="w-full max-w-[420px] rounded-2xl border border-white/10 bg-white/5 p-6">
        <Link to="/login" className="mb-4 flex items-center gap-2 text-fluid-sm text-white/60 hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          Back to Login
        </Link>

        <h1 className="text-fluid-xl font-bold">Forgot Password</h1>
        <p className="mt-2 text-fluid-sm text-white/60">
          Enter your email and we'll send you a reset link.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
          <div className="space-y-2">
            <label htmlFor="forgot-email" className="text-fluid-sm text-white/70">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
              <input
                id="forgot-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/10 py-3 pl-10 pr-3 text-fluid-sm text-white outline-none placeholder:text-white/40 focus:border-white/40"
                placeholder="you@email.com"
                autoComplete="email"
                required
              />
            </div>
          </div>

          {error !== null && (
            <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-fluid-sm text-rose-200">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl border border-white/40 bg-transparent py-3 text-fluid-sm font-bold disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? 'Sending…' : 'Send Reset Link'}
          </button>
        </form>
      </div>
    </div>
  );
}
