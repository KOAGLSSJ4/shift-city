// Shared material library. Both graphics modes use the same materials; Photoreal adds PBR maps
// (Poly Haven CC0 scans) and richer reflections, Rendered keeps lighter procedural textures.
import * as THREE from 'three';
import type { GraphicsMode, TimeOfDay, Weather } from '../core/Save';

type MapSet = { map?: THREE.Texture; normalMap?: THREE.Texture; roughnessMap?: THREE.Texture };

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function noiseFill(g: CanvasRenderingContext2D, w: number, h: number, base: [number, number, number], amp: number, n = 9000) {
  g.fillStyle = `rgb(${base.join(',')})`; g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const v = (Math.random() - 0.5) * amp;
    g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 255})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

export interface FacadeStyle { base: string; trim: string; glass: string; cols: number; glassy: boolean; bands: boolean }

const FACADES: FacadeStyle[] = [
  { base: '#d8d2c6', trim: '#b9b1a3', glass: '#30404e', cols: 2, glassy: false, bands: true },   // limestone office
  { base: '#9a5a44', trim: '#7d4535', glass: '#2a3540', cols: 2, glassy: false, bands: false },  // brick
  { base: '#6f7b86', trim: '#59636d', glass: '#1e2c3a', cols: 3, glassy: true, bands: false },   // glass tower
  { base: '#e9e6e0', trim: '#cfcac0', glass: '#34495a', cols: 2, glassy: false, bands: true },   // white residential
  { base: '#3c4148', trim: '#2c3036', glass: '#22323f', cols: 4, glassy: true, bands: true },    // dark glass
  { base: '#c49a6c', trim: '#a37d55', glass: '#2b3843', cols: 2, glassy: false, bands: false },  // sandstone
];

export class Materials {
  private loader = new THREE.TextureLoader();
  private photoMaps = new Map<THREE.MeshStandardMaterial, MapSet>();
  private lightMaps = new Map<THREE.MeshStandardMaterial, MapSet>();
  readonly asphalt: THREE.MeshStandardMaterial;
  readonly sidewalk: THREE.MeshStandardMaterial;
  readonly curb = new THREE.MeshStandardMaterial({ color: 0xb8b5ae, roughness: 0.85 });
  readonly grass: THREE.MeshStandardMaterial;
  readonly paintWhite = new THREE.MeshStandardMaterial({ color: 0xf2f2ea, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
  readonly paintYellow = new THREE.MeshStandardMaterial({ color: 0xf0c330, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
  readonly roof: THREE.MeshStandardMaterial;
  readonly metal = new THREE.MeshStandardMaterial({ color: 0x3a3f45, metalness: 0.8, roughness: 0.4 });
  readonly darkMetal = new THREE.MeshStandardMaterial({ color: 0x1d2024, metalness: 0.6, roughness: 0.5 });
  readonly foliage = new THREE.MeshStandardMaterial({ color: 0x3f6b2e, roughness: 0.9, flatShading: true });
  readonly trunk = new THREE.MeshStandardMaterial({ color: 0x5a4532, roughness: 1 });
  readonly facades: THREE.MeshStandardMaterial[];
  readonly lampGlow = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2cc, emissiveIntensity: 0.6 });
  readonly shopfronts: THREE.MeshStandardMaterial[];
  readonly leaves: THREE.MeshStandardMaterial;
  readonly lampPool = new THREE.MeshBasicMaterial({ color: 0xffc98a, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false });
  private puddles: THREE.Texture;
  private mode: GraphicsMode = 'rendered';
  private weather: Weather = 'dry';

  constructor() {
    const asphaltLite = canvasTex(256, 256, (g) => noiseFill(g, 256, 256, [62, 65, 70], 60, 12000));
    this.asphalt = new THREE.MeshStandardMaterial({ map: asphaltLite, color: 0xffffff, roughness: 0.92 });
    const walkLite = canvasTex(256, 256, (g) => {
      noiseFill(g, 256, 256, [170, 168, 160], 30, 4000);
      g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2;
      for (let i = 0; i <= 256; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
    });
    this.sidewalk = new THREE.MeshStandardMaterial({ map: walkLite, roughness: 0.9 });
    const grassLite = canvasTex(256, 256, (g) => noiseFill(g, 256, 256, [78, 112, 56], 50, 15000));
    this.grass = new THREE.MeshStandardMaterial({ map: grassLite, roughness: 1 });
    const roofLite = canvasTex(128, 128, (g) => noiseFill(g, 128, 128, [120, 122, 124], 40, 3000));
    this.roof = new THREE.MeshStandardMaterial({ map: roofLite, roughness: 0.95 });
    this.lightMaps.set(this.asphalt, { map: asphaltLite });
    this.lightMaps.set(this.sidewalk, { map: walkLite });
    this.lightMaps.set(this.grass, { map: grassLite });
    this.lightMaps.set(this.roof, { map: roofLite });
    this.facades = FACADES.map((f) => this.makeFacade(f));
    this.shopfronts = ['#b8432f', '#2f6db8', '#2f9a6a', '#c9a227', '#7a3fb0', '#d0d0d0'].map((c) => this.makeShopfront(c));
    this.leaves = new THREE.MeshStandardMaterial({ map: leafTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75, color: 0xb8c8a0 });
    this.puddles = canvasTex(512, 512, (g) => {
      // roughness (G channel): a uniform damp sheen with soft, irregular standing water
      g.fillStyle = 'rgb(0,95,0)'; g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 9; i++) {
        const cx = Math.random() * 512, cy = Math.random() * 512;
        for (let k = 0; k < 14; k++) {
          const x = cx + (Math.random() - 0.5) * 120, y = cy + (Math.random() - 0.5) * 60, r = 18 + Math.random() * 40;
          const grd = g.createRadialGradient(x, y, 0, x, y, r);
          grd.addColorStop(0, 'rgba(0,10,0,0.55)'); grd.addColorStop(1, 'rgba(0,10,0,0)');
          g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
        }
      }
      for (let i = 0; i < 6000; i++) { g.fillStyle = `rgba(0,${Math.random() < 0.5 ? 60 : 130},0,0.12)`; g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2); }
    }, false);
  }

  /** Ground-floor shops: one tile = 8 m wide x 4.5 m tall. Emissive glass lights up at night. */
  private makeShopfront(sign: string) {
    const W = 512, H = 288;
    const draw = (g: CanvasRenderingContext2D, lit: boolean) => {
      g.fillStyle = lit ? '#000' : '#3a3d42'; g.fillRect(0, 0, W, H);
      g.fillStyle = lit ? '#000' : sign; g.fillRect(0, 0, W, 54);
      if (!lit) { g.fillStyle = 'rgba(255,255,255,0.85)'; g.font = 'bold 30px sans-serif'; g.fillText(['CAFÉ', 'MARKET', 'BAKERY', 'PHARMACY', 'BOUTIQUE', 'DELI'][Math.floor(Math.random() * 6)], 24, 38); }
      const panes = [[16, 70, 300, 200], [330, 70, 70, 200], [414, 70, 82, 200]];
      panes.forEach(([x, y, w, h], i) => {
        if (lit) { const grd = g.createLinearGradient(0, y, 0, y + h); grd.addColorStop(0, '#ffe2b0'); grd.addColorStop(1, '#c98a4a'); g.fillStyle = i === 1 ? '#6a4a2a' : grd; }
        else { const grd = g.createLinearGradient(0, y, 0, y + h); grd.addColorStop(0, '#4a5d6c'); grd.addColorStop(1, '#141c24'); g.fillStyle = grd; }
        g.fillRect(x, y, w, h);
        if (!lit && i !== 1) { g.fillStyle = 'rgba(220,210,190,0.18)'; for (let k = 0; k < 6; k++) g.fillRect(x + 10 + Math.random() * (w - 40), y + h * 0.55, 18, h * 0.45 * Math.random()); }
      });
      if (lit) { g.fillStyle = sign; g.fillRect(16, 12, 220, 30); }
    };
    const map = canvasTex(W, H, (g) => draw(g, false));
    const emissiveMap = canvasTex(W, H, (g) => draw(g, true));
    const rm = canvasTex(W, H, (g) => { g.fillStyle = 'rgb(0,200,0)'; g.fillRect(0, 0, W, H); g.fillStyle = 'rgb(0,20,160)'; [[16, 70, 300, 200], [414, 70, 82, 200]].forEach(([x, y, w, h]) => g.fillRect(x, y, w, h)); }, false);
    const m = new THREE.MeshStandardMaterial({ map, emissiveMap, emissive: 0xffffff, emissiveIntensity: 0, roughnessMap: rm, metalnessMap: rm, roughness: 1, metalness: 1 });
    this.lightMaps.set(m, { map });
    return m;
  }

  /** One texture tile = one window bay (4 m wide x 3.5 m tall). */
  private makeFacade(f: FacadeStyle) {
    const S = 256;
    const map = canvasTex(S, S, (g) => {
      noiseFill(g, S, S, hexRgb(f.base), 18, 1500);
      if (f.bands) { g.fillStyle = f.trim; g.fillRect(0, S * 0.84, S, S * 0.16); }
      const cw = S / f.cols;
      for (let c = 0; c < f.cols; c++) {
        const x0 = c * cw + (f.glassy ? 3 : cw * 0.16), w = f.glassy ? cw - 6 : cw * 0.68;
        const y0 = f.glassy ? 6 : S * 0.14, h = f.glassy ? S * 0.78 : S * 0.6;
        g.fillStyle = f.trim; g.fillRect(x0 - 4, y0 - 4, w + 8, h + 8);
        const grd = g.createLinearGradient(0, y0, 0, y0 + h);
        grd.addColorStop(0, f.glass); grd.addColorStop(1, '#0f171f');
        g.fillStyle = grd; g.fillRect(x0, y0, w, h);
        // curtains / interior variation
        if (Math.random() < 0.5) { g.fillStyle = `rgba(230,220,200,${0.15 + Math.random() * 0.25})`; g.fillRect(x0, y0, w * Math.random(), h * 0.4); }
        g.fillStyle = f.trim; g.fillRect(x0 + w / 2 - 1.5, y0, 3, h);
      }
    });
    // roughness in G, metalness in B: glass is smooth and reflective, walls are rough.
    const rm = canvasTex(S, S, (g) => {
      g.fillStyle = 'rgb(0,235,0)'; g.fillRect(0, 0, S, S);
      const cw = S / f.cols;
      for (let c = 0; c < f.cols; c++) {
        const x0 = c * cw + (f.glassy ? 3 : cw * 0.16), w = f.glassy ? cw - 6 : cw * 0.68;
        const y0 = f.glassy ? 6 : S * 0.14, h = f.glassy ? S * 0.78 : S * 0.6;
        g.fillStyle = 'rgb(0,18,200)'; g.fillRect(x0, y0, w, h);
      }
    }, false);
    // night: a random subset of windows glows warm/cool
    const em = canvasTex(S, S * 4, (g) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, S, S * 4);
      const cw = S / f.cols;
      for (let row = 0; row < 4; row++) for (let c = 0; c < f.cols; c++) {
        if (Math.random() < 0.45) continue;
        const x0 = c * cw + (f.glassy ? 3 : cw * 0.16), w = f.glassy ? cw - 6 : cw * 0.68;
        const y0 = row * S + (f.glassy ? 6 : S * 0.14), h = f.glassy ? S * 0.78 : S * 0.6;
        const warm = Math.random() < 0.75;
        g.fillStyle = warm ? `rgb(${230 + Math.random() * 25},${170 + Math.random() * 40},${90 + Math.random() * 40})` : 'rgb(170,200,255)';
        g.globalAlpha = 0.35 + Math.random() * 0.65;
        g.fillRect(x0, y0, w, h);
        g.globalAlpha = 1;
      }
    });
    em.repeat.set(1, 0.25);
    const m = new THREE.MeshStandardMaterial({ map, roughnessMap: rm, metalnessMap: rm, roughness: 1, metalness: 1, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0 });
    this.lightMaps.set(m, { map });
    return m;
  }

  /** Loads Poly Haven scans. Missing files just leave the procedural textures in place. */
  async loadPhotoreal() {
    const load = (name: string, srgb: boolean, rep: number) => new Promise<THREE.Texture | undefined>((res) => {
      this.loader.load(`assets/textures/${name}.jpg`, (t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.repeat.set(rep, rep);
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        res(t);
      }, undefined, () => res(undefined));
    });
    const set = async (id: string, rep: number): Promise<MapSet> => {
      const [map, normalMap, roughnessMap] = await Promise.all([load(`${id}_diff`, true, rep), load(`${id}_nor_gl`, false, rep), load(`${id}_rough`, false, rep)]);
      return { map, normalMap, roughnessMap };
    };
    const [asphalt, walk, wall, brick] = await Promise.all([set('asphalt_02', 1), set('concrete_pavers_02', 1), set('concrete_wall_008', 1), set('brick_wall_02', 1)]);
    this.photoMaps.set(this.asphalt, asphalt);
    this.photoMaps.set(this.sidewalk, walk);
    this.photoMaps.set(this.roof, { map: wall.map, normalMap: wall.normalMap, roughnessMap: wall.roughnessMap });
    // Facades keep their window-bay albedo but gain scanned surface detail via normal maps at a finer repeat.
    this.facades.forEach((m, i) => {
      const src = i === 1 || i === 5 ? brick : wall;
      const n = src.normalMap?.clone();
      if (n) { n.repeat.set(2, 2); n.needsUpdate = true; }
      this.photoMaps.set(m, { map: this.lightMaps.get(m)!.map, normalMap: n });
    });
  }

  setMode(mode: GraphicsMode) {
    this.mode = mode;
    const real = mode !== 'rendered';
    const all = new Set([...this.lightMaps.keys(), ...this.photoMaps.keys()]);
    for (const m of all) {
      const set = (real && this.photoMaps.get(m)) || this.lightMaps.get(m) || {};
      m.map = set.map ?? null;
      m.normalMap = set.normalMap ?? null;
      if (!m.metalnessMap) m.roughnessMap = set.roughnessMap ?? null;
      m.normalScale.set(1, 1);
      m.needsUpdate = true;
    }
    this.foliage.flatShading = !real;
    this.foliage.needsUpdate = true;
    this.setWeather(this.weather);
  }

  /** Wet roads: darker albedo, standing-water puddles that mirror the sky and sun. */
  setWeather(w: Weather) {
    this.weather = w;
    const real = this.mode !== 'rendered', wet = w !== 'dry';
    const base = this.photoMaps.get(this.asphalt);
    this.asphalt.roughnessMap = wet ? this.puddles : real ? base?.roughnessMap ?? null : null;
    this.asphalt.color.set(wet ? (real ? 0x5a5a5e : 0xb0b0b8) : real ? 0x9a9a9a : 0xffffff);
    this.asphalt.roughness = wet ? 1 : 1;
    this.asphalt.envMapIntensity = wet ? 1.6 : 1;
    this.asphalt.normalScale.set(wet ? 0.5 : 1, wet ? 0.5 : 1);
    this.sidewalk.roughness = wet ? 0.45 : 0.9;
    this.sidewalk.color.set(wet ? 0x8a8a8a : 0xffffff);
    this.paintWhite.roughness = this.paintYellow.roughness = wet ? 0.25 : 0.6;
    for (const m of [this.asphalt, this.sidewalk]) m.needsUpdate = true;
  }

  setTime(t: TimeOfDay) {
    const k = t === 'night' ? 1 : t === 'sunset' ? 0.12 : 0;
    this.facades.forEach((m) => (m.emissiveIntensity = 0.9 * k));
    this.shopfronts.forEach((m) => (m.emissiveIntensity = t === 'night' ? 0.7 : t === 'sunset' ? 0.25 : 0));
    this.lampGlow.emissiveIntensity = t === 'night' ? 8 : t === 'sunset' ? 2 : 0.4;
    this.lampPool.opacity = t === 'night' ? 0.3 : t === 'sunset' ? 0.06 : 0;
  }
}

/** Alpha-tested foliage card: clusters of leaves with light/dark variation. */
function leafTexture() {
  return canvasTex(256, 256, (g) => {
    g.clearRect(0, 0, 256, 256);
    for (let i = 0; i < 520; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.pow(Math.random(), 0.6) * 118;
      const x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r * 0.9;
      const shade = 0.55 + Math.random() * 0.45 - (r / 118) * 0.15;
      g.fillStyle = `rgb(${Math.round(70 * shade)},${Math.round(118 * shade)},${Math.round(48 * shade)})`;
      g.save(); g.translate(x, y); g.rotate(Math.random() * 6.3);
      g.beginPath(); g.ellipse(0, 0, 7 + Math.random() * 5, 3 + Math.random() * 2, 0, 0, 7); g.fill();
      g.restore();
    }
  });
}

function hexRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
