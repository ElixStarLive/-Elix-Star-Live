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

/** Bake filter + overlays into an image; returns a new object URL. */
export async function bakeImage(
  srcUrl: string,
  filterCss: string,
  overlays: EditOverlay[],
): Promise<string> {
  if (!filterCss && overlays.length === 0) return srcUrl;
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
 * Bake filter + overlays into a video by re-drawing every frame to a canvas and
 * re-encoding with the original audio. Falls back to the original URL if the
 * runtime cannot re-encode (edits then apply to preview only, never faked).
 */
export async function bakeVideo(
  srcUrl: string,
  filterCss: string,
  overlays: EditOverlay[],
): Promise<string> {
  if (!filterCss && overlays.length === 0) return srcUrl;
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

  // Attach original audio if present.
  try {
    const srcStream = video.captureStream?.();
    const audio = srcStream?.getAudioTracks?.() ?? [];
    for (const track of audio) canvasStream.addTrack(track);
  } catch {
    /* no audio track available — export video-only */
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
      resolve(blob.size === 0 ? srcUrl : URL.createObjectURL(blob));
    };
    video.onended = finish;
    guard = window.setTimeout(finish, maxMs);

    recorder.start(200);
    renderFrame();
    video.play().catch(() => { finish(); });
  });
}
