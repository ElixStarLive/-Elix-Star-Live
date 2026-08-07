import React, { useCallback, useState } from 'react';
import { nativeConfirm } from '../components/NativeDialog';
import { authDeleteAccount } from '../features/auth/authSession';
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
import { SETTINGS_EXIT_TO, ENGAGEMENT_HOME } from '../lib/settingsNav';

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

  const exitSettings = useCallback(() => {
    navigate(SETTINGS_EXIT_TO, { replace: true });
  }, [navigate]);

  const goEditProfile = useCallback(() => navigate('/edit-profile'), [navigate]);
  const goSafety = useCallback(() => navigate('/settings/safety'), [navigate]);
  const goSecurity = useCallback(() => navigate('/settings/security'), [navigate]);
  const goPayout = useCallback(() => navigate('/settings/payout'), [navigate]);
  const goEngagement = useCallback(() => navigate(ENGAGEMENT_HOME), [navigate]);
  const goAdmin = useCallback(() => navigate('/admin'), [navigate]);
  const goNotifications = useCallback(() => navigate('/settings/notifications'), [navigate]);
  const goLikedVideos = useCallback(() => navigate('/profile?tab=liked'), [navigate]);
  const goSaved = useCallback(() => navigate('/saved'), [navigate]);
  const goBlocked = useCallback(() => navigate('/settings/blocked'), [navigate]);
  const goHowItWorks = useCallback(() => navigate('/how-it-works'), [navigate]);
  const goSupport = useCallback(() => navigate('/support'), [navigate]);
  const goTerms = useCallback(() => navigate('/terms'), [navigate]);
  const goPrivacy = useCallback(() => navigate('/privacy'), [navigate]);
  const goGuidelines = useCallback(() => navigate('/guidelines'), [navigate]);
  const goLogin = useCallback(() => navigate('/login'), [navigate]);

  const handleLogout = async () => {
    try { await signOut(); } catch { /* best-effort */ }
    goLogin();
  };

  const handleDeleteAccount = async () => {
    const confirmed = await nativeConfirm(
      'Are you sure you want to delete your account?',
      'Delete Account'
    );
    if (!confirmed) return;

    try {
      const result = await authDeleteAccount();

      if (result.ok) {
        await signOut();
        goLogin();
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
      <span className="flex-1 min-w-0">
        <span className="elix-silver-red-text text-[15px] leading-tight">{t}</span>
      </span>
      {v ? (
        <span className="elix-silver-red-text text-[12px] tabular-nums shrink-0">{v}</span>
      ) : null}
      <ChevronRight size={16} className="text-white/30 shrink-0" />
    </button>
  );

  const S = ({ t }: { t: string }) => (
    <p className="mt-3.5 mb-1 px-1 leading-none">
      <span className="text-[10px] uppercase tracking-[0.12em] text-[#8B9099]">{t}</span>
    </p>
  );

  const G = ({ children }: { children: React.ReactNode }) => (
    <div className="elix-surface rounded-xl overflow-hidden">{children}</div>
  );

  return (
    <SettingsOptionSheet onClose={exitSettings} title={t('settings.title')}>
      {/* Logo + menu — title lives in sheet top bar with close (no gap) */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 pt-2 pb-[3mm]">
        <div className="flex flex-col gap-0 max-w-full min-h-full">
          <div className="flex flex-col items-center pb-3">
            <img src="/elix-logo.png" alt="Elix Star Live" className="w-20 h-20 object-contain" />
          </div>
          <S t={t('settings.section.account')} />
          <G>
            <R ic={<User size={14} />} t={t('settings.editProfile')} fn={goEditProfile} />
            <R ic={<Lock size={14} />} t={t('settings.privacy')} fn={goSafety} />
            <R ic={<Shield size={14} />} t={t('settings.security')} fn={goSecurity} />
            <R ic={<Trash2 size={14} />} t={t('settings.deleteAccount')} fn={handleDeleteAccount} />
            <R ic={<Wallet size={14} />} t="Creator payout" fn={goPayout} />
            {engagementFlags.engagementHubEnabled ? (
              <R ic={<Gift size={14} />} t="Engagement Hub" fn={goEngagement} />
            ) : null}
            {user?.isAdmin ? (
              <R ic={<LayoutDashboard size={14} />} t="Admin" fn={goAdmin} />
            ) : null}
          </G>

          <S t={t('settings.section.preferences')} />
          <G>
            <R ic={<Bell size={14} />} t={t('settings.notifications')} fn={goNotifications} />
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
          </G>

          <S t={t('settings.section.content')} />
          <G>
            <R ic={<Video size={14} />} t={t('settings.videoQuality')} v={t('common.auto')} fn={() => showToast(t('toast.videoQualityAuto'))} />
            <R ic={<Heart size={14} />} t={t('settings.likedVideos')} fn={goLikedVideos} />
            <R ic={<Bookmark size={14} />} t="Saved videos" fn={goSaved} />
          </G>

          <S t={t('settings.section.safety')} />
          <G>
            <R ic={<Ban size={14} />} t={t('settings.blockedAccounts')} fn={goBlocked} />
            <R ic={<Shield size={14} />} t={t('settings.safetyCenter')} fn={goSafety} />
          </G>

          <S t={t('settings.section.support')} />
          <G>
            <R ic={<BookOpen size={14} />} t="How the app works" fn={goHowItWorks} />
            <R ic={<HelpCircle size={14} />} t={t('settings.helpSupport')} fn={goSupport} />
          </G>

          <div className="grid grid-cols-3 gap-1 mt-auto pt-4 px-0.5">
            <button
              type="button"
              onClick={goTerms}
              className="text-[12px] py-2 rounded-md active:bg-white/5 text-center leading-tight"
            >
              <span className="elix-silver-red-text">{t('common.terms')}</span>
            </button>
            <button
              type="button"
              onClick={goPrivacy}
              className="text-[12px] py-2 rounded-md active:bg-white/5 text-center leading-tight"
            >
              <span className="elix-silver-red-text">{t('common.privacy')}</span>
            </button>
            <button
              type="button"
              onClick={goGuidelines}
              className="text-[12px] py-2 rounded-md active:bg-white/5 text-center leading-tight"
            >
              <span className="elix-silver-red-text">{t('common.guidelines')}</span>
            </button>
          </div>

          <div className="mt-3 pt-2.5 flex items-center justify-center gap-6 border-t border-white/10">
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 py-1.5 text-[13px] active:bg-white/5 px-2.5 rounded-md"
            >
              <LogOut size={15} className="royce-icon-gold" /> <span className="elix-silver-red-text">{t('common.logout')}</span>
            </button>
            <button
              type="button"
              onClick={handleDeleteAccount}
              className="flex items-center gap-1.5 py-1.5 text-[13px] active:bg-white/20/10 px-2.5 rounded-md"
            >
              <Trash2 size={15} className="royce-icon-gold" /> <span className="elix-silver-red-text">{t('common.delete')}</span>
            </button>
          </div>
          <p className="text-center text-[9px] pt-1.5 pb-0.5">
            <span className="elix-silver-red-text opacity-40">v1.0.0</span>
          </p>
        </div>
      </div>
      {langOpen && <LanguagePickerSheet onClose={() => setLangOpen(false)} />}
    </SettingsOptionSheet>
  );
}
