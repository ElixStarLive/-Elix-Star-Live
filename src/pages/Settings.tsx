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
  Radio,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { showToast } from '../lib/toast';
import { useAuthStore } from '../store/useAuthStore';
import { useSettingsStore } from '../store/useSettingsStore';
import SettingsOptionSheet from '../components/SettingsOptionSheet';

export default function Settings() {
  const navigate = useNavigate();
  const signOut = useAuthStore((s) => s.signOut);
  const liveNotifications = useSettingsStore((s) => s.liveNotifications);
  const setLiveNotifications = useSettingsStore((s) => s.setLiveNotifications);

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
      className="w-full flex items-center gap-3 px-2.5 py-2.5 active:bg-white/5 text-left rounded-md"
    >
      {ic && (
        <span
          className="royce-glow-disc shrink-0 [&_svg]:size-[18px]"
          style={{ width: '36px', height: '36px' }}
        >
          <span className="royce-icon-gold">{ic}</span>
        </span>
      )}
      <span className="flex-1 text-[15px] leading-tight text-white/85">{t}</span>
      {v && <span className="text-[12px] text-white/45 tabular-nums">{v}</span>}
      <ChevronRight size={16} className="text-white/30 shrink-0" />
    </button>
  );

  const S = ({ t }: { t: string }) => (
    <p className="text-[10px] text-white/30 uppercase tracking-[0.12em] mt-3.5 mb-1 px-1 leading-none">{t}</p>
  );

  return (
    <SettingsOptionSheet onClose={() => navigate(-1)}>
      <div className="flex-shrink-0 px-3 pb-1">
        <div className="flex flex-col items-center">
          <span className="text-[13px] font-bold text-[#D4AF37]">Settings</span>
        </div>
      </div>

      {/* Logo + menu moved down so the void under the title is filled */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 pb-[3mm]">
        <div className="flex flex-col gap-0 max-w-full min-h-full" style={{ paddingTop: '5mm' }}>
          <div className="flex flex-col items-center pb-3">
            <img src="/elix-logo.png" alt="Elix Star Live" className="w-20 h-20 object-contain" />
          </div>
          <S t="Account" />
          <R ic={<User size={14} />} t="Edit Profile" fn={() => navigate('/edit-profile')} />
          <R ic={<Lock size={14} />} t="Privacy" fn={() => navigate('/settings/safety')} />
          <R ic={<Shield size={14} />} t="Security" fn={() => navigate('/settings/safety')} />
          <R ic={<Trash2 size={14} />} t="Delete Account" fn={handleDeleteAccount} />

          <S t="Preferences" />
          <R ic={<Bell size={14} />} t="Notifications" fn={() => navigate('/settings/safety')} />
          <R
            ic={<Radio size={14} />}
            t="Live notifications"
            v={liveNotifications ? 'On' : 'Off'}
            fn={() => setLiveNotifications(!liveNotifications)}
          />
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

          <div className="grid grid-cols-3 gap-1 mt-auto pt-4 px-0.5">
            <button
              type="button"
              onClick={() => navigate('/terms')}
              className="text-[12px] text-white/60 py-2 rounded-md active:bg-white/5 text-center leading-tight"
            >
              Terms
            </button>
            <button
              type="button"
              onClick={() => navigate('/privacy')}
              className="text-[12px] text-white/60 py-2 rounded-md active:bg-white/5 text-center leading-tight"
            >
              Privacy
            </button>
            <button
              type="button"
              onClick={() => navigate('/guidelines')}
              className="text-[12px] text-white/60 py-2 rounded-md active:bg-white/5 text-center leading-tight"
            >
              Guidelines
            </button>
          </div>

          <div className="mt-3 pt-2.5 flex items-center justify-center gap-6 border-t border-white/[0.06]">
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 py-1.5 text-white/60 text-[13px] active:bg-white/5 px-2.5 rounded-md"
            >
              <LogOut size={15} /> Log Out
            </button>
            <button
              type="button"
              onClick={handleDeleteAccount}
              className="flex items-center gap-1.5 py-1.5 text-white/60/80 text-[13px] active:bg-white/20/10 px-2.5 rounded-md"
            >
              <Trash2 size={15} /> Delete
            </button>
          </div>
          <p className="text-center text-[9px] text-white/20 pt-1.5 pb-0.5">v1.0.0</p>
        </div>
      </div>
    </SettingsOptionSheet>
  );
}
