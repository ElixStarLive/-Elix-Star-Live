import React, { useCallback, useEffect } from 'react';
import SoundLibraryView from './SoundLibraryView';
import { type SoundTrack } from '../lib/soundLibrary';
import { useSoundLibraryPlayerStore } from '../store/useSoundLibraryPlayerStore';

type Props = {
  onClose: () => void;
  onPick: (track: SoundTrack) => void;
  /** Kept for Create/Upload call sites — both use the same full Sound page shell. */
  layout?: 'sheet' | 'embedded';
};

/**
 * Create / Upload Add sound — identical full Sound page as /music.
 * Opaque fundal so camera / Create chrome never shows through.
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

  return (
    <div
      className="fixed inset-0 z-[10050] elix-fundal-glass flex justify-center pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Sound"
    >
      {/* Same page shell as MusicFeed (/music) */}
      <div
        className="page-above-bottom-nav text-white w-full max-w-[480px] flex flex-col min-h-0"
        style={{ bottom: 'var(--bottom-nav-top)' }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="page-above-bottom-nav__inner bg-transparent flex flex-col min-h-0 h-full">
          <SoundLibraryView
            mode="pick"
            onBack={close}
            onPick={handlePick}
            className="pointer-events-auto h-full"
          />
        </div>
      </div>
    </div>
  );
}
