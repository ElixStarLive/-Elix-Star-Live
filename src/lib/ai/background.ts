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
  { id: 'grad-gold', name: 'Gold', type: 'gradient', value: 'linear-gradient(135deg, #FFFFFF, #FFFFFF)', preview: '✨' },
  { id: 'grad-dark', name: 'Dark Mode', type: 'gradient', value: 'linear-gradient(135deg, #1A1A1F, #1C1E24)', preview: '🌑' },
];
