import React, { useState } from 'react';
import { nativeConfirm } from '../components/NativeDialog';
import { request } from '../lib/apiClient';
import { useT, LANGUAGE_SHORT } from '../lib/i18n';
import LanguagePickerSheet from '../components/LanguagePickerSheet';
import {
  ChevronRight,
  User,
  Lock,
  Bell,
  Shield,
  HelpCircle,
  BookOpen,
  LogOut,
  Moon,
  Globe,
  Heart,
  Video,
  Ban,
  Trash2,
  Radio,
  Wallet,
  Gift,
  Bookmark,
  LayoutDashboard,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { showToast } from '../lib/toast';
import { useAuthStore } from '../store/useAuthStore';
import { useSettingsStore } from '../store/useSettingsStore';
import SettingsOptionSheet from '../components/SettingsOptionSheet';
import { engagementFlags } from '../config/engagementFlags';

export default function Settings() {
  const navigate = useNavigate();
  const { t, lang } = useT();
  const [langOpen, setLangOpen] = useState(false);
  const signOut = useAuthStore((s) => s.signOut);
  const user = useAuthStore((s) => s.user);
  const liveNotifications = useSettingsStore((s) => s.liveNotifications);
  const setLiveNotifications = useSettingsStore((s) => s.setLiveNotifications);
  const muteAllSounds = useSettingsStore((s) => s.muteAllSounds);
  const setMuteAllSounds = useSettingsStore((s) => s.setMuteAllSounds);

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
          <span className="text-[13px] font-bold text-[#D4AF37]">{t('settings.title')}</span>
        </div>
      </div>

      {/* Logo + menu moved down so the void under the title is filled */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 pb-[3mm]">
        <div className="flex flex-col gap-0 max-w-full min-h-full" style={{ paddingTop: '5mm' }}>
          <div className="flex flex-col items-center pb-3">
            <img src="/elix-logo.png" alt="Elix Star Live" className="w-20 h-20 object-contain" />
          </div>
          <S t={t('settings.section.account')} />
          <R ic={<User size={14} />} t={t('settings.editProfile')} fn={() => navigate('/edit-profile')} />
          <R ic={<Lock size={14} />} t={t('settings.privacy')} fn={() => navigate('/settings/safety')} />
          <R ic={<Shield size={14} />} t={t('settings.security')} fn={() => navigate('/settings/security')} />
          <R ic={<Trash2 size={14} />} t={t('settings.deleteAccount')} fn={handleDeleteAccount} />
          <R ic={<Wallet size={14} />} t="Creator payout" fn={() => navigate('/settings/payout')} />
          {engagementFlags.engagementHubEnabled ? (
            <R ic={<Gift size={14} />} t="Engagement Hub" fn={() => navigate('/engagement')} />
          ) : null}
          {user?.isAdmin ? (
            <R ic={<LayoutDashboard size={14} />} t="Admin" fn={() => navigate('/admin')} />
          ) : null}

          <S t={t('settings.section.preferences')} />
          <R ic={<Bell size={14} />} t={t('settings.notifications')} fn={() => navigate('/settings/notifications')} />
          <R
            ic={<Radio size={14} />}
            t={t('settings.liveNotifications')}
            v={liveNotifications ? t('common.on') : t('common.off')}
            fn={() => setLiveNotifications(!liveNotifications)}
          />
          <R
            ic={muteAllSounds ? <VolumeX size={14} /> : <Volume2 size={14} />}
            t="Mute all sounds"
            v={muteAllSounds ? t('common.on') : t('common.off')}
            fn={() => {
              const next = !muteAllSounds;
              setMuteAllSounds(next);
              showToast(next ? 'All app sounds muted' : 'App sounds on');
            }}
          />
          <R ic={<Moon size={14} />} t={t('settings.darkMode')} v={t('common.on')} fn={() => showToast(t('toast.darkModeAlwaysOn'))} />
          <R ic={<Globe size={14} />} t={t('settings.language')} v={LANGUAGE_SHORT[lang]} fn={() => setLangOpen(true)} />

          <S t={t('settings.section.content')} />
          <R ic={<Video size={14} />} t={t('settings.videoQuality')} v={t('common.auto')} fn={() => showToast(t('toast.videoQualityAuto'))} />
          <R ic={<Heart size={14} />} t={t('settings.likedVideos')} fn={() => navigate('/profile?tab=liked')} />
          <R ic={<Bookmark size={14} />} t="Saved videos" fn={() => navigate('/saved')} />

          <S t={t('settings.section.safety')} />
          <R ic={<Ban size={14} />} t={t('settings.blockedAccounts')} fn={() => navigate('/settings/blocked')} />
          <R ic={<Shield size={14} />} t={t('settings.safetyCenter')} fn={() => navigate('/settings/safety')} />

          <S t={t('settings.section.support')} />
          <R ic={<BookOpen size={14} />} t="How the app works" fn={() => navigate('/how-it-works')} />
          <R ic={<HelpCircle size={14} />} t={t('settings.helpSupport')} fn={() => navigate('/support')} />

          <div className="grid grid-cols-3 gap-1 mt-auto pt-4 px-0.5">
            <button
              type="button"
              onClick={() => navigate('/terms')}
              className="text-[12px] text-white/60 py-2 rounded-md active:bg-white/5 text-center leading-tight"
            >
              {t('common.terms')}
            </button>
            <button
              type="button"
              onClick={() => navigate('/privacy')}
              className="text-[12px] text-white/60 py-2 rounded-md active:bg-white/5 text-center leading-tight"
            >
              {t('common.privacy')}
            </button>
            <button
              type="button"
              onClick={() => navigate('/guidelines')}
              className="text-[12px] text-white/60 py-2 rounded-md active:bg-white/5 text-center leading-tight"
            >
              {t('common.guidelines')}
            </button>
          </div>

          <div className="mt-3 pt-2.5 flex items-center justify-center gap-6 border-t border-white/[0.06]">
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 py-1.5 text-white/60 text-[13px] active:bg-white/5 px-2.5 rounded-md"
            >
              <LogOut size={15} /> {t('common.logout')}
            </button>
            <button
              type="button"
              onClick={handleDeleteAccount}
              className="flex items-center gap-1.5 py-1.5 text-white/60/80 text-[13px] active:bg-white/20/10 px-2.5 rounded-md"
            >
              <Trash2 size={15} /> {t('common.delete')}
            </button>
          </div>
          <p className="text-center text-[9px] text-white/20 pt-1.5 pb-0.5">v1.0.0</p>
        </div>
      </div>
      {langOpen && <LanguagePickerSheet onClose={() => setLangOpen(false)} />}
    </SettingsOptionSheet>
  );
}
