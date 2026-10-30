// The Classic: the original Shift City starter hatch from the first web version, kept by request.
// Built the old way (a side profile extruded across the width, then sculpted), which gives it its
// chunky, toy-like look next to the lofted designs in designs.ts.
import * as THREE from 'three';
import { blackTrim, chrome, glassMat, headMat, interiorMat, leatherMat, leatherWheel, makeHeadlights, makePaint, plateMat, rimMat, tireMat, type CarRig } from './CarFactory';

interface Profile {
  L: number; W: number; H: number; wb: number; wr: number; clear: number;
  belt: number; hood: number; tail: number; cowl: number; roofF: number; roofR: number; glassTail: number;
  trunk?: number;
}

/** The original hatch profile, unchanged. */
/** Fabric headliner and pillar trim (a little lighter than the dash so the cabin reads). */
const headliner = new THREE.MeshStandardMaterial({ color: 0x4a4744, roughness: 0.95 });

const P: Profile = { L: 3.9, W: 1.75, H: 1.5, wb: 2.45, wr: 0.31, clear: 0.16, belt: 0.92, hood: 0.84, tail: 0.98, cowl: 0.72, roofF: 0.1, roofR: -1.62, glassTail: -1.86 };

function bodyShape(p: Profile) {
  const s = new THREE.Shape();
  const hL = p.L / 2, ar = p.wr + 0.07, fx = p.wb / 2, rx = -p.wb / 2;
  s.moveTo(hL - 0.06, p.clear + 0.06);
  // bottom edge with wheel arches (front to rear)
  s.lineTo(fx + ar, p.clear + 0.02);
  for (let i = 0; i <= 12; i++) { const a = (i / 12) * Math.PI; s.lineTo(fx + ar * Math.cos(a), p.wr + ar * Math.sin(a)); }
  s.lineTo(fx - ar, p.clear + 0.02);
  s.lineTo(rx + ar, p.clear + 0.02);
  for (let i = 0; i <= 12; i++) { const a = (i / 12) * Math.PI; s.lineTo(rx + ar * Math.cos(a), p.wr + ar * Math.sin(a)); }
  s.lineTo(rx - ar, p.clear + 0.02);
  s.lineTo(-hL + 0.08, p.clear + 0.1);
  // rear face
  s.quadraticCurveTo(-hL - 0.02, (p.clear + p.tail) / 2, -hL + 0.02, p.tail - 0.04);
  s.lineTo(-hL + 0.12, p.tail);
  if (p.trunk !== undefined) s.lineTo(p.trunk, p.belt + 0.02);
  else s.lineTo(p.glassTail, Math.max(p.belt, p.tail));
  s.lineTo(p.cowl, p.belt);
  // hood sweeping down to nose
  s.quadraticCurveTo(hL - 0.5, p.hood + 0.04, hL - 0.12, p.hood - 0.06);
  s.quadraticCurveTo(hL + 0.02, p.hood - 0.12, hL, p.clear + 0.3);
  s.lineTo(hL - 0.06, p.clear + 0.06);
  return s;
}

function greenhouseShape(p: Profile) {
  const s = new THREE.Shape();
  const tailY = p.trunk !== undefined ? p.belt + 0.02 : Math.max(p.belt, p.tail);
  s.moveTo(p.cowl, p.belt - 0.02);
  s.quadraticCurveTo((p.cowl + p.roofF) / 2 + 0.05, (p.belt + p.H) / 2 + 0.08, p.roofF, p.H - 0.03);
  s.lineTo(p.roofR, p.H - 0.03);
  s.quadraticCurveTo((p.roofR + p.glassTail) / 2 - 0.05, (p.H + tailY) / 2 + 0.05, p.glassTail, tailY - 0.02);
  s.lineTo(p.cowl, p.belt - 0.02);
  return s;
}

function extrudeAlongWidth(shape: THREE.Shape, width: number, bevel: number, seg = 3) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.01, width - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.7, bevelSegments: seg, curveSegments: 10 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2); // profile x (length) → world +Z
  return g;
}

/**
 * Sculpts an extruded slab into a car-like volume: sides lean in above the belt line (tumblehome),
 * the plan view tapers toward the bumpers and the sill tucks under.
 */
function sculpt(g: THREE.BufferGeometry, p: Profile, top: number) {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const hL = p.L / 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const end = Math.pow(Math.min(1, Math.abs(z) / hL), 5);           // 0 mid-car → 1 at bumpers
    const up = Math.max(0, (y - p.belt * 0.75) / Math.max(0.2, top - p.belt * 0.75));
    const tuck = Math.max(0, 1 - (y - p.clear) / 0.25);
    const k = 1 - end * 0.14 - up * 0.1 - tuck * 0.05;
    pos.setX(i, x * k);
  }
  g.computeVertexNormals();
  return g;
}

function wheel(r: number, w: number, detail: boolean) {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, detail ? 28 : 14), tireMat);
  tire.rotation.z = Math.PI / 2;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.66, r * 0.66, w + 0.02, detail ? 24 : 10), rimMat);
  rim.rotation.z = Math.PI / 2;
  g.add(tire, rim);
  if (detail) {
    for (let i = 0; i < 5; i++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, r * 1.1, 0.06), blackTrim);
      spoke.rotation.x = (i / 5) * Math.PI;
      g.add(spoke);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.15, r * 0.15, w + 0.06, 10), chrome);
    hub.rotation.z = Math.PI / 2;
    g.add(hub);
  }
  g.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
  return g;
}

/** The Classic hatch as a full player rig (same interface as the lofted cars). */
export function buildClassicCar(color: number, opts: { detail: boolean; photoreal: boolean }): CarRig {
  const p = P;
  const root = new THREE.Group();
  const bodyG = new THREE.Group();
  root.add(bodyG);
  const paint = makePaint(color, opts.photoreal);
  const brakeLights = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1010, emissiveIntensity: 0.5 });
  let screens: CarRig['screens'];

  const shell = new THREE.Mesh(sculpt(extrudeAlongWidth(bodyShape(p), p.W, 0.14, opts.detail ? 4 : 2), p, p.belt + 0.1), paint);
  const gh = new THREE.Mesh(sculpt(extrudeAlongWidth(greenhouseShape(p), p.W * 0.92, 0.12, opts.detail ? 4 : 2), p, p.H), glassMat);
  // painted roof panel sitting on the glasshouse
  const roofShape = new THREE.Shape();
  roofShape.moveTo(p.roofF + 0.08, p.H - 0.05); roofShape.lineTo(p.roofR - 0.05, p.H - 0.05);
  roofShape.lineTo(p.roofR - 0.05, p.H + 0.015); roofShape.lineTo(p.roofF + 0.08, p.H + 0.015);
  const roof = new THREE.Mesh(sculpt(extrudeAlongWidth(roofShape, p.W * 0.92 + 0.02, 0.05), p, p.H), paint);
  bodyG.add(shell, gh, roof);

  // pillars (painted) so the glasshouse reads as windows
  const pillar = (z0: number, y0: number, z1: number, y1: number) => {
    const len = Math.hypot(z1 - z0, y1 - y0);
    for (const sx of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.04, len, 0.06), paint);
      const yMid = (y0 + y1) / 2, upF = Math.max(0, (yMid - p.belt * 0.75) / Math.max(0.2, p.H - p.belt * 0.75));
      m.position.set(sx * (p.W * 0.46 * (1 - upF * 0.1) - 0.01), yMid, (z0 + z1) / 2);
      m.rotation.x = Math.atan2(z1 - z0, y1 - y0);
      bodyG.add(m);
    }
  };
  pillar(p.cowl, p.belt, p.roofF, p.H - 0.03);                         // A
  const bz = (p.roofF + p.roofR) / 2 + (p.roofF - p.roofR) * 0.05;
  pillar(bz, p.belt, bz, p.H - 0.03);                                   // B

  // lights, grille, plates, underbody
  const hL = p.L / 2;
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(p.W * 0.2, 0.08, 0.06), headMat);
    hl.position.set(sx * p.W * 0.32, p.hood - 0.1, hL - 0.08);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(p.W * 0.26, 0.13, 0.06), brakeLights);
    tl.position.set(sx * p.W * 0.31, p.tail - 0.14, -hL + 0.05);
    bodyG.add(hl, tl);
  }
  const grille = new THREE.Mesh(new THREE.BoxGeometry(p.W * 0.42, Math.max(0.1, p.hood * 0.22), 0.05), blackTrim);
  grille.position.set(0, p.clear + 0.28, hL - 0.02);
  const under = new THREE.Mesh(new THREE.BoxGeometry(p.W * 0.9, 0.12, p.L * 0.9), blackTrim);
  under.position.y = p.clear + 0.06;
  for (const [z, w] of [[hL - 0.04, 0.84], [-hL + 0.03, 0.88]]) {
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(p.W * w, 0.16, 0.12), blackTrim);
    bumper.position.set(0, p.clear + 0.14, z);
    bodyG.add(bumper);
  }
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.02), plateMat);
  plate.position.set(0, p.clear + 0.32, -hL - 0.005);
  bodyG.add(grille, under, plate);

  if (opts.detail) {
    for (const sx of [-1, 1]) {
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.1), paint);
      mirror.position.set(sx * (p.W / 2 + 0.06), p.belt + 0.08, p.cowl - 0.12);
      bodyG.add(mirror);
    }
    // interior
    // a full-width dash whose top sits just above the bonnet line, so from the seat you see dashboard, not paint
    const dash = new THREE.Mesh(new THREE.BoxGeometry(p.W * 0.9, 0.42, 0.68), interiorMat);
    dash.position.set(0, p.belt - 0.1, p.cowl - 0.29);
    // cabin floor/door cards hide the body's top deck when viewed from the driver's seat
    const tub = new THREE.Mesh(new THREE.BoxGeometry(p.W * 0.86, 0.02, Math.abs(p.cowl - p.glassTail)), interiorMat);
    tub.position.set(0, p.belt + 0.012, (p.cowl + p.glassTail) / 2);
    bodyG.add(tub);
    const driverX = p.W * 0.22;
    // steering wheel: rim, three spokes, hub
    const wheelG = new THREE.Group();
    wheelG.add(new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.024, 10, 36), leatherWheel));
    for (const a of [0, 2.1, -2.1]) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.02), blackTrim);
      sp.position.set(Math.cos(a - Math.PI / 2) * 0.09, Math.sin(a - Math.PI / 2) * 0.09, 0); sp.rotation.z = a - Math.PI / 2;
      wheelG.add(sp);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.05, 20), blackTrim); hub.rotation.x = Math.PI / 2; wheelG.add(hub);
    wheelG.position.set(driverX, p.belt - 0.02, p.cowl - 0.66);
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
    cluster.mesh.position.set(driverX, p.belt + 0.15, p.cowl - 0.6); cluster.mesh.rotation.x = -0.3;
    const nav = mkScreen(256, 160, 0.3, 0.19);
    nav.mesh.position.set(0, p.belt + 0.2, p.cowl - 0.6); nav.mesh.rotation.x = -0.25; nav.mesh.rotation.y = Math.PI - 0.25;
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.21, 0.015), blackTrim);
    bezel.position.copy(nav.mesh.position).add(new THREE.Vector3(0, 0, 0.012)); bezel.rotation.copy(nav.mesh.rotation);
    // rear-view mirror
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.02), new THREE.MeshStandardMaterial({ color: 0x9aa4ad, metalness: 1, roughness: 0.05 }));
    mirror.position.set(0, p.H - 0.16, p.roofF - 0.05);
    const mback = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.085, 0.03), interiorMat); mback.position.copy(mirror.position).add(new THREE.Vector3(0, 0, 0.02));
    bodyG.add(dash, wheelG, cluster.mesh, nav.mesh, bezel, mirror, mback);
    screens = { nav: { canvas: nav.canvas, tex: nav.tex }, cluster: { canvas: cluster.canvas, tex: cluster.tex } };
    for (const sx of [-1, 1]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.15), leatherMat);
      seat.position.set(sx * p.W * 0.22, p.belt - 0.05, p.cowl - 1.45);
      seat.rotation.x = -0.15;
      bodyG.add(seat);
    }
    const liner = new THREE.Mesh(new THREE.PlaneGeometry(p.W * 0.9, Math.abs(p.roofF - p.roofR) + 0.2), headliner);
    liner.rotation.x = Math.PI / 2;
    liner.position.set(0, p.H - 0.07, (p.roofF + p.roofR) / 2);
    bodyG.add(liner);
    // the body is built as solid blocks, so from the driver's seat you'd see the painted top of the lower body:
    // cover it with dark door/dash tops, and trim the windscreen pillars
    const sill = new THREE.Mesh(new THREE.BoxGeometry(p.W * 0.94, 0.02, Math.abs(p.cowl - p.glassTail)), interiorMat);
    sill.position.set(0, p.belt + 0.03, (p.cowl + p.glassTail) / 2);
    bodyG.add(sill);
    for (const sx of [-1, 1]) {
      const a = new THREE.Vector3(sx * (p.W * 0.46 - 0.04), p.belt + 0.04, p.cowl - 0.02), b = new THREE.Vector3(sx * (p.W * 0.44 - 0.04), p.H - 0.06, p.roofF + 0.02);
      const dir = b.clone().sub(a), len = dir.length();
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, len), headliner);
      pillar.position.copy(a).addScaledVector(dir, 0.5);
      pillar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize());
      bodyG.add(pillar);
    }
  }
  bodyG.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = opts.detail; } });

  const wheels: THREE.Object3D[] = [], steerPivots: THREE.Object3D[] = [];
  const tw = p.W / 2 - 0.16;
  for (const [x, z, front] of [[tw, p.wb / 2, true], [-tw, p.wb / 2, true], [tw, -p.wb / 2, false], [-tw, -p.wb / 2, false]] as const) {
    const pivot = new THREE.Group();
    pivot.position.set(x, p.wr, z);
    const w = wheel(p.wr, 0.24, opts.detail);
    pivot.add(w);
    root.add(pivot);
    wheels.push(w);
    if (front) steerPivots.push(pivot);
  }
  const eye = new THREE.Vector3(p.W * 0.22, Math.min(p.H - 0.26, p.belt + 0.42), p.cowl - 1.1);
  const headlights = makeHeadlights(p.W, p.hood - 0.1, p.L / 2);
  root.add(headlights);
  return {
    root, body: bodyG, wheels, steerPivots, paint, brakeLights, eye, wheelRadius: p.wr, length: p.L, width: p.W, screens, headlights, glassBase: new THREE.Vector3(0, p.belt + 0.08, p.cowl),
    dispose() { root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); }); paint.dispose(); brakeLights.dispose(); },
  };
}
