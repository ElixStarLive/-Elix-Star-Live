import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Lock, Mail, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { AvatarRing } from '../components/AvatarRing';

export default function CreatorLoginDetails() {
  const navigate = useNavigate();
  const { user, signInWithPassword, signUpWithPassword, signOut, resendSignupConfirmation, authMode } = useAuthStore();
  const [rememberMe, setRememberMe] = useState(true);
  const [saveDetails, setSaveDetails] = useState(false);
  const [savedIdentifier, setSavedIdentifier] = useState('');
  const [savedUsername, setSavedUsername] = useState('');

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  // Force signin mode if users shouldn't create accounts here
  useEffect(() => {
    setMode('signin');
  }, []);

  const [email, setEmail] = useState(() => {
    // If user is logged in, default to their email
    return window.localStorage.getItem('creator_saved_identifier') || '';
  });

  // Sync email state with user email on mount if logged in and no local email set
  useEffect(() => {
    if (user && !email) {
      // Don't auto-set it, let user type freely. Or set it once only.
      // Actually if we want to allow typing "another" email, we shouldn't force reset it
      // unless it is completely empty.
      setEmail(user.email);
    }
  }, [user]); // We removed 'email' dependency so it doesn't loop or reset when user clears it manually
  const [username, setUsername] = useState(() => window.localStorage.getItem('creator_saved_username') || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showResend, setShowResend] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  const [savedAccounts, setSavedAccounts] = useState<Array<{
    identifier: string;
    username: string;
    avatar?: string;
  }>>([]);

  useEffect(() => {
    // ... existing effect ...
  }, []);

  const saveCurrentAccount = (nextEmail: string, nextUsername: string, nextAvatar?: string) => {
    // 1. Enable save preference
    window.localStorage.setItem('creator_save_login_details', 'true');
    setSaveDetails(true);

    // 2. Add to saved accounts list (avoid duplicates)
    setSavedAccounts(prev => {
      // Remove existing entry for this email if present
      const filtered = prev.filter(acc => acc.identifier !== nextEmail);
      // Add new entry to the top
      const newAccounts = [{ identifier: nextEmail, username: nextUsername, avatar: nextAvatar }, ...filtered];
      // Limit to 5 accounts
      const limited = newAccounts.slice(0, 5);
      
      window.localStorage.setItem('creator_saved_accounts', JSON.stringify(limited));
      
      // Also update legacy single fields for backward compat
      window.localStorage.setItem('creator_saved_identifier', nextEmail);
      window.localStorage.setItem('creator_saved_username', nextUsername);
      
      return limited;
    });
  };
  const removeAccount = (identifierToRemove: string) => {
    setSavedAccounts(prev => {
      const newAccounts = prev.filter(acc => acc.identifier !== identifierToRemove);
      window.localStorage.setItem('creator_saved_accounts', JSON.stringify(newAccounts));
      
      // If we removed the "legacy" one, clear legacy fields
      if (window.localStorage.getItem('creator_saved_identifier') === identifierToRemove) {
         window.localStorage.removeItem('creator_saved_identifier');
         window.localStorage.removeItem('creator_saved_username');
      }
      return newAccounts;
    });
  };


  const persistSavedPassword = (_nextPassword: string) => {
    // SECURITY: Never persist passwords to localStorage
    // Clean up any legacy stored password
    window.localStorage.removeItem('creator_saved_password');
    window.localStorage.removeItem('creator_save_password');
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setShowResend(false);
    setIsSubmitting(true);

    const trimmedEmail = email.trim();
    const trimmedUsername = username.trim();

    try {
      if (mode === 'signup') {
        if (password.length < 6) {
          setError('Parola trebuie să aibă minim 6 caractere.');
          return;
        }
        if (password !== confirmPassword) {
          setError('Parolele nu coincid.');
          return;
        }
        const res = await signUpWithPassword(trimmedEmail, password, trimmedUsername || undefined);
        if (res.error) {
          setError(res.error);
          return;
        }
        if (res.needsEmailConfirmation) {
          setInfo('Check your inbox and confirm your email to finish creating your account.');
          setShowResend(true);
          saveCurrentAccount(trimmedEmail, trimmedUsername || trimmedEmail.split('@')[0]);
          return;
        }
        saveCurrentAccount(trimmedEmail, trimmedUsername || trimmedEmail.split('@')[0]);
        persistSavedPassword(password);
        navigate('/profile', { replace: true });
        return;
      }

      const res = await signInWithPassword(trimmedEmail, password);
      if (res.error) {
        const msg = res.error;
        if (msg.toLowerCase().includes('email not confirmed')) {
          setError('Email neconfirmat. Verifică inbox-ul și confirmă contul, apoi încearcă din nou.');
          setShowResend(true);
          return;
        }
        setError(msg);
        if (/confirm|verification|verify|email/i.test(msg)) {
          setShowResend(true);
        }
        return;
      }
      saveCurrentAccount(trimmedEmail, trimmedUsername || savedUsername || trimmedEmail.split('@')[0]);
      persistSavedPassword(password);
      navigate('/profile', { replace: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  const onResend = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Introdu email-ul mai întâi.');
      return;
    }
    setError(null);
    setInfo(null);
    setIsResending(true);
    try {
      const res = await resendSignupConfirmation(trimmedEmail);
      if (res.error) {
        setError(res.error);
        return;
      }
      setInfo('Email de confirmare trimis din nou. Verifică Inbox și Spam.');
    } finally {
      setIsResending(false);
    }
  };
  const switchAccount = async (targetEmail: string, targetPassword?: string) => {
    setIsSwitching(true);
    try {
      // 1. Sign out current user
      if (user) {
        await signOut();
      }
      
      // 2. Auto sign in if password is known (or just prefill)
      // Prefill the form and let the user sign in manually.
      
      // Update local state to reflect selected account
      setEmail(targetEmail);
      // Find the account to get username
      const acc = savedAccounts.find(a => a.identifier === targetEmail);
      if (acc) setUsername(acc.username);
      
      // If we have a saved password for this specific account (in a real app this needs secure storage)
      // Here we only have one "creator_saved_password" slot in this simple implementation,
      // but for multiple accounts we'd need a map. 
      // For now, let's just prefill email.
      
      if (targetPassword) {
         setPassword(targetPassword);
         // If we really want to auto-login:
         // await signInWithPassword(targetEmail, targetPassword);
      } else {
         setPassword('');
      }

    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <div className="bg-[#13151A] text-white flex justify-center px-2">
      <div className="w-full max-w-[480px] rounded-3xl overflow-hidden bg-[#13151A] flex flex-col overflow-y-auto p-4">
        {/* ... header ... */}
        <header className="flex items-center justify-between mb-6">
          <button onClick={() => navigate(-1)}><img src="/Icons/Gold power buton.png" alt="Back" className="w-5 h-5" /></button>
          <h1 className="font-bold text-lg">Creator Login Details</h1>
          <div className="w-6" />
        </header>

        {/* Saved Accounts Switcher (Visible always if there are saved accounts) */}
        {savedAccounts.length > 0 && (
          <div className="mb-6">
            <h3 className="text-[9px] text-white/40 uppercase tracking-widest font-bold mb-2 pl-1">Switch Accounts</h3>
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-white/10 px-1">
              {savedAccounts.map((acc) => {
                const isActive = user?.email === acc.identifier;
                return (
                  <div 
                    key={acc.identifier}
                    onClick={() => !isActive && switchAccount(acc.identifier)}
                    className={`flex-shrink-0 w-14 flex flex-col items-center gap-1.5 group cursor-pointer ${isActive ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}
                  >
                    <div className={`relative ${isActive ? '' : ''} transition-all`}>
                      <AvatarRing src={acc.avatar || `https://ui-avatars.com/api/?name=${acc.username}&background=random`} alt={acc.username} size={40} />
                      {isActive && (
                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#C9A96E] rounded-full border-[1.5px] border-black flex items-center justify-center">
                          <div className="w-1 h-1 bg-[#13151A] rounded-full" />
                        </div>
                      )}
                      {!isActive && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeAccount(acc.identifier);
                          }}
                          className="absolute -top-1 -right-1 w-4 h-4 bg-red-500/80 rounded-full text-white text-[8px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <div className="text-center w-full">
                      <p className={`text-[9px] font-medium truncate w-full ${isActive ? 'text-white' : 'text-white'}`}>
                        {acc.username}
                      </p>
                    </div>
                  </div>
                );
              })}
              
              {/* Add Account Button */}
              <div 
                onClick={async () => {
                   if (user) await signOut();
                   setEmail('');
                   setPassword('');
                   // Focus email input or scroll to form
                }}
                className="flex-shrink-0 w-14 flex flex-col items-center gap-1.5 group cursor-pointer opacity-60 hover:opacity-100"
              >
                <div className="w-10 h-10 rounded-full bg-[#13151A] border border-[#C9A96E]/40 flex items-center justify-center group-hover:bg-[#C9A96E]/10 transition-colors relative">
                  <span className="text-lg text-white/50 font-light relative z-[2]">+</span>
                  <img src="/Icons/Music Icon.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[3] scale-125 translate-y-0.5" />
                </div>
                <div className="text-center">
                  <p className="text-[9px] font-medium text-white/50">Add</p>
                </div>
              </div>
            </div>
          </div>
        )}


        {!user && (
          // Hidden mode switcher - forcing "Sign in" only
          <div className="mb-4 hidden">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setError(null);
                setInfo(null);
                setShowResend(false);
              }}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition ${
                mode === 'signin'
                  ? 'bg-[#C9A96E] text-black border-[#C9A96E]'
                  : 'bg-transparent5 text-white border-white/10 hover:bg-transparent10'
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setError(null);
                setInfo(null);
                setShowResend(false);
              }}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition ${
                mode === 'signup'
                  ? 'bg-[#C9A96E] text-black border-[#C9A96E]'
                  : 'bg-transparent5 text-white border-white/10 hover:bg-transparent10'
              }`}
            >
              Create account
            </button>
          </div>
        )}

        {!user && (
          <form onSubmit={onSubmit} className="space-y-4 mb-6 max-w-[90%] mx-auto">
            <div className="space-y-1.5">
              <label className="text-[10px] text-white/50 font-medium uppercase tracking-wider pl-1">Email</label>
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-[#C9A96E]/20 to-[#C9A96E]/5 rounded-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-300" />
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 group-focus-within:text-white transition-colors" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#13151A] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-white/40/20 outline-none focus:border-[#C9A96E]/50 transition-all"
                  placeholder="name@example.com"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] text-white/50 font-medium uppercase tracking-wider pl-1">Password</label>
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-[#C9A96E]/20 to-[#C9A96E]/5 rounded-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-300" />
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 group-focus-within:text-white transition-colors" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    // Ensure we are in signin mode if user types here
                    if (mode !== 'signin') setMode('signin');
                  }}
                  className="w-full bg-[#13151A] border border-white/10 rounded-xl pl-10 pr-10 py-3 text-sm text-white placeholder-white/40/20 outline-none focus:border-[#C9A96E]/50 transition-all"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Save login details checkbox */}
            <div className="flex items-center gap-2">
              <div className="relative flex items-center">
                <input
                  type="checkbox"
                  id="save-login"
                  checked={saveDetails}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setSaveDetails(next);
                    window.localStorage.setItem('creator_save_login_details', next ? 'true' : 'false');
                  }}
                  className="peer h-4 w-4 rounded-full border border-white/30 bg-transparent appearance-none checked:border-[#C9A96E] checked:bg-[#C9A96E] transition-all cursor-pointer"
                />
                <svg className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 text-black pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <label htmlFor="save-login" className="text-xs text-white/60 cursor-pointer select-none">Save login info</label>
            </div>

            {error && <div className="text-xs text-rose-300">{error}</div>}
            {info && <div className="text-xs text-white/70">{info}</div>}

            {showResend && (
              <button
                type="button"
                disabled={isResending}
                className="w-full bg-transparent10 border border-white/10 rounded-xl py-2 text-sm disabled:opacity-60"
                onClick={onResend}
              >
                {isResending ? 'Sending...' : 'Resend confirmation email'}
              </button>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-[#C9A96E] text-black font-bold rounded-xl py-3 text-sm disabled:opacity-60 shadow-[0_0_15px_rgba(230,179,106,0.3)] hover:shadow-[0_0_20px_rgba(230,179,106,0.5)] transition-all active:scale-[0.98]"
            >
              {isSubmitting ? 'Signing in...' : 'Log in'}
            </button>
          </form>
        )}

        {user && (
          <div className="space-y-4 mb-6 max-w-[90%] mx-auto">
            <div className="space-y-1.5">
              <label className="text-[10px] text-white/50 font-medium uppercase tracking-wider pl-1">Email</label>
              <div className="relative group">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 group-focus-within:text-white transition-colors" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#13151A] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-white/40/20 outline-none focus:border-[#C9A96E]/50 transition-all"
                  placeholder="name@example.com"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] text-white/50 font-medium uppercase tracking-wider pl-1">Password</label>
              <div className="relative group">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 group-focus-within:text-white transition-colors" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#13151A] border border-white/10 rounded-xl pl-10 pr-10 py-3 text-sm text-white placeholder-white/40/20 outline-none focus:border-[#C9A96E]/50 transition-all"
                  placeholder="Enter password to save"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Save login details checkbox */}
            <div className="flex items-center gap-2">
              <div className="relative flex items-center">
                <input
                  type="checkbox"
                  id="save-login-user"
                  checked={saveDetails}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setSaveDetails(next);
                    window.localStorage.setItem('creator_save_login_details', next ? 'true' : 'false');
                    if (next) {
                        const emailToSave = email;
                        // Use default username if saving another email
                        const usernameToSave = emailToSave === user.email ? user.username : emailToSave.split('@')[0];
                        
                        saveCurrentAccount(emailToSave, usernameToSave, emailToSave === user.email ? user.avatar : undefined);
                        if (password) {
                            window.localStorage.removeItem('creator_saved_password');
                        }
                    } else {
                        // Clear
                        window.localStorage.removeItem('creator_saved_identifier');
                        window.localStorage.removeItem('creator_saved_username');
                        window.localStorage.removeItem('creator_saved_password');
                    }
                  }}
                  className="peer h-4 w-4 rounded-full border border-white/30 bg-transparent appearance-none checked:border-[#C9A96E] checked:bg-[#C9A96E] transition-all cursor-pointer"
                />
                <svg className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 text-black pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <label htmlFor="save-login-user" className="text-xs text-white/60 cursor-pointer select-none">Save login info</label>
            </div>

            <button
              className="w-full bg-transparent10 border border-white/10 rounded-xl py-3 text-sm font-semibold hover:bg-white/5 transition-colors"
              onClick={async () => {
                await signOut();
                setPassword('');
                setConfirmPassword('');
                setMode('signin');
                navigate('/creator/login-details', { replace: true });
              }}
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
