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
