import React, { useEffect, useRef } from 'react';
import { detectFacePose, releaseFaceLandmarker } from '../lib/faceLandmarks';
import { drawFaceAREffect } from '../lib/faceARRenderer';
import { resolveLiveFaceEffectsEngine } from '../lib/liveFaceEffectsProvider';
import { shouldTrackWithMediaPipe } from '../lib/commercialFaceEffects';
import { getLiveMediaTierConfig } from '../lib/live/liveMediaProfile';

type LiveFaceEffectsLayerProps = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  effectType: string;
  color: string;
  mirrored?: boolean;
  active: boolean;
};

/** Persistent creator face FX layer (MediaPipe tracking; DeepAR/Banuba when licensed). */
export function LiveFaceEffectsLayer({
  videoRef,
  effectType,
  color,
  mirrored = true,
  active,
}: LiveFaceEffectsLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engine = resolveLiveFaceEffectsEngine();

  useEffect(() => {
    if (!active || effectType === 'none') return;

    // Thermal: skip MediaPipe/RAF GPU loop when device is under pressure.
    if (getLiveMediaTierConfig().reduceDecorativeMotion) return;

    // Commercial DeepAR/Banuba is not wired in this build — MediaPipe tracks faces.
    if (!shouldTrackWithMediaPipe(engine)) return;

    let cancelled = false;
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
    let lastDetect = 0;
    let lastCssW = 0;
    let lastCssH = 0;
    let cachedPose: Awaited<ReturnType<typeof detectFacePose>> = null;
    // Fair+ already returns above; keep detect interval conservative if we expand later.
    const detectIntervalMs = 48;

    const tick = (now: number) => {
      if (cancelled) return;
      if (getLiveMediaTierConfig().reduceDecorativeMotion) {
        // Thermal rose mid-effect — stop GPU work without tearing down Live.
        cancelAnimationFrame(raf);
        canvas?.remove();
        canvasRef.current = null;
        releaseFaceLandmarker();
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

      if (shouldTrackWithMediaPipe(engine) && now - lastDetect > detectIntervalMs) {
        lastDetect = now;
        void detectFacePose(video, cssW, cssH, mirrored, now).then((pose) => {
          if (pose) cachedPose = pose;
        });
      }

      const ctx = surface.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cssW, cssH);
        drawFaceAREffect(ctx, cssW, cssH, effectType, color, now / 1000, mirrored, cachedPose);
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      canvas?.remove();
      canvasRef.current = null;
      releaseFaceLandmarker();
    };
  }, [active, color, effectType, engine, mirrored, videoRef]);

  return null;
}
