import React, { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import SettingsOptionSheet from "../../components/SettingsOptionSheet";
import { useSettingsStore } from "../../store/useSettingsStore";
import { SETTINGS_HOME } from "../../lib/settingsNav";

export default function NotificationSettings() {
  const navigate = useNavigate();
  const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled);
  const liveNotifications = useSettingsStore((s) => s.liveNotifications);
  const setNotificationsEnabled = useSettingsStore(
    (s) => s.setNotificationsEnabled,
  );
  const setLiveNotifications = useSettingsStore((s) => s.setLiveNotifications);

  const exit = useCallback(() => navigate(SETTINGS_HOME, { replace: true }), [navigate]);

  return (
    <SettingsOptionSheet onClose={exit} title="Notifications">
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 pt-2 pb-[3mm]">
        <div className="flex flex-col gap-0 max-w-full min-h-full">
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
          <div className="px-2.5 pt-3 text-xs text-[#8B9099] flex items-start gap-2 leading-relaxed">
            <Bell size={14} className="mt-0.5 flex-shrink-0 royce-icon-gold" />
            Preferences are stored locally on this device. Push delivery also requires device
            permission.
          </div>
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
      className="w-full flex items-center gap-3 px-2.5 py-2.5 text-left active:bg-white/5 rounded-md"
    >
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] leading-tight text-[#E6E9EE]">{title}</span>
        <span className="block text-xs text-[#8B9099] mt-0.5">{description}</span>
      </span>
      <span
        className={`text-xs font-bold px-2 py-1 rounded-full shrink-0 ${
          value ? "bg-[#E6E9EE] text-white elix-accent" : "bg-white/10 text-[#8B9099]"
        }`}
      >
        {value ? "On" : "Off"}
      </span>
    </button>
  );
}
