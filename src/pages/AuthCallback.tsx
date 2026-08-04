import React, { useCallback, useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { authVerifyEmail } from '../features/auth/authSession';
import { useAuthStore } from '../store/useAuthStore';

/**
 * Handles email-confirmation links: /auth/callback?token=<purpose-bound JWT>
 * Existing layout preserved; only the verification path is wired to the real API.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const goLogin = useCallback(() => navigate('/login', { replace: true }), [navigate]);
  const [status, setStatus] = useState<'working' | 'error' | 'ok'>('working');
  const [message, setMessage] = useState<string>('Confirming your email...');
  const processedRef = useRef(false);

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;
    let cancelled = false;

    const run = async () => {
      try {
        const url = new URL(window.location.href);
        const token = url.searchParams.get('token');
        const errorDescription = url.searchParams.get('error_description');
        const error = url.searchParams.get('error');

        if (errorDescription || error) {
          let decoded: string;
          try {
            decoded = decodeURIComponent(errorDescription ?? error ?? 'Unknown error');
          } catch {
            decoded = errorDescription ?? error ?? 'Unknown error';
          }
          if (!cancelled) {
            setStatus('error');
            setMessage(decoded);
          }
          return;
        }

        if (token) {
          const verifyResult = await authVerifyEmail(token);
          if (cancelled) return;
          if (verifyResult.ok === false) {
            setStatus('error');
            setMessage(verifyResult.error || 'Invalid or expired confirmation link.');
            return;
          }
          if (verifyResult.kind !== 'session' || !verifyResult.accessToken) {
            setStatus('error');
            setMessage('Confirmation succeeded but no session was returned. Please sign in.');
            return;
          }
          // Seed the session token so checkUser can hydrate user + profile_meta.
          useAuthStore.setState({
            session: {
              user: verifyResult.user as never,
              access_token: verifyResult.accessToken,
            },
            backendUser: verifyResult.user as never,
            isAuthenticated: true,
            isLoading: true,
            authMode: 'client',
          });
          await useAuthStore.getState().checkUser();
          if (cancelled) return;
          setStatus('ok');
          setMessage('Email confirmed. Redirecting...');
          navigate('/profile', { replace: true });
          return;
        }

        if (useAuthStore.getState().session?.access_token) {
          navigate('/profile', { replace: true });
          return;
        }

        setStatus('error');
        setMessage('No confirmation token found. Try signing in again.');
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
    <div className="min-h-[100dvh] bg-[#121215] text-white p-4 flex justify-center">
      <div className="w-full">
        <h1 className="font-bold text-lg mb-3">Auth Callback</h1>
        <div className="text-sm text-white/70">
          {status === 'working' ? 'Working...' : status === 'ok' ? 'Done.' : 'Something went wrong.'}
        </div>
        <div className="mt-4 p-4 bg-transparent border border-transparent rounded-xl text-sm break-words">
          {message}
        </div>
        <button
          className="mt-4 w-full bg-secondary text-black font-bold rounded-xl py-2 text-sm"
          onClick={goLogin}
        >
          Go to Login
        </button>
      </div>
    </div>
  );
}
