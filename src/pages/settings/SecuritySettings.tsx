import React, { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, KeyRound, Shield } from "lucide-react";
import SettingsOptionSheet from "../../components/SettingsOptionSheet";
import { isPasswordResetEnabled } from "../../lib/authFeatures";
import { SETTINGS_HOME } from "../../lib/settingsNav";

export default function SecuritySettings() {
  const navigate = useNavigate();
  const showReset = isPasswordResetEnabled();

  const exit = useCallback(() => navigate(SETTINGS_HOME, { replace: true }), [navigate]);
  const goForgotPassword = useCallback(() => navigate("/forgot-password"), [navigate]);
  const goBlocked = useCallback(() => navigate("/settings/blocked"), [navigate]);

  return (
    <SettingsOptionSheet onClose={exit} title="Security">
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 pt-2 pb-[3mm]">
        <div className="flex flex-col gap-0 max-w-full min-h-full">
          {showReset ? (
            <R
              ic={<KeyRound size={14} />}
              t="Password"
              d="Reset your password via email."
              fn={goForgotPassword}
            />
          ) : (
            <div className="px-2.5 py-2.5 text-xs text-[#8B9099] leading-relaxed">
              Password reset is unavailable until transactional email is configured on the server.
            </div>
          )}
          <R
            ic={<Shield size={14} />}
            t="Blocked accounts"
            d="Manage people you have blocked."
            fn={goBlocked}
          />
          <div className="px-2.5 pt-3 text-xs text-[#8B9099]">
            Two-factor authentication is not available yet.
          </div>
        </div>
      </div>
    </SettingsOptionSheet>
  );
}

function R({
  ic,
  t,
  d,
  fn,
}: {
  ic: React.ReactNode;
  t: string;
  d: string;
  fn: () => void;
}) {
  return (
    <button
      type="button"
      onClick={fn}
      className="w-full flex items-center gap-3 px-2.5 py-2.5 active:bg-white/5 text-left rounded-md"
    >
      <span
        className="royce-glow-disc shrink-0 [&_svg]:size-[18px]"
        style={{ width: "36px", height: "36px" }}
      >
        <span className="royce-icon-gold">{ic}</span>
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] leading-tight text-[#E6E9EE]">{t}</span>
        <span className="block text-xs text-[#8B9099] mt-0.5">{d}</span>
      </span>
      <ChevronRight size={16} className="text-white/30 shrink-0" />
    </button>
  );
}
