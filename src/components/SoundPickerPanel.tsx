import React, { useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import SoundLibraryView from './SoundLibraryView';
import { type SoundTrack } from '../lib/soundLibrary';
import { useSoundLibraryPlayerStore } from '../store/useSoundLibraryPlayerStore';

type Props = {
  onClose: () => void;
  onPick: (track: SoundTrack) => void;
  /** Kept for call-site compatibility — unused; always full Sound page. */
  layout?: 'sheet' | 'embedded';
};

/**
 * Create / Upload Add sound — full-viewport Sound panel (no bottom-nav gap).
 * Create has POST/CREATE/LIVE, not BottomNav — panel must cover to the bottom.
 */
export default function SoundPickerPanel({ onClose, onPick }: Props) {
  const stopLibraryPlayer = useSoundLibraryPlayerStore((s) => s.stop);

  useEffect(() => {
    return () => {
      useSoundLibraryPlayerStore.getState().stop();
    };
  }, []);

  const close = useCallback(() => {
    stopLibraryPlayer();
    onClose();
  }, [onClose, stopLibraryPlayer]);

  const handlePick = useCallback(
    (track: SoundTrack) => {
      stopLibraryPlayer();
      onPick(track);
      onClose();
    },
    [onClose, onPick, stopLibraryPlayer],
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[10050] elix-fundal-glass flex justify-center pointer-events-auto text-white"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Sound"
    >
      <div className="absolute inset-0 elix-page-glass pointer-events-none" aria-hidden />
      <div className="relative w-full max-w-[480px] h-full min-h-0 flex flex-col overflow-hidden">
        <SoundLibraryView mode="pick" onBack={close} onPick={handlePick} className="h-full" />
      </div>
    </div>,
    document.body,
  );
}
