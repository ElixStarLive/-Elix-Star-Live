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
  { id: 'neon', name: 'Neon', fontFamily: "'Montserrat', sans-serif", fontSize: 26, color: '#FFFFFF', background: 'transparent', position: 'center', animation: 'pop' },
  { id: 'minimal', name: 'Minimal', fontFamily: "'Inter', sans-serif", fontSize: 22, color: '#FFFFFF', background: 'transparent', position: 'bottom', animation: 'fade' },
  { id: 'cinematic', name: 'Cinematic', fontFamily: "'Playfair Display', serif", fontSize: 30, color: '#F5E6D3', background: 'transparent', position: 'center', animation: 'typewriter' },
  { id: 'karaoke', name: 'Karaoke', fontFamily: "'Montserrat', sans-serif", fontSize: 28, color: '#FFFFFF', background: 'rgba(0,0,0,0.6)', position: 'bottom', animation: 'karaoke' },
  { id: 'outline', name: 'Outline', fontFamily: "'Arial Black', sans-serif", fontSize: 26, color: '#FFFFFF', background: 'transparent', position: 'bottom', animation: 'pop' },
  { id: 'gradient', name: 'Gradient', fontFamily: "'Montserrat', sans-serif", fontSize: 28, color: 'linear-gradient(90deg, #FFFFFF, #FFFFFF)', background: 'transparent', position: 'center', animation: 'fade' },
];

type RecognitionCallback = (segments: SubtitleSegment[]) => void;

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  [index: number]: { transcript: string; confidence: number };
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionWindow = Window & {
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  SpeechRecognition?: new () => SpeechRecognitionLike;
};

export class SubtitleGenerator {
  private recognition: SpeechRecognitionLike | null = null;
  private segments: SubtitleSegment[] = [];
  private isRunning = false;
  private startTime = 0;
  private onUpdate: RecognitionCallback | null = null;

  get supported(): boolean {
    return !!(window as SpeechRecognitionWindow).webkitSpeechRecognition || !!(window as SpeechRecognitionWindow).SpeechRecognition;
  }

  start(onUpdate: RecognitionCallback, lang: string = 'en-US'): boolean {
    if (!this.supported) return false;

    const SpeechRecognition = (window as SpeechRecognitionWindow).webkitSpeechRecognition || (window as SpeechRecognitionWindow).SpeechRecognition;
    this.recognition = new (SpeechRecognition as new () => SpeechRecognitionLike)();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = lang;
    this.onUpdate = onUpdate;
    this.startTime = Date.now();
    this.segments = [];

    this.recognition.onresult = (event: SpeechRecognitionEventLike) => {
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

    this.recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      if (event.error === 'no-speech') return;

    };

    this.recognition.onend = () => {
      if (this.isRunning) {
        try { this.recognition?.start(); } catch { /* already stopped */ }
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
    try { this.recognition?.stop(); } catch { /* already stopped */ }
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

