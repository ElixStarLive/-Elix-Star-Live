import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import { PasswordField } from '../components/PasswordField';
import { resetPassword } from '../features/auth/authApi';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Invalid or missing reset link. Please request a new password reset.');
    }
  }, [token]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting || !token) return;

    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    const { error: apiError } = await resetPassword(token, password);
    setSubmitting(false);

    if (apiError) {
      setError(apiError.message);
      return;
    }

    setSuccess(true);
    setTimeout(() => navigate('/login', { replace: true }), 2_000);
  };

  if (success) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center p-4 text-white">
        <div className="w-full max-w-[420px] rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
          <CheckCircle className="mx-auto mb-4 h-12 w-12" />
          <h1 className="text-fluid-xl font-bold">Password Reset</h1>
          <p className="mt-2 text-fluid-sm text-white/60">Redirecting to login…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center p-4 text-white">
      <div className="w-full max-w-[420px] rounded-2xl border border-white/10 bg-white/5 p-6">
        <h1 className="text-fluid-xl font-bold">Reset Password</h1>
        <p className="mt-2 text-fluid-sm text-white/60">Enter your new password below.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
          <PasswordField label="New Password" value={password} onChange={setPassword} autoComplete="new-password" />
          <PasswordField
            label="Confirm Password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
          />

          {error !== null && (
            <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-fluid-sm text-rose-200">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !token}
            className="w-full rounded-xl border border-white/40 bg-transparent py-3 text-fluid-sm font-bold disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? 'Updating…' : 'Reset Password'}
          </button>

          <Link
            to="/login"
            className="block text-center text-fluid-sm text-white/60 hover:text-white hover:underline"
          >
            Back to Login
          </Link>
        </form>
      </div>
    </div>
  );
}
