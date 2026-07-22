import React from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, KeyRound, Shield } from "lucide-react";
import SettingsOptionSheet from "../../components/SettingsOptionSheet";
import { isPasswordResetEnabled } from "../../lib/authFeatures";

export default function SecuritySettings() {
  const navigate = useNavigate();
  const showReset = isPasswordResetEnabled();
  return (
    <SettingsOptionSheet onClose={() => navigate(-1)}>
      <div className="w-full h-full overflow-hidden bg-[#111111] flex flex-col">
        <header className="flex items-center justify-center mb-2 px-4 pt-2">
          <h1 className="font-bold text-lg text-[#D4AF37]">Security</h1>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 space-y-3">
          {showReset ? (
            <Row
              icon={<KeyRound size={18} />}
              title="Password"
              description="Reset your password via email."
              onClick={() => navigate("/forgot-password")}
            />
          ) : (
            <p className="text-xs text-white/40 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
              Password reset is unavailable until transactional email is
              configured on the server.
            </p>
          )}
          <Row
            icon={<Shield size={18} />}
            title="Blocked accounts"
            description="Manage people you have blocked."
            onClick={() => navigate("/settings/blocked")}
          />
          <p className="text-xs text-white/40 pt-2">
            Two-factor authentication is not available yet.
          </p>
        </div>
      </div>
    </SettingsOptionSheet>
  );
}

function Row({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left"
    >
      <span className="text-[#D4AF37]">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-white">{title}</span>
        <span className="block text-xs text-white/50 mt-0.5">{description}</span>
      </span>
      <ChevronRight size={16} className="text-white/30" />
    </button>
  );
}
