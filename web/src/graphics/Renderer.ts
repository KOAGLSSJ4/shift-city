// Renderer, environment lighting, post-processing and the player-facing graphics tiers.
// Rendered = light and fast, Photoreal = PBR scans + HDRI + bloom, Hyper-real = everything plus AO,
// cinematic grade/lens effects, live car reflections and lens flare. All tiers share one world.
import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { Lensflare, LensflareElement } from 'three/examples/jsm/objects/Lensflare.js';
import type { GraphicsMode, TimeOfDay, Weather } from '../core/Save';
import { binaryUrl } from '../core/AssetUrl';
import { PlanarReflection, puddleUniforms } from './PuddleReflection';
import { WindscreenRainShader } from './WindscreenRain';

interface Preset {
  maxPixelRatio: number;
  shadowSize: number;
  shadowType: THREE.ShadowMapType;
  shadowSpan: number;
  shadowEvery: number;   // update the shadow map every N frames
  post: 'none' | 'bloom' | 'full';
  hdri: '1k' | '2k';
  minScale: number;
}

const PRESETS: Record<GraphicsMode, Preset> = {
  rendered: { maxPixelRatio: 1, shadowSize: 1024, shadowType: THREE.PCFShadowMap, shadowSpan: 60, shadowEvery: 2, post: 'none', hdri: '1k', minScale: 0.6 },
  photoreal: { maxPixelRatio: 1.25, shadowSize: 2048, shadowType: THREE.PCFSoftShadowMap, shadowSpan: 70, shadowEvery: 2, post: 'bloom', hdri: '1k', minScale: 0.55 },
  hyper: { maxPixelRatio: 2, shadowSize: 4096, shadowType: THREE.PCFSoftShadowMap, shadowSpan: 70, shadowEvery: 1, post: 'full', hdri: '2k', minScale: 0.5 },
};

interface Atmos { fog: number; fogDensity: number; exposure: number; sunColor: number; sunIntensity: number; hemi: number; env: number; bg: number; minElevation: number }
const ATMOS: Record<TimeOfDay, Atmos> = {
  day: { fog: 0xc9d6e2, fogDensity: 0.0016, exposure: 0.95, sunColor: 0xfff1dc, sunIntensity: 3.4, hemi: 0.2, env: 1, bg: 0.9, minElevation: 0.45 },
  sunset: { fog: 0xc89878, fogDensity: 0.0018, exposure: 0.95, sunColor: 0xffb070, sunIntensity: 3.0, hemi: 0.12, env: 0.9, bg: 1, minElevation: 0.16 },
  night: { fog: 0x0c1018, fogDensity: 0.003, exposure: 0.9, sunColor: 0x8fa8ff, sunIntensity: 0.25, hemi: 0.04, env: 0.22, bg: 0.35, minElevation: 0.7 },
};

const HDRI_FILES: Record<TimeOfDay, string> = { day: 'sky', sunset: 'sunset', night: 'night' };

/** Colour grade, vignette, film grain, chromatic aberration and speed blur (runs after tone mapping). */
const CinematicShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uSpeed: { value: 0 },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uVignette: { value: 0.35 },
    uGrain: { value: 0.035 },
    uWet: { value: 0 },
  },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime, uSpeed, uVignette, uGrain, uWet; uniform vec3 uTint;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5;
      float r = length(c);
      // radial speed blur, strongest at the screen edges
      float blur = uSpeed * smoothstep(0.15, 0.7, r) * 0.06;
      vec3 col = vec3(0.0);
      for (int i = 0; i < 6; i++) {
        float t = float(i) / 5.0;
        vec2 uv = vUv - c * blur * t;
        // subtle chromatic aberration grows toward the edges
        float ca = 0.0012 + r * 0.002;
        col += vec3(texture2D(tDiffuse, uv + c * ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - c * ca).b);
      }
      col /= 6.0;
      // grade: gentle S-curve + tint + slight saturation boost
      col = col * uTint;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, 1.12 - uWet * 0.1);
      col = col * col * (3.0 - 2.0 * col) * 0.35 + col * 0.65;
      // vignette + grain
      col *= 1.0 - uVignette * smoothstep(0.35, 0.85, r);
      col += (hash(vUv * 900.0 + uTime) - 0.5) * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
  readonly hemi = new THREE.HemisphereLight(0xbfd9ff, 0x4a4136, 0.35);
  mode: GraphicsMode = 'rendered';
  time: TimeOfDay = 'day';
  weather: Weather = 'dry';
  /** Called once when the device can't keep up even at the lowest render scale. */
  onSlow: (() => void) | null = null;
  fps = 60;
  speed01 = 0;
  private preset = PRESETS.rendered;
  private composer: EffectComposer | null = null;
  private cinematic: ShaderPass | null = null;
  private envCache = new Map<string, Promise<{ env: THREE.Texture; bg: THREE.Texture; sun: THREE.Vector3 } | null>>();
  private pmrem: THREE.PMREMGenerator;
  private sunDir = new THREE.Vector3(0.45, 0.62, 0.35).normalize();
  private rawSunDir = this.sunDir.clone();
  private pixelScale = 1;
  private frameTimes: number[] = [];
  private slowWindows = 0;
  private frame = 0;
  private camera: THREE.PerspectiveCamera | null = null;
  private flare: Lensflare;
  private flareAnchor = new THREE.Object3D();
  private cube: THREE.CubeCamera;
  private cubeTarget: THREE.WebGLCubeRenderTarget;
  private fpsAcc = 0; private fpsN = 0;
  readonly reflection = new PlanarReflection();
  private windscreen: ShaderPass | null = null;
  /** Cockpit rain on the glass: amount (0 = off) and the dashboard line in screen space. */
  cockpitRain = { amount: 0, dashY: 0.3 };

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.fog = new THREE.FogExp2(0xc9d6e2, 0.002);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target, this.hemi);
    // lens flare on the sun (Hyper-real only)
    this.flare = new Lensflare();
    const glow = flareTexture(256, true), ring = flareTexture(128, false);
    this.flare.addElement(new LensflareElement(glow, 420, 0, new THREE.Color(1, 0.92, 0.8)));
    this.flare.addElement(new LensflareElement(ring, 60, 0.4, new THREE.Color(0.6, 0.8, 1)));
    this.flare.addElement(new LensflareElement(ring, 90, 0.65, new THREE.Color(1, 0.7, 0.5)));
    this.flare.addElement(new LensflareElement(ring, 130, 0.9, new THREE.Color(0.5, 1, 0.7)));
    this.flareAnchor.add(this.flare);
    this.scene.add(this.flareAnchor);
    this.flare.visible = false;
    // live reflections for the player's car paint (Hyper-real only)
    this.cubeTarget = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    this.cube = new THREE.CubeCamera(0.5, 400, this.cubeTarget);
    addEventListener('resize', () => this.resize());
  }

  private loadEnv(time: TimeOfDay, res: '1k' | '2k') {
    const key = `${time}_${res}`;
    if (!this.envCache.has(key)) {
      this.envCache.set(key, (async () => {
        try {
          const url = await binaryUrl(`assets/hdri/${HDRI_FILES[time]}_${res}.hdr`);
          const tex = await new RGBELoader().loadAsync(url);
          tex.mapping = THREE.EquirectangularReflectionMapping;
          return { env: this.pmrem.fromEquirectangular(tex).texture, bg: tex, sun: findSun(tex) ?? this.rawSunDir };
        } catch (e) {
          console.warn('HDRI unavailable', key, e);
          return null;
        }
      })());
    }
    return this.envCache.get(key)!;
  }

  /** Initial load: the day sky (and whatever the saved settings need). */
  async loadEnvironment(onProgress?: (f: number) => void) {
    const day = await this.loadEnv('day', '1k');
    onProgress?.(0.6);
    if (!day) {
      const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
      const env = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      this.envCache.set('day_1k', Promise.resolve({ env, bg: env, sun: this.rawSunDir }));
    }
    onProgress?.(1);
  }

  async configure(mode: GraphicsMode, time: TimeOfDay, weather: Weather) {
    this.mode = mode; this.time = time; this.weather = weather;
    this.preset = PRESETS[mode];
    this.pixelScale = 1; this.slowWindows = 0;
    const want = this.preset.hdri;
    const set = (await this.loadEnv(time, want)) ?? (await this.loadEnv(time, '1k')) ?? (await this.loadEnv('day', '1k'));
    if (this.mode !== mode || this.time !== time) return; // superseded by a newer call
    if (set) {
      this.scene.environment = set.env;
      this.scene.background = set.bg;
      this.rawSunDir.copy(set.sun);
    }
    this.applyMode();
  }

  private applyMode() {
    const p = this.preset, a = ATMOS[this.time];
    const wet = this.weather !== 'dry', rain = this.weather === 'rain';
    const el = Math.max(a.minElevation, Math.asin(Math.min(1, this.rawSunDir.y)));
    const az = Math.atan2(this.rawSunDir.z, this.rawSunDir.x);
    this.sunDir.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.setHex(rain ? (this.time === 'night' ? 0x0e121a : 0x8c96a0) : a.fog);
    fog.density = a.fogDensity * (rain ? 2.4 : 1) * (this.mode === 'rendered' ? 1.4 : 1);
    this.scene.environmentIntensity = a.env * (rain ? 0.75 : 1);
    this.scene.backgroundIntensity = a.bg * (rain ? 0.6 : 1);
    this.scene.backgroundBlurriness = rain ? 0.08 : 0;
    this.renderer.toneMappingExposure = a.exposure * (this.mode === 'rendered' ? 1.05 : 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.type = p.shadowType;
    this.sun.color.setHex(a.sunColor);
    this.sun.intensity = a.sunIntensity * (rain ? 0.35 : wet ? 0.85 : 1) * (this.mode === 'rendered' ? 0.9 : 1);
    this.hemi.intensity = (this.mode === 'rendered' ? a.hemi * 2 : a.hemi) * (rain ? 1.6 : 1);
    this.sun.shadow.mapSize.set(p.shadowSize, p.shadowSize);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null as any;
    const s = p.shadowSpan;
    Object.assign(this.sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 400 });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.shadow.radius = rain ? 6 : 3;
    this.renderer.shadowMap.autoUpdate = p.shadowEvery === 1;
    this.renderer.shadowMap.needsUpdate = true;
    this.flare.visible = this.mode === 'hyper' && this.time !== 'night' && !rain;
    puddleUniforms.uWet.value = wet ? 1 : 0;
    puddleUniforms.uRain.value = rain ? 1 : 0;
    puddleUniforms.uReflOn.value = 0;
    this.reflection.scale = this.mode === 'hyper' ? 0.5 : 0.33;
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true)); else if (m) m.needsUpdate = true;
    });
    this.composer?.dispose();
    this.composer = null; // rebuilt lazily for the new tier
    this.resize();
  }

  private buildComposer(camera: THREE.PerspectiveCamera) {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: this.preset.post === 'bloom' ? 4 : 0 });
    const c = new EffectComposer(this.renderer, rt);
    c.addPass(new RenderPass(this.scene, camera));
    if (this.preset.post === 'full') {
      const gtao = new GTAOPass(this.scene, camera, size.x, size.y);
      gtao.blendIntensity = 0.9;
      gtao.updateGtaoMaterial({ radius: 0.7, distanceExponent: 1.4, thickness: 1.5, scale: 1, samples: 12 });
      c.addPass(gtao);
    }
    const night = this.time === 'night';
    // high thresholds: only lamps, signals, sun glints and lit windows bloom, never the whole sky
    const full = this.preset.post === 'full';
    c.addPass(new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), night ? 0.55 : full ? 0.25 : 0.15, night ? 0.5 : 0.4, night ? 0.9 : 2.2));
    c.addPass(new OutputPass());
    this.windscreen = new ShaderPass(WindscreenRainShader);
    this.windscreen.enabled = false;
    c.addPass(this.windscreen);
    if (this.preset.post === 'full') {
      this.cinematic = new ShaderPass(CinematicShader);
      const tint = { day: [1.02, 1.0, 0.97], sunset: [1.08, 0.98, 0.88], night: [0.92, 0.97, 1.08] }[this.time];
      this.cinematic.uniforms.uTint.value.set(tint[0], tint[1], tint[2]);
      this.cinematic.uniforms.uWet.value = this.weather === 'dry' ? 0 : 1;
      c.addPass(this.cinematic);
      c.addPass(new SMAAPass(size.x, size.y));
    } else this.cinematic = null;
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
  followSun(focus: THREE.Vector3, camera: THREE.Camera) {
    const texel = (this.preset.shadowSpan * 2) / this.preset.shadowSize;
    const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx, 0, fz).addScaledVector(this.sunDir, 160);
    this.flareAnchor.position.copy(camera.position).addScaledVector(this.sunDir, 900);
  }

  /** Re-renders the car's surroundings into a cube map (Hyper-real) so paint reflects the city. */
  updateReflections(car: THREE.Object3D, paint: THREE.MeshPhysicalMaterial) {
    if (this.mode !== 'hyper') { if (paint.envMap) { paint.envMap = null; paint.needsUpdate = true; } return; }
    if (this.frame % 4 !== 0) return;
    car.getWorldPosition(this.cube.position);
    this.cube.position.y += 0.8;
    const vis = car.visible, fl = this.flare.visible;
    car.visible = false; this.flare.visible = false;
    this.cube.update(this.renderer, this.scene);
    car.visible = vis; this.flare.visible = fl;
    if (paint.envMap !== this.cubeTarget.texture) { paint.envMap = this.cubeTarget.texture; paint.envMapIntensity = 1.2; paint.needsUpdate = true; }
  }

  render(camera: THREE.PerspectiveCamera, dt: number) {
    this.frame++;
    if (this.preset.shadowEvery > 1 && this.frame % this.preset.shadowEvery === 0) this.renderer.shadowMap.needsUpdate = true;
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    // real reflections in standing water (Photoreal + Hyper-real, wet or rain)
    const puddles = this.weather !== 'dry' && this.mode !== 'rendered';
    if (puddles) { camera.updateMatrixWorld(); this.reflection.update(this.renderer, this.scene, camera); }
    else puddleUniforms.uReflOn.value = 0;
    puddleUniforms.uTime.value = (puddleUniforms.uTime.value + dt) % 1000;
    if (this.preset.post !== 'none') {
      if (!this.composer || this.camera !== camera) { this.buildComposer(camera); this.resize(); }
      if (this.windscreen) {
        const u = this.windscreen.uniforms;
        this.windscreen.enabled = this.cockpitRain.amount > 0;
        u.uAmount.value = this.cockpitRain.amount;
        u.uDashY.value = this.cockpitRain.dashY;
        u.uAspect.value = innerWidth / innerHeight;
        u.uSpeed.value = this.speed01;
        u.uTime.value = (u.uTime.value + dt) % 1000;
      }
      if (this.cinematic) {
        this.cinematic.uniforms.uTime.value = (this.cinematic.uniforms.uTime.value + dt) % 100;
        this.cinematic.uniforms.uSpeed.value += (this.speed01 - this.cinematic.uniforms.uSpeed.value) * Math.min(1, dt * 4);
      }
      this.composer!.render(dt);
    } else {
      this.renderer.render(this.scene, camera);
    }
    this.adapt(dt);
  }

  /** Adaptive resolution: drop render scale quickly when frames are slow, recover slowly. */
  private adapt(dt: number) {
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) { this.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; }
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 30) return;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const med = sorted[15];
    this.frameTimes.length = 0;
    const prev = this.pixelScale;
    if (med > 1 / 45 && this.pixelScale > this.preset.minScale) this.pixelScale = Math.max(this.preset.minScale, this.pixelScale - 0.15);
    else if (med < 1 / 58 && this.pixelScale < 1) this.pixelScale = Math.min(1, this.pixelScale + 0.05);
    if (med > 1 / 28 && this.pixelScale <= this.preset.minScale) { if (++this.slowWindows === 4) this.onSlow?.(); } else this.slowWindows = 0;
    if (prev !== this.pixelScale) this.resize();
  }

  get stats() { return { scale: this.pixelScale, calls: this.renderer.info.render.calls, tris: this.renderer.info.render.triangles, fps: Math.round(this.fps) }; }
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
  const el = (0.5 - (by + 0.5) / height) * Math.PI;
  const az = (u - 0.5) * Math.PI * 2;
  return new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize();
}

function flareTexture(size: number, glow: boolean) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  if (glow) { grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.08, 'rgba(255,240,210,0.9)'); grd.addColorStop(0.3, 'rgba(255,200,140,0.18)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); }
  else { grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.7, 'rgba(255,255,255,0.12)'); grd.addColorStop(0.8, 'rgba(255,255,255,0.25)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); }
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
