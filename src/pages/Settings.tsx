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

export default function Settings() {
  const navigate = useNavigate();
  const signOut = useAuthStore((s) => s.signOut);

  // Swipe-down-to-close (same drag-to-dismiss feel as the sheet handle)
  const [dragY, setDragY] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const dragStartRef = React.useRef<number | null>(null);

  const onDragStart = (e: React.PointerEvent) => {
    dragStartRef.current = e.clientY;
    setDragging(true);
  };
  const onDragMove = (e: React.PointerEvent) => {
    if (dragStartRef.current == null) return;
    setDragY(Math.max(0, e.clientY - dragStartRef.current));
  };
  const onDragEnd = () => {
    if (dragStartRef.current == null) return;
    const shouldClose = dragY > 120;
    dragStartRef.current = null;
    setDragging(false);
    if (shouldClose) navigate(-1);
    else setDragY(0);
  };

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
      {ic && <span className="royce-icon-gold shrink-0 [&_svg]:size-[14px]">{ic}</span>}
      <span className="flex-1 text-[12px] leading-tight text-white/85">{t}</span>
      {v && <span className="text-[10px] text-white/45 tabular-nums">{v}</span>}
      <ChevronRight size={13} className="text-white/30 shrink-0" />
    </button>
  );

  const S = ({ t }: { t: string }) => (
    <p className="text-[8px] text-white/30 uppercase tracking-[0.12em] mt-2.5 mb-0.5 px-1 leading-none">{t}</p>
  );

  return (
    <div className="fixed inset-0 z-[9999] flex justify-center">
      <div className="absolute inset-0 bg-black/45" onClick={() => navigate(-1)} />
      <div
        className="absolute inset-y-0 w-full max-w-[480px] bg-[#111111] text-white shadow-2xl overflow-hidden flex flex-col"
        style={{
          transform: `translateY(${dragY}px)`,
          transition: dragging ? 'none' : 'transform 0.25s ease',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex-shrink-0 px-3 pt-1.5 pb-2 touch-none cursor-grab active:cursor-grabbing"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          <div className="flex flex-col items-center">
            <div className="w-10 h-1 bg-white/20 rounded-full absolute top-2 left-1/2 -translate-x-1/2" />
            <span className="text-[13px] font-bold text-[#D4AF37] mt-2">Settings</span>
            <img src="/elix-logo.png" alt="Elix Star Live" className="w-16 h-16 object-contain mt-1.5" />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 pb-[max(22px,calc(env(safe-area-inset-bottom,0px)+18px))]">
          <div className="flex flex-col gap-0 max-w-full">
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

          <div className="grid grid-cols-3 gap-1 mt-2 px-0.5">
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
      </div>
    </div>
  );
}
