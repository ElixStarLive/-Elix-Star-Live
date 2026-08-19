import React, { useState, useEffect, useCallback } from 'react';
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
  Search,
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import PromotePanel from './PromotePanel';
import { nativeConfirm } from './NativeDialog';
import { downloadVideoWithoutMusic } from '../lib/videoDownloadClient';
import {
  fetchAllSharePanelContacts,
  SHARE_PANEL_ACTION_DISC_PX,
  SHARE_PANEL_ACTION_ICON_PX,
  SHARE_PANEL_AVATAR_PX,
  SHARE_PANEL_ITEM_WIDTH_PX,
} from '../lib/sharePanelContacts';
import { openExternalLink, nativeShareUrl } from '../lib/platform';
import { getPublicWebOrigin } from '../lib/api';
import { showToast } from '../lib/toast';
import { trackShare } from '../features/feed/feedApi';
import { sendDmToUser } from '../lib/chatMessages';
import { StoryGoldRingAvatar } from './StoryGoldRingAvatar';
import { useLivePresence } from '../hooks/useLivePresence';
import { reportFailure } from '../lib/reportFailure';

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

export default function ShareModal({ isOpen, onClose, video, onReport, onJoin: _onJoin, isFollowing: _isFollowing, onDeleteVideo }: ShareModalProps) {
  const navigate = useNavigate();
  const [copiedLink, setCopiedLink] = useState(false);
  const [showQrCode, setShowQrCode] = useState(false);
  const [showPromotePanel, setShowPromotePanel] = useState(false);
  const { user } = useAuthStore();
  const [shareQuery, setShareQuery] = useState('');
  const [followers, setFollowers] = useState<{ user_id: string; username: string; avatar_url: string | null }[]>([]);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const session = useAuthStore((s) => s.session);
  // Live rings follow the server while the sheet is open: a contact who ends mid
  // share should not keep a live ring until the sheet is reopened.
  const { creatorIds: liveUserIds } = useLivePresence(session?.access_token, isOpen);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchAllSharePanelContacts(user?.id);
        if (cancelled) return;
        setFollowers(rows);
      } catch (e) {
        if (!cancelled) {
          reportFailure('share_modal_contacts', e);
          showToast('Could not load share contacts');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, user?.id]);

  const sendShareTo = async (targetUserId: string) => {
    if (!user?.id || sentTo.has(targetUserId)) return;
    const shareUrl = `${getPublicWebOrigin()}/video/${video.id}`;
    const msgText = `Check out this video by @${video.user.username}: ${shareUrl}`;
    const { message, error } = await sendDmToUser(targetUserId, msgText);
    if (!message) {
      showToast(error || 'Failed to send');
      return;
    }
    setSentTo((prev) => new Set(prev).add(targetUserId));
    void trackShare(video.id, 'direct');
  };

  const videoUrl = `${getPublicWebOrigin()}/video/${video.id}`;
  const shareText = `Check out this amazing video by @${video.user.username}: ${video.description}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(videoUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      showToast('Could not copy link');
    }
  };

  const filteredFollowers = followers.filter(f => f.username?.toLowerCase().includes(shareQuery.toLowerCase()));

  // Wrap a share action so the platform share count is tracked server-side.
  const withShareTracking = (platform: string, run: () => void) => () => {
    run();
    void trackShare(video.id, platform);
  };

  const goDuet = useCallback(() => {
    onClose();
    navigate(`/upload?duet=${video.id}`);
  }, [onClose, navigate, video.id]);

  const openPromotePanel = useCallback(() => {
    onClose();
    setShowPromotePanel(true);
  }, [onClose]);

  const reportFromShare = useCallback(() => {
    onClose();
    if (onReport) onReport();
  }, [onClose, onReport]);

  const shareNative = useCallback(async () => {
    await nativeShareUrl({ title: `Video by @${video.user.username}`, text: shareText, url: videoUrl });
  }, [video.user.username, shareText, videoUrl]);

  const downloadFromShare = useCallback(async () => {
    try {
      await downloadVideoWithoutMusic(video.id);
      showToast('Download started');
    } catch (err) {
      reportFailure('share_modal_download', err, { videoId: video.id });
      showToast('Download failed');
    }
  }, [video.id]);

  const openQrCode = useCallback(() => {
    setShowQrCode(true);
  }, []);

  const closeQrCode = useCallback(() => {
    setShowQrCode(false);
  }, []);

  const confirmDeleteVideo = useCallback(async () => {
    if (!onDeleteVideo) return;
    const ok = await nativeConfirm('Delete this video? This cannot be undone.', 'Delete Video');
    if (ok) {
      onDeleteVideo();
      onClose();
    }
  }, [onDeleteVideo, onClose]);

  const socialPlatforms = [
    { name: 'WhatsApp', color: '#25D366', icon: <MessageCircle size={22} className="text-white" />, action: withShareTracking('whatsapp', () => openExternalLink(`https://wa.me/?text=${encodeURIComponent(shareText + ' ' + videoUrl)}`)) },
    { name: 'Facebook', color: '#1877F2', icon: <Share2 size={22} className="text-white" />, action: withShareTracking('facebook', () => openExternalLink(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(videoUrl)}`)) },
    { name: 'Twitter', color: '#1DA1F2', icon: <Share2 size={22} className="text-white" />, action: withShareTracking('twitter', () => openExternalLink(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(videoUrl)}`)) },
    { name: 'Copy Link', color: '#FFFFFF', icon: copiedLink ? <Check size={22} className="text-white" /> : <Copy size={22} className="text-white" />, action: withShareTracking('copy', handleCopyLink) },
    { name: 'Email', color: '#EA4335', icon: <Send size={22} className="text-white" />, action: withShareTracking('email', () => openExternalLink(`mailto:?subject=Check out this video&body=${encodeURIComponent(shareText + '\n\n' + videoUrl)}`)) },
  ];

  const isOwnVideo = !!user?.id && !!video.user?.id && user.id === video.user.id;
  const actionItems = [
    { name: 'Duet', icon: <Users2 size={22} className="text-white" />, action: goDuet },
    { name: 'Promote', color: '#FFFFFF', icon: <TrendingUp size={22} className="text-white" />, action: openPromotePanel },
    { name: 'Report', color: '#EF4444', icon: <Flag size={22} className="text-white" />, action: reportFromShare },
    { name: 'Share', icon: <Share2 size={22} className="text-white" />, action: shareNative },
    { name: 'Download', icon: <Download size={22} className="text-white" />, action: downloadFromShare },
    { name: 'QR Code', icon: <QrCode size={22} className="text-white" />, action: openQrCode },
    ...(isOwnVideo && onDeleteVideo ? [{ name: 'Delete video', icon: <Trash2 size={22} className="text-white/60" />, action: confirmDeleteVideo, isRed: true }] : []),
  ];

  return (
    <>
    {isOpen && (
    <div
      className="fixed inset-0 z-modals bg-black/40 flex items-end justify-center pb-[var(--bottom-nav-top)]"
      onClick={onClose}
    >
      <div
        className="elix-panel elix-share-sheet w-full max-w-[480px] rounded-t-2xl overflow-hidden flex flex-col h-[calc(38vh-13mm)] border border-black"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex flex-col px-4 pt-0.5 pb-2 border-b border-white/10 flex-shrink-0">
          <div className="flex justify-center pb-2" aria-hidden>
            <div className="w-10 h-1 rounded-full bg-white/25 flex-shrink-0" />
          </div>
          <div className="absolute left-4 top-0 flex items-center gap-1 z-10" style={{ transform: 'translateY(1mm)' }}>
            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0 border border-[#D8D9DD]/35">
              <Search className="w-3.5 h-3.5 text-[#F5F5F7]" />
            </div>
            <input
              value={shareQuery}
              onChange={(e) => setShareQuery(e.target.value)}
              placeholder="Search..."
              className="bg-transparent text-[#F5F5F7]/90 text-xs outline-none w-[72px] placeholder:text-[#F5F5F7]/45"
              aria-label="Search"
            />
          </div>
          <h3 className="text-[#F5F5F7] font-bold text-sm text-center w-full">Share to</h3>
        </div>

        {/* Share to followers */}
        <div className="flex gap-3 overflow-x-auto overflow-y-hidden pt-2 pb-3 flex-shrink-0 px-4 no-scrollbar">
          {filteredFollowers.map((f) => (
            <button
              key={f.user_id}
              className="flex-shrink-0 flex flex-col items-center gap-1 active:scale-95 transition-transform overflow-visible"
              style={{ width: SHARE_PANEL_ITEM_WIDTH_PX, minWidth: SHARE_PANEL_ITEM_WIDTH_PX }}
              onClick={() => sendShareTo(f.user_id)}
            >
              <StoryGoldRingAvatar
                size={SHARE_PANEL_AVATAR_PX}
                src={f.avatar_url || '/royce/default-avatar.svg'}
                alt={f.username}
                live={liveUserIds.has(f.user_id)}
              />
              <span className="text-white/80 text-[11px] font-medium truncate w-full text-center">
                {sentTo.has(f.user_id) ? 'Sent' : f.username || 'User'}
              </span>
            </button>
          ))}
        </div>

        {/* Line between user circles and action icons */}
        <div className="mx-4 border-t border-[#D8D9DD]/45 flex-shrink-0" aria-hidden />

        {/* Action icons under the line — no visible scrollbar */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 px-4 pb-2 flex flex-col no-scrollbar" style={{ scrollbarWidth: 'none' }}>
          {showQrCode && (
            <div className="pt-2 pb-3 flex flex-col items-center gap-2 border-b border-white/10 mb-2">
              <div className="flex items-center justify-between w-full">
                <span className="text-white/80 text-sm font-medium">Scan to open video</span>
                <button type="button" onClick={closeQrCode} className="text-white/70 hover:text-white text-xs px-2 py-1 rounded">Close</button>
              </div>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=112x112&data=${encodeURIComponent(videoUrl)}`}
                alt="QR code for video link"
                className="w-28 h-28 rounded-lg bg-white p-1.5"
              />
            </div>
          )}
          <div className="grid grid-cols-5 gap-y-3 gap-x-1.5 auto-rows-fr" style={{ paddingTop: '3mm' }}>
            {socialPlatforms.map((item) => (
              <button
                key={item.name}
                onClick={() => item.action()}
                className="flex flex-col items-center gap-1 active:scale-95 transition-transform"
              >
                <div
                  className="relative royce-glow-disc flex-shrink-0"
                  style={{ width: SHARE_PANEL_ACTION_DISC_PX, height: SHARE_PANEL_ACTION_DISC_PX }}
                >
                  {React.cloneElement(item.icon as React.ReactElement, {
                    className: 'royce-icon-gold',
                    size: SHARE_PANEL_ACTION_ICON_PX,
                    strokeWidth: 2,
                  })}
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
                  <div
                    className="relative royce-glow-disc flex-shrink-0"
                    style={{ width: SHARE_PANEL_ACTION_DISC_PX, height: SHARE_PANEL_ACTION_DISC_PX }}
                  >
                    {React.cloneElement(item.icon as React.ReactElement, {
                      className: 'royce-icon-gold',
                      size: SHARE_PANEL_ACTION_ICON_PX,
                      strokeWidth: 2,
                    })}
                  </div>
                  <span className={`text-[8px] font-semibold truncate w-full text-center ${isRed ? 'text-white/60/70' : 'text-white/70'}`}>{item.name}</span>
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
