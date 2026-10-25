// Shared material library. Both graphics modes use the same materials; Photoreal adds PBR maps
// (Poly Haven CC0 scans) and richer reflections, Rendered keeps lighter procedural textures.
import * as THREE from 'three';
import type { GraphicsMode } from '../core/Save';

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
    const m = new THREE.MeshStandardMaterial({ map, roughnessMap: rm, metalnessMap: rm, roughness: 1, metalness: 1 });
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
    const all = new Set([...this.lightMaps.keys(), ...this.photoMaps.keys()]);
    for (const m of all) {
      const set = (mode === 'photoreal' && this.photoMaps.get(m)) || this.lightMaps.get(m) || {};
      m.map = set.map ?? null;
      m.normalMap = set.normalMap ?? null;
      if (!m.metalnessMap) m.roughnessMap = set.roughnessMap ?? null;
      m.normalScale.set(1, 1);
      m.needsUpdate = true;
    }
    this.asphalt.color.set(mode === 'photoreal' ? 0x9a9a9a : 0xffffff);
    this.asphalt.roughness = 1;
    this.foliage.flatShading = mode !== 'photoreal';
    this.foliage.needsUpdate = true;
  }
}

function hexRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
