export interface EnhanceSettings {
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
  sharpness: number;
  vignette: number;
  grain: number;
  fade: number;
}

export const DEFAULT_ENHANCE: EnhanceSettings = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  warmth: 0,
  sharpness: 0,
  vignette: 0,
  grain: 0,
  fade: 0,
};

export function enhanceSettingsToCss(s: EnhanceSettings): string {
  const parts: string[] = [];
  if (s.brightness !== 0) parts.push(`brightness(${1 + s.brightness / 100})`);
  if (s.contrast !== 0) parts.push(`contrast(${1 + s.contrast / 100})`);
  if (s.saturation !== 0) parts.push(`saturate(${1 + s.saturation / 100})`);
  if (s.warmth > 0) parts.push(`sepia(${s.warmth / 200})`);
  if (s.warmth < 0) parts.push(`hue-rotate(${s.warmth / 5}deg)`);
  if (s.fade > 0) parts.push(`opacity(${1 - s.fade / 200})`);
  return parts.length > 0 ? parts.join(' ') : 'none';
}

export function applyEnhanceToCanvas(
  canvas: HTMLCanvasElement,
  source: HTMLVideoElement | HTMLImageElement,
  settings: EnhanceSettings
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
  canvas.height = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;

  ctx.filter = enhanceSettingsToCss(settings);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  ctx.filter = 'none';

  if (settings.sharpness > 0) {
    applySharpen(ctx, canvas.width, canvas.height, settings.sharpness / 100);
  }
  if (settings.vignette > 0) {
    applyVignette(ctx, canvas.width, canvas.height, settings.vignette / 100);
  }
  if (settings.grain > 0) {
    applyGrain(ctx, canvas.width, canvas.height, settings.grain / 100);
  }
}

function applySharpen(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number): void {
  const a = amount * 0.5;
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const copy = new Uint8ClampedArray(data);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const center = copy[i + c] * (1 + 4 * a);
        const neighbors =
          copy[((y - 1) * w + x) * 4 + c] * -a +
          copy[((y + 1) * w + x) * 4 + c] * -a +
          copy[(y * w + (x - 1)) * 4 + c] * -a +
          copy[(y * w + (x + 1)) * 4 + c] * -a;
        data[i + c] = Math.max(0, Math.min(255, center + neighbors));
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

function applyVignette(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number): void {
  const gradient = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.8);
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, `rgba(0,0,0,${amount * 0.7})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
}

function applyGrain(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number): void {
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const strength = amount * 30;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * strength;
    data[i] = Math.max(0, Math.min(255, data[i] + noise));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
  }
  ctx.putImageData(imageData, 0, 0);
}

export function autoEnhance(source: HTMLVideoElement | HTMLImageElement): EnhanceSettings {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return DEFAULT_ENHANCE;

  const sw = 100;
  const sh = source instanceof HTMLVideoElement
    ? Math.round((source.videoHeight / source.videoWidth) * sw)
    : Math.round((source.naturalHeight / source.naturalWidth) * sw);
  canvas.width = sw;
  canvas.height = sh;
  ctx.drawImage(source, 0, 0, sw, sh);

  const imageData = ctx.getImageData(0, 0, sw, sh);
  const data = imageData.data;

  let totalR = 0, totalG = 0, totalB = 0, minLum = 255, maxLum = 0;
  const pixCount = data.length / 4;

  for (let i = 0; i < data.length; i += 4) {
    totalR += data[i];
    totalG += data[i + 1];
    totalB += data[i + 2];
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
  }

  const avgLum = (totalR + totalG + totalB) / (pixCount * 3);
  const range = maxLum - minLum;

  return {
    brightness: avgLum < 100 ? 15 : avgLum > 180 ? -10 : 5,
    contrast: range < 150 ? 15 : range > 230 ? -5 : 5,
    saturation: 10,
    warmth: 5,
    sharpness: 20,
    vignette: 15,
    grain: 0,
    fade: 0,
  };
}
