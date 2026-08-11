import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, KeyRound, Shield, ShieldCheck } from "lucide-react";
import SettingsOptionSheet from "../../components/SettingsOptionSheet";
import { isPasswordResetEnabled } from "../../lib/authFeatures";
import { SETTINGS_HOME } from "../../lib/settingsNav";
import { request } from "../../lib/apiClient";
import { showToast } from "../../lib/toast";

export default function SecuritySettings() {
  const navigate = useNavigate();
  const showReset = isPasswordResetEnabled();
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorLoading, setTwoFactorLoading] = useState(true);

  const exit = useCallback(() => navigate(SETTINGS_HOME, { replace: true }), [navigate]);
  const goForgotPassword = useCallback(() => navigate("/forgot-password"), [navigate]);
  const goBlocked = useCallback(() => navigate("/settings/blocked"), [navigate]);

  const refreshTwoFactor = useCallback(async () => {
    setTwoFactorLoading(true);
    try {
      const { data, error } = await request<{ enabled?: boolean }>("/api/auth/2fa/status");
      if (error) {
        showToast(error.message || "Could not load 2FA status");
        setTwoFactorEnabled(false);
        return;
      }
      setTwoFactorEnabled(Boolean(data?.enabled));
    } finally {
      setTwoFactorLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshTwoFactor();
  }, [refreshTwoFactor]);

  const toggleTwoFactor = useCallback(async () => {
    if (twoFactorLoading) return;

    if (twoFactorEnabled) {
      const code = window.prompt("Enter your authenticator code to disable 2FA");
      if (code == null) return;
      const trimmed = code.trim();
      if (!trimmed) {
        showToast("Code required");
        return;
      }
      const { error } = await request("/api/auth/2fa/disable", {
        method: "POST",
        body: JSON.stringify({ code: trimmed }),
      });
      if (error) {
        showToast(error.message || "Could not disable 2FA");
        return;
      }
      setTwoFactorEnabled(false);
      showToast("Two-factor authentication disabled");
      return;
    }

    const { data: enroll, error: enrollError } = await request<{
      secret?: string;
      otpauth_url?: string;
    }>("/api/auth/2fa/enroll", { method: "POST", body: "{}" });
    if (enrollError || !enroll?.secret) {
      showToast(enrollError?.message || "Could not start 2FA enrollment");
      return;
    }

    window.prompt(
      "Add this secret in your authenticator app, then tap OK and enter a code.",
      enroll.secret,
    );
    const code = window.prompt("Enter the 6-digit code from your authenticator app");
    if (code == null) return;
    const trimmed = code.trim();
    if (!trimmed) {
      showToast("Code required — 2FA was not enabled");
      return;
    }
    const { error: verifyError } = await request("/api/auth/2fa/verify", {
      method: "POST",
      body: JSON.stringify({ code: trimmed }),
    });
    if (verifyError) {
      showToast(verifyError.message || "Invalid code — 2FA was not enabled");
      return;
    }
    setTwoFactorEnabled(true);
    showToast("Two-factor authentication enabled");
  }, [twoFactorEnabled, twoFactorLoading]);

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
          <R
            ic={<ShieldCheck size={14} />}
            t="Two-factor authentication"
            d={
              twoFactorLoading
                ? "Checking status…"
                : twoFactorEnabled
                  ? "Enabled — tap to disable."
                  : "Add an authenticator app code."
            }
            fn={() => {
              void toggleTwoFactor();
            }}
          />
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
