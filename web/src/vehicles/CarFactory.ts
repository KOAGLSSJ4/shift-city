// Builds vehicle meshes. Each body type has its own silhouette (hatch, sedan, SUV, GT, supercar,
// limousine, hypercar) so garage tiers look different. Authored glTF models replace the
// procedural body where available.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import type { BodyType, VehicleDef } from '../data/vehicles';
import { binaryUrl } from '../core/AssetUrl';
import { BodyShape, Kit, mergeParts, rimGeometry, tireGeometry, type PartKey } from './CarBody';
import { DESIGNS, type DesignBody } from './designs';

export interface CarRig {
  root: THREE.Group;          // positioned/rotated by gameplay
  body: THREE.Group;          // pitch/roll visual
  wheels: THREE.Object3D[];   // [fl, fr, rl, rr]
  steerPivots: THREE.Object3D[]; // front wheel pivots
  paint: THREE.MeshPhysicalMaterial;
  brakeLights: THREE.MeshStandardMaterial;
  eye: THREE.Vector3;         // cockpit camera position in car space
  wheelRadius: number;
  /** In-car displays (procedural cars only): redraw the canvas then flag the texture. */
  screens?: { nav: { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture }; cluster: { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture } };
  headlights: THREE.Group;
  /** Car-space point at the base of the windscreen (for the cockpit rain mask). */
  glassBase: THREE.Vector3;
  length: number;
  width: number;
  dispose(): void;
}

export const tireMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.85 });
export const rimMat = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, metalness: 1, roughness: 0.25 });
export const blackTrim = new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.5, metalness: 0.2 });
export const chrome = new THREE.MeshStandardMaterial({ color: 0xe8ecef, metalness: 1, roughness: 0.08, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
export const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x0a0f15, metalness: 0.2, roughness: 0.03, transparent: true, opacity: 0.82, clearcoat: 1, side: THREE.FrontSide });
export const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e0, emissiveIntensity: 1.6, roughness: 0.1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
export const interiorMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1f, roughness: 0.8 });
export const leatherMat = new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 0.6 });
export const plateMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
export const leatherWheel = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.55 });
/** Decal materials draw on top of the panel they are projected onto. */
const DECAL = { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 };
const satinBlack = new THREE.MeshStandardMaterial({ color: 0x101113, roughness: 0.6, metalness: 0.1, ...DECAL });
const glossBlack = new THREE.MeshPhysicalMaterial({ color: 0x060708, roughness: 0.15, metalness: 0.3, clearcoat: 1 });
const decalMat = new THREE.MeshStandardMaterial({ color: 0x08090a, roughness: 0.45, metalness: 0.2, ...DECAL });
const lensMat = new THREE.MeshPhysicalMaterial({ color: 0x15181c, roughness: 0.05, metalness: 0.6, clearcoat: 1, ...DECAL });
const carbonMat = new THREE.MeshPhysicalMaterial({ color: 0x15161a, roughness: 0.35, metalness: 0.4, clearcoat: 0.8, ...DECAL });
const interiorBack = new THREE.MeshStandardMaterial({ color: 0x6b6862, roughness: 0.9, side: THREE.BackSide });
const dashMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2d, roughness: 0.7 });
const linerMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.9, side: THREE.DoubleSide });
const barrelMat = new THREE.MeshStandardMaterial({ color: 0x3a3c40, metalness: 0.8, roughness: 0.4, side: THREE.DoubleSide });
const discMat = new THREE.MeshStandardMaterial({ color: 0x6c6f74, metalness: 0.9, roughness: 0.35 });
const trafficDark = new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: 0.6, ...DECAL });
const trafficBright = new THREE.MeshStandardMaterial({ color: 0xc4c8cc, metalness: 0.9, roughness: 0.3, ...DECAL });

/** Two forward spot lights; only switched on at night (lights cost shader work). */
export function makeHeadlights(width: number, y: number, front: number) {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) {
    const l = new THREE.SpotLight(0xfff1dc, 60, 70, 0.42, 0.55, 1.6);
    l.position.set(sx * width * 0.32, y, front);
    l.target.position.set(sx * 1.2, 0, front + 25);
    g.add(l, l.target);
  }
  g.visible = false;
  return g;
}

export function makePaint(color: number, photoreal: boolean) {
  return new THREE.MeshPhysicalMaterial({
    color, metalness: 0.55, roughness: 0.32,
    clearcoat: photoreal ? 1 : 0.4, clearcoatRoughness: 0.04,
  });
}

/** Procedural car. `detail` adds interior, mirrors and spoked rims (player car). */
export function buildProceduralCar(kind: BodyType, color: number, opts: { detail: boolean; photoreal: boolean }): CarRig {
  const body = kind;
  const d = DESIGNS[body], shape = bodyShape(body), p = cabin(body);
  const root = new THREE.Group();
  const bodyG = new THREE.Group();
  root.add(bodyG);
  const paint = makePaint(color, opts.photoreal);
  const brakeLights = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1010, emissiveIntensity: 0.5, ...DECAL });
  let screens: CarRig['screens'];

  const mats: Record<PartKey, THREE.Material> = {
    paint, roof: d.roofStyle === 'paint' ? paint : d.roofStyle === 'black' ? glossBlack : glassMat, glass: glassMat,
    black: blackTrim, trim: satinBlack, chrome, decal: decalMat, head: headMat, lens: lensMat, tail: brakeLights,
    accent: blackTrim, cabin: interiorMat, carbon: carbonMat, plate: plateMat, liner: linerMat, tire: tireMat, rim: rimMat,
  };
  for (const [k, g] of Object.entries(carParts(body, opts.detail ? 0 : 1)) as [PartKey, THREE.BufferGeometry][]) {
    // the player car's cabin deck is left open: you sit down inside the body, which is lined below
    if (k === 'cabin' && opts.detail) continue;
    bodyG.add(new THREE.Mesh(g, mats[k]));
  }

  if (opts.detail) {
    for (const sx of [-1, 1]) {
      const mz = p.cowl - 0.25, mx = shape.glassHalfWidth(mz), my = (shape.topAtX(mz, mx) ?? p.belt) + 0.07;
      const mirror = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 10), paint);
      mirror.scale.set(1.1, 0.6, 0.55);
      mirror.position.set(sx * (mx + 0.16), my, mz);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.06), satinBlack);
      arm.position.set(sx * (mx + 0.07), my - 0.04, mz + 0.02);
      bodyG.add(mirror, arm);
    }
    // interior, placed from the body surface so it always sits inside the glasshouse
    const eyeY = p.eyeY, eyeZ = p.eyeZ;
    const dashTop = eyeY - 0.27, dashBack = eyeZ + 0.55;
    let dashFront = dashBack + 0.1;
    while (dashFront < p.cowl && shape.roof(dashFront + 0.02) > dashTop + 0.03) dashFront += 0.02;
    const dashW = shape.glassHalfWidth(dashBack) * 1.9;
    const dash = new THREE.Mesh(new THREE.BoxGeometry(dashW, 0.3, dashFront - dashBack), dashMat);
    dash.position.set(0, dashTop - 0.15, (dashFront + dashBack) / 2);
    const driverX = Math.min(p.W * 0.22, shape.glassHalfWidth(eyeZ) * 0.48);
    // steering wheel: rim, three spokes, hub
    const wheelG = new THREE.Group();
    wheelG.add(new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.024, 10, 36), leatherWheel));
    for (const a of [0, 2.1, -2.1]) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.02), blackTrim);
      sp.position.set(Math.cos(a - Math.PI / 2) * 0.09, Math.sin(a - Math.PI / 2) * 0.09, 0); sp.rotation.z = a - Math.PI / 2;
      wheelG.add(sp);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.05, 20), blackTrim); hub.rotation.x = Math.PI / 2; wheelG.add(hub);
    wheelG.position.set(driverX, dashTop - 0.06, dashBack - 0.12);
    wheelG.rotation.x = -0.45;
    wheelG.name = 'steeringWheel';
    // digital cluster behind the wheel + central touchscreen (both live canvas textures)
    const mkScreen = (w: number, h: number, pw: number, ph: number) => {
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
      const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.9, roughness: 0.15, metalness: 0.2 }));
      mesh.rotation.y = Math.PI;
      return { canvas, tex, mesh };
    };
    const cluster = mkScreen(256, 96, 0.3, 0.11);
    cluster.mesh.position.set(driverX, dashTop + 0.05, dashBack + 0.08); cluster.mesh.rotation.x = -0.3;
    const nav = mkScreen(256, 160, 0.3, 0.19);
    nav.mesh.position.set(0, dashTop + 0.06, dashBack + 0.02); nav.mesh.rotation.x = -0.25; nav.mesh.rotation.y = Math.PI - 0.25;
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.21, 0.015), blackTrim);
    bezel.position.copy(nav.mesh.position).add(new THREE.Vector3(0, 0, 0.012)); bezel.rotation.copy(nav.mesh.rotation);
    // rear-view mirror hangs from the top of the windscreen
    const mz = Math.min(p.roofF, eyeZ + 0.6);
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.02), new THREE.MeshStandardMaterial({ color: 0x9aa4ad, metalness: 1, roughness: 0.05 }));
    mirror.position.set(0, shape.roof(mz) - 0.12, mz - 0.05);
    const mback = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.085, 0.03), interiorMat); mback.position.copy(mirror.position).add(new THREE.Vector3(0, 0, 0.02));
    bodyG.add(dash, wheelG, cluster.mesh, nav.mesh, bezel, mirror, mback);
    screens = { nav: { canvas: nav.canvas, tex: nav.tex }, cluster: { canvas: cluster.canvas, tex: cluster.tex } };
    for (const sx of [-1, 1]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.7, 0.15), leatherMat);
      seat.position.set(sx * driverX, eyeY - 0.42, eyeZ - 0.3);
      seat.rotation.x = -0.15;
      bodyG.add(seat);
    }
    // inside faces of the roof and pillars (the glasshouse is single-sided)
    const parts = carParts(body, 0);
    for (const k of ['paint', 'trim', 'black', ...(d.roofStyle === 'glass' ? [] : ['roof'])] as PartKey[]) if (parts[k]) bodyG.add(new THREE.Mesh(parts[k], interiorBack));
  }
  bodyG.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = opts.detail; } });

  const wheels: THREE.Object3D[] = [], steerPivots: THREE.Object3D[] = [];
  const rimM = new THREE.MeshStandardMaterial({ color: d.rimColor, metalness: 1, roughness: 0.3 });
  const caliperM = new THREE.MeshStandardMaterial({ color: d.accent, metalness: 0.3, roughness: 0.4 });
  const wg = wheelGeometry(body, opts.detail ? 0 : 1);
  const tw = d.W / 2 - 0.03 - (d.tireW ?? 0.24) / 2; // tyres close to flush with the body side, like a real car
  for (const [x, z, front] of [[tw, d.wb / 2, true], [-tw, d.wb / 2, true], [tw, -d.wb / 2, false], [-tw, -d.wb / 2, false]] as const) {
    const pivot = new THREE.Group();
    pivot.position.set(x, d.wr, z);
    const spin = new THREE.Group(), fixed = new THREE.Group();
    spin.add(new THREE.Mesh(wg.tire, tireMat), new THREE.Mesh(wg.rim, rimM), new THREE.Mesh(wg.barrel, barrelMat));
    if (opts.detail) {
      fixed.add(new THREE.Mesh(wg.disc, discMat));
      const cal = new THREE.Mesh(wg.caliper, caliperM);
      cal.position.set(0, d.wr * (d.rim ?? 0.68) * 0.55, -d.wr * (d.rim ?? 0.68) * 0.35);
      fixed.add(cal);
    }
    if (x < 0) { spin.scale.x = -1; fixed.scale.x = -1; }
    spin.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
    pivot.add(spin, fixed);
    root.add(pivot);
    wheels.push(spin);
    if (front) steerPivots.push(pivot);
  }
  const eye = new THREE.Vector3(Math.min(p.W * 0.22, shape.glassHalfWidth(p.eyeZ) * 0.48), p.eyeY, p.eyeZ);
  const headlights = makeHeadlights(p.W, p.hood - 0.1, p.L / 2);
  root.add(headlights);
  return {
    root, body: bodyG, wheels, steerPivots, paint, brakeLights, eye, wheelRadius: d.wr, length: d.L, width: d.W, screens, headlights, glassBase: new THREE.Vector3(0, p.belt + 0.08, p.cowl),
    dispose() { root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !m.geometry.userData.shared) m.geometry.dispose(); }); paint.dispose(); brakeLights.dispose(); rimM.dispose(); caliperM.dispose(); },
  };
}

// ---------- glTF models ----------
const gltfCache = new Map<string, Promise<THREE.Group | null>>();
let gltfLoader: GLTFLoader | null = null;

export function loadModel(url: string): Promise<THREE.Group | null> {
  if (!gltfLoader) {
    const draco = new DRACOLoader();
    draco.setDecoderPath('draco/');
    gltfLoader = new GLTFLoader();
    gltfLoader.setDRACOLoader(draco);
  }
  if (!gltfCache.has(url)) {
    gltfCache.set(url, binaryUrl(url).then((u) => new Promise((res) => gltfLoader!.load(u, (g) => res(g.scene), undefined, (e) => { console.warn('model failed', url, e); res(null); }))));
  }
  return gltfCache.get(url)!;
}

/** Wraps an authored glTF model in the same rig interface as procedural cars. */
export async function buildModelCar(def: VehicleDef, photoreal: boolean): Promise<CarRig | null> {
  if (!def.model) return null;
  const src = await loadModel(def.model);
  if (!src) return null;
  const model = src.clone(true);
  const root = new THREE.Group();
  const bodyG = new THREE.Group();
  root.add(bodyG);
  const paint = makePaint(def.color, photoreal);
  paint.metalness = 1; paint.roughness = 0.45; paint.clearcoat = 1; paint.clearcoatRoughness = 0.03;
  const brakeLights = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1010, emissiveIntensity: 0.5 });
  // Material assignment by node name (three.js example naming).
  const named = (n: string) => model.getObjectByName(n) as THREE.Mesh | undefined;
  const body = named('body'); if (body) body.material = paint;
  ['rim_fl', 'rim_fr', 'rim_rr', 'rim_rl', 'trim'].forEach((n) => { const m = named(n); if (m) m.material = rimMat; });
  const glass = named('glass');
  // no transmission: it forces an extra full-scene render pass every frame
  if (glass) glass.material = new THREE.MeshPhysicalMaterial({ color: 0x111111, metalness: 0.3, roughness: 0, transparent: true, opacity: 0.45, clearcoat: 1 });
  model.rotation.y = Math.PI; // source model faces -Z; our vehicles face +Z
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const scale = def.dims.length / Math.max(size.z, size.x);
  model.scale.setScalar(scale);
  box.setFromObject(model);
  model.position.y -= box.min.y;
  model.position.x -= (box.min.x + box.max.x) / 2;
  model.position.z -= (box.min.z + box.max.z) / 2;
  bodyG.add(model);
  model.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  const wheels = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'].map((n) => model.getObjectByName(n)).filter(Boolean) as THREE.Object3D[];
  const s = box.getSize(new THREE.Vector3());
  const headlights = makeHeadlights(s.x, s.y * 0.5, s.z / 2);
  root.add(headlights);
  return {
    root, body: bodyG, wheels, steerPivots: [], paint, brakeLights, headlights, glassBase: new THREE.Vector3(0, s.y * 0.62, s.z * 0.12),
    eye: new THREE.Vector3(s.x * 0.2, s.y * 0.82, -0.25), wheelRadius: 0.34, length: s.z, width: s.x,
    dispose() { paint.dispose(); },
  };
}

// Shared so night mode can switch every traffic car's lights with one change.
export const trafficTail = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1010, emissiveIntensity: 0.6, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
export const trafficHead = new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xfff4e0, emissiveIntensity: 0.3, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
export function setCarLights(night: boolean) {
  trafficTail.emissiveIntensity = night ? 3 : 0.6;
  trafficHead.emissiveIntensity = night ? 6 : 0.3;
  headMat.emissiveIntensity = night ? 6 : 1.6;
}

/** Cheap traffic car: shared cached geometry, six draw calls (paint, glass, dark, bright, head, tail). */
export function buildTrafficCar(body: DesignBody, color: number): THREE.Group {
  const d = DESIGNS[body];
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.35 });
  const mats: Record<TrafficSlot, THREE.Material> = { paint, glass: glassMat, dark: trafficDark, bright: trafficBright, head: trafficHead, tail: trafficTail };
  for (const [k, geo] of Object.entries(trafficParts(body)) as [TrafficSlot, THREE.BufferGeometry][]) {
    const m = new THREE.Mesh(geo, mats[k]);
    m.castShadow = k === 'paint' || k === 'glass' || k === 'dark';
    g.add(m);
  }
  g.userData.length = d.L;
  g.userData.width = d.W;
  return g;
}

// ---------- shared geometry caches ----------

/** Cabin landmarks used to place the interior, cockpit camera and lights. */
function cabin(body: DesignBody) {
  const d = DESIGNS[body], b = bodyShape(body);
  const cowl = b.gz1;
  const eyeZ = Math.max(d.roofR + 0.25, cowl - 1.1);
  return {
    L: d.L, W: d.W, H: Math.max(...d.roof.map((r) => r[1])), cowl, glassTail: b.gz0, roofF: d.roofF, roofR: d.roofR,
    belt: b.top(cowl - 0.4), hood: b.top(d.L / 2 - 0.35), tail: b.top(-d.L / 2 + 0.2), eyeZ, eyeY: Math.min(b.roof(eyeZ) - 0.17, b.top(eyeZ) + 0.3),
  };
}

const shapes = new Map<DesignBody, BodyShape>();
function bodyShape(body: DesignBody) {
  if (!shapes.has(body)) shapes.set(body, new BodyShape(DESIGNS[body]));
  return shapes.get(body)!;
}

const partCache = new Map<string, Partial<Record<PartKey, THREE.BufferGeometry>>>();
/** Body, glasshouse and details merged per material slot (cached; shared between cars). */
function carParts(body: DesignBody, lod: 0 | 1) {
  const key = `${body}:${lod}`;
  if (!partCache.has(key)) {
    const b = bodyShape(body);
    const kit = new Kit(b, lod);
    const add = (parts: Partial<Record<PartKey, THREE.BufferGeometry>>) => { for (const [k, g] of Object.entries(parts) as [PartKey, THREE.BufferGeometry][]) kit.add(k, g); };
    add(lod === 0 ? b.bodyParts(96, 56) : b.bodyParts(40, 24));
    add(lod === 0 ? b.greenhouseParts(80, 32) : b.greenhouseParts(26, 12));
    DESIGNS[body].details(kit);
    if (kit.skipped && import.meta.env?.DEV) console.warn(`car design ${body}: ${kit.skipped} decal triangles fell off the body`);
    const merged = mergeParts(kit.parts);
    Object.values(merged).forEach((g) => { g.userData.shared = true; });
    partCache.set(key, merged);
  }
  return partCache.get(key)!;
}

const wheelCache = new Map<string, Record<'tire' | 'rim' | 'barrel' | 'disc' | 'caliper', THREE.BufferGeometry>>();
function wheelGeometry(body: DesignBody, lod: 0 | 1) {
  const key = `${body}:${lod}`;
  if (!wheelCache.has(key)) {
    const d = DESIGNS[body], w = d.tireW ?? 0.24, rr = d.wr * (d.rim ?? 0.68);
    const rim = rimGeometry(d.rimStyle, rr);
    rim.translate(w / 2 - 0.06, 0, 0);
    const barrel = new THREE.CylinderGeometry(rr * 0.97, rr * 0.97, w - 0.04, lod === 0 ? 28 : 12, 1, true);
    barrel.rotateZ(Math.PI / 2);
    const disc = new THREE.CylinderGeometry(rr * 0.78, rr * 0.78, 0.028, 28);
    disc.rotateZ(Math.PI / 2); disc.translate(w / 2 - 0.11, 0, 0);
    const caliper = new THREE.BoxGeometry(0.05, rr * 0.42, rr * 0.3);
    caliper.translate(w / 2 - 0.085, 0, 0);
    const g = { tire: tireGeometry(d.wr, rr, w, lod === 0 ? 40 : 16), rim, barrel, disc, caliper };
    Object.values(g).forEach((x) => { x.userData.shared = true; });
    wheelCache.set(key, g);
  }
  return wheelCache.get(key)!;
}

type TrafficSlot = 'paint' | 'glass' | 'dark' | 'bright' | 'head' | 'tail';
const TRAFFIC_SLOT: Record<PartKey, TrafficSlot> = {
  paint: 'paint', roof: 'paint', glass: 'glass', black: 'dark', trim: 'dark', decal: 'dark', lens: 'dark', liner: 'dark',
  carbon: 'dark', cabin: 'dark', tire: 'dark', accent: 'dark', chrome: 'bright', rim: 'bright', plate: 'bright', head: 'head', tail: 'tail',
};
const trafficCache = new Map<DesignBody, Partial<Record<TrafficSlot, THREE.BufferGeometry>>>();
function trafficParts(body: DesignBody) {
  if (!trafficCache.has(body)) {
    const d = DESIGNS[body];
    const lists: Partial<Record<TrafficSlot, THREE.BufferGeometry[]>> = {};
    const push = (slot: TrafficSlot, g: THREE.BufferGeometry) => (lists[slot] ??= []).push(g);
    for (const [k, g] of Object.entries(carParts(body, 1)) as [PartKey, THREE.BufferGeometry][]) {
      push(k === 'roof' && d.roofStyle !== 'paint' ? (d.roofStyle === 'glass' ? 'glass' : 'dark') : TRAFFIC_SLOT[k], g.clone());
    }
    const w = d.tireW ?? 0.24, rr = d.wr * (d.rim ?? 0.68), tw = d.W / 2 - 0.05 - w / 2;
    for (const [x, z] of [[tw, d.wb / 2], [-tw, d.wb / 2], [tw, -d.wb / 2], [-tw, -d.wb / 2]]) {
      const tire = new THREE.CylinderGeometry(d.wr, d.wr, w, 14);
      tire.rotateZ(Math.PI / 2); tire.translate(x, d.wr, z);
      push('dark', tire);
      const cap = new THREE.CylinderGeometry(rr, rr, 0.02, 12);
      cap.rotateZ(Math.PI / 2); cap.translate(x + Math.sign(x) * (w / 2 + 0.005), d.wr, z);
      push('bright', cap);
    }
    const merged = mergeParts(lists as Partial<Record<PartKey, THREE.BufferGeometry[]>>) as Partial<Record<TrafficSlot, THREE.BufferGeometry>>;
    Object.values(merged).forEach((g) => { g.userData.shared = true; });
    trafficCache.set(body, merged);
  }
  return trafficCache.get(body)!;
}
