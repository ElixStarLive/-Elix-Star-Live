import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Download,
  MessageCircle,
  Share2,
  Check,
  QrCode,
  Copy,
  Send,
  TrendingUp,
  Flag,
  Trash2,
  Users2,
  Plus,
  Search,
} from 'lucide-react';
import { api } from '../lib/apiClient';
import { useAuthStore } from '../store/useAuthStore';
import { StoryGoldRingAvatar } from './StoryGoldRingAvatar';
import PromotePanel from './PromotePanel';
import { nativeConfirm } from './NativeDialog';
import { fetchAllSharePanelContacts } from '../lib/sharePanelContacts';
import { openExternalLink, nativeShareUrl } from '../lib/platform';
import { showToast } from '../lib/toast';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  video: {
    id: string;
    url: string;
    thumbnail?: string;
    description: string;
    user: {
      username: string;
      id?: string;
    };
    stats: {
      likes: number;
      comments: number;
    };
  };
  onReport?: () => void;
  onJoin?: () => void;
  isFollowing?: boolean;
  onDeleteVideo?: () => void;
}

export default function ShareModal({ isOpen, onClose, video, onReport, onJoin, isFollowing, onDeleteVideo }: ShareModalProps) {
  const navigate = useNavigate();
  const [copiedLink, setCopiedLink] = useState(false);
  const [showQrCode, setShowQrCode] = useState(false);
  const [showPromotePanel, setShowPromotePanel] = useState(false);
  const { user } = useAuthStore();
  const [shareQuery, setShareQuery] = useState('');
  const [followers, setFollowers] = useState<{ user_id: string; username: string; avatar_url: string | null }[]>([]);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      const rows = await fetchAllSharePanelContacts(user?.id);
      if (!cancelled) setFollowers(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, user?.id]);

  const sendShareTo = async (targetUserId: string) => {
    if (!user?.id || sentTo.has(targetUserId)) return;
    const shareUrl = `${window.location.origin}/video/${video.id}`;
    const msgText = `Check out this video by @${video.user.username}: ${shareUrl}`;
    try {
      const { data: thread } = await api.chat.ensureThread(targetUserId);
      const threadId = thread?.id;
      if (threadId) {
        await api.chat.sendMessage(threadId, msgText);
        setSentTo(prev => new Set(prev).add(targetUserId));
      } else {
        showToast('Could not send share');
      }
    } catch {
      showToast('Failed to send');
    }
  };

  const videoUrl = `${window.location.origin}/video/${video.id}`;
  const shareText = `Check out this amazing video by @${video.user.username}: ${video.description}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(videoUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {}
  };

  const filteredFollowers = followers.filter(f => f.username?.toLowerCase().includes(shareQuery.toLowerCase()));

  const socialPlatforms = [
    { name: 'WhatsApp', color: '#25D366', icon: <MessageCircle size={22} className="text-white" />, action: () => openExternalLink(`https://wa.me/?text=${encodeURIComponent(shareText + ' ' + videoUrl)}`) },
    { name: 'Facebook', color: '#1877F2', icon: <Share2 size={22} className="text-white" />, action: () => openExternalLink(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(videoUrl)}`) },
    { name: 'Twitter', color: '#1DA1F2', icon: <Share2 size={22} className="text-white" />, action: () => openExternalLink(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(videoUrl)}`) },
    { name: 'Copy Link', color: '#C9A96E', icon: copiedLink ? <Check size={22} className="text-white" /> : <Copy size={22} className="text-white" />, action: handleCopyLink },
    { name: 'Email', color: '#EA4335', icon: <Send size={22} className="text-white" />, action: () => openExternalLink(`mailto:?subject=Check out this video&body=${encodeURIComponent(shareText + '\n\n' + videoUrl)}`) },
  ];

  const isOwnVideo = !!user?.id && !!video.user?.id && user.id === video.user.id;
  const actionItems = [
    { name: 'Duet', icon: <Users2 size={22} className="text-white" />, action: () => { onClose(); navigate(`/upload?duet=${video.id}`); } },
    { name: 'Promote', color: '#C9A96E', icon: <TrendingUp size={22} className="text-white" />, action: () => { onClose(); setShowPromotePanel(true); } },
    { name: 'Report', color: '#EF4444', icon: <Flag size={22} className="text-white" />, action: () => { onClose(); if (onReport) onReport(); } },
    { name: 'Share', icon: <Share2 size={22} className="text-white" />, action: async () => { await nativeShareUrl({ title: `Video by @${video.user.username}`, text: shareText, url: videoUrl }); } },
    { name: 'Download', icon: <Download size={22} className="text-white" />, action: async () => { try { const res = await fetch(video.url, { mode: 'cors' }); const blob = await res.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `video_${video.id}.mp4`; a.click(); URL.revokeObjectURL(url); } catch { const a = document.createElement('a'); a.href = video.url; a.download = `video_${video.id}.mp4`; a.target = '_blank'; a.click(); } } },
    { name: 'QR Code', icon: <QrCode size={22} className="text-white" />, action: () => setShowQrCode(true) },
    ...(isOwnVideo && onDeleteVideo ? [{ name: 'Delete video', icon: <Trash2 size={22} className="text-red-400" />, action: async () => { const ok = await nativeConfirm('Delete this video? This cannot be undone.', 'Delete Video'); if (ok) { onDeleteVideo(); onClose(); } }, isRed: true }] : []),
  ];

  return (
    <>
    {isOpen && (
    <div className="fixed inset-0 z-modals bg-black/40 flex items-end justify-center" onClick={onClose}>
      <div
        className="bg-[#1C1E24]/95 backdrop-blur-md w-full max-w-[480px] rounded-t-2xl overflow-hidden flex flex-col border-t border-[#C9A96E]/20 h-[38vh] shadow-2xl mb-[calc(var(--nav-height)+var(--safe-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-1 pb-1">
          <div className="w-10" />
          <div className="w-10 h-1 bg-white/20 rounded-full flex-shrink-0" />
          <button type="button" onClick={onClose} className="flex-shrink-0 w-10 h-10 flex items-center justify-center active:scale-95 transition-transform" aria-label="Close">
            <img src="/Icons/Gold power buton.png" alt="" className="w-5 h-5 object-contain" />
          </button>
        </div>
        <div className="flex items-center justify-between gap-2 px-4 pb-2 flex-shrink-0">
          <h3 className="text-white font-bold whitespace-nowrap text-sm">Share to</h3>
          <div className="flex-none w-[120px] bg-white/5 rounded-lg px-2 py-1.5 flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-white/30" />
            <input
              value={shareQuery}
              onChange={(e) => setShareQuery(e.target.value)}
              placeholder="Search..."
              className="bg-transparent text-white text-xs outline-none w-full placeholder:text-white/20"
            />
          </div>
        </div>

        {/* Create + all users — same as live / watch share */}
        <div className="flex gap-3 overflow-x-auto overflow-y-hidden pb-3 flex-shrink-0 px-4 no-scrollbar">
          <button
            type="button"
            onClick={() => { onClose(); navigate('/create'); }}
            className="flex-shrink-0 flex flex-col items-center gap-1 active:scale-95 transition-transform"
            style={{ width: 95, minWidth: 95 }}
          >
            <div className="relative w-[85px] h-[85px] flex items-center justify-center">
              <StoryGoldRingAvatar size={85} src={user?.avatar || '/Icons/Profile icon.png'} alt="Create" />
              <Plus size={28} className="text-[#C9A96E] absolute" strokeWidth={2.5} />
            </div>
            <span className="text-white/80 text-[11px] font-medium">Create</span>
          </button>
          {filteredFollowers.map((f) => (
            <button
              key={f.user_id}
              className="flex-shrink-0 flex flex-col items-center gap-1 active:scale-95 transition-transform"
              style={{ width: 95, minWidth: 95 }}
              onClick={() => sendShareTo(f.user_id)}
            >
              <StoryGoldRingAvatar size={85} src={f.avatar_url || '/Icons/Profile icon.png'} alt={f.username} />
              <span className="text-white/80 text-[11px] font-medium truncate w-full text-center">
                {sentTo.has(f.user_id) ? 'Sent' : f.username || 'User'}
              </span>
            </button>
          ))}
        </div>

        {/* All share options — compact grid, scrollable */}
        <div className="flex-1 overflow-y-scroll overflow-x-hidden min-h-0 px-4 pb-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-white/5 [&::-webkit-scrollbar-thumb]:bg-[#C9A96E]/60 [&::-webkit-scrollbar-thumb]:rounded-full" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(201,169,110,0.6) transparent' }}>
          {showQrCode && (
            <div className="pt-2 pb-3 flex flex-col items-center gap-2 border-b border-white/10 mb-2">
              <div className="flex items-center justify-between w-full">
                <span className="text-white/80 text-sm font-medium">Scan to open video</span>
                <button type="button" onClick={() => setShowQrCode(false)} className="text-white/70 hover:text-white text-xs px-2 py-1 rounded">Close</button>
              </div>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=112x112&data=${encodeURIComponent(videoUrl)}`}
                alt="QR code for video link"
                className="w-28 h-28 rounded-lg bg-white p-1.5"
              />
            </div>
          )}
          <div className="grid grid-cols-5 gap-y-3 gap-x-1.5 pt-1 auto-rows-fr">
            {socialPlatforms.map((item) => (
              <button
                key={item.name}
                onClick={() => item.action()}
                className="flex flex-col items-center gap-1 active:scale-95 transition-transform"
              >
                <div className="relative w-9 h-9 rounded-full bg-[#13151A] overflow-hidden flex items-center justify-center flex-shrink-0">
                  <div className="relative z-[2]">{React.cloneElement(item.icon as React.ReactElement, { className: 'w-3.5 h-3.5 text-white', strokeWidth: 1.8 })}</div>
                  <img src="/Icons/Music Icon.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[3] scale-125 translate-y-0.5" />
                </div>
                <span className="text-[8px] font-semibold text-white/70 truncate w-full text-center">{item.name}</span>
              </button>
            ))}
            {actionItems.map((item) => {
              const isRed = item.name === 'Report' || (item as { isRed?: boolean }).isRed;
              return (
                <button
                  key={item.name}
                  onClick={() => item.action()}
                  className="flex flex-col items-center gap-1 active:scale-95 transition-transform"
                >
                  <div className="relative w-9 h-9 rounded-full bg-[#13151A] overflow-hidden flex items-center justify-center flex-shrink-0">
                    <div className={`relative z-[2] ${item.name === 'Report' ? 'translate-y-0.5' : ''}`}>{React.cloneElement(item.icon as React.ReactElement, { className: `w-3.5 h-3.5 ${isRed ? 'text-red-400' : 'text-white'}`, strokeWidth: 1.8 })}</div>
                    <img src="/Icons/Music Icon.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[3] scale-125 translate-y-px" />
                  </div>
                  <span className={`text-[8px] font-semibold truncate w-full text-center ${isRed ? 'text-red-400/70' : 'text-white/70'}`}>{item.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
    )}
    <PromotePanel
      isOpen={showPromotePanel}
      onClose={() => setShowPromotePanel(false)}
      contentType="video"
      content={{
        id: video.id,
        title: video.description,
        thumbnail: video.thumbnail,
        username: video.user?.username,
        postedAt: new Date().toLocaleDateString(),
      }}
    />
    </>
  );
}
