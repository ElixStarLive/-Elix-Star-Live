import React, { useEffect, useRef, useState } from 'react';
import { LevelBadge } from './LevelBadge';
import { LEVEL_BADGE_RING_PX } from '../lib/profileFrame';
import { Trash2, Ban, Shield, Heart } from 'lucide-react';

interface Message {
  id: string;
  username: string;
  text: string;
  isGift?: boolean;
  level?: number;
  isSystem?: boolean;
  avatar?: string;
  membershipIcon?: string;
  /** Fan club short name on the orange member pill (e.g. ZMAJ). */
  membershipName?: string;
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

export function ChatOverlay({ messages, variant = 'panel', compact = false, className, isModerator = false, onLike: _onLike, onHeartSpawn: _onHeartSpawn, onProfileTap, onDeleteMessage, onBlockUser }: ChatOverlayProps) {
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
    gap: '16px',
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
    paddingLeft: '0px',
    marginLeft: '0px',
    marginTop: compact ? '2mm' : '1cm',
    alignItems: 'flex-start',
    width: '100%',
    pointerEvents: 'auto',
    transform: 'translateX(-2mm)',
  };

  return (
    <div
      style={containerStyle}
      className={className}
    >
      <div
        className="chat-scroll px-2"
        style={scrollStyle}
      >
        {messages.map((msg, idx) => (
          <div
            key={typeof msg.id === 'string' ? msg.id : `msg-${idx}`}
            className="flex flex-col gap-1 animate-in slide-in-from-left-2 duration-200 relative"
            onPointerDown={() => startLongPress(msg.id)}
            onPointerUp={cancelLongPress}
            onPointerLeave={cancelLongPress}
            onPointerCancel={cancelLongPress}
          >
            {/* Name on the same line as circle + diamond level chip */}
            <div
              className={`flex items-center gap-2 min-w-0 ${msg.isSystem ? 'bg-gradient-to-r from-[#8A2BE2] to-[#3B4BE8] rounded-full pr-2.5 self-start shadow-sm' : ''}`}
            >
              <div 
                className="flex-shrink-0 cursor-pointer relative z-10 flex items-center justify-center"
                style={{ height: LEVEL_BADGE_RING_PX }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onProfileTap) onProfileTap(msg.username);
                }}
              >
                <LevelBadge
                  level={typeof msg.level === 'number' ? msg.level : 1}
                  layout="fixed"
                  avatar={typeof msg.avatar === 'string' ? msg.avatar : undefined}
                />
              </div>
              <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                {msg.isMod && (
                  <div className="bg-purple-600/80 px-1 py-0.5 rounded flex items-center gap-0.5 flex-shrink-0">
                    <Shield size={8} className="text-white" />
                    <span className="text-white text-[7px] font-bold uppercase">MOD</span>
                  </div>
                )}
                {typeof msg.membershipIcon === 'string' && msg.membershipIcon && (
                  <div
                    className="inline-flex items-center flex-shrink-0 align-middle"
                    style={{
                      height: 15,
                      paddingLeft: 4,
                      paddingRight: 6,
                      gap: 3,
                      borderRadius: 999,
                      background: 'linear-gradient(90deg, #8B3E0F 0%, #D45A12 50%, #E86A1A 100%)',
                      border: '1px solid #FF8C3A',
                    }}
                    title="Member"
                  >
                    <Heart size={9} fill="#FF9A40" stroke="#FF9A40" strokeWidth={0} aria-hidden />
                    <span
                      style={{
                        color: '#FFFFFF',
                        fontSize: 8,
                        fontWeight: 800,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        lineHeight: 1,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {typeof msg.membershipName === 'string' && msg.membershipName.trim()
                        ? msg.membershipName.trim().slice(0, 10)
                        : 'FAN'}
                    </span>
                  </div>
                )}
                <span 
                    className="text-white font-semibold text-[11px] leading-none cursor-pointer hover:underline whitespace-nowrap" 
                    onClick={() => onProfileTap?.(String(msg.username ?? ''))}
                >
                  {typeof msg.username === 'string' ? msg.username : 'User'}
                </span>
                {/* Join / system events read inline next to the colored level badge */}
                {msg.isSystem && typeof msg.text === 'string' && msg.text ? (
                  <span className="text-white/70 text-[11px] leading-none whitespace-nowrap">
                    {msg.text}
                  </span>
                ) : null}
              </div>
            </div>

            {(msg.stickerUrl || (!msg.isSystem && typeof msg.text === 'string' && msg.text)) ? (
              <div
                className="min-w-0"
                style={{ paddingLeft: LEVEL_BADGE_RING_PX + 4 + Math.max(18, Math.round(LEVEL_BADGE_RING_PX * 0.78)) + 12 }}
              >
                {msg.stickerUrl ? (
                  <img src={msg.stickerUrl} alt="sticker" className="w-16 h-16 object-contain rounded-lg" />
                ) : (
                  <span className={`text-[12px] leading-snug break-words ${msg.isGift ? 'text-white font-bold' : 'text-white/90'}`}>
                    {typeof msg.text === 'string' ? msg.text : ''}
                  </span>
                )}
              </div>
            ) : null}

            {activeModMenu === msg.id && isModerator && (
              <div className="absolute left-20 -top-1 z-50 flex items-center gap-1 bg-[#111111] border border-white/20 rounded-lg px-1 py-1 shadow-xl pointer-events-auto">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteMessage?.(msg.id);
                    setActiveModMenu(null);
                  }}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-md hover:bg-white/10 active:scale-95 transition-all"
                >
                  <Trash2 size={12} className="text-white/60" />
                  <span className="text-white/60 text-[10px] font-bold">Delete</span>
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
