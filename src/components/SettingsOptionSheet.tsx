import React from 'react';
import { RoyceCloseIcon } from './royce';

type SettingsOptionSheetProps = {
  children: React.ReactNode;
  onClose: () => void;
};

/**
 * Full-height settings column (STEM width + height):
 * max-w 480px, top of screen → top of home bar. Slide-down / close.
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
    const shouldClose = dragY > 120;
    dragStartRef.current = null;
    setDragging(false);
    if (shouldClose) onClose();
    else setDragY(0);
  };

  return (
    <div
      className="fixed inset-x-0 top-0 z-[9999]"
      style={{ height: 'calc(100dvh - var(--bottom-nav-top))' }}
    >
      <div className="absolute inset-0 bg-black/45" onClick={onClose} aria-hidden />
      <div
        className="absolute inset-y-0 left-1/2 w-full max-w-[480px] bg-[#111111] text-white shadow-2xl overflow-hidden flex flex-col"
        style={{
          transform: `translateX(-50%) translateY(${dragY}px)`,
          transition: dragging ? 'none' : 'transform 0.25s ease',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="relative flex-shrink-0 h-10 touch-none cursor-grab active:cursor-grabbing"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          <div className="w-10 h-1 bg-white/20 rounded-full absolute top-2.5 left-1/2 -translate-x-1/2" />
          <button
            type="button"
            onClick={onClose}
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute top-1 right-2 z-20 w-9 h-9 flex items-center justify-center rounded-full active:scale-90 transition-transform"
            aria-label="Close"
          >
            <RoyceCloseIcon size={20} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">{children}</div>
      </div>
    </div>
  );
}
