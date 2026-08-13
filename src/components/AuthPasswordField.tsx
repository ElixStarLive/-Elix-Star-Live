/**
 * Shared Login/Register password field (label + input + eye toggle).
 */

import React from 'react';
import { Eye, EyeOff } from 'lucide-react';

export function AuthPasswordField({
  label,
  value,
  onChange,
  showPassword,
  onToggleShow,
  autoComplete,
  placeholder = 'Password',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  showPassword: boolean;
  onToggleShow: () => void;
  autoComplete: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <label className="text-fluid-sm text-white/70">{label}</label>
      <div className="relative">
        <input
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-white/10 border border-white/10 rounded-xl pl-3 pr-10 xs:pr-9 py-3 xs:py-2.5 text-fluid-sm text-white outline-none focus:border-[#D8D9DD]/50 placeholder:text-white/40"
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
        >
          {showPassword ? (
            <EyeOff className="elix-auth-icon w-4 h-4 xs:w-3.5 xs:h-3.5" />
          ) : (
            <Eye className="elix-auth-icon w-4 h-4 xs:w-3.5 xs:h-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
