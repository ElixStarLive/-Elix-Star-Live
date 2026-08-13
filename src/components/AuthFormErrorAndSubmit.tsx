/**
 * Shared auth form error banner + primary submit button
 * (ForgotPassword / ResetPassword).
 */

import React from 'react';

export function AuthFormErrorAndSubmit({
  error,
  isSubmitting,
  submittingLabel,
  idleLabel,
}: {
  error: string | null;
  isSubmitting: boolean;
  submittingLabel: string;
  idleLabel: string;
}) {
  return (
    <>
      {error && (
        <div className="text-sm text-rose-300 bg-white/20/10 border border-rose-500/20 rounded-xl p-3">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-[#E6E9EE] text-white font-bold rounded-xl py-3 text-sm disabled:opacity-60"
      >
        {isSubmitting ? submittingLabel : idleLabel}
      </button>
    </>
  );
}
