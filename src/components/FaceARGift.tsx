import React, { useEffect, useRef } from 'react';
import { drawFaceAREffect } from '../lib/faceARRenderer';

type FaceARGiftProps = {
  giftType: string;
  color: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  mirrored?: boolean;
  durationMs?: number;
  onComplete?: () => void;
};

export function FaceARGift({
  giftType,
  color,
  videoRef,
  mirrored = true,
  durationMs = 4500,
  onComplete,
}: FaceARGiftProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const video = videoRef.current;
    const parent = video?.parentElement;
    if (!video || !parent) return;

    let canvas = canvasRef.current;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      canvas.className = 'absolute inset-0 w-full h-full pointer-events-none z-[6]';
      canvasRef.current = canvas;
      parent.appendChild(canvas);
    }

    let raf = 0;
    const start = performance.now();
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      canvas?.remove();
      canvasRef.current = null;
      onCompleteRef.current?.();
    };

    const tick = (now: number) => {
      if (done) return;
      const elapsed = now - start;
      if (elapsed >= durationMs) {
        finish();
        return;
      }

      const rect = parent.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) {
        raf = requestAnimationFrame(tick);
        return;
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.round(rect.width * dpr);
      canvas!.height = Math.round(rect.height * dpr);
      canvas!.style.width = `${rect.width}px`;
      canvas!.style.height = `${rect.height}px`;

      const ctx = canvas!.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, rect.width, rect.height);
        drawFaceAREffect(ctx, rect.width, rect.height, giftType, color, elapsed / 1000, mirrored);
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    const timeout = window.setTimeout(finish, durationMs + 120);

    return () => {
      window.clearTimeout(timeout);
      finish();
    };
  }, [videoRef, giftType, color, mirrored, durationMs]);

  return null;
}
