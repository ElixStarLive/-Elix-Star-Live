export interface BackgroundOption {
  id: string;
  name: string;
  type: 'blur' | 'color' | 'image' | 'gradient';
  value: string;
  preview: string;
}

export const BACKGROUND_OPTIONS: BackgroundOption[] = [
  { id: 'none', name: 'Original', type: 'blur', value: '0', preview: '📷' },
  { id: 'blur-light', name: 'Soft Blur', type: 'blur', value: '8', preview: '🌫️' },
  { id: 'blur-medium', name: 'Medium Blur', type: 'blur', value: '16', preview: '💨' },
  { id: 'blur-heavy', name: 'Heavy Blur', type: 'blur', value: '30', preview: '🌊' },
  { id: 'color-black', name: 'Black', type: 'color', value: '#000000', preview: '⬛' },
  { id: 'color-white', name: 'White', type: 'color', value: '#FFFFFF', preview: '⬜' },
  { id: 'color-green', name: 'Green Screen', type: 'color', value: '#00FF00', preview: '🟩' },
  { id: 'grad-sunset', name: 'Sunset', type: 'gradient', value: 'linear-gradient(135deg, #FF6B6B, #FFE66D)', preview: '🌅' },
  { id: 'grad-ocean', name: 'Ocean', type: 'gradient', value: 'linear-gradient(135deg, #667eea, #764ba2)', preview: '🌊' },
  { id: 'grad-neon', name: 'Neon', type: 'gradient', value: 'linear-gradient(135deg, #f093fb, #f5576c)', preview: '💜' },
  { id: 'grad-gold', name: 'Gold', type: 'gradient', value: 'linear-gradient(135deg, #C9A96E, #FFD700)', preview: '✨' },
  { id: 'grad-dark', name: 'Dark Mode', type: 'gradient', value: 'linear-gradient(135deg, #13151A, #1C1E24)', preview: '🌑' },
];

export function applyBackgroundBlur(
  canvas: HTMLCanvasElement,
  source: HTMLVideoElement | HTMLImageElement,
  blurAmount: number,
  personMask?: ImageData
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
  const h = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
  canvas.width = w;
  canvas.height = h;

  if (!personMask) {
    ctx.filter = `blur(${blurAmount}px)`;
    ctx.drawImage(source, -blurAmount * 2, -blurAmount * 2, w + blurAmount * 4, h + blurAmount * 4);
    ctx.filter = 'none';

    const centerW = w * 0.5;
    const centerH = h * 0.7;
    const centerX = (w - centerW) / 2;
    const centerY = (h - centerH) / 2;

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.4, centerW / 2, centerH / 2, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(source, 0, 0, w, h);
    ctx.restore();
  } else {
    ctx.filter = `blur(${blurAmount}px)`;
    ctx.drawImage(source, 0, 0, w, h);
    ctx.filter = 'none';

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = w;
    tempCanvas.height = h;
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.drawImage(source, 0, 0, w, h);

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = personMask.width;
    maskCanvas.height = personMask.height;
    maskCanvas.getContext('2d')!.putImageData(personMask, 0, 0);

    tempCtx.globalCompositeOperation = 'destination-in';
    tempCtx.drawImage(maskCanvas, 0, 0, w, h);

    ctx.drawImage(tempCanvas, 0, 0);
  }
}

export function applyBackgroundColor(
  canvas: HTMLCanvasElement,
  source: HTMLVideoElement | HTMLImageElement,
  color: string
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
  const h = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
  canvas.width = w;
  canvas.height = h;

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);

  const centerW = w * 0.6;
  const centerH = h * 0.75;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(w / 2, h * 0.4, centerW / 2, centerH / 2, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(source, 0, 0, w, h);
  ctx.restore();
}

export async function createSimpleSegmentationMask(
  source: HTMLVideoElement | HTMLImageElement,
  sensitivity: number = 0.5
): Promise<ImageData | null> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const w = 160;
  const sw = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
  const sh = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
  const h = Math.round((sh / sw) * w);
  canvas.width = w;
  canvas.height = h;

  ctx.drawImage(source, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  const skinThreshold = 30 + sensitivity * 40;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];

    const isSkin = r > 60 && g > 40 && b > 20 &&
      r > g && r > b &&
      Math.abs(r - g) > skinThreshold * 0.3 &&
      r - b > skinThreshold * 0.5;

    const isCenterRegion =
      ((i / 4) % w) > w * 0.2 && ((i / 4) % w) < w * 0.8 &&
      Math.floor((i / 4) / w) > h * 0.05 && Math.floor((i / 4) / w) < h * 0.85;

    const isPerson = isSkin || isCenterRegion;

    data[i] = isPerson ? 255 : 0;
    data[i + 1] = isPerson ? 255 : 0;
    data[i + 2] = isPerson ? 255 : 0;
    data[i + 3] = isPerson ? 255 : 0;
  }

  return imageData;
}
