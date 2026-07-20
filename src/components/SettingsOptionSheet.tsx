import React from 'react';
import { RoyceCloseIcon } from './royce';

type SettingsOptionSheetProps = {
  children: React.ReactNode;
  onClose: () => void;
};

/**
 * Full-height settings = LIVE top-bar tab column (LiveDiscover):
 * fixed full viewport host + max-w 480px × height 100%. Not a height patch.
 */
export default function SettingsOptionSheet({ children, onClose }: SettingsOptionSheetProps) {
  const [dragY, setDragY] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const dragStartRef = React.useRef<number | null>(null);

  const onDragStart = (e: React.PointerEvent) => {
    dragStartRef.current = e.clientY;
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onDragMove = (e: React.PointerEvent) => {
    if (dragStartRef.current == null) return;
    setDragY(Math.max(0, e.clientY - dragStartRef.current));
  };
  const onDragEnd = () => {
    if (dragStartRef.current == null) return;
    const shouldClose = dragY > 100;
    dragStartRef.current = null;
    setDragging(false);
    if (shouldClose) onClose();
    else setDragY(0);
  };

  return (
    <div className="app-live-column-host z-[9999]">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div
        className="app-live-column text-white"
        style={{
          transform: `translateY(${dragY}px)`,
          transition: dragging ? 'none' : 'transform 0.22s ease',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="relative flex-shrink-0 bg-[#111111] touch-none cursor-grab active:cursor-grabbing border-b border-white/[0.06]"
          style={{ paddingTop: 'var(--page-header-top)' }}
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          <div className="relative h-11">
            <div className="w-11 h-1.5 bg-white/35 rounded-full absolute top-3 left-1/2 -translate-x-1/2" />
            <button
              type="button"
              onClick={onClose}
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute top-1 right-2 z-30 p-1 rounded-full active:scale-90 transition-transform"
              aria-label="Close"
              title="Close"
            >
              <RoyceCloseIcon size={20} />
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">{children}</div>
      </div>
    </div>
  );
}
