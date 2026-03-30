import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { Eye, EyeOff, Lock, Mail, Check, User } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signInWithPassword, signInWithApple } = useAuthStore();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saveDetails, setSaveDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const state = location.state as { from?: string } | null;
  const from = state?.from ?? '/';

  // Load saved email AND password on mount
  useEffect(() => {
    const savedSaveDetails = window.localStorage.getItem('login_save_details') === 'true';
    const savedEmail = window.localStorage.getItem('login_saved_email') || '';
    
    setSaveDetails(savedSaveDetails);
    if (savedSaveDetails && savedEmail) {
      setEmail(savedEmail);
    }
    // Clean up any previously stored password for security
    try { window.localStorage.removeItem('login_saved_password'); } catch { /* ignore */ }
  }, []);

  const isMounted = React.useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent double-submit
    if (isSubmitting) return;
    
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await signInWithPassword(email.trim(), password);
      
      // If component unmounted during await, stop here
      if (!isMounted.current) return;

      if (res.error) {
        if (res.error === 'aborted' || res.error.includes('aborted')) {
          if (isMounted.current) setIsSubmitting(false);
          return;
        }
        // Legacy message from old build – prompt refresh
        const message =
          res.error === 'System error: Authentication not configured.'
            ? 'Please refresh the page and try again. If the problem continues, ensure the app is updated and the server is running.'
            : res.error;
        if (isMounted.current) {
          setError(message);
          setIsSubmitting(false);
        }
        return;
      }

      if (saveDetails) {
        try {
          window.localStorage.setItem('login_saved_email', email.trim());
          window.localStorage.setItem('login_save_details', 'true');
        } catch { /* ignore storage errors */ }
      } else {
        try {
          window.localStorage.removeItem('login_saved_email');
          window.localStorage.setItem('login_save_details', 'false');
        } catch { /* ignore storage errors */ }
      }
      // Clean up any previously stored password
      try { window.localStorage.removeItem('login_saved_password'); } catch { /* ignore */ }

      if (isMounted.current) {
        navigate(from, { replace: true });
      }
    } catch (err: any) {

      
      // Check for AbortError in catch block too
      if (err.name === 'AbortError' || err.message?.includes('aborted')) {
        if (isMounted.current) setIsSubmitting(false);
        return;
      }

      if (isMounted.current) {
        setError('An unexpected error occurred. Please try again.');
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="min-h-[100dvh] h-[100dvh] bg-[#13151A] text-white flex items-center justify-center p-4 xs:p-3 sm:p-4 overflow-y-auto pt-[calc(var(--safe-top)+46px)] pb-[calc(var(--safe-bottom)+var(--nav-height))]">
      <div className="w-full max-w-[420px] xs:max-w-[320px] sm:max-w-[380px] bg-white/5 border border-white/10 rounded-2xl p-6 xs:p-4 sm:p-5">
        <div className="flex justify-center mb-4">
          <img src="/elix-logo.png" alt="Elix Star Live" className="w-24 h-24 object-contain" />
        </div>
        <h1 className="text-fluid-xl font-bold mb-4 xs:mb-3 sm:mb-4 text-center">Login</h1>

        <form onSubmit={onSubmit} className="space-y-4 xs:space-y-3 sm:space-y-4">
          <div className="space-y-2">
            <label className="text-fluid-sm text-white/70">Email or Username</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 xs:w-3.5 xs:h-3.5 text-white/50" />
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white/10 border border-white/10 rounded-xl pl-10 xs:pl-9 pr-3 py-3 xs:py-2.5 text-fluid-sm text-white outline-none focus:border-[#C9A96E]/50 placeholder:text-white/40"
                placeholder="username or you@email.com"
                autoComplete="email"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-fluid-sm text-white/70">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 xs:w-3.5 xs:h-3.5 text-white/50" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white/10 border border-white/10 rounded-xl pl-10 xs:pl-9 pr-10 xs:pr-9 py-3 xs:py-2.5 text-fluid-sm text-white outline-none focus:border-[#C9A96E]/50 placeholder:text-white/40"
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
              >
                {showPassword ? <EyeOff className="w-4 h-4 xs:w-3.5 xs:h-3.5" /> : <Eye className="w-4 h-4 xs:w-3.5 xs:h-3.5" />}
              </button>
            </div>
          </div>

          <label className="flex items-center gap-3 px-3 xs:px-2 py-3 xs:py-2.5 bg-white/5 border border-white/10 rounded-xl cursor-pointer hover:bg-white/10 transition">
            <div className="relative flex items-center">
              <input
                type="checkbox"
                checked={saveDetails}
                onChange={(e) => setSaveDetails(e.target.checked)}
                className="peer sr-only"
              />
              <div className={`w-5 h-5 xs:w-4 xs:h-4 rounded-md border transition-all flex items-center justify-center ${
                saveDetails 
                  ? 'bg-[#C9A96E] border-[#C9A96E]' 
                  : 'bg-white/10 border-white/30 group-hover:border-white/50'
              }`}>
                {saveDetails && <Check className="w-3.5 h-3.5 xs:w-3 xs:h-3 text-black stroke-[3]" />}
              </div>
            </div>
            <span className="text-fluid-sm text-white/70 select-none">Remember email</span>
          </label>

          {error && (
            <div className="text-fluid-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 xs:p-2.5">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-[#C9A96E] text-black font-bold rounded-xl py-3 xs:py-2.5 text-fluid-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        {/* Sign up CTA in place of guest access */}
        <div className="mt-4 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-white/40">New here?</span>
          </div>
          <button
            type="button"
            onClick={() => navigate('/register')}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-white/8 hover:bg-white/15 text-white text-sm font-semibold py-2.5 border border-white/15 transition"
          >
            <User className="w-4 h-4" />
            Sign up
          </button>
        </div>

        <div className="relative my-5 flex items-center">
          <div className="flex-1 border-t border-white/10" />
          <span className="px-3 text-white/40 text-xs">or</span>
          <div className="flex-1 border-t border-white/10" />
        </div>

        <button
          type="button"
          disabled={isSubmitting}
          onClick={async () => {
            if (isSubmitting) return;
            setError(null);
            setIsSubmitting(true);
            try {
              const { error: err } = await signInWithApple();
              if (isMounted.current && err) setError(err);
            } catch {
              if (isMounted.current) setError('Apple sign-in failed. Please try again.');
            } finally {
              if (isMounted.current) setIsSubmitting(false);
            }
          }}
          className="w-full flex items-center justify-center gap-2 bg-white text-black font-bold rounded-xl py-3 xs:py-2.5 text-fluid-sm hover:bg-white/90 transition"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
          Sign in with Apple
        </button>

        <div className="mt-4 xs:mt-3 text-center space-y-2">
          <Link to="/forgot-password" className="block text-fluid-sm text-white/60 hover:text-white hover:underline">
            Forgot your password?
          </Link>
          <Link to="/register" className="block text-fluid-sm text-white hover:underline">
            Don&apos;t have an account? Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}
