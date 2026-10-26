// Street detail from Poly Haven (CC0): optimised glTF props placed with GPU instancing, and
// photographic tree impostors baked from full scanned trees (scripts/bake-impostors.cjs).
import * as THREE from 'three';
import { loadModel } from '../vehicles/CarFactory';

export interface Placement { p: THREE.Vector3; rot: number; scale?: number }

/** Flattens a model into (geometry, material) parts in model space. */
async function parts(url: string, filter?: (name: string) => boolean) {
  const src = await loadModel(url);
  if (!src) return [];
  src.updateMatrixWorld(true);
  const out: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = [];
  src.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (filter && !filter(m.name))) return;
    out.push({ geo: m.geometry.clone().applyMatrix4(m.matrixWorld), mat: m.material as THREE.Material });
  });
  return out;
}

/** One InstancedMesh per part of the model, all sharing the same placements. */
export async function instanceProp(url: string, places: Placement[], opts: { filter?: (n: string) => boolean; yOffset?: number; shadows?: boolean } = {}) {
  const g = new THREE.Group();
  if (!places.length) return g;
  const ps = await parts(url, opts.filter);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3();
  for (const part of ps) {
    const im = new THREE.InstancedMesh(part.geo, part.mat, places.length);
    places.forEach((pl, i) => {
      q.setFromAxisAngle(up, pl.rot);
      const k = pl.scale ?? 1;
      m.compose(p.copy(pl.p).setY(pl.p.y + (opts.yOffset ?? 0)), q, s.set(k, k, k));
      im.setMatrixAt(i, m);
    });
    im.castShadow = opts.shadows ?? true;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    g.add(im);
  }
  return g;
}

export interface ImpostorSpec { url: string; frame: number; bottom: number; views: number[] }

export const TREE_IMPOSTORS: ImpostorSpec[] = [
  { url: 'trees/tree_small_02.webp', frame: 4.648, bottom: -0.024, views: [0, 60, 120] },
  { url: 'trees/island_tree_01.webp', frame: 5.128, bottom: -0.02, views: [0, 60, 120] },
];

/** Three crossed vertical quads, each showing the tree photographed from that angle. */
export async function treeImpostors(spec: ImpostorSpec, places: Placement[]) {
  const tex = await new THREE.TextureLoader().loadAsync(spec.url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const n = spec.views.length, F = spec.frame;
  const quads: THREE.BufferGeometry[] = [];
  spec.views.forEach((deg, i) => {
    const q = new THREE.PlaneGeometry(F, F);
    const uv = q.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / n);
    // the baked view looked from +Z rotated by deg about Y; face the plane the same way
    q.rotateY(THREE.MathUtils.degToRad(deg));
    q.translate(0, F / 2 + spec.bottom, 0);
    // lighting is baked into the photo: point normals up so every card is lit evenly by the sky
    const nrm = q.attributes.normal as THREE.BufferAttribute;
    for (let k = 0; k < nrm.count; k++) nrm.setXYZ(k, 0, 1, 0);
    quads.push(q);
  });
  const { mergeGeometries } = await import('three/examples/jsm/utils/BufferGeometryUtils.js');
  const geo = mergeGeometries(quads);
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85, metalness: 0, envMapIntensity: 0.4 });
  const im = new THREE.InstancedMesh(geo, mat, places.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();
  places.forEach((pl, i) => {
    const k = pl.scale ?? 1;
    m.compose(pl.p, q.setFromAxisAngle(up, pl.rot), s.set(k, k, k));
    im.setMatrixAt(i, m);
    im.setColorAt(i, col.setHSL(0, 0, 0.85 + Math.random() * 0.2)); // slight per-tree brightness variation
  });
  im.castShadow = true;
  im.receiveShadow = false; // crossed cards would shadow each other into a dark blob
  im.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5 });
  im.computeBoundingSphere();
  return im;
}
