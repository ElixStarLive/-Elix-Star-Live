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
 * Create / Upload Add sound — same full Sound page as /music (portaled to body).
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

  // Portal out of Create/Upload overflow/transform so the panel is truly full-screen.
  return createPortal(
    <div
      className="page-above-bottom-nav text-white"
      style={{ bottom: 'var(--bottom-nav-top)', zIndex: 10050 }}
      role="dialog"
      aria-modal="true"
      aria-label="Sound"
    >
      <div className="page-above-bottom-nav__inner bg-transparent flex flex-col min-h-0">
        <SoundLibraryView mode="pick" onBack={close} onPick={handlePick} />
      </div>
    </div>,
    document.body,
  );
}
