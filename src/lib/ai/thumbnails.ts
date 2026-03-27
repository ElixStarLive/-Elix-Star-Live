export interface ThumbnailCandidate {
  dataUrl: string;
  timestamp: number;
  score: number;
}

export async function extractThumbnails(
  videoUrl: string,
  count: number = 6
): Promise<ThumbnailCandidate[]> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'auto';

    video.onloadedmetadata = async () => {
      const duration = video.duration;
      if (!duration || !isFinite(duration)) {
        resolve([]);
        return;
      }

      const candidates: ThumbnailCandidate[] = [];
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve([]); return; }

      canvas.width = 320;
      canvas.height = Math.round((video.videoHeight / video.videoWidth) * 320);

      const timestamps: number[] = [];
      for (let i = 0; i < count; i++) {
        timestamps.push((duration * (i + 0.5)) / count);
      }

      for (const ts of timestamps) {
        try {
          await seekTo(video, ts);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          const score = analyzeFrame(ctx, canvas.width, canvas.height);
          candidates.push({
            dataUrl: canvas.toDataURL('image/jpeg', 0.85),
            timestamp: ts,
            score,
          });
        } catch {
          // skip frame
        }
      }

      video.src = '';
      resolve(candidates.sort((a, b) => b.score - a.score));
    };

    video.onerror = () => resolve([]);
    video.src = videoUrl;
  });
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('seek timeout')), 5000);
    video.onseeked = () => { clearTimeout(timeout); resolve(); };
    video.onerror = () => { clearTimeout(timeout); reject(new Error('seek error')); };
    video.currentTime = time;
  });
}

function analyzeFrame(ctx: CanvasRenderingContext2D, w: number, h: number): number {
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const pixCount = data.length / 4;

  let totalLum = 0;
  let totalSat = 0;
  const lumValues: number[] = [];

  for (let i = 0; i < data.length; i += 16) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    totalLum += lum;
    lumValues.push(lum);

    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    totalSat += max > 0 ? (max - min) / max : 0;
  }

  const sampleCount = lumValues.length;
  const avgLum = totalLum / sampleCount;
  const avgSat = totalSat / sampleCount;

  let variance = 0;
  for (const l of lumValues) {
    variance += (l - avgLum) ** 2;
  }
  variance /= sampleCount;
  const contrast = Math.sqrt(variance);

  const lumScore = 1 - Math.abs(avgLum - 128) / 128;
  const contrastScore = Math.min(contrast / 80, 1);
  const satScore = Math.min(avgSat * 2, 1);

  return lumScore * 0.3 + contrastScore * 0.4 + satScore * 0.3;
}

export async function generateSmartThumbnail(
  videoUrl: string
): Promise<string | null> {
  const candidates = await extractThumbnails(videoUrl, 8);
  return candidates.length > 0 ? candidates[0].dataUrl : null;
}
