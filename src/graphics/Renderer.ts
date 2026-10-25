// Renderer, environment lighting, post-processing and the two player-facing graphics modes.
import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import type { GraphicsMode } from '../core/Save';

interface Preset {
  maxPixelRatio: number;
  shadowSize: number;
  shadowType: THREE.ShadowMapType;
  post: boolean;
  fogDensity: number;
  exposure: number;
  shadowSpan: number;
}

const PRESETS: Record<GraphicsMode, Preset> = {
  photoreal: { maxPixelRatio: 2, shadowSize: 4096, shadowType: THREE.PCFSoftShadowMap, post: true, fogDensity: 0.0016, exposure: 0.9, shadowSpan: 90 },
  rendered: { maxPixelRatio: 1.25, shadowSize: 1024, shadowType: THREE.PCFShadowMap, post: false, fogDensity: 0.0026, exposure: 1.0, shadowSpan: 70 },
};

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
  readonly hemi = new THREE.HemisphereLight(0xbfd9ff, 0x4a4136, 0.35);
  mode: GraphicsMode = 'rendered';
  private preset = PRESETS.rendered;
  private composer: EffectComposer | null = null;
  private gtao: GTAOPass | null = null;
  private envs: Partial<Record<GraphicsMode, THREE.Texture>> = {};
  private backgrounds: Partial<Record<GraphicsMode, THREE.Texture>> = {};
  private sunDir = new THREE.Vector3(0.45, 0.62, 0.35).normalize();
  private pixelScale = 1;
  private frameTimes: number[] = [];
  private camera: THREE.PerspectiveCamera | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.scene.fog = new THREE.FogExp2(0xc9d6e2, 0.002);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target, this.hemi);
    addEventListener('resize', () => this.resize());
  }

  /** Loads the HDRI sky for both modes (1k for Rendered, 2k for Photoreal). Falls back to a procedural sky. */
  async loadEnvironment(onProgress?: (f: number) => void) {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const loader = new RGBELoader();
    const load = (url: string) => new Promise<THREE.DataTexture>((res, rej) => loader.load(url, res, undefined, rej));
    try {
      const lo = await load('assets/hdri/sky_1k.hdr');
      onProgress?.(0.5);
      lo.mapping = THREE.EquirectangularReflectionMapping;
      this.sunDir = findSun(lo) ?? this.sunDir;
      this.envs.rendered = pmrem.fromEquirectangular(lo).texture;
      this.backgrounds.rendered = lo;
      const hi = await load('assets/hdri/sky_2k.hdr').catch(() => lo);
      hi.mapping = THREE.EquirectangularReflectionMapping;
      this.envs.photoreal = pmrem.fromEquirectangular(hi).texture;
      this.backgrounds.photoreal = hi;
    } catch (e) {
      console.warn('HDRI unavailable, using procedural sky', e);
      const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
      const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      this.envs.rendered = this.envs.photoreal = env;
      this.scene.background = new THREE.Color(0x9cc3e6);
    }
    pmrem.dispose();
    onProgress?.(1);
    this.applyMode();
  }

  setMode(mode: GraphicsMode) {
    this.mode = mode;
    this.preset = PRESETS[mode];
    this.pixelScale = 1;
    this.applyMode();
  }

  private applyMode() {
    const p = this.preset;
    const env = this.envs[this.mode];
    if (env) this.scene.environment = env;
    const bg = this.backgrounds[this.mode];
    if (bg) this.scene.background = bg;
    this.scene.environmentIntensity = this.mode === 'photoreal' ? 1.0 : 0.85;
    this.scene.backgroundIntensity = 0.85;
    (this.scene.fog as THREE.FogExp2).density = p.fogDensity;
    this.renderer.toneMappingExposure = p.exposure;
    this.renderer.toneMapping = this.mode === 'photoreal' ? THREE.AgXToneMapping : THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.type = p.shadowType;
    this.sun.shadow.mapSize.set(p.shadowSize, p.shadowSize);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null as any;
    const s = p.shadowSpan;
    Object.assign(this.sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 400 });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.intensity = this.mode === 'photoreal' ? 3.6 : 3.0;
    this.hemi.intensity = this.mode === 'photoreal' ? 0.15 : 0.4;
    this.scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; });
    this.composer = null; // rebuilt lazily
    this.resize();
  }

  private buildComposer(camera: THREE.PerspectiveCamera) {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const c = new EffectComposer(this.renderer);
    c.addPass(new RenderPass(this.scene, camera));
    this.gtao = new GTAOPass(this.scene, camera, size.x, size.y);
    this.gtao.blendIntensity = 0.85;
    this.gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.5, scale: 1, samples: 12 });
    c.addPass(this.gtao);
    c.addPass(new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.22, 0.5, 0.92));
    c.addPass(new OutputPass());
    c.addPass(new SMAAPass(size.x, size.y));
    this.composer = c;
    this.camera = camera;
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, this.preset.maxPixelRatio) * this.pixelScale;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(innerWidth, innerHeight, false);
    if (this.composer) { this.composer.setPixelRatio(dpr); this.composer.setSize(innerWidth, innerHeight); }
  }

  /** Keeps the shadow frustum centred on the player and aligned with the HDRI sun. */
  followSun(focus: THREE.Vector3) {
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 160);
    this.sun.target.position.copy(focus);
    // Snap to shadow texels to avoid shimmering.
    const texel = (this.preset.shadowSpan * 2) / this.preset.shadowSize;
    this.sun.target.position.x = Math.round(focus.x / texel) * texel;
    this.sun.target.position.z = Math.round(focus.z / texel) * texel;
  }

  render(camera: THREE.PerspectiveCamera, dt: number) {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    if (this.preset.post) {
      if (!this.composer || this.camera !== camera) { this.buildComposer(camera); this.resize(); }
      this.composer!.render(dt);
    } else {
      this.renderer.render(this.scene, camera);
    }
    this.adapt(dt);
  }

  /** Adaptive resolution: drop render scale when frame time is high, recover when there's headroom. */
  private adapt(dt: number) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 45) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    const prev = this.pixelScale;
    if (avg > 1 / 40 && this.pixelScale > 0.55) this.pixelScale = Math.max(0.55, this.pixelScale - 0.1);
    else if (avg < 1 / 57 && this.pixelScale < 1) this.pixelScale = Math.min(1, this.pixelScale + 0.05);
    if (prev !== this.pixelScale) this.resize();
  }

  get stats() { return { scale: this.pixelScale, calls: this.renderer.info.render.calls, tris: this.renderer.info.render.triangles }; }
}

/** Finds the brightest direction in an equirectangular HDR (the sun) so shadows match the sky. */
function findSun(tex: THREE.DataTexture): THREE.Vector3 | null {
  const { data, width, height } = tex.image as { data: ArrayLike<number>; width: number; height: number };
  if (!data || !width) return null;
  const isHalf = data instanceof Uint16Array;
  const read = (i: number) => (isHalf ? THREE.DataUtils.fromHalfFloat((data as Uint16Array)[i]) : (data as Float32Array)[i]);
  let best = -1, bx = 0, by = 0;
  for (let y = 0; y < height / 2; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4;
      const l = read(i) + read(i + 1) + read(i + 2);
      if (l > best) { best = l; bx = x; by = y; }
    }
  }
  const u = (bx + 0.5) / width;
  const el = Math.max(0.35, (0.5 - (by + 0.5) / height) * Math.PI); // keep shadows a sensible length
  const az = (u - 0.5) * Math.PI * 2;
  return new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize();
}
