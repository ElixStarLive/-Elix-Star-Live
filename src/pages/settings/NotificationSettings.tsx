import React from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import SettingsOptionSheet from "../../components/SettingsOptionSheet";
import { useSettingsStore } from "../../store/useSettingsStore";

export default function NotificationSettings() {
  const navigate = useNavigate();
  const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled);
  const liveNotifications = useSettingsStore((s) => s.liveNotifications);
  const setNotificationsEnabled = useSettingsStore(
    (s) => s.setNotificationsEnabled,
  );
  const setLiveNotifications = useSettingsStore((s) => s.setLiveNotifications);

  return (
    <SettingsOptionSheet onClose={() => navigate(-1)}>
      <div className="w-full h-full overflow-hidden bg-[#111111] flex flex-col">
        <header className="flex items-center justify-center mb-2 px-4 pt-2">
          <h1 className="font-bold text-lg text-[#D4AF37]">Notifications</h1>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 space-y-3">
          <ToggleRow
            title="App notifications"
            description="General in-app notification preference (saved on this device)."
            value={notificationsEnabled}
            onToggle={() => setNotificationsEnabled(!notificationsEnabled)}
          />
          <ToggleRow
            title="Live notifications"
            description="Alerts when creators you follow go live."
            value={liveNotifications}
            onToggle={() => setLiveNotifications(!liveNotifications)}
          />
          <p className="text-xs text-white/40 flex items-start gap-2 pt-2">
            <Bell size={14} className="mt-0.5 flex-shrink-0" />
            Preferences are stored locally on this device. Push delivery also
            requires device permission.
          </p>
        </div>
      </div>
    </SettingsOptionSheet>
  );
}

function ToggleRow({
  title,
  description,
  value,
  onToggle,
}: {
  title: string;
  description: string;
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left"
    >
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-white">{title}</span>
        <span className="block text-xs text-white/50 mt-0.5">{description}</span>
      </span>
      <span
        className={`text-xs font-bold px-2 py-1 rounded-full ${
          value ? "bg-[#C9A227] text-black" : "bg-white/10 text-white/50"
        }`}
      >
        {value ? "On" : "Off"}
      </span>
    </button>
  );
}
