// Procedural engine drone + one-shot effects, plus streamed CC0 music (public/music, see ASSETS.md).
import { tracksFor, type RadioTrack, type StationId } from '../data/radio';

export type MusicScene = 'menu' | 'city' | 'arcade' | 'arcade-climax' | null;

const PLAYLISTS: Record<Exclude<MusicScene, null>, string[]> = {
  menu: ['music/menu_families.mp3'],
  city: [], // the car radio picks city music (data/radio.ts)
  arcade: ['music/arcade_cool_highway.mp3'],
  'arcade-climax': ['music/arcade_cool_highway_climax.mp3'],
};

/** One streamed track routed through the music bus, with its own fade gain. */
interface Track { el: HTMLAudioElement; gain: GainNode; scene: MusicScene }

export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private engOsc!: OscillatorNode;
  private engOsc2!: OscillatorNode;
  private engGain!: GainNode;
  private engBus!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private vol = { master: 0.8, engine: 0.7, sfx: 0.8, music: 0.6 };
  private track: Track | null = null;
  private scene: MusicScene = null;
  /** Car radio station used for the 'city' scene. */
  private station: StationId = 'drive';
  /** The radio track playing now (city scene only). */
  nowPlaying: RadioTrack | null = null;
  private cityIndex = Math.floor(Math.random() * PLAYLISTS.city.length);
  /** Platform pauses (ad breaks, hidden tab) silence everything without touching the settings. */
  private suspended = false;
  private engFilter!: BiquadFilterNode;
  private loops: Record<'city' | 'rain' | 'skid', GainNode> | null = null;
  enabled = true;

  /** Must be called from a user gesture. */
  unlock() {
    if (this.ctx) { this.ctx.resume(); return; }
    try { this.ctx = new AudioContext(); } catch { return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.connect(c.destination);
    this.engBus = c.createGain(); this.engBus.connect(this.master);
    this.sfxBus = c.createGain(); this.sfxBus.connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.connect(this.master);
    this.applyVolume();
    this.engFilter = c.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 600;
    this.engGain = c.createGain(); this.engGain.gain.value = 0;
    this.engOsc = c.createOscillator(); this.engOsc.type = 'sawtooth';
    this.engOsc2 = c.createOscillator(); this.engOsc2.type = 'square';
    this.engOsc.connect(this.engFilter); this.engOsc2.connect(this.engFilter);
    this.engFilter.connect(this.engGain); this.engGain.connect(this.engBus);
    this.engOsc.start(); this.engOsc2.start();
    this.loops = { city: this.noiseLoop('lowpass', 320, 0.7), rain: this.noiseLoop('highpass', 1400, 0.5), skid: this.noiseLoop('bandpass', 1150, 7) };
    const want = this.scene;
    this.scene = null;
    this.music(want);
  }

  setEnabled(on: boolean) { this.enabled = on; this.applyVolume(); }

  /** 0..1 levels; master is perceptually scaled. */
  setVolume(v: { master: number; engine: number; sfx: number; music?: number }) { this.vol = { ...this.vol, ...v }; this.applyVolume(); }

  /** Silences all audio (and pauses music) for ad breaks or a hidden tab. */
  setSuspended(on: boolean) {
    this.suspended = on;
    if (!this.ctx) return;
    if (on) { this.track?.el.pause(); this.ctx.suspend(); }
    else { this.ctx.resume(); this.track?.el.play().catch(() => {}); }
  }

  /** Crossfades to the music for a scene (null = silence). Safe to call every time the scene changes. */
  music(scene: MusicScene) {
    if (scene === this.scene) return;
    this.scene = scene;
    if (!this.ctx) return; // started on unlock()
    const old = this.track;
    this.track = null;
    if (old) this.fadeOut(old, scene === 'arcade-climax' ? 0.6 : 1.2);
    this.nowPlaying = null;
    if (!scene) return;
    let src: string;
    if (scene === 'city') {
      const list = tracksFor(this.station);
      if (!list.length) return; // radio off
      this.nowPlaying = list[this.cityIndex++ % list.length];
      src = this.nowPlaying.file;
    } else src = PLAYLISTS[scene][0];
    const el = new window.Audio(src);
    el.crossOrigin = 'anonymous';
    el.loop = scene !== 'city';
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    this.ctx.createMediaElementSource(el).connect(gain);
    gain.connect(this.musicBus);
    const t: Track = { el, gain, scene };
    // the city playlist moves on to the next track when one ends
    el.addEventListener('ended', () => { if (this.track === t) { this.scene = null; this.music('city'); } });
    this.track = t;
    if (!this.suspended) el.play().catch(() => {});
    gain.gain.setTargetAtTime(1, this.ctx.currentTime, scene === 'arcade-climax' ? 0.15 : 0.5);
  }

  /** Tunes the car radio; restarts the music if we're driving in the city. */
  setStation(s: StationId) {
    if (s === this.station) return;
    this.station = s;
    this.cityIndex = 0;
    if (this.scene === 'city') { this.scene = null; this.music('city'); }
  }
  get currentStation() { return this.station; }

  private fadeOut(t: Track, secs: number) {
    t.gain.gain.setTargetAtTime(0, this.ctx!.currentTime, secs / 4);
    setTimeout(() => { t.el.pause(); t.el.src = ''; t.gain.disconnect(); }, secs * 1000 + 200);
  }

  private applyVolume() {
    if (!this.master) return;
    const t = this.ctx!.currentTime;
    this.master.gain.setTargetAtTime(this.enabled ? Math.pow(this.vol.master, 2) * 0.9 : 0, t, 0.02);
    this.engBus.gain.setTargetAtTime(this.vol.engine * 1.4, t, 0.02);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, t, 0.02);
    this.musicBus.gain.setTargetAtTime(Math.pow(this.vol.music, 2) * 0.8, t, 0.05);
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

  /** Looping filtered noise feeding the effects bus (ambience beds and tyre squeal). */
  private noiseLoop(type: BiquadFilterType, freq: number, q: number) {
    const c = this.ctx!;
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      // a little brown-noise weighting for the low beds
      last = type === 'lowpass' ? (last + 0.02 * w) / 1.02 : w;
      d[i] = type === 'lowpass' ? last * 3.5 : w;
    }
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(this.sfxBus); src.start();
    return g;
  }

  /** Background beds: city hum (0..1) and rain (0..1). */
  ambience(city: number, rain: number) {
    if (!this.loops) return;
    const t = this.ctx!.currentTime;
    this.loops.city.gain.setTargetAtTime(city * 0.05, t, 0.6);
    this.loops.rain.gain.setTargetAtTime(rain * 0.06, t, 0.6);
  }

  /** Tyre squeal, 0..1 (sliding, hard braking, cornering at the limit). */
  skid(amount: number) {
    if (!this.loops) return;
    this.loops.skid.gain.setTargetAtTime(Math.min(1, amount) * 0.09, this.ctx!.currentTime, 0.06);
  }

  /** Two-note door chime when a passenger gets in or out. */
  chime() { this.tone(988, 0.22, 'sine', 0.12); setTimeout(() => this.tone(784, 0.35, 'sine', 0.1), 140); }

  /** Cash-register style payout. */
  cash() { this.noise(0.06, 0.15, 5000); [1568, 2093].forEach((f, i) => setTimeout(() => this.tone(f, 0.2, 'triangle', 0.1), 50 + i * 70)); }

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
