import React from 'react';
import { nativeConfirm } from '../components/NativeDialog';
import { request } from '../lib/apiClient';
import {
  ChevronRight,
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
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { showToast } from '../lib/toast';
import { useAuthStore } from '../store/useAuthStore';
import SettingsOptionSheet from '../components/SettingsOptionSheet';

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

  const R = ({ ic, t, v, fn }: { ic?: React.ReactNode; t: string; v?: string; fn: () => void }) => (
    <button
      type="button"
      onClick={fn}
      className="w-full flex items-center gap-2.5 px-2 py-2 active:bg-white/5 text-left rounded-md"
    >
      {ic && (
        <span className="royce-glow-disc w-7 h-7 shrink-0 [&_svg]:size-[14px]">
          <span className="royce-icon-gold">{ic}</span>
        </span>
      )}
      <span className="flex-1 text-[12px] leading-tight text-white/85">{t}</span>
      {v && <span className="text-[10px] text-white/45 tabular-nums">{v}</span>}
      <ChevronRight size={13} className="text-white/30 shrink-0" />
    </button>
  );

  const S = ({ t }: { t: string }) => (
    <p className="text-[8px] text-white/30 uppercase tracking-[0.12em] mt-2.5 mb-0.5 px-1 leading-none">{t}</p>
  );

  return (
    <SettingsOptionSheet onClose={() => navigate(-1)}>
      <div className="flex-shrink-0 px-3 pb-2">
        <div className="flex flex-col items-center">
          <span className="text-[13px] font-bold text-[#D4AF37]">Settings</span>
          <img src="/elix-logo.png" alt="Elix Star Live" className="w-16 h-16 object-contain mt-1.5" />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3">
        <div className="flex flex-col gap-0 max-w-full min-h-full">
          <S t="Account" />
          <R ic={<User size={14} />} t="Edit Profile" fn={() => navigate('/edit-profile')} />
          <R ic={<Lock size={14} />} t="Privacy" fn={() => navigate('/settings/safety')} />
          <R ic={<Shield size={14} />} t="Security" fn={() => navigate('/settings/safety')} />

          <S t="Preferences" />
          <R ic={<Bell size={14} />} t="Notifications" fn={() => navigate('/settings/safety')} />
          <R ic={<Moon size={14} />} t="Dark Mode" v="On" fn={() => showToast('Dark mode is always on')} />
          <R ic={<Globe size={14} />} t="Language" v="EN" fn={() => showToast('More languages coming soon')} />

          <S t="Content" />
          <R ic={<Video size={14} />} t="Video Quality" v="Auto" fn={() => showToast('Video quality is set to auto')} />
          <R ic={<Heart size={14} />} t="Liked Videos" fn={() => navigate('/profile?tab=liked')} />

          <S t="Safety" />
          <R ic={<Ban size={14} />} t="Blocked Accounts" fn={() => navigate('/settings/blocked')} />
          <R ic={<Shield size={14} />} t="Safety Center" fn={() => navigate('/settings/safety')} />

          <S t="Support" />
          <R ic={<HelpCircle size={14} />} t="Help & Support" fn={() => navigate('/support')} />

          <div className="grid grid-cols-3 gap-1 mt-auto pt-3 px-0.5">
            <button
              type="button"
              onClick={() => navigate('/terms')}
              className="text-[10px] text-white/60 py-1.5 rounded-md active:bg-white/5 text-center leading-tight"
            >
              Terms
            </button>
            <button
              type="button"
              onClick={() => navigate('/privacy')}
              className="text-[10px] text-white/60 py-1.5 rounded-md active:bg-white/5 text-center leading-tight"
            >
              Privacy
            </button>
            <button
              type="button"
              onClick={() => navigate('/guidelines')}
              className="text-[10px] text-white/60 py-1.5 rounded-md active:bg-white/5 text-center leading-tight"
            >
              Guidelines
            </button>
          </div>

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
