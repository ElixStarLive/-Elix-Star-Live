/**
 * Media baking — composites the selected filter and text/sticker overlays
 * directly into the exported image or video so the edits are permanent in the
 * uploaded file (not just a live preview).
 *
 * Overlays are stored as fractions of the media size so the same layout the
 * user positioned on screen is reproduced 1:1 on the full-resolution output.
 */

export type EditOverlay = {
  id: string;
  kind: 'text' | 'sticker';
  /** Text content for kind==='text', or the emoji glyph for kind==='sticker'. */
  value: string;
  /** Center X as a fraction of media width (0..1). */
  xPct: number;
  /** Center Y as a fraction of media height (0..1). */
  yPct: number;
  /** Text color (ignored for stickers). */
  color: string;
  /** Font/glyph size as a fraction of media width (0..1). */
  sizePct: number;
};

export type StoryFxKind =
  | 'beauty'
  | 'glow'
  | 'golden'
  | 'cinematic'
  | 'neon'
  | 'clarity'
  | 'blush'
  | 'frost'
  | 'aura';

/** Modern story FX layers (glow / wash / vignette) — baked after CSS grade. */
export function drawStoryFx(
  ctx: CanvasRenderingContext2D,
  fx: StoryFxKind | null | undefined,
  width: number,
  height: number,
): void {
  if (!fx) return;
  ctx.save();

  if (fx === 'beauty' || fx === 'glow') {
    const g = ctx.createRadialGradient(width * 0.5, height * 0.32, 0, width * 0.5, height * 0.4, Math.max(width, height) * 0.72);
    g.addColorStop(0, 'rgba(255,236,225,0.26)');
    g.addColorStop(0.45, 'rgba(255,210,200,0.1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    const v = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.38, width / 2, height / 2, Math.max(width, height) * 0.78);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(18,10,16,0.3)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, width, height);
  } else if (fx === 'blush') {
    const g = ctx.createRadialGradient(width * 0.5, height * 0.45, 0, width * 0.5, height * 0.5, Math.max(width, height) * 0.65);
    g.addColorStop(0, 'rgba(255,140,160,0.2)');
    g.addColorStop(0.55, 'rgba(255,180,190,0.08)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  } else if (fx === 'golden') {
    const g = ctx.createLinearGradient(0, 0, width, height);
    g.addColorStop(0, 'rgba(255,176,80,0.2)');
    g.addColorStop(0.5, 'rgba(255,140,50,0.06)');
    g.addColorStop(1, 'rgba(255,90,40,0.16)');
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  } else if (fx === 'cinematic') {
    const g = ctx.createLinearGradient(0, 0, 0, height);
    g.addColorStop(0, 'rgba(0,40,55,0.18)');
    g.addColorStop(0.35, 'rgba(0,0,0,0)');
    g.addColorStop(0.65, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(40,15,0,0.22)');
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
    const v = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.4, width / 2, height / 2, Math.max(width, height) * 0.8);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.34)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, width, height);
  } else if (fx === 'clarity') {
    const g = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) * 0.55);
    g.addColorStop(0, 'rgba(255,255,255,0.07)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  } else if (fx === 'frost') {
    const g = ctx.createLinearGradient(0, 0, width, height);
    g.addColorStop(0, 'rgba(160,210,255,0.18)');
    g.addColorStop(0.5, 'rgba(120,180,230,0.06)');
    g.addColorStop(1, 'rgba(200,230,255,0.14)');
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  } else if (fx === 'neon') {
    const g = ctx.createLinearGradient(0, 0, width, height);
    g.addColorStop(0, 'rgba(0,220,255,0.16)');
    g.addColorStop(0.45, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(255,40,160,0.18)');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
    const v = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.4, width / 2, height / 2, Math.max(width, height) * 0.85);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(10,0,30,0.38)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, width, height);
  } else if (fx === 'aura') {
    const g = ctx.createRadialGradient(width * 0.5, height * 0.4, 0, width * 0.5, height * 0.45, Math.max(width, height) * 0.7);
    g.addColorStop(0, 'rgba(180,120,255,0.2)');
    g.addColorStop(0.45, 'rgba(255,80,180,0.1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(180,100,255,0.18)';
    ctx.lineWidth = Math.max(24, Math.round(Math.min(width, height) * 0.06));
    ctx.beginPath();
    ctx.ellipse(width / 2, height / 2, width * 0.42, height * 0.42, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

/** True when the runtime can re-encode video (needed to bake edits into video). */
export function canBakeVideo(): boolean {
  try {
    const canvas = document.createElement('canvas') as HTMLCanvasElement & { captureStream?: unknown };
    return typeof MediaRecorder !== 'undefined' && typeof canvas.captureStream === 'function';
  } catch {
    return false;
  }
}

function drawOverlays(
  ctx: CanvasRenderingContext2D,
  overlays: EditOverlay[],
  width: number,
  height: number,
): void {
  for (const o of overlays) {
    const fontPx = Math.max(10, Math.round(o.sizePct * width));
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${fontPx}px -apple-system, "Segoe UI", Roboto, sans-serif`;
    const x = o.xPct * width;
    const y = o.yPct * height;
    if (o.kind === 'text') {
      // Soft shadow for legibility over any background.
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = Math.round(fontPx * 0.18);
      ctx.shadowOffsetY = Math.round(fontPx * 0.06);
      ctx.fillStyle = o.color || '#FFFFFF';
      ctx.fillText(o.value, x, y);
    } else {
      ctx.fillText(o.value, x, y);
    }
    ctx.restore();
  }
}

/** Bake filter + FX + overlays into an image; returns a new object URL. */
export async function bakeImage(
  srcUrl: string,
  filterCss: string,
  overlays: EditOverlay[],
  fx?: StoryFxKind | null,
): Promise<string> {
  if (!filterCss && overlays.length === 0 && !fx) return srcUrl;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('image load failed'));
    img.src = srcUrl;
  });
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return srcUrl;
  if (filterCss) ctx.filter = filterCss;
  ctx.drawImage(img, 0, 0, w, h);
  ctx.filter = 'none';
  drawStoryFx(ctx, fx, w, h);
  drawOverlays(ctx, overlays, w, h);
  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92),
  );
  if (!blob) return srcUrl;
  return URL.createObjectURL(blob);
}

type CaptureCanvas = HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream };
type CaptureVideo = HTMLVideoElement & { captureStream?: () => MediaStream };

/**
 * Bake filter + overlays (+ optional voice FX) into a video by re-drawing every
 * frame to a canvas and re-encoding with MediaRecorder. Voice FX routes the
 * captured audio through VoiceProcessor before mux. Falls back to the original
 * URL if the runtime cannot re-encode (edits then apply to preview only, never faked).
 */
export async function bakeVideo(
  srcUrl: string,
  filterCss: string,
  overlays: EditOverlay[],
  voiceEffectId?: string,
  fx?: StoryFxKind | null,
): Promise<string> {
  const wantsVoice = Boolean(voiceEffectId && voiceEffectId !== 'none');
  if (!filterCss && overlays.length === 0 && !wantsVoice && !fx) return srcUrl;
  if (!canBakeVideo()) return srcUrl;

  const video = document.createElement('video') as CaptureVideo;
  video.src = srcUrl;
  video.playsInline = true;
  video.muted = false;
  video.volume = 0; // silent local playback; audio track still captured
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('video load failed'));
  });

  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return srcUrl;

  const canvas = document.createElement('canvas') as CaptureCanvas;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return srcUrl;

  const canvasStream = canvas.captureStream(30);

  // Attach original (or voice-processed) audio if present.
  let destroyVoice: (() => void) | null = null;
  let voiceApplied = !wantsVoice;
  try {
    const srcStream = video.captureStream?.();
    const audio = srcStream?.getAudioTracks?.() ?? [];
    if (audio.length > 0) {
      if (wantsVoice) {
        const { VoiceProcessor } = await import('./ai/voice');
        const voiceProcessor = new VoiceProcessor();
        const processed = await voiceProcessor.init(new MediaStream(audio));
        voiceProcessor.applyEffect(voiceEffectId as string);
        destroyVoice = () => { try { voiceProcessor.destroy(); } catch { /* ignore */ } };
        for (const track of processed.getAudioTracks()) canvasStream.addTrack(track);
        voiceApplied = processed.getAudioTracks().length > 0;
      } else {
        for (const track of audio) canvasStream.addTrack(track);
      }
    }
  } catch {
    /* no audio track available — export video-only; voice bake skipped honestly */
    try { destroyVoice?.(); } catch { /* ignore */ }
    destroyVoice = null;
    voiceApplied = !wantsVoice;
  }

  // Voice was requested but could not be applied — abort bake (never pretend FX is in file).
  if (wantsVoice && !voiceApplied) {
    try { destroyVoice?.(); } catch { /* ignore */ }
    return srcUrl;
  }

  const mimeCandidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  const mimeType = mimeCandidates.find((t) => {
    try { return MediaRecorder.isTypeSupported(t); } catch { return false; }
  });
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(canvasStream, mimeType ? { mimeType } : undefined);
  recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };

  let rafId = 0;
  const renderFrame = () => {
    if (filterCss) ctx.filter = filterCss;
    ctx.drawImage(video, 0, 0, w, h);
    ctx.filter = 'none';
    drawStoryFx(ctx, fx, w, h);
    drawOverlays(ctx, overlays, w, h);
    rafId = requestAnimationFrame(renderFrame);
  };

  return new Promise<string>((resolve) => {
    let settled = false;
    // Safety cap so a stalled element can never hang the export.
    const maxMs = Math.min(120000, ((video.duration || 60) + 2) * 1000);
    let guard = 0;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(guard);
      cancelAnimationFrame(rafId);
      try { if (recorder.state !== 'inactive') recorder.stop(); } catch { /* ignore */ }
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
      try { video.pause(); } catch { /* ignore */ }
      try { destroyVoice?.(); } catch { /* ignore */ }
      resolve(blob.size === 0 ? srcUrl : URL.createObjectURL(blob));
    };
    video.onended = finish;
    guard = window.setTimeout(finish, maxMs);

    recorder.start(200);
    renderFrame();
    video.play().catch(() => { finish(); });
  });
}
