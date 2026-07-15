import React from 'react';
import { nativeConfirm } from '../components/NativeDialog';
import { request } from '../lib/apiClient';
import {
  User,
  Lock,
  Bell,
  Shield,
  HelpCircle,
  LogOut,
  Moon,
  Globe,
  Heart,
  Video,
  Ban,
  Trash2,
  FileText,
  BookOpen,
  Scale,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { showToast } from '../lib/toast';
import { useAuthStore } from '../store/useAuthStore';
import SettingsOptionSheet from '../components/SettingsOptionSheet';
import { SettingsListRow, SettingsSectionLabel } from '../components/SettingsListRow';

export default function Settings() {
  const navigate = useNavigate();
  const signOut = useAuthStore((s) => s.signOut);

  const handleLogout = async () => {
    try { await signOut(); } catch { /* best-effort */ }
    navigate('/login');
  };

  const handleDeleteAccount = async () => {
    const confirmed = await nativeConfirm(
      'Are you sure you want to delete your account?',
      'Delete Account'
    );
    if (!confirmed) return;

    try {
      const { error } = await request('/api/auth/delete', { method: 'POST' });

      if (!error) {
        await signOut();
        navigate('/login');
      } else {
        showToast('Failed to delete account.');
      }
    } catch {
      showToast('Something went wrong. Please try again.');
    }
  };

  return (
    <SettingsOptionSheet onClose={() => navigate(-1)}>
      <div className="flex-shrink-0 px-3 pb-2">
        <div className="flex flex-col items-center">
          <span className="text-[13px] font-bold text-[#D4AF37]">Settings</span>
          <img src="/elix-logo.png" alt="Elix Star Live" className="w-16 h-16 object-contain mt-1.5" />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 pb-[3mm]">
        <div className="flex flex-col gap-0 max-w-full min-h-full">
          <SettingsSectionLabel title="Account" />
          <SettingsListRow icon={<User size={14} />} title="Edit Profile" onClick={() => navigate('/edit-profile')} />
          <SettingsListRow icon={<Lock size={14} />} title="Privacy" onClick={() => navigate('/settings/safety')} />
          <SettingsListRow icon={<Shield size={14} />} title="Security" onClick={() => navigate('/settings/safety')} />

          <SettingsSectionLabel title="Preferences" />
          <SettingsListRow icon={<Bell size={14} />} title="Notifications" onClick={() => navigate('/settings/safety')} />
          <SettingsListRow icon={<Moon size={14} />} title="Dark Mode" value="On" onClick={() => showToast('Dark mode is always on')} />
          <SettingsListRow icon={<Globe size={14} />} title="Language" value="EN" onClick={() => showToast('More languages coming soon')} />

          <SettingsSectionLabel title="Content" />
          <SettingsListRow icon={<Video size={14} />} title="Video Quality" value="Auto" onClick={() => showToast('Video quality is set to auto')} />
          <SettingsListRow icon={<Heart size={14} />} title="Liked Videos" onClick={() => navigate('/profile?tab=liked')} />

          <SettingsSectionLabel title="Safety" />
          <SettingsListRow icon={<Ban size={14} />} title="Blocked Accounts" onClick={() => navigate('/settings/blocked')} />
          <SettingsListRow icon={<Shield size={14} />} title="Safety Center" onClick={() => navigate('/settings/safety')} />

          <SettingsSectionLabel title="Support" />
          <SettingsListRow icon={<HelpCircle size={14} />} title="Help & Support" onClick={() => navigate('/support')} />
          <SettingsListRow icon={<FileText size={14} />} title="Terms" onClick={() => navigate('/terms')} />
          <SettingsListRow icon={<Scale size={14} />} title="Privacy Policy" onClick={() => navigate('/privacy')} />
          <SettingsListRow icon={<BookOpen size={14} />} title="Guidelines" onClick={() => navigate('/guidelines')} />

          <div className="mt-2.5 pt-1.5 flex items-center justify-center gap-5 border-t border-white/[0.06]">
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1 py-1 text-white/60 text-[11px] active:bg-white/5 px-2 rounded-md"
            >
              <LogOut size={12} /> Log Out
            </button>
            <button
              type="button"
              onClick={handleDeleteAccount}
              className="flex items-center gap-1 py-1 text-white/60/80 text-[11px] active:bg-white/20/10 px-2 rounded-md"
            >
              <Trash2 size={12} /> Delete
            </button>
          </div>
          <p className="text-center text-[8px] text-white/20 pt-1 pb-0.5">v1.0.0</p>
        </div>
      </div>
    </SettingsOptionSheet>
  );
}
