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
 * Create / Upload Add sound — same SoundLibraryView as /music (1:1).
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
    <SoundLibraryView mode="pick" onBack={close} onPick={handlePick} className="pointer-events-auto" />
  );

  if (layout === 'embedded') {
    return (
      <div className="flex flex-col flex-1 min-h-0 pointer-events-auto relative z-10">{body}</div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[10050] bg-black/40 flex items-end justify-center animate-in fade-in duration-200 pointer-events-auto"
      onClick={close}
    >
      <div
        className="elix-panel backdrop-blur-md w-full max-w-[480px] rounded-t-2xl overflow-hidden flex flex-col h-[92dvh] max-h-[92dvh] border border-black animate-in slide-in-from-bottom duration-300 pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {body}
      </div>
    </div>
  );
}
