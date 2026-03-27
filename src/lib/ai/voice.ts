export interface VoiceEffect {
  id: string;
  name: string;
  icon: string;
  category: 'pitch' | 'environment' | 'character' | 'studio';
}

export const VOICE_EFFECTS: VoiceEffect[] = [
  { id: 'none', name: 'Original', icon: '🎤', category: 'studio' },
  { id: 'deep', name: 'Deep Voice', icon: '🔊', category: 'pitch' },
  { id: 'high', name: 'High Pitch', icon: '🔔', category: 'pitch' },
  { id: 'chipmunk', name: 'Chipmunk', icon: '🐿️', category: 'character' },
  { id: 'robot', name: 'Robot', icon: '🤖', category: 'character' },
  { id: 'echo', name: 'Echo', icon: '🏔️', category: 'environment' },
  { id: 'reverb', name: 'Concert Hall', icon: '🏛️', category: 'environment' },
  { id: 'telephone', name: 'Telephone', icon: '📞', category: 'character' },
  { id: 'radio', name: 'Vintage Radio', icon: '📻', category: 'character' },
  { id: 'studio', name: 'Studio Clean', icon: '🎙️', category: 'studio' },
  { id: 'warm', name: 'Warm Tone', icon: '☀️', category: 'studio' },
  { id: 'megaphone', name: 'Megaphone', icon: '📣', category: 'character' },
];

export class VoiceProcessor {
  private ctx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private nodes: AudioNode[] = [];

  async init(stream: MediaStream): Promise<MediaStream> {
    this.ctx = new AudioContext();
    this.source = this.ctx.createMediaStreamSource(stream);
    this.destination = this.ctx.createMediaStreamDestination();
    this.source.connect(this.destination);
    return this.destination.stream;
  }

  applyEffect(effectId: string): void {
    if (!this.ctx || !this.source || !this.destination) return;

    this.nodes.forEach(n => { try { n.disconnect(); } catch {} });
    this.nodes = [];
    try { this.source.disconnect(); } catch {}

    if (effectId === 'none') {
      this.source.connect(this.destination);
      return;
    }

    const chain: AudioNode[] = [];

    switch (effectId) {
      case 'deep': {
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -30;
        comp.ratio.value = 4;
        const bass = this.ctx.createBiquadFilter();
        bass.type = 'lowshelf';
        bass.frequency.value = 200;
        bass.gain.value = 8;
        const high = this.ctx.createBiquadFilter();
        high.type = 'highshelf';
        high.frequency.value = 3000;
        high.gain.value = -6;
        chain.push(comp, bass, high);
        break;
      }
      case 'high': {
        const high = this.ctx.createBiquadFilter();
        high.type = 'highshelf';
        high.frequency.value = 2000;
        high.gain.value = 8;
        const low = this.ctx.createBiquadFilter();
        low.type = 'lowshelf';
        low.frequency.value = 300;
        low.gain.value = -10;
        chain.push(high, low);
        break;
      }
      case 'chipmunk': {
        const high = this.ctx.createBiquadFilter();
        high.type = 'highpass';
        high.frequency.value = 400;
        const peak = this.ctx.createBiquadFilter();
        peak.type = 'peaking';
        peak.frequency.value = 3000;
        peak.gain.value = 12;
        chain.push(high, peak);
        break;
      }
      case 'robot': {
        const wave = this.ctx.createOscillator();
        wave.frequency.value = 50;
        wave.type = 'sawtooth';
        const waveGain = this.ctx.createGain();
        waveGain.gain.value = 0.3;
        wave.connect(waveGain);
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -50;
        comp.ratio.value = 20;
        comp.attack.value = 0;
        comp.release.value = 0;
        waveGain.connect(comp.threshold as any);
        wave.start();
        chain.push(comp);
        this.nodes.push(wave, waveGain);
        break;
      }
      case 'echo': {
        const delay = this.ctx.createDelay(1);
        delay.delayTime.value = 0.3;
        const feedback = this.ctx.createGain();
        feedback.gain.value = 0.4;
        const mix = this.ctx.createGain();
        mix.gain.value = 0.6;
        delay.connect(feedback);
        feedback.connect(delay);
        this.source.connect(delay);
        delay.connect(mix);
        mix.connect(this.destination);
        this.source.connect(this.destination);
        this.nodes.push(delay, feedback, mix);
        return;
      }
      case 'reverb': {
        const convolver = this.ctx.createConvolver();
        const len = this.ctx.sampleRate * 2;
        const impulse = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
          const channelData = impulse.getChannelData(ch);
          for (let i = 0; i < len; i++) {
            channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
          }
        }
        convolver.buffer = impulse;
        const dry = this.ctx.createGain();
        dry.gain.value = 0.7;
        const wet = this.ctx.createGain();
        wet.gain.value = 0.5;
        this.source.connect(dry);
        this.source.connect(convolver);
        convolver.connect(wet);
        dry.connect(this.destination);
        wet.connect(this.destination);
        this.nodes.push(convolver, dry, wet);
        return;
      }
      case 'telephone': {
        const hp = this.ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 300;
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 3400;
        const peak = this.ctx.createBiquadFilter();
        peak.type = 'peaking';
        peak.frequency.value = 2000;
        peak.gain.value = 6;
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -20;
        comp.ratio.value = 8;
        chain.push(hp, lp, peak, comp);
        break;
      }
      case 'radio': {
        const hp = this.ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 200;
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 5000;
        const dist = this.ctx.createWaveShaper();
        const curve = new Float32Array(256);
        for (let i = 0; i < 256; i++) {
          const x = (i / 128) - 1;
          curve[i] = (Math.PI + 3) * x / (Math.PI + 3 * Math.abs(x));
        }
        dist.curve = curve;
        chain.push(hp, lp, dist);
        break;
      }
      case 'studio': {
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -24;
        comp.knee.value = 12;
        comp.ratio.value = 4;
        comp.attack.value = 0.003;
        comp.release.value = 0.25;
        const eq1 = this.ctx.createBiquadFilter();
        eq1.type = 'highpass';
        eq1.frequency.value = 80;
        const eq2 = this.ctx.createBiquadFilter();
        eq2.type = 'peaking';
        eq2.frequency.value = 3000;
        eq2.gain.value = 3;
        const eq3 = this.ctx.createBiquadFilter();
        eq3.type = 'highshelf';
        eq3.frequency.value = 10000;
        eq3.gain.value = 2;
        chain.push(eq1, comp, eq2, eq3);
        break;
      }
      case 'warm': {
        const low = this.ctx.createBiquadFilter();
        low.type = 'lowshelf';
        low.frequency.value = 300;
        low.gain.value = 4;
        const high = this.ctx.createBiquadFilter();
        high.type = 'highshelf';
        high.frequency.value = 6000;
        high.gain.value = -2;
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -20;
        comp.ratio.value = 3;
        chain.push(low, high, comp);
        break;
      }
      case 'megaphone': {
        const hp = this.ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 600;
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 4000;
        const peak = this.ctx.createBiquadFilter();
        peak.type = 'peaking';
        peak.frequency.value = 2500;
        peak.gain.value = 15;
        const dist = this.ctx.createWaveShaper();
        const curve2 = new Float32Array(256);
        for (let i = 0; i < 256; i++) {
          const x = (i / 128) - 1;
          curve2[i] = Math.tanh(x * 2);
        }
        dist.curve = curve2;
        chain.push(hp, peak, lp, dist);
        break;
      }
    }

    if (chain.length > 0) {
      let prev: AudioNode = this.source;
      for (const node of chain) {
        prev.connect(node);
        prev = node;
        this.nodes.push(node);
      }
      prev.connect(this.destination);
    }
  }

  destroy(): void {
    this.nodes.forEach(n => { try { n.disconnect(); } catch {} });
    try { this.source?.disconnect(); } catch {}
    this.ctx?.close();
    this.ctx = null;
    this.source = null;
    this.destination = null;
    this.nodes = [];
  }
}

export function createNoiseGate(ctx: AudioContext): DynamicsCompressorNode {
  const gate = ctx.createDynamicsCompressor();
  gate.threshold.value = -40;
  gate.knee.value = 0;
  gate.ratio.value = 20;
  gate.attack.value = 0.001;
  gate.release.value = 0.1;
  return gate;
}
