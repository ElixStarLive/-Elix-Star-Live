import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/apiClient';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'working' | 'error'>('working');
  const [message, setMessage] = useState<string>('Confirming your email...');

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get('code');
        const errorDescription = url.searchParams.get('error_description');
        const error = url.searchParams.get('error');

        if (errorDescription || error) {
          setStatus('error');
          setMessage(decodeURIComponent(errorDescription ?? error ?? 'Unknown error'));
          return;
        }

        if (code) {
          const { error: exchangeError } = await api.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            setStatus('error');
            setMessage(exchangeError.message);
            return;
          }
        }

        const { data } = await api.auth.getSession();
        if (data.session) {
          if (!cancelled) navigate('/profile', { replace: true });
          return;
        }

        if (!cancelled) {
          setStatus('error');
          setMessage('No active session found. Try signing in again.');
        }
      } catch (e) {
        if (!cancelled) {
          setStatus('error');
          setMessage(e instanceof Error ? e.message : 'Failed to confirm email.');
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="min-h-[100dvh] bg-[#13151A] text-white p-4 flex justify-center">
      <div className="w-full">
        <h1 className="font-bold text-lg mb-3">Auth Callback</h1>
        <div className="text-sm text-white/70">
          {status === 'working' ? 'Working...' : 'Something went wrong.'}
        </div>
        <div className="mt-4 p-4 bg-transparent border border-transparent rounded-xl text-sm break-words">
          {message}
        </div>
        <button
          className="mt-4 w-full bg-secondary text-black font-bold rounded-xl py-2 text-sm"
          onClick={() => navigate('/login', { replace: true })}
        >
          Go to Login
        </button>
      </div>
    </div>
  );
}

