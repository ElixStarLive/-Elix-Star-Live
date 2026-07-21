export type BattleTauntSide = 'host' | 'opponent';
export type BattleTauntKind = 'cheer' | 'win' | 'boo' | 'mvp' | 'lead';

let audioCtx: AudioContext | null = null;
let lastMvpAnnounceAt = 0;
let lastLeadTauntAt = 0;

function ctx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType, gain = 0.08, when = 0) {
  const ac = ctx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, ac.currentTime + when);
  g.gain.linearRampToValueAtTime(gain, ac.currentTime + when + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + when + dur);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(ac.currentTime + when);
  osc.stop(ac.currentTime + when + dur + 0.05);
}

export function playBattleTauntSound(kind: BattleTauntKind): void {
  switch (kind) {
    case 'cheer':
      tone(523, 0.12, 'sine', 0.07, 0);
      tone(659, 0.14, 'sine', 0.08, 0.1);
      tone(784, 0.18, 'triangle', 0.09, 0.2);
      break;
    case 'win':
      tone(440, 0.1, 'square', 0.05, 0);
      tone(554, 0.1, 'square', 0.06, 0.08);
      tone(659, 0.1, 'square', 0.07, 0.16);
      tone(880, 0.22, 'sawtooth', 0.08, 0.24);
      break;
    case 'boo':
      tone(180, 0.25, 'sawtooth', 0.06, 0);
      tone(140, 0.35, 'triangle', 0.05, 0.12);
      break;
    case 'mvp':
      tone(392, 0.08, 'sine', 0.07, 0);
      tone(523, 0.1, 'sine', 0.08, 0.07);
      tone(659, 0.14, 'triangle', 0.09, 0.14);
      tone(784, 0.2, 'sine', 0.1, 0.22);
      break;
    case 'lead':
      tone(330, 0.09, 'triangle', 0.06, 0);
      tone(415, 0.11, 'triangle', 0.07, 0.08);
      tone(494, 0.15, 'sine', 0.08, 0.16);
      break;
    default:
      break;
  }
}

export function announceMvpName(name: string, side: BattleTauntSide): void {
  const label = String(name || 'MVP').trim().slice(0, 32);
  if (!label) return;
  const now = Date.now();
  if (now - lastMvpAnnounceAt < 4000) return;
  lastMvpAnnounceAt = now;

  playBattleTauntSound('mvp');

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(`M V P, ${label}`);
    utter.rate = side === 'host' ? 1.08 : 1.02;
    utter.pitch = side === 'host' ? 1.15 : 0.92;
    utter.volume = 0.85;
    window.speechSynthesis.speak(utter);
  } catch {
    /* ignore TTS failures */
  }
}

export function maybeTauntLeadChange(
  leadingSide: BattleTauntSide | null,
  delta: number,
): void {
  if (!leadingSide || delta < 30) return;
  const now = Date.now();
  if (now - lastLeadTauntAt < 2500) return;
  lastLeadTauntAt = now;
  playBattleTauntSound('lead');
  if (leadingSide === 'host') playBattleTauntSound('cheer');
  else playBattleTauntSound('boo');
}

export type TauntBurst = {
  id: number;
  side: BattleTauntSide;
  emoji: string;
  x: number;
  delay: number;
};

let tauntBurstId = 0;

export function createTauntBurst(side: BattleTauntSide, kind: BattleTauntKind): TauntBurst {
  const emoji =
    kind === 'win' ? '🏆' :
    kind === 'mvp' ? '👑' :
    kind === 'boo' ? '😤' :
    kind === 'lead' ? '🔥' : '🎉';
  return {
    id: ++tauntBurstId,
    side,
    emoji,
    x: 12 + Math.random() * 56,
    delay: 0,
  };
}
