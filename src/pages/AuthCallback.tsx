import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, XCircle } from 'lucide-react';
import { useAuthStore } from '../features/auth/authStore';
import { setBearerToken } from '../lib/apiClient';
import { verifyEmail } from '../features/auth/authApi';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'working' | 'ok' | 'error'>('working');
  const [message, setMessage] = useState('Confirming your email…');
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const run = async () => {
      const token = searchParams.get('token');
      const error = searchParams.get('error') ?? searchParams.get('error_description');

      if (error) {
        setStatus('error');
        setMessage(error);
        return;
      }

      if (!token) {
        setStatus('error');
        setMessage('No confirmation token found.');
        return;
      }

      const { data, error: apiError } = await verifyEmail(token);
      if (apiError) {
        setStatus('error');
        setMessage(apiError.message);
        return;
      }

      setBearerToken(data.session.accessToken);
      useAuthStore.getState().updateUser(data.user);
      setStatus('ok');
      setMessage('Email confirmed. Redirecting…');
      setTimeout(() => navigate('/profile', { replace: true }), 1_500);
    };

    void run();
  }, [navigate, searchParams]);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center p-4 text-white">
      <div className="w-full max-w-[420px] rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
        {status === 'working' && (
          <p className="text-fluid-lg font-semibold">{message}</p>
        )}
        {status === 'ok' && (
          <>
            <CheckCircle className="mx-auto mb-4 h-12 w-12" />
            <h1 className="text-fluid-xl font-bold">Confirmed</h1>
            <p className="mt-2 text-fluid-sm text-white/60">{message}</p>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle className="mx-auto mb-4 h-12 w-12 text-rose-300" />
            <h1 className="text-fluid-xl font-bold">Could not confirm</h1>
            <p className="mt-2 break-words text-fluid-sm text-rose-200">{message}</p>
            <button
              type="button"
              onClick={() => navigate('/login', { replace: true })}
              className="mt-6 w-full rounded-xl border border-white/40 py-3 text-fluid-sm font-bold"
            >
              Go to Login
            </button>
          </>
        )}
      </div>
    </div>
  );
}
