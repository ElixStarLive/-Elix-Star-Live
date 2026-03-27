export interface FilterPreset {
  id: string;
  name: string;
  category: 'cinematic' | 'portrait' | 'mood' | 'vintage' | 'artistic';
  css: string;
  intensity: number;
  preview: string;
}

export const FILTER_PRESETS: FilterPreset[] = [
  // Cinematic
  { id: 'none', name: 'Original', category: 'cinematic', css: 'none', intensity: 1, preview: '🎬' },
  { id: 'cinema-warm', name: 'Golden Hour', category: 'cinematic', css: 'saturate(1.3) contrast(1.1) sepia(0.15) brightness(1.05)', intensity: 1, preview: '🌅' },
  { id: 'cinema-cold', name: 'Nordic', category: 'cinematic', css: 'saturate(0.85) contrast(1.15) hue-rotate(-10deg) brightness(1.05)', intensity: 1, preview: '❄️' },
  { id: 'cinema-teal', name: 'Teal & Orange', category: 'cinematic', css: 'saturate(1.4) contrast(1.2) hue-rotate(-15deg) brightness(0.95)', intensity: 1, preview: '🎥' },
  { id: 'cinema-noir', name: 'Film Noir', category: 'cinematic', css: 'grayscale(0.9) contrast(1.4) brightness(0.9)', intensity: 1, preview: '🖤' },
  { id: 'cinema-blade', name: 'Blade Runner', category: 'cinematic', css: 'saturate(1.5) contrast(1.3) hue-rotate(10deg) brightness(0.85)', intensity: 1, preview: '🌃' },
  { id: 'cinema-matte', name: 'Matte Film', category: 'cinematic', css: 'contrast(0.9) brightness(1.1) saturate(0.9) sepia(0.05)', intensity: 1, preview: '📽️' },

  // Portrait
  { id: 'port-soft', name: 'Soft Glow', category: 'portrait', css: 'brightness(1.1) contrast(0.95) saturate(1.1) blur(0.3px)', intensity: 1, preview: '✨' },
  { id: 'port-beauty', name: 'Beauty', category: 'portrait', css: 'brightness(1.08) contrast(0.92) saturate(1.15) sepia(0.03)', intensity: 1, preview: '💎' },
  { id: 'port-hd', name: 'HD Clarity', category: 'portrait', css: 'contrast(1.15) brightness(1.02) saturate(1.05)', intensity: 1, preview: '🔍' },
  { id: 'port-warm', name: 'Warm Skin', category: 'portrait', css: 'sepia(0.12) saturate(1.2) brightness(1.05) contrast(1.02)', intensity: 1, preview: '🌸' },

  // Mood
  { id: 'mood-dreamy', name: 'Dreamy', category: 'mood', css: 'brightness(1.15) contrast(0.85) saturate(1.3) sepia(0.1)', intensity: 1, preview: '💭' },
  { id: 'mood-dark', name: 'Moody Dark', category: 'mood', css: 'brightness(0.8) contrast(1.3) saturate(0.9)', intensity: 1, preview: '🌑' },
  { id: 'mood-neon', name: 'Neon Nights', category: 'mood', css: 'saturate(1.8) contrast(1.2) brightness(0.9) hue-rotate(20deg)', intensity: 1, preview: '💜' },
  { id: 'mood-sunset', name: 'Sunset Glow', category: 'mood', css: 'sepia(0.25) saturate(1.5) brightness(1.05) hue-rotate(-10deg)', intensity: 1, preview: '🌇' },

  // Vintage
  { id: 'vint-retro', name: 'Retro 70s', category: 'vintage', css: 'sepia(0.35) saturate(1.3) contrast(1.1) brightness(1.05)', intensity: 1, preview: '📻' },
  { id: 'vint-faded', name: 'Faded Film', category: 'vintage', css: 'sepia(0.2) saturate(0.8) contrast(0.9) brightness(1.1)', intensity: 1, preview: '🎞️' },
  { id: 'vint-polaroid', name: 'Polaroid', category: 'vintage', css: 'sepia(0.3) contrast(1.15) brightness(1.1) saturate(0.85)', intensity: 1, preview: '📸' },
  { id: 'vint-vhs', name: 'VHS', category: 'vintage', css: 'saturate(1.4) contrast(1.1) brightness(0.95) sepia(0.1) hue-rotate(5deg)', intensity: 1, preview: '📼' },

  // Artistic
  { id: 'art-pop', name: 'Pop Art', category: 'artistic', css: 'saturate(2.0) contrast(1.4) brightness(1.05)', intensity: 1, preview: '🎨' },
  { id: 'art-bw-high', name: 'B&W High Key', category: 'artistic', css: 'grayscale(1) brightness(1.2) contrast(1.1)', intensity: 1, preview: '⬜' },
  { id: 'art-bw-low', name: 'B&W Low Key', category: 'artistic', css: 'grayscale(1) brightness(0.8) contrast(1.4)', intensity: 1, preview: '⬛' },
  { id: 'art-chrome', name: 'Chrome', category: 'artistic', css: 'saturate(0.6) contrast(1.3) brightness(1.1) sepia(0.1)', intensity: 1, preview: '🪞' },
];

export function applyFilterToCanvas(
  canvas: HTMLCanvasElement,
  source: HTMLVideoElement | HTMLImageElement,
  filterId: string,
  intensity: number = 1
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const preset = FILTER_PRESETS.find(f => f.id === filterId);
  canvas.width = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
  canvas.height = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;

  if (!preset || preset.css === 'none') {
    ctx.filter = 'none';
  } else {
    const parts = preset.css.split(' ');
    const scaled = parts.map(part => {
      const match = part.match(/^(\w[\w-]*)\(([^)]+)\)$/);
      if (!match) return part;
      const [, fn, val] = match;
      const num = parseFloat(val);
      if (isNaN(num)) return part;
      const unit = val.replace(String(num), '');
      const base = fn === 'brightness' || fn === 'contrast' || fn === 'saturate' ? 1 : 0;
      const adjusted = base + (num - base) * intensity;
      return `${fn}(${adjusted}${unit})`;
    });
    ctx.filter = scaled.join(' ');
  }

  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  ctx.filter = 'none';
}

export type FilterCategory = FilterPreset['category'];

export function getFiltersByCategory(category: FilterCategory): FilterPreset[] {
  return FILTER_PRESETS.filter(f => f.category === category);
}
