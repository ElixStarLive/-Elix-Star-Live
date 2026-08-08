import React from 'react';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  originalVolume: number;
  musicVolume: number;
  onOriginalVolumeChange: (v: number) => void;
  onMusicVolumeChange: (v: number) => void;
  /** False for image stories — original audio row stays disabled. */
  hasOriginalAudio?: boolean;
  hasAddedSound: boolean;
  addedSoundTitle?: string | null;
  onChooseSound: () => void;
  onClearSound?: () => void;
  /** Pick a phone image as own backdrop behind the video. */
  hasOwnBackground?: boolean;
  onChooseBackground?: () => void;
  onClearBackground?: () => void;
};

/**
 * Separate sound mix sheet — same header as More Options
 * (top decoration pill + centered title).
 * Two potentiometer lines: original video + added sound (red tracks so they stay visible).
 */
export default function SoundMixPanel({
  isOpen,
  onClose,
  originalVolume,
  musicVolume,
  onOriginalVolumeChange,
  onMusicVolumeChange,
  hasOriginalAudio = true,
  hasAddedSound,
  addedSoundTitle,
  onChooseSound,
  onClearSound,
  hasOwnBackground = false,
  onChooseBackground,
  onClearBackground,
}: Props) {
  if (!isOpen) return null;

  const origMuted = originalVolume <= 0.001;
  const musicMuted = musicVolume <= 0.001;

  const potClass =
    'elix-sound-pot w-full h-2 disabled:opacity-40';

  return (
    <div className="absolute inset-0 z-[125] pointer-events-auto" role="dialog" aria-label="Sound">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-[480px] elix-more-options-sheet rounded-t-2xl pb-[calc(env(safe-area-inset-bottom,0px)+14px)] pointer-events-auto overflow-hidden">
        <div className="flex flex-col px-4 pt-2 pb-3 border-b border-white/10">
          <div className="flex justify-center pb-2" aria-hidden>
            <div className="w-10 h-1 rounded-full bg-white/25" />
          </div>
          <span className="text-[#F5F5F7] font-bold text-sm text-center">Sound</span>
        </div>

        <div className="px-4 pt-4 pb-2 space-y-5">
          {/* Line 1 — original video sound potentiometer */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#E6E9EE] text-xs font-semibold">Original video</span>
              <button
                type="button"
                disabled={!hasOriginalAudio}
                onClick={() => onOriginalVolumeChange(origMuted ? 1 : 0)}
                className="px-2.5 py-1 rounded-full text-[10px] font-bold border border-[#D8D9DD]/40 text-[#C8CDD5] disabled:opacity-40"
              >
                {origMuted ? 'Unmute' : 'Mute'}
              </button>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              disabled={!hasOriginalAudio}
              value={Math.round(Math.max(0, Math.min(1, originalVolume)) * 100)}
              onChange={(e) => onOriginalVolumeChange(Number(e.target.value) / 100)}
              className={potClass}
              aria-label="Original video sound volume"
            />
            {!hasOriginalAudio ? (
              <p className="text-[10px] text-[#8B9099]">No original audio on images</p>
            ) : null}
          </div>

          {/* Line 2 — added sound potentiometer (always show the line) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#E6E9EE] text-xs font-semibold truncate">
                {hasAddedSound ? (addedSoundTitle || 'Added sound') : 'Added sound'}
              </span>
              {hasAddedSound ? (
                <button
                  type="button"
                  onClick={() => onMusicVolumeChange(musicMuted ? 0.7 : 0)}
                  className="px-2.5 py-1 rounded-full text-[10px] font-bold border border-[#D8D9DD]/40 text-[#C8CDD5] shrink-0"
                >
                  {musicMuted ? 'Unmute' : 'Mute'}
                </button>
              ) : null}
            </div>
            <input
              type="range"
              min={0}
              max={100}
              disabled={!hasAddedSound}
              value={Math.round(Math.max(0, Math.min(1, hasAddedSound ? musicVolume : 0)) * 100)}
              onChange={(e) => onMusicVolumeChange(Number(e.target.value) / 100)}
              className={potClass}
              aria-label="Added sound volume"
            />
            {!hasAddedSound ? (
              <p className="text-[10px] text-[#8B9099]">Add a track to mix with the video</p>
            ) : null}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  onChooseSound();
                  onClose();
                }}
                className="flex-1 h-9 rounded-full border border-[#D8D9DD]/40 text-[#E6E9EE] text-xs font-bold"
              >
                {hasAddedSound ? 'Change sound' : 'Add sound'}
              </button>
              {hasAddedSound && onClearSound ? (
                <button
                  type="button"
                  onClick={() => {
                    onClearSound();
                  }}
                  className="h-9 px-3 rounded-full border border-[#F12C56]/50 text-[#E6E9EE] text-xs font-bold"
                >
                  Remove
                </button>
              ) : null}
            </div>
          </div>

          {/* Own background — phone image behind video */}
          {onChooseBackground ? (
            <div className="space-y-2">
              <span className="text-[#E6E9EE] text-xs font-semibold">Own background</span>
              <p className="text-[10px] text-[#8B9099]">
                {hasOwnBackground ? 'Your image is behind the video' : 'Add a photo from your phone as backdrop'}
              </p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onChooseBackground();
                  }}
                  className="flex-1 h-9 rounded-full border border-[#D8D9DD]/40 text-[#E6E9EE] text-xs font-bold"
                >
                  {hasOwnBackground ? 'Change background' : 'Add background'}
                </button>
                {hasOwnBackground && onClearBackground ? (
                  <button
                    type="button"
                    onClick={() => {
                      onClearBackground();
                    }}
                    className="h-9 px-3 rounded-full border border-[#F12C56]/50 text-[#E6E9EE] text-xs font-bold"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
