// Tiny procedural audio: engine drone + one-shot effects. No audio files needed.
export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private engOsc!: OscillatorNode;
  private engOsc2!: OscillatorNode;
  private engGain!: GainNode;
  private engBus!: GainNode;
  private sfxBus!: GainNode;
  private vol = { master: 0.8, engine: 0.7, sfx: 0.8 };
  private engFilter!: BiquadFilterNode;
  enabled = true;

  /** Must be called from a user gesture. */
  unlock() {
    if (this.ctx) { this.ctx.resume(); return; }
    try { this.ctx = new AudioContext(); } catch { return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.connect(c.destination);
    this.engBus = c.createGain(); this.engBus.connect(this.master);
    this.sfxBus = c.createGain(); this.sfxBus.connect(this.master);
    this.applyVolume();
    this.engFilter = c.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 600;
    this.engGain = c.createGain(); this.engGain.gain.value = 0;
    this.engOsc = c.createOscillator(); this.engOsc.type = 'sawtooth';
    this.engOsc2 = c.createOscillator(); this.engOsc2.type = 'square';
    this.engOsc.connect(this.engFilter); this.engOsc2.connect(this.engFilter);
    this.engFilter.connect(this.engGain); this.engGain.connect(this.engBus);
    this.engOsc.start(); this.engOsc2.start();
  }

  setEnabled(on: boolean) { this.enabled = on; this.applyVolume(); }

  /** 0..1 levels; master is perceptually scaled. */
  setVolume(v: { master: number; engine: number; sfx: number }) { this.vol = { ...v }; this.applyVolume(); }

  private applyVolume() {
    if (!this.master) return;
    const t = this.ctx!.currentTime;
    this.master.gain.setTargetAtTime(this.enabled ? Math.pow(this.vol.master, 2) * 0.9 : 0, t, 0.02);
    this.engBus.gain.setTargetAtTime(this.vol.engine * 1.4, t, 0.02);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, t, 0.02);
  }

  /** Short blip so a volume slider gives instant feedback. */
  preview() { this.tone(660, 0.12, 'triangle', 0.18); }

  /** rpm01: 0..1 engine load, active: whether engine sound should play. */
  engine(rpm01: number, throttle: number, active: boolean) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 38 + rpm01 * 120;
    this.engOsc.frequency.setTargetAtTime(f, t, 0.05);
    this.engOsc2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    this.engFilter.frequency.setTargetAtTime(300 + rpm01 * 900 + throttle * 500, t, 0.08);
    this.engGain.gain.setTargetAtTime(active ? 0.05 + throttle * 0.05 : 0, t, 0.1);
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.2, slide = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t + dur);
  }

  private noise(dur: number, vol = 0.3, freq = 800) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = c.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.sfxBus); src.start(t);
  }

  coin(pitch = 1) { this.tone(880 * pitch, 0.12, 'triangle', 0.15); setTimeout(() => this.tone(1320 * pitch, 0.18, 'triangle', 0.12), 60); }
  crash() { this.noise(0.5, 0.5, 600); this.tone(90, 0.4, 'sawtooth', 0.2, 0.4); }
  bump() { this.noise(0.15, 0.2, 400); }
  whoosh() { this.noise(0.25, 0.18, 2500); }
  click() { this.tone(660, 0.05, 'square', 0.05); }
  success() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.25, 'triangle', 0.14), i * 90)); }
  levelUp() { [392, 523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => this.tone(f, 0.3, 'square', 0.07), i * 70)); }
  power() { this.tone(300, 0.4, 'sawtooth', 0.12, 4); }
}
