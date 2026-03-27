import React, { useEffect, useRef, useState } from 'react';
import { LevelBadge } from './LevelBadge';
import { CHAT_LEVEL_PILL_SIZE_PX, LIVE_MVP_PROFILE_RING_PX } from '../lib/profileFrame';
import { Trash2, Ban, Shield } from 'lucide-react';

interface Message {
  id: string;
  username: string;
  text: string;
  isGift?: boolean;
  level?: number;
  isSystem?: boolean;
  avatar?: string;
  membershipIcon?: string;
  isMod?: boolean;
  stickerUrl?: string;
}

interface ChatOverlayProps {
  messages: Message[];
  variant?: 'panel' | 'overlay';
  compact?: boolean;
  className?: string;
  isModerator?: boolean;
  onLike?: () => void;
  onHeartSpawn?: (clientX: number, clientY: number) => void;
  onProfileTap?: (username: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onBlockUser?: (username: string) => void;
}

export function ChatOverlay({ messages, variant = 'panel', compact = false, className, isModerator = false, onLike, onHeartSpawn, onProfileTap, onDeleteMessage, onBlockUser }: ChatOverlayProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [activeModMenu, setActiveModMenu] = useState<string | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startLongPress = (msgId: string) => {
    if (!isModerator) return;
    longPressTimer.current = setTimeout(() => {
      setActiveModMenu(msgId);
    }, 500);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    position: variant === 'overlay' ? 'absolute' : 'relative',
    bottom: variant === 'overlay' ? 0 : undefined,
    left: variant === 'overlay' ? 0 : undefined,
    width: variant === 'overlay' ? '100%' : '360px',
    maxWidth: variant === 'overlay' ? '100%' : 'calc(100% - 24px)',
    height: variant === 'overlay' ? (compact ? '30dvh' : '40dvh') : '100%',
    paddingLeft: '12px',
    paddingRight: '12px',
    paddingTop: '8px',
    boxSizing: 'border-box',
    background: 'transparent',
    WebkitFontSmoothing: 'antialiased',
    MozOsxFontSmoothing: 'grayscale',
    pointerEvents: 'none',
    alignItems: 'flex-start',
    zIndex: 90,
  };

  const scrollStyle: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
    paddingLeft: '0px',
    marginLeft: '0px',
    marginTop: '1cm',
    alignItems: 'flex-start',
    width: '100%',
    pointerEvents: 'auto',
    transform: 'translateX(-4mm)',
  };

  return (
    <div
      style={containerStyle}
      className={className}
    >
      <div
        className="chat-scroll space-y-2 px-2"
        style={scrollStyle}
      >
        {messages.map((msg, idx) => (
          <div
            key={typeof msg.id === 'string' ? msg.id : `msg-${idx}`}
            className="flex items-center gap-2 animate-in slide-in-from-left-2 duration-200 relative"
            onPointerDown={() => startLongPress(msg.id)}
            onPointerUp={cancelLongPress}
            onPointerLeave={cancelLongPress}
            onPointerCancel={cancelLongPress}
          >
            <div 
              className="flex-shrink-0 cursor-pointer relative z-10 self-center"
              onClick={(e) => {
                e.stopPropagation();
                if (onProfileTap) onProfileTap(msg.username);
              }}
            >
              <LevelBadge
                level={typeof msg.level === 'number' ? msg.level : 1}
                size={CHAT_LEVEL_PILL_SIZE_PX}
                circleSize={LIVE_MVP_PROFILE_RING_PX}
                layout="fixed"
                avatar={typeof msg.avatar === 'string' ? msg.avatar : undefined}
              />
            </div>
            
            <div className="flex flex-col min-w-0 justify-center self-center">
              <div className="flex items-center gap-1.5 flex-wrap">
                {msg.isMod && (
                  <div className="bg-purple-600/80 px-1 py-0.5 rounded flex items-center gap-0.5 flex-shrink-0">
                    <Shield size={8} className="text-white" />
                    <span className="text-white text-[7px] font-bold uppercase">MOD</span>
                  </div>
                )}
                <span 
                    className="text-white font-bold text-[13px] leading-tight cursor-pointer hover:underline whitespace-nowrap" 
                    onClick={() => onProfileTap?.(String(msg.username ?? ''))}
                >
                  {typeof msg.username === 'string' ? msg.username : 'User'}
                </span>
                
                {typeof msg.membershipIcon === 'string' && msg.membershipIcon && (
                  <div className="bg-[#FF4500] px-1.5 py-0.5 rounded-full flex items-center gap-1 border border-white/10 shadow-sm inline-flex align-middle">
                    <img src={msg.membershipIcon} alt="Member" className="w-3 h-3 object-contain" />
                    <span className="text-white text-[9px] font-bold uppercase tracking-wider">Member</span>
                  </div>
                )}
                
                {msg.stickerUrl ? (
                  <img src={msg.stickerUrl} alt="sticker" className="w-16 h-16 object-contain rounded-lg" />
                ) : (
                  <span className={`text-[13px] leading-snug break-words ${msg.isGift ? 'text-white font-bold' : 'text-white/90'}`}>
                    {typeof msg.text === 'string' ? msg.text : ''}
                  </span>
                )}
              </div>
            </div>

            {activeModMenu === msg.id && isModerator && (
              <div className="absolute left-20 -top-1 z-50 flex items-center gap-1 bg-[#1C1E24] border border-white/20 rounded-lg px-1 py-1 shadow-xl pointer-events-auto">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteMessage?.(msg.id);
                    setActiveModMenu(null);
                  }}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-md hover:bg-white/10 active:scale-95 transition-all"
                >
                  <Trash2 size={12} className="text-red-400" />
                  <span className="text-red-400 text-[10px] font-bold">Delete</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onBlockUser?.(msg.username);
                    setActiveModMenu(null);
                  }}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-md hover:bg-white/10 active:scale-95 transition-all"
                >
                  <Ban size={12} className="text-orange-400" />
                  <span className="text-orange-400 text-[10px] font-bold">Block</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setActiveModMenu(null); }}
                  className="px-2 py-1.5 rounded-md hover:bg-white/10 text-white/50 text-[10px] font-bold"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
