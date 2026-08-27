import { useId, useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
}

export function PasswordField({ label, value, onChange, autoComplete }: PasswordFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const id = useId();

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-fluid-sm text-white/70">
        {label}
      </label>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50 xs:h-3.5 xs:w-3.5" />
        <input
          id={id}
          type={revealed ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-xl border border-white/10 bg-white/10 py-3 pl-10 pr-11 text-fluid-sm text-white outline-none placeholder:text-white/40 focus:border-white/40 xs:py-2.5 xs:pl-9"
          placeholder="••••••••"
          autoComplete={autoComplete}
          required
        />
        <button
          type="button"
          onClick={() => setRevealed((current) => !current)}
          // The control is icon-only, so its purpose has to be announced.
          aria-label={revealed ? 'Hide password' : 'Show password'}
          aria-pressed={revealed}
          className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-white/50 transition hover:text-white"
        >
          {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
