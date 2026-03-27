export interface SubtitleSegment {
  text: string;
  start: number;
  end: number;
  confidence: number;
}

export interface SubtitleStyle {
  id: string;
  name: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  background: string;
  position: 'bottom' | 'center' | 'top';
  animation: 'none' | 'fade' | 'pop' | 'typewriter' | 'karaoke';
}

export const SUBTITLE_STYLES: SubtitleStyle[] = [
  { id: 'classic', name: 'Classic', fontFamily: 'Arial, sans-serif', fontSize: 24, color: '#FFFFFF', background: 'rgba(0,0,0,0.7)', position: 'bottom', animation: 'none' },
  { id: 'bold', name: 'Bold', fontFamily: "'Montserrat', sans-serif", fontSize: 28, color: '#FFFFFF', background: 'rgba(0,0,0,0.85)', position: 'bottom', animation: 'pop' },
  { id: 'neon', name: 'Neon', fontFamily: "'Montserrat', sans-serif", fontSize: 26, color: '#C9A96E', background: 'transparent', position: 'center', animation: 'pop' },
  { id: 'minimal', name: 'Minimal', fontFamily: "'Inter', sans-serif", fontSize: 22, color: '#FFFFFF', background: 'transparent', position: 'bottom', animation: 'fade' },
  { id: 'cinematic', name: 'Cinematic', fontFamily: "'Playfair Display', serif", fontSize: 30, color: '#F5E6D3', background: 'transparent', position: 'center', animation: 'typewriter' },
  { id: 'karaoke', name: 'Karaoke', fontFamily: "'Montserrat', sans-serif", fontSize: 28, color: '#FFD700', background: 'rgba(0,0,0,0.6)', position: 'bottom', animation: 'karaoke' },
  { id: 'outline', name: 'Outline', fontFamily: "'Arial Black', sans-serif", fontSize: 26, color: '#FFFFFF', background: 'transparent', position: 'bottom', animation: 'pop' },
  { id: 'gradient', name: 'Gradient', fontFamily: "'Montserrat', sans-serif", fontSize: 28, color: 'linear-gradient(90deg, #C9A96E, #FFFFFF)', background: 'transparent', position: 'center', animation: 'fade' },
];

type RecognitionCallback = (segments: SubtitleSegment[]) => void;

export class SubtitleGenerator {
  private recognition: any = null;
  private segments: SubtitleSegment[] = [];
  private isRunning = false;
  private startTime = 0;
  private onUpdate: RecognitionCallback | null = null;

  get supported(): boolean {
    return !!(window as any).webkitSpeechRecognition || !!(window as any).SpeechRecognition;
  }

  start(onUpdate: RecognitionCallback, lang: string = 'en-US'): boolean {
    if (!this.supported) return false;

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = lang;
    this.onUpdate = onUpdate;
    this.startTime = Date.now();
    this.segments = [];

    this.recognition.onresult = (event: any) => {
      const now = (Date.now() - this.startTime) / 1000;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript.trim();
        const confidence = result[0].confidence || 0.8;

        if (result.isFinal) {
          const segment: SubtitleSegment = {
            text,
            start: Math.max(0, now - text.split(' ').length * 0.3),
            end: now,
            confidence,
          };
          this.segments.push(segment);
        }
      }

      this.onUpdate?.(this.getSegments());
    };

    this.recognition.onerror = (event: any) => {
      if (event.error === 'no-speech') return;

    };

    this.recognition.onend = () => {
      if (this.isRunning) {
        try { this.recognition?.start(); } catch {}
      }
    };

    try {
      this.recognition.start();
      this.isRunning = true;
      return true;
    } catch {
      return false;
    }
  }

  stop(): SubtitleSegment[] {
    this.isRunning = false;
    try { this.recognition?.stop(); } catch {}
    this.recognition = null;
    return this.getSegments();
  }

  getSegments(): SubtitleSegment[] {
    return [...this.segments];
  }
}

export const SUBTITLE_LANGUAGES = [
  { code: 'en-US', name: 'English (US)' },
  { code: 'en-GB', name: 'English (UK)' },
  { code: 'es-ES', name: 'Spanish' },
  { code: 'fr-FR', name: 'French' },
  { code: 'de-DE', name: 'German' },
  { code: 'it-IT', name: 'Italian' },
  { code: 'pt-BR', name: 'Portuguese' },
  { code: 'ro-RO', name: 'Romanian' },
  { code: 'ja-JP', name: 'Japanese' },
  { code: 'ko-KR', name: 'Korean' },
  { code: 'zh-CN', name: 'Chinese (Simplified)' },
  { code: 'hi-IN', name: 'Hindi' },
  { code: 'ar-SA', name: 'Arabic' },
  { code: 'ru-RU', name: 'Russian' },
  { code: 'tr-TR', name: 'Turkish' },
];

export function renderSubtitleToCanvas(
  ctx: CanvasRenderingContext2D,
  text: string,
  style: SubtitleStyle,
  canvasWidth: number,
  canvasHeight: number,
  progress: number = 1
): void {
  if (!text) return;

  ctx.save();
  ctx.font = `bold ${style.fontSize}px ${style.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const padding = 12;
  const maxWidth = canvasWidth - 40;
  const metrics = ctx.measureText(text);
  const textW = Math.min(metrics.width, maxWidth);

  let y: number;
  switch (style.position) {
    case 'top': y = canvasHeight * 0.15; break;
    case 'center': y = canvasHeight * 0.5; break;
    default: y = canvasHeight * 0.85; break;
  }

  if (style.background !== 'transparent') {
    ctx.fillStyle = style.background;
    const bgW = textW + padding * 2;
    const bgH = style.fontSize + padding * 2;
    const radius = 8;
    const x = (canvasWidth - bgW) / 2;
    ctx.beginPath();
    ctx.roundRect(x, y - bgH / 2, bgW, bgH, radius);
    ctx.fill();
  }

  if (style.id === 'outline') {
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.strokeText(text, canvasWidth / 2, y, maxWidth);
  }

  if (style.animation === 'karaoke') {
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText(text, canvasWidth / 2, y, maxWidth);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, canvasWidth * progress, canvasHeight);
    ctx.clip();
    ctx.fillStyle = style.color;
    ctx.fillText(text, canvasWidth / 2, y, maxWidth);
    ctx.restore();
  } else {
    let alpha = 1;
    if (style.animation === 'fade') alpha = Math.min(progress * 3, 1);
    if (style.animation === 'pop') {
      const scale = progress < 0.1 ? progress * 10 : 1;
      ctx.setTransform(scale, 0, 0, scale, canvasWidth / 2 * (1 - scale), y * (1 - scale));
    }

    ctx.globalAlpha = alpha;
    ctx.fillStyle = style.color.startsWith('linear') ? '#FFFFFF' : style.color;

    if (style.animation === 'typewriter') {
      const chars = Math.floor(text.length * Math.min(progress * 2, 1));
      ctx.fillText(text.substring(0, chars), canvasWidth / 2, y, maxWidth);
    } else {
      ctx.fillText(text, canvasWidth / 2, y, maxWidth);
    }
  }

  ctx.restore();
}
