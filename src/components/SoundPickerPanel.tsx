import React, { useCallback } from 'react';
import SoundLibraryView from './SoundLibraryView';
import { silenceAllHtmlMedia, type SoundTrack } from '../lib/soundLibrary';
import { useSoundLibraryPlayerStore } from '../store/useSoundLibraryPlayerStore';

type Props = {
  onClose: () => void;
  onPick: (track: SoundTrack) => void;
  /** bottom sheet (Create) vs embedded (Upload) */
  layout?: 'sheet' | 'embedded';
};

/**
 * Create / Upload — same full Sound panel as /music (SoundLibraryView only).
 */
export default function SoundPickerPanel({ onClose, onPick, layout = 'sheet' }: Props) {
  const stopLibraryPlayer = useSoundLibraryPlayerStore((s) => s.stop);

  const close = useCallback(() => {
    stopLibraryPlayer();
    silenceAllHtmlMedia();
    onClose();
  }, [onClose, stopLibraryPlayer]);

  const handlePick = useCallback(
    (track: SoundTrack) => {
      stopLibraryPlayer();
      silenceAllHtmlMedia();
      onPick(track);
      onClose();
    },
    [onClose, onPick, stopLibraryPlayer],
  );

  const body = (
    <SoundLibraryView mode="pick" onBack={close} onPick={handlePick} className="pointer-events-auto h-full" />
  );

  if (layout === 'embedded') {
    return (
      <div className="flex flex-col flex-1 min-h-0 pointer-events-auto relative z-10 h-full">{body}</div>
    );
  }

  // Full-screen Sound panel — same footprint as /music, not a half sheet.
  return (
    <div
      className="fixed inset-0 z-[10050] bg-transparent flex flex-col pointer-events-auto animate-in fade-in duration-200"
      onClick={close}
    >
      <div
        className="flex-1 min-h-0 w-full max-w-[480px] mx-auto flex flex-col bg-transparent pointer-events-auto"
        style={{ paddingBottom: 'var(--bottom-ui-reserve, 0px)' }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {body}
      </div>
    </div>
  );
}
