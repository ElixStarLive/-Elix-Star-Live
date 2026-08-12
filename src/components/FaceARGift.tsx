import React, { useEffect, useRef } from 'react';
import { detectFacePose, releaseFaceLandmarker } from '../lib/faceLandmarks';
import { drawFaceAREffect } from '../lib/faceARRenderer';
import { resolveLiveFaceEffectsEngine } from '../lib/liveFaceEffectsProvider';
import { initCommercialFaceEngine, shouldTrackWithMediaPipe } from '../lib/commercialFaceEffects';
import { getLiveMediaTierConfig } from '../lib/live/liveMediaProfile';

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
  const engine = resolveLiveFaceEffectsEngine();

  useEffect(() => {
    // Under thermal pressure, skip Face AR canvas/MediaPipe — gift video overlay still plays.
    if (getLiveMediaTierConfig().reduceDecorativeMotion) {
      onCompleteRef.current?.();
      return;
    }

    void initCommercialFaceEngine(engine);

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
    let lastDetect = 0;
    let lastCssW = 0;
    let lastCssH = 0;
    let cachedPose: Awaited<ReturnType<typeof detectFacePose>> = null;

    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      canvas?.remove();
      canvasRef.current = null;
      releaseFaceLandmarker();
      onCompleteRef.current?.();
    };

    const tick = (now: number) => {
      if (done) return;
      if (getLiveMediaTierConfig().reduceDecorativeMotion) {
        finish();
        return;
      }
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

      const surface = canvas;
      if (!surface) {
        raf = requestAnimationFrame(tick);
        return;
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const cssW = rect.width;
      const cssH = rect.height;
      if (cssW !== lastCssW || cssH !== lastCssH) {
        lastCssW = cssW;
        lastCssH = cssH;
        surface.width = Math.round(cssW * dpr);
        surface.height = Math.round(cssH * dpr);
        surface.style.width = `${cssW}px`;
        surface.style.height = `${cssH}px`;
      }

      if (shouldTrackWithMediaPipe(engine) && now - lastDetect > 64) {
        lastDetect = now;
        void detectFacePose(video, cssW, cssH, mirrored, now).then((pose) => {
          if (pose) cachedPose = pose;
        });
      }

      const ctx = surface.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cssW, cssH);
        drawFaceAREffect(ctx, cssW, cssH, giftType, color, elapsed / 1000, mirrored, cachedPose);
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    const timeout = window.setTimeout(finish, durationMs + 120);

    return () => {
      window.clearTimeout(timeout);
      finish();
    };
  }, [videoRef, giftType, color, mirrored, durationMs, engine]);

  return null;
}
