/**
 * Elix Live Camera Layout with ALL AI Features CONNECTED
 * Cyan Blue Color Scheme (#C9A96E)
 * Version: FINAL - All buttons functional
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { 
  X, 
  Music, 
  RefreshCw, 
  Zap, 
  Clock, 
  Sparkles, 
  User, 
  ChevronDown,
  Check,
  ZoomIn,
  ZoomOut,
  Wand2,
  Type,
  Gauge,
  Star,
  Palette,
  SlidersHorizontal,
  RotateCcw,
  ImagePlus,
  Layers,
  Crosshair
} from 'lucide-react';
import { request } from '../lib/apiClient';

// ═══════════════════════════════════════════════════
// Database-driven Camera Filters - NO HARDCODED DATA
// ═══════════════════════════════════════════════════
async function fetchCameraFilters() {
  try {
    const { data, error } = await request('/api/camera-filters');
    if (error) return [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════
// Database-driven Speed options - NO HARDCODED DATA
// ═══════════════════════════════════════════════════
async function fetchSpeedOptions() {
  try {
    const { data, error } = await request('/api/speed-options');
    if (error) return [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════
// Database-driven Sticker/Emoji options - NO HARDCODED DATA
// ═══════════════════════════════════════════════════
async function fetchStickerOptions() {
  try {
    const { data, error } = await request('/api/sticker-options');
    if (error) return [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

interface ElixCameraLayoutProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  isRecording: boolean;
  isPaused: boolean;
  onRecord: () => void;
  onClose: () => void;
  onFlipCamera: () => void;
  onSelectMusic: () => void;
  onAIMusicGenerator?: () => void;
  onAIEffects?: () => void;
  onCapCut?: () => void;
  zoomLevel?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomReset?: () => void;
  onGalleryOpen?: () => void;
  onPostTab?: () => void;
  onCreateTab?: () => void;
  onLiveTab?: () => void;
  selectedTab?: 'post' | 'create' | 'live';
  onFlashToggle?: () => void;
  flashActive?: boolean;
  timerDelay?: 0 | 3 | 10;
  onTimerCycle?: () => void;
  onSpeedChange?: (speed: number) => void;
  currentSpeed?: number;
  hasRecordedVideo?: boolean;
  onRetake?: () => void;
  onPost?: () => void;
  isPosting?: boolean;
}

interface CameraFilterOption {
  id: string;
  name: string;
  color: string;
  filter: string;
}

interface SpeedOption {
  value: number;
  label: string;
}

interface StickerOption {
  emoji: string;
}

export default function ElixCameraLayout({
  videoRef,
  isRecording,
  isPaused: _isPaused,
  onRecord,
  onClose,
  onFlipCamera,
  onSelectMusic,
  onAIMusicGenerator,
  onAIEffects: _onAIEffects,
  onCapCut: _onCapCut,
  zoomLevel = 1,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onGalleryOpen,
  onPostTab,
  onCreateTab,
  onLiveTab,
  selectedTab = 'post',
  onFlashToggle,
  flashActive = false,
  timerDelay = 0,
  onTimerCycle,
  onSpeedChange,
  currentSpeed = 1,
  hasRecordedVideo = false,
  onRetake,
  onPost,
  isPosting = false,
}: ElixCameraLayoutProps) {
  const [selectedDuration, setSelectedDuration] = useState('60s');
  const [focusLocked, setFocusLocked] = useState(false);

  const toggleFocusLock = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.srcObject) return;
    const stream = video.srcObject as MediaStream;
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const caps = track.getCapabilities?.() as any;
      if (caps?.focusMode) {
        const newLocked = !focusLocked;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await track.applyConstraints({ advanced: [{ focusMode: newLocked ? 'manual' : 'continuous' } as any] });
        setFocusLocked(newLocked);
      } else {
        setFocusLocked((v) => !v);
      }
    } catch {
      setFocusLocked((v) => !v);
    }
  }, [focusLocked, videoRef]);
  const [beautyEnabled, setBeautyEnabled] = useState(true);
  const [beautyLevel, setBeautyLevel] = useState(0.5); // 0 to 1

  // ── Database-driven options ──
  const [cameraFilters, setCameraFilters] = useState<CameraFilterOption[]>([]);
  const [speedOptions, setSpeedOptions] = useState<SpeedOption[]>([]);
  const [stickerOptions, setStickerOptions] = useState<StickerOption[]>([]);

  // Fetch database options on mount
  useEffect(() => {
    fetchCameraFilters().then(setCameraFilters);
    fetchSpeedOptions().then(setSpeedOptions);
    fetchStickerOptions().then(setStickerOptions);
  }, []);

  // ── Panel states ──
  const [showEffectsPanel, setShowEffectsPanel] = useState(false);
  const [showCapCutPanel, setShowCapCutPanel] = useState(false);
  const [showBeautySlider, setShowBeautySlider] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);

  // ── Filter / Effects state ──
  const [activeFilter, setActiveFilter] = useState<string>('none');
  const [textOverlay, setTextOverlay] = useState('');
  const [activeStickers, setActiveStickers] = useState<string[]>([]);
  const [enhanceEnabled, setEnhanceEnabled] = useState(false);

  const textInputRef = useRef<HTMLInputElement>(null);

  const durations = ['10m', '60s', '15s', 'PHOTO', 'TEXT'];

  // ═══════════════════════════════════════════════════
  // Apply CSS filters to the video element in real-time
  // ═══════════════════════════════════════════════════
  useEffect(() => {
    if (!videoRef.current) return;

    const filters: string[] = [];

    // Beauty filter
    if (beautyEnabled) {
      const bl = beautyLevel;
      filters.push(`brightness(${1 + bl * 0.15}) contrast(${1 - bl * 0.05}) saturate(${1 + bl * 0.08})`);
    }

    // Color filter
    const filterObj = cameraFilters.find(f => f.id === activeFilter);
    if (filterObj && filterObj.filter !== 'none') {
      filters.push(filterObj.filter);
    }

    // Auto-enhance
    if (enhanceEnabled) {
      filters.push('brightness(1.05) contrast(1.08) saturate(1.12)');
    }

    videoRef.current.style.filter = filters.length > 0 ? filters.join(' ') : 'none';

    const videoEl = videoRef.current;
    return () => {
      if (videoEl) {
        videoEl.style.filter = 'none';
      }
    };
  }, [beautyEnabled, beautyLevel, activeFilter, enhanceEnabled, videoRef]);

  useEffect(() => {
    if (videoRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (videoRef.current as any).setZoom?.(zoomLevel);
      }
  }, [zoomLevel, videoRef]);

  // ── Toggle effects panel ──
  const toggleEffectsPanel = useCallback(() => {
    setShowEffectsPanel(prev => !prev);
    setShowCapCutPanel(false);
    setShowBeautySlider(false);
  }, []);

  // ── Toggle CapCut panel ──
  const toggleCapCutPanel = useCallback(() => {
    setShowCapCutPanel(prev => !prev);
    setShowEffectsPanel(false);
    setShowBeautySlider(false);
  }, []);

  // ── Toggle beauty slider ──
  const toggleBeautySlider = useCallback(() => {
    setBeautyEnabled(prev => !prev);
  }, []);

  const openBeautySlider = useCallback(() => {
    setShowBeautySlider(prev => !prev);
    setShowEffectsPanel(false);
    setShowCapCutPanel(false);
  }, []);

  // ── Select a filter ──
  const selectFilter = useCallback((filterId: string) => {
    setActiveFilter(prev => prev === filterId ? 'none' : filterId);
  }, []);

  // ── Add sticker ──
  const addSticker = useCallback((emoji: string) => {
    setActiveStickers(prev => {
      if (prev.includes(emoji)) return prev.filter(s => s !== emoji);
      return [...prev, emoji];
    });
  }, []);

  // ── Focus text input when shown ──
  useEffect(() => {
    if (showTextInput && textInputRef.current) {
      textInputRef.current.focus();
    }
  }, [showTextInput]);

  return (
    <div className="absolute inset-0 w-full h-full pointer-events-none">

      {/* ══════════════════════════════════════════ */}
      {/* TOP BAR */}
      {/* ══════════════════════════════════════════ */}
      <div
        className="absolute top-0 left-0 right-0 z-50 px-3 flex items-center justify-between pointer-events-auto"
        style={{ paddingTop: 'max(3rem, env(safe-area-inset-top))' }}
      >
        <div className="w-8 h-8" />

        {/* Add Sound Button */}
        <button
          onClick={onSelectMusic}
          className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center hover:scale-105 active:scale-95 transition-all relative"
          title="Add sound"
        >
          <div className="w-7 h-7 rounded-full flex items-center justify-center z-[2]">
            <Music
              size={18}
              className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] drop-shadow-[0_0_16px_rgba(255,215,0,0.6)]"
              strokeWidth={2}
            />
          </div>
        </button>

        {/* Close Button (no circular container) */}
        <button
          onClick={onClose}
          className="flex-shrink-0 flex items-center justify-center hover:scale-110 transition-transform active:scale-95 z-[60] relative translate-x-[-2.5mm]"
          title="Close"
        >
          <img
            src="/Icons/Gold power buton.png"
            alt="Close"
            className="w-5 h-5 object-contain drop-shadow-[0_0_8px_rgba(255,215,0,1)]"
          />
        </button>
      </div>

      {/* ══════════════════════════════════════════ */}
      {/* Active Filter Indicator (top-left) */}
      {/* ══════════════════════════════════════════ */}
      {activeFilter !== 'none' && (
        <div className="absolute top-0 left-3 z-50 pointer-events-auto" style={{ paddingTop: 'max(5.5rem, calc(env(safe-area-inset-top) + 3rem))' }}>
          <div className="bg-[#13151A]/50 backdrop-blur-sm px-2 py-1 rounded-full flex items-center gap-1.5 border border-[#C9A96E]/20">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cameraFilters.find(f => f.id === activeFilter)?.color }} />
          <span className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] text-[9px] font-semibold">{cameraFilters.find(f => f.id === activeFilter)?.name}</span>
            <button onClick={() => setActiveFilter('none')} className="ml-0.5" title="Remove filter">
              <X size={8} className="text-white/60" />
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════ */}
      {/* Text Overlay Display */}
      {/* ══════════════════════════════════════════ */}
      {textOverlay && (
        <div className="absolute top-1/3 left-0 right-0 z-40 flex justify-center pointer-events-auto">
          <button onClick={() => setTextOverlay('')} title="Remove text" className="bg-[#13151A]/40 backdrop-blur-sm px-4 py-2 rounded-lg">
            <p className="text-white text-xl font-bold text-center drop-shadow-lg">{textOverlay}</p>
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════ */}
      {/* Sticker Overlay Display */}
      {/* ══════════════════════════════════════════ */}
      {activeStickers.length > 0 && (
        <div className="absolute top-[15%] right-12 z-40 flex flex-col gap-2 pointer-events-auto">
          {activeStickers.map((sticker, i) => (
            <button
              key={i}
              onClick={() => setActiveStickers(prev => prev.filter(s => s !== sticker))}
              className="text-3xl drop-shadow-lg hover:scale-125 transition-transform"
              title="Remove sticker"
            >
              {sticker}
            </button>
          ))}
        </div>
      )}

      {/* ══════════════════════════════════════════ */}
      {/* RIGHT SIDE VERTICAL CONTROLS */}
      {/* ══════════════════════════════════════════ */}
      <div className="absolute right-2 top-[calc(env(safe-area-inset-top)+4.5rem)] pt-[9mm] pb-4 z-50 flex flex-col items-center justify-start gap-2.5 pointer-events-auto max-h-[85vh] overflow-y-auto scrollbar-hide">
        
        {/* Flip Camera */}
        <button
          onClick={onFlipCamera}
          className="w-8 h-8 flex-shrink-0 min-w-8 aspect-square rounded-full overflow-hidden flex items-center justify-center hover:scale-110 active:scale-90 transition-transform relative self-center"
          title="Flip Camera"
        >
          <div className="w-6 h-6 rounded-full flex items-center justify-center z-[2]">
            <RefreshCw size={18} strokeWidth={1.5} className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] drop-shadow-[0_0_16px_rgba(255,215,0,0.6)]" />
          </div>
        </button>

        {/* Flash */}
        <button 
          onClick={onFlashToggle}
          className="w-8 h-8 flex-shrink-0 min-w-8 aspect-square rounded-full overflow-hidden flex items-center justify-center hover:scale-110 active:scale-90 transition-transform relative self-center"
        >
          <div className="w-6 h-6 rounded-full flex items-center justify-center z-[2]">
            <Zap size={18} strokeWidth={1.5} className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] drop-shadow-[0_0_16px_rgba(255,215,0,0.6)]" fill={flashActive ? "#FFD700" : "none"} />
          </div>
          {flashActive && (
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-[#C9A96E] rounded-full flex items-center justify-center z-[4]">
              <Check size={6} className="text-white" strokeWidth={2.5} />
            </div>
          )}
        </button>

        {/* Focus Lock */}
        <button 
          onClick={toggleFocusLock}
          className="w-8 h-8 flex-shrink-0 min-w-8 aspect-square rounded-full overflow-hidden flex items-center justify-center hover:scale-110 active:scale-90 transition-transform relative self-center"
          title="Focus Lock"
        >
          <div className="w-6 h-6 rounded-full flex items-center justify-center z-[2]">
            <Crosshair size={18} strokeWidth={1.5} className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] drop-shadow-[0_0_16px_rgba(255,215,0,0.6)]" />
          </div>
          {focusLocked && (
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-[#C9A96E] rounded-full flex items-center justify-center z-[4]">
              <Check size={6} className="text-white" strokeWidth={2.5} />
            </div>
          )}
        </button>

        <div className="w-8 h-[1px] bg-[#C9A96E]/25 rounded-full"></div>
        <button 
          onClick={onTimerCycle}
          className="w-8 h-8 flex-shrink-0 min-w-8 aspect-square rounded-full overflow-hidden flex items-center justify-center hover:scale-110 active:scale-90 transition-transform relative self-center"
        >
          <div className="w-6 h-6 rounded-full flex items-center justify-center z-[2]">
            <Clock size={18} strokeWidth={1.5} className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] drop-shadow-[0_0_16px_rgba(255,215,0,0.6)]" />
          </div>
          {timerDelay > 0 && (
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[#C9A96E] rounded-full flex items-center justify-center z-[4]">
              <span className="text-[6px] text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] font-bold">{timerDelay}s</span>
            </div>
          )}
        </button>

        {/* Effects / Filters */}
        <button 
          onClick={toggleEffectsPanel}
          className={`w-8 h-8 flex-shrink-0 min-w-8 aspect-square rounded-full overflow-hidden flex items-center justify-center hover:scale-110 active:scale-90 transition-transform relative self-center ${showEffectsPanel ? 'ring-2 ring-[#C9A96E]/50' : ''}`}
          title="Filters & Effects"
        >
          <div className="w-6 h-6 rounded-full flex items-center justify-center z-[2]">
            <Palette size={18} strokeWidth={1.5} className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] drop-shadow-[0_0_16px_rgba(255,215,0,0.6)]" />
          </div>
        </button>

        {/* Beauty */}
        <button
          onClick={toggleBeautySlider}
          onDoubleClick={openBeautySlider}
          className="w-8 h-8 flex-shrink-0 min-w-8 aspect-square rounded-full overflow-hidden flex items-center justify-center hover:scale-110 active:scale-90 transition-transform relative self-center"
        >
          <div className="w-6 h-6 rounded-full flex items-center justify-center z-[2]">
            <User size={18} strokeWidth={1.5} className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] drop-shadow-[0_0_16px_rgba(255,215,0,0.6)]" />
          </div>
          {beautyEnabled && (
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-[#C9A96E] rounded-full flex items-center justify-center z-[4]">
              <Check size={6} className="text-white" strokeWidth={2.5} />
            </div>
          )}
        </button>

        {/* Beauty Slider (shows when tapped) */}
        {showBeautySlider && (
          <div className="bg-[#13151A]/60 backdrop-blur-sm rounded-full px-1 py-1.5 flex flex-col items-center gap-0.5 border border-[#C9A96E]/20">
            <span className="text-[7px] text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] font-bold">{Math.round(beautyLevel * 100)}%</span>
            <input
              type="range"
              min="0"
              max="100"
              value={beautyLevel * 100}
              onChange={(e) => setBeautyLevel(Number(e.target.value) / 100)}
              title="Beauty level"
              className="w-5 h-12 appearance-none cursor-pointer"
              style={{
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                writingMode: 'vertical-lr' as any,
                direction: 'rtl',
                accentColor: '#C9A96E',
              }}
            />
          </div>
        )}

        {/* More Options Arrow */}
        <button 
          onClick={() => {
            const el = document.querySelector('.scrollbar-hide');
            if (el) el.scrollBy({ top: 100, behavior: 'smooth' });
          }}
          className="w-8 h-8 flex-shrink-0 min-w-8 aspect-square rounded-full overflow-hidden flex items-center justify-center hover:scale-110 active:scale-90 transition-transform relative self-center"
          title="More options"
        >
          <div className="w-6 h-6 rounded-full flex items-center justify-center z-[2]">
            <ChevronDown size={18} strokeWidth={1.5} className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] drop-shadow-[0_0_16px_rgba(255,215,0,0.6)]" />
          </div>
        </button>

        {/* ── AI FEATURES SECTION ── */}
        <div className="w-8 h-[1.5px] bg-[#C9A96E]/30 rounded-full my-0.5"></div>

        {/* Zoom In */}
        {onZoomIn && (
          <button 
            onClick={onZoomIn}
            className="w-8 h-8 flex-shrink-0 min-w-8 aspect-square rounded-full overflow-hidden flex items-center justify-center hover:scale-110 active:scale-90 transition-transform relative self-center"
            title="Zoom In"
          >
            <div className="w-6 h-6 rounded-full flex items-center justify-center z-[2]">
              <ZoomIn size={18} className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] drop-shadow-[0_0_16px_rgba(255,215,0,0.6)]" strokeWidth={1.5} />
            </div>
          </button>
        )}

        {/* Zoom Out */}
        {onZoomOut && (
          <button 
            onClick={onZoomOut}
            className="w-8 h-8 flex-shrink-0 min-w-8 aspect-square rounded-full overflow-hidden flex items-center justify-center hover:scale-110 active:scale-90 transition-transform relative self-center"
            title="Zoom Out"
          >
            <div className="w-6 h-6 rounded-full flex items-center justify-center z-[2]">
              <ZoomOut size={18} className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] drop-shadow-[0_0_16px_rgba(255,215,0,0.6)]" strokeWidth={1.5} />
            </div>
          </button>
        )}

        {/* Zoom Level - tap to reset */}
        {(onZoomIn || onZoomOut) && (
          <button
            onClick={onZoomReset}
            className="w-8 h-8 flex-shrink-0 min-w-8 aspect-square rounded-full overflow-hidden flex items-center justify-center transition-all active:scale-90 hover:scale-110 self-center"
            title="Tap to reset zoom"
          >
            <div className="w-6 h-6 rounded-full flex items-center justify-center z-[2]">
              <span className="text-[#D4AF37] text-[9px] font-bold drop-shadow-[0_0_6px_rgba(212,175,55,0.8)]">{zoomLevel.toFixed(1)}x</span>
            </div>
          </button>
        )}

        {/* AI Effects (Wand) */}
        <button 
          onClick={toggleEffectsPanel}
          className={`w-8 h-8 flex-shrink-0 min-w-8 aspect-square rounded-full overflow-hidden flex items-center justify-center hover:scale-110 active:scale-90 transition-transform relative self-center ${showEffectsPanel ? 'ring-2 ring-[#C9A96E]/50' : ''}`}
          title="AI Effects"
        >
          <div className="w-6 h-6 rounded-full flex items-center justify-center z-[2]">
            <Wand2 size={18} className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] drop-shadow-[0_0_16px_rgba(255,215,0,0.6)]" strokeWidth={1.5} />
          </div>
        </button>

        {/* CapCut AI Editor */}
        <button 
          onClick={toggleCapCutPanel}
          className={`w-8 h-8 flex-shrink-0 min-w-8 aspect-square rounded-full overflow-hidden flex items-center justify-center hover:scale-110 active:scale-90 transition-transform relative self-center ${showCapCutPanel ? 'ring-2 ring-[#C9A96E]/50' : ''}`}
          title="CapCut AI"
        >
          <div className="w-6 h-6 rounded-full flex items-center justify-center z-[2]">
            <Sparkles size={18} className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] drop-shadow-[0_0_16px_rgba(255,215,0,0.6)]" strokeWidth={1.5} />
          </div>
        </button>
      </div>

      {/* ══════════════════════════════════════════ */}
      {/* EFFECTS PANEL (Bottom Sheet) */}
      {/* ══════════════════════════════════════════ */}
      {showEffectsPanel && (
        <div className="absolute bottom-0 left-0 right-0 z-[60] pointer-events-auto animate-in slide-in-from-bottom duration-300">
          <div className="bg-[#13151A]/90 backdrop-blur-xl rounded-t-2xl border-t border-[#C9A96E]/20 pb-safe">
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <h3 className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] text-xs font-bold flex items-center gap-1.5">
                <Palette size={12} />
                Filters & Effects
              </h3>
              <button onClick={() => setShowEffectsPanel(false)} className="p-1" title="Close effects">
                <X size={14} className="text-white/60" />
              </button>
            </div>

            {/* Filter Grid */}
            <div className="px-3 pb-3">
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {cameraFilters.map(filter => (
                  <button
                    key={filter.id}
                    onClick={() => selectFilter(filter.id)}
                    className={`flex flex-col items-center gap-0.5 flex-shrink-0 ${activeFilter === filter.id ? 'scale-105' : ''} transition-transform`}
                  >
                    <div
                      className={`w-11 h-11 rounded-full border-2 flex items-center justify-center shadow-lg ${
                        activeFilter === filter.id ? 'border-[#C9A96E] shadow-[#C9A96E]/30' : 'border-white/10'
                      }`}
                      style={{ backgroundColor: filter.color }}
                    >
                      {activeFilter === filter.id && (
                        <Check size={12} className="text-white drop-shadow-lg" strokeWidth={3} />
                      )}
                    </div>
                    <span className={`text-[9px] font-semibold ${activeFilter === filter.id ? 'text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)]' : 'text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)]/70'}`}>
                      {filter.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Enhance Toggle */}
            <div className="px-4 pb-4 flex items-center gap-3">
              <button
                onClick={() => setEnhanceEnabled(prev => !prev)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all ${
                  enhanceEnabled
                    ? 'bg-[#C9A96E] text-black'
                    : 'bg-white/10 text-white/60 border border-white/10'
                }`}
              >
                <Star size={10} />
                Auto Enhance
              </button>
              <button
                onClick={() => { setActiveFilter('none'); setEnhanceEnabled(false); }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-[#13151A] text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] border border-[#C9A96E]/40"
              >
                <RotateCcw size={10} />
                Reset All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════ */}
      {/* CAPCUT AI PANEL (Bottom Sheet) */}
      {/* ══════════════════════════════════════════ */}
      {showCapCutPanel && (
        <div className="absolute bottom-0 left-0 right-0 z-[60] pointer-events-auto animate-in slide-in-from-bottom duration-300">
          <div className="bg-[#13151A]/90 backdrop-blur-xl rounded-t-2xl border-t border-[#C9A96E]/20 pb-safe">
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <h3 className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] text-xs font-bold flex items-center gap-1.5">
                <Sparkles size={12} />
                CapCut AI Tools
              </h3>
              <button onClick={() => setShowCapCutPanel(false)} className="p-1" title="Close CapCut">
                <X size={14} className="text-white/60" />
              </button>
            </div>

            {/* Speed Control */}
            <div className="px-4 pb-3">
              <p className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)]/80 text-[9px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1">
                <Gauge size={9} />
                Recording Speed
              </p>
              <div className="flex items-center gap-2">
                {speedOptions.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => onSpeedChange?.(opt.value)}
                    className={`flex-1 py-1.5 rounded-full text-xs font-bold transition-all ${
                      currentSpeed === opt.value
                        ? 'bg-[#C9A96E] text-black shadow-lg shadow-[#C9A96E]/30'
                        : 'bg-white/10 text-white/60 border border-white/10'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* AI Tools Grid */}
            <div className="px-4 pb-3">
              <p className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)]/80 text-[9px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1">
                <Layers size={9} />
                AI Tools
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {/* Text Overlay */}
                <button
                  onClick={() => { setShowTextInput(true); setShowCapCutPanel(false); }}
                  className="flex flex-col items-center gap-0.5 p-1.5 rounded-xl bg-white/5 border border-white/10 hover:border-[#C9A96E]/30 transition-all active:scale-95"
                >
                  <div className="w-7 h-7 rounded-full flex items-center justify-center border border-[#C9A96E]/30">
                    <Type size={18} className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] drop-shadow-[0_0_16px_rgba(255,215,0,0.6)]" />
                  </div>
                  <span className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] text-[8px] font-medium">Text</span>
                </button>

                {/* Stickers */}
                <button
                  onClick={() => { setShowStickerPicker(true); setShowCapCutPanel(false); }}
                  className="flex flex-col items-center gap-0.5 p-1.5 rounded-xl bg-white/5 border border-white/10 hover:border-[#C9A96E]/30 transition-all active:scale-95"
                >
                  <div className="w-7 h-7 rounded-full flex items-center justify-center border border-[#C9A96E]/30 text-sm">
                    😂
                  </div>
                  <span className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] text-[8px] font-medium">Stickers</span>
                </button>

                {/* Auto Enhance */}
                <button
                  onClick={() => setEnhanceEnabled(prev => !prev)}
                  className={`flex flex-col items-center gap-0.5 p-1.5 rounded-xl border transition-all active:scale-95 ${
                    enhanceEnabled
                      ? 'bg-[#C9A96E]/20 border-[#C9A96E]/40'
                      : 'bg-white/5 border-white/10 hover:border-[#C9A96E]/30'
                  }`}
                >
                  <div className="w-7 h-7 rounded-full flex items-center justify-center border border-[#C9A96E]/30">
                    <Star size={18} className={`drop-shadow-[0_0_8px_rgba(255,215,0,1)] ${enhanceEnabled ? 'text-[#FFD700]' : 'text-white/60'}`} />
                  </div>
                  <span className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] text-[8px] font-medium">Enhance</span>
                </button>

                {/* Beauty Fine-Tune */}
                <button
                  onClick={() => { openBeautySlider(); setShowCapCutPanel(false); }}
                  className="flex flex-col items-center gap-0.5 p-1.5 rounded-xl bg-white/5 border border-white/10 hover:border-[#C9A96E]/30 transition-all active:scale-95"
                >
                  <div className="w-7 h-7 rounded-full flex items-center justify-center border border-[#C9A96E]/30">
                    <SlidersHorizontal size={18} className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] drop-shadow-[0_0_16px_rgba(255,215,0,0.6)]" />
                  </div>
                  <span className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] text-[8px] font-medium">Retouch</span>
                </button>

                {/* Filters shortcut */}
                <button
                  onClick={() => { toggleEffectsPanel(); setShowCapCutPanel(false); }}
                  className="flex flex-col items-center gap-0.5 p-1.5 rounded-xl bg-white/5 border border-white/10 hover:border-[#C9A96E]/30 transition-all active:scale-95"
                >
                  <div className="w-7 h-7 rounded-full flex items-center justify-center border border-[#C9A96E]/30">
                    <Palette size={18} className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] drop-shadow-[0_0_16px_rgba(255,215,0,0.6)]" />
                  </div>
                  <span className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] text-[8px] font-medium">Filters</span>
                </button>

                {/* Music */}
                <button
                  onClick={() => { onAIMusicGenerator?.(); setShowCapCutPanel(false); }}
                  className="flex flex-col items-center gap-0.5 p-1.5 rounded-xl bg-white/5 border border-white/10 hover:border-[#C9A96E]/30 transition-all active:scale-95"
                >
                  <div className="w-7 h-7 rounded-full flex items-center justify-center border border-[#C9A96E]/30">
                    <Music size={18} className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] drop-shadow-[0_0_16px_rgba(255,215,0,0.6)]" />
                  </div>
                  <span className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] text-[8px] font-medium">Music</span>
                </button>

                {/* Flip */}
                <button
                  onClick={() => { onFlipCamera(); setShowCapCutPanel(false); }}
                  className="flex flex-col items-center gap-0.5 p-1.5 rounded-xl bg-white/5 border border-white/10 hover:border-[#C9A96E]/30 transition-all active:scale-95"
                >
                  <div className="w-7 h-7 rounded-full flex items-center justify-center border border-[#C9A96E]/30">
                    <RefreshCw size={18} className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] drop-shadow-[0_0_16px_rgba(255,215,0,0.6)]" />
                  </div>
                  <span className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] text-[8px] font-medium">Flip</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════ */}
      {/* TEXT INPUT OVERLAY */}
      {/* ══════════════════════════════════════════ */}
      {showTextInput && (
        <div className="absolute inset-0 z-[70] bg-[#13151A]/60 flex items-center justify-center pointer-events-auto">
          <div className="w-[80%] max-w-xs bg-[#13151A]/90 backdrop-blur-xl rounded-2xl border border-[#C9A96E]/20 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] text-xs font-bold">Add Text</h3>
              <button onClick={() => setShowTextInput(false)} title="Close text input">
                <X size={14} className="text-white/60" />
              </button>
            </div>
            <input
              ref={textInputRef}
              type="text"
              value={textOverlay}
              onChange={(e) => setTextOverlay(e.target.value)}
              placeholder="Type your text..."
              className="w-full bg-white/10 border border-[#C9A96E]/20 rounded-xl px-3 py-2 text-white text-sm placeholder-white/40/30 outline-none focus:border-[#C9A96E]/50"
              maxLength={50}
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => { setTextOverlay(''); setShowTextInput(false); }}
                className="flex-1 py-2 rounded-xl bg-white/10 text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] text-xs font-semibold"
              >
                Clear
              </button>
              <button
                onClick={() => setShowTextInput(false)}
                className="flex-1 py-2 rounded-xl bg-[#C9A96E] text-black text-xs font-bold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════ */}
      {/* STICKER PICKER OVERLAY */}
      {/* ══════════════════════════════════════════ */}
      {showStickerPicker && (
        <div className="absolute bottom-0 left-0 right-0 z-[70] pointer-events-auto">
          <div className="bg-[#13151A]/90 backdrop-blur-xl rounded-t-2xl border-t border-[#C9A96E]/20 pb-safe">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <h3 className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] text-xs font-bold">Stickers</h3>
              <button onClick={() => setShowStickerPicker(false)} className="p-1" title="Close stickers">
                <X size={14} className="text-white/60" />
              </button>
            </div>
            <div className="grid grid-cols-8 gap-2 px-4 pb-4">
              {stickerOptions.map((option, i) => (
                <button
                  key={i}
                  onClick={() => addSticker(option.emoji)}
                  className={`text-2xl p-1.5 rounded-xl transition-all active:scale-90 ${
                    activeStickers.includes(option.emoji) 
                      ? 'bg-[#C9A96E]/20 border border-[#C9A96E]/40 scale-110' 
                      : 'bg-white/5 hover:bg-white/10'
                  }`}
                >
                  {option.emoji}
                </button>
              ))}
            </div>
            {activeStickers.length > 0 && (
              <div className="px-4 pb-4">
                <button
                  onClick={() => setActiveStickers([])}
                  className="w-full py-2 rounded-xl bg-white/10 text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] text-xs font-semibold"
                >
                  Clear All Stickers
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════ */}
      {/* BOTTOM SECTION */}
      {/* ══════════════════════════════════════════ */}
      {!showEffectsPanel && !showCapCutPanel && !showStickerPicker && (
        <div className="absolute bottom-0 left-0 right-0 z-50 pointer-events-auto" style={{ paddingBottom: 'max(3.5rem, env(safe-area-inset-bottom))' }}>

          {/* Duration Selector - short scroll */}
          <div className="flex justify-center mb-4">
            <div 
              className="w-16 overflow-x-scroll scrollbar-hide snap-x snap-mandatory"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              <div className="flex w-max">
                {durations.map((d) => (
                  <button
                    key={d}
                    onClick={() => setSelectedDuration(d)}
                    className={`w-16 flex-shrink-0 snap-center text-xs font-bold py-1.5 text-center transition-all ${selectedDuration === d ? 'text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] drop-shadow-[0_0_16px_rgba(255,215,0,0.6)]' : 'text-[#D4AF37]/40'}`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Record Button or Post/Retake Actions */}
          <div className="flex items-center justify-center mb-4 px-4">
            {hasRecordedVideo ? (
              <div className="flex items-center gap-12">
                <button 
                    onClick={onRetake}
                    className="flex flex-col items-center gap-1 group"
                    title="Retake"
                >
                    <div className="w-9 h-9 bg-[#1C1E24]/80 rounded-full flex items-center justify-center text-white border-2 border-white group-hover:bg-[#2A2D35]">
                        <RotateCcw size={14} />
                    </div>
                    <span className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] font-bold text-[9px] shadow-black drop-shadow-md">Retake</span>
                </button>

                <button 
                    onClick={onPost}
                    className="flex flex-col items-center gap-1 group disabled:opacity-60"
                    title="Post"
                    disabled={isPosting}
                >
                    <div className="w-9 h-9 bg-red-600 rounded-full flex items-center justify-center text-white font-bold shadow-lg border-2 border-white group-hover:scale-110 transition-transform">
                        <Check size={14} />
                    </div>
                    <span className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] font-bold text-[9px] shadow-black drop-shadow-md">{isPosting ? 'Posting' : 'Post'}</span>
                </button>
              </div>
            ) : (
              <button
                onClick={onRecord}
                title={isRecording ? 'Stop recording' : 'Start recording'}
                className={`w-[72px] h-[72px] rounded-full flex items-center justify-center transition-all flex-shrink-0 shadow-xl active:scale-90 ${
                  isRecording
                    ? 'bg-red-600 border-[3px] border-white'
                    : 'bg-white border-[3px] border-white hover:bg-red-50'
                }`}
              >
                {isRecording ? (
                    <div className="w-6 h-6 bg-white rounded-sm" />
                ) : (
                    <div className="w-[56px] h-[56px] bg-red-600 rounded-full shadow-inner" />
                )}
              </button>
            )}
          </div>

          {/* Speed indicator when not 1x */}
          {currentSpeed !== 1 && (
            <div className="flex justify-center mb-2">
              <div className="bg-[#C9A96E]/20 px-3 py-0.5 rounded-full border border-[#C9A96E]/30">
                <span className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] text-[10px] font-bold">Speed: {currentSpeed}x</span>
              </div>
            </div>
          )}

          {/* Bottom Tabs — no golden circle icon, text only */}
          <div className="flex items-center justify-center px-4 pb-0.5 w-full absolute bottom-4">
            <div className="flex items-center gap-4">
              <button 
                onClick={onPostTab}
                className="relative flex items-center justify-center h-10 px-6 min-w-[80px] rounded-full"
              >
                <span className={`text-sm font-semibold ${selectedTab === 'post' ? 'text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)]' : 'text-white/70'}`}>POST</span>
              </button>
              <button 
                onClick={() => onCreateTab?.()}
                className="relative flex items-center justify-center h-10 px-6 min-w-[80px] rounded-full"
                type="button"
              >
                <span className={`text-sm font-semibold ${selectedTab === 'create' ? 'text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)]' : 'text-white/70'}`}>CREATE</span>
              </button>
              <button 
                onClick={onLiveTab}
                className="relative flex items-center justify-center h-10 px-6 min-w-[80px] rounded-full"
              >
                <span className={`text-sm font-semibold ${selectedTab === 'live' ? 'text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)]' : 'text-white/70'}`}>LIVE</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
